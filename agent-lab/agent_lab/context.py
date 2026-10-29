"""每一轮发给模型的上下文：在完整历史之上应用开关，生成「这一轮模型实际看到的消息」。

历史本身不被修改；开关只影响视图。这样轨迹里能同时看到完整历史和模型实际收到的内容。
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .config import AgentConfig
from .tools.registry import RunState
from .trace.tokens import estimate_tokens, segment_tokens

DROPPED_RESULT = "（工具结果已省略）"
COMPRESSED_PREVIEW_CHARS = 200


@dataclass(frozen=True)
class ContextInputs:
    system_prompt: str
    history: list[dict[str, Any]]
    question_index: int  # 当前问题在 history 中的位置；之前是本会话的旧问答
    config: AgentConfig
    state: RunState
    turn: int
    tokens_used: int = 0


@dataclass(frozen=True)
class ContextResult:
    messages: list[dict[str, Any]]
    notes: list[dict[str, Any]] = field(default_factory=list)


def build_system_prompt(base: str, config: AgentConfig, memories: list[str], rules: list[str]) -> str:
    parts = [base]
    if config.memory and memories:
        parts.append("## 关于这位读者的记忆（来自以前的对话）\n" + "\n".join(f"- {m}" for m in memories))
    if config.learned_rules and rules:
        parts.append("## 从过去的失败中学到的规则\n" + "\n".join(f"- {r}" for r in rules))
    text = "\n\n".join(parts)
    if not config.stable_prefix:
        stamp = datetime.now().isoformat(timespec="microseconds")
        text = f"当前时间：{stamp}；请求编号：{secrets.token_hex(4)}\n\n{text}"
    return text


def _last_round(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].get("role") == "assistant" and messages[index].get("tool_calls"):
            return messages[index:]
    return []


def _truncate_old_results(messages: list[dict[str, Any]], config: AgentConfig) -> tuple[list[dict[str, Any]], dict | None]:
    before = sum(estimate_tokens(str(m.get("content") or "")) for m in messages)
    if before <= config.compress_after_tokens:
        return messages, None
    tool_positions = [i for i, m in enumerate(messages) if m.get("role") == "tool"]
    keep = set(tool_positions[-config.keep_recent_tool_results :]) if config.keep_recent_tool_results else set()
    result, compressed = [], 0
    for index, message in enumerate(messages):
        content = str(message.get("content") or "")
        if index in tool_positions and index not in keep and len(content) > COMPRESSED_PREVIEW_CHARS:
            preview = content[:COMPRESSED_PREVIEW_CHARS]
            result.append({**message, "content": f"[已压缩，原 {len(content)} 字] {preview}…"})
            compressed += 1
        else:
            result.append(message)
    after = sum(estimate_tokens(str(m.get("content") or "")) for m in result)
    note = {"kind": "compressed", "detail": {"mode": "truncate", "messages": compressed, "before": before, "after": after}}
    return result, (note if compressed else None)


def _status_bar(inputs: ContextInputs) -> dict[str, Any]:
    cfg, state = inputs.config, inputs.state
    read = "、".join(f"ch{c}#{s or '导语'}" for c, s in state.sections_read) or "无"
    remaining = cfg.max_turns - inputs.turn
    if cfg.final_answer and remaining <= 0:
        tail = "这是最后一轮，工具已关闭：必须直接给出完整回答，不能再检索。"
    elif cfg.final_answer and remaining <= 2:
        tail = f"只剩 {remaining} 轮：停止检索，用已读材料作答；来不及逐字核对的引用要说明未核对。"
    else:
        tail = "如果信息已经足够，请直接给出带引用的回答。"
    text = (
        f"[状态栏 · 系统自动生成] 第 {inputs.turn}/{cfg.max_turns} 轮；"
        f"已用 token {inputs.tokens_used}/{cfg.max_total_tokens}；已调用工具 {state.tool_calls} 次；已读小节：{read}。"
        f"{tail}"
    )
    return {"role": "user", "content": text}


def build_context(inputs: ContextInputs) -> ContextResult:
    cfg = inputs.config
    history = list(inputs.history)
    notes: list[dict[str, Any]] = []
    if cfg.drop_history:
        history = [history[inputs.question_index], *_last_round(history[inputs.question_index + 1 :])]
    if cfg.compression == "truncate":
        history, note = _truncate_old_results(history, cfg)
        if note:
            notes.append(note)
    if cfg.drop_tool_results:
        history = [{**m, "content": DROPPED_RESULT} if m.get("role") == "tool" else m for m in history]
    messages = [{"role": "system", "content": inputs.system_prompt}, *history]
    if cfg.status_bar:
        messages.append(_status_bar(inputs))
    return ContextResult(messages, notes)


def context_segments(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, int]:
    return segment_tokens(messages, tools)
