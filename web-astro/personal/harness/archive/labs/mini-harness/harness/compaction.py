"""S3：上下文压缩（context compaction）。

token 估算（字符数 / 4）超过阈值时，在下一轮模型调用之前，把旧历史
（除 system 外、最近 keep_last_n 条之前的所有消息）用一次模型调用压成
一条摘要；system 提示与最近 N 条原样保留。压缩提示词单独成文件
prompts/compact.md（research/08 §4.4：Gemini CLI 的"独立 compression prompt"，
别复用主提示）。
"""
from __future__ import annotations

import json
from pathlib import Path

from .models import estimate_tokens

# prompts/ 目录与 harness/ 包同级（labs/mini-harness/prompts/compact.md）
DEFAULT_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "compact.md"

SUMMARY_TAG_OPEN = "<历史摘要>"


def should_compact(messages: list[dict], token_limit: int | None) -> bool:
    return bool(token_limit) and estimate_tokens(messages) > token_limit


def compact_messages(model, messages: list[dict], *, keep_last_n: int = 6,
                     prompt_path: str | Path | None = None) -> tuple[list[dict], str]:
    """返回 (压缩后的消息列表, 摘要文本)。

    保留全部 system、**第一条 user 消息**（原始任务目标——只活在摘要里容易
    失真，常见做法是原样常驻）与最近 keep_last_n 条非 system 消息。
    没有可压的旧历史时原样返回、摘要为空串、不消耗模型调用。
    """
    path = Path(prompt_path) if prompt_path else DEFAULT_PROMPT_PATH
    template = path.read_text(encoding="utf-8")

    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    if len(rest) <= keep_last_n:
        return messages, ""

    first_user = rest[0] if rest[0]["role"] == "user" else None
    pool = rest[1:] if first_user is not None else rest
    boundary = len(pool) - keep_last_n
    # 边界不能落在 tool 消息上：tool 消息必须跟在同一条 assistant(tool_calls)
    # 之后，拆散了 OpenAI 兼容接口会直接报错。往前挪到这条 assistant。
    while boundary > 0 and pool[boundary]["role"] == "tool":
        boundary -= 1
    old, recent = pool[:boundary], pool[boundary:]
    if not old:
        return messages, ""  # 没有可压的历史（保首条用户消息后可能发生）

    prompt = template.replace("{{TRANSCRIPT}}", render_transcript(old))
    resp = model.chat([{"role": "user", "content": prompt}], tools=None)
    summary = (resp.content or "").strip()
    if not summary:
        return messages, ""  # 压缩失败不毁历史，宁可下轮再试

    new = system + ([first_user] if first_user else []) + [
        {"role": "user", "content": f"{SUMMARY_TAG_OPEN}\n{summary}\n</历史摘要>\n\n以下是最近的对话，请继续任务。"},
    ] + recent
    return new, summary


def render_transcript(old: list[dict]) -> str:
    """把 wire 格式消息渲染成给人/压缩模型看的纯文本轨迹。"""
    lines = []
    for m in old:
        c = m.get("content")
        if c is None and m.get("tool_calls"):
            calls = ", ".join(
                f"{tc['function']['name']}({tc['function']['arguments']})"
                for tc in m["tool_calls"]
            )
            c = f"调用工具: {calls}"
        if m["role"] == "tool":
            c = f"(工具结果) {c}"
        lines.append(f"[{m['role']}] {c}")
    return "\n".join(lines)


def messages_digest(messages: list[dict]) -> str:
    """调试用：打印整条轨迹（含 token 估算）。"""
    return f"≈{estimate_tokens(messages)} tokens\n" + "\n".join(
        f"[{m['role']}] {json.dumps(m.get('content'), ensure_ascii=False)[:120]}"
        for m in messages
    )


__all__ = ["should_compact", "compact_messages", "render_transcript", "messages_digest",
           "DEFAULT_PROMPT_PATH", "SUMMARY_TAG_OPEN"]
