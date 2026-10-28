"""第 2 章开关 compression=summarize：历史过长时，调一次模型把较早的轮次压成摘要。

只压缩完整的轮次，最近一轮工具调用原样保留，保证 tool_calls 与工具结果成对出现。
摘要调用本身也计入用量，并在时间线上标出。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .prompts import SUMMARY_PROMPT
from .trace.tokens import estimate_tokens

if TYPE_CHECKING:
    from .agent import _Run

SUMMARY_HEADER = "[之前工作的摘要]"
TOOL_RESULT_CHARS = 2000


def _estimate(messages: list[dict[str, Any]]) -> int:
    return sum(estimate_tokens(str(m.get("content") or "")) for m in messages)


def render_transcript(messages: list[dict[str, Any]]) -> str:
    lines = []
    for message in messages:
        role = message.get("role")
        if role == "assistant":
            for call in message.get("tool_calls") or []:
                fn = call.get("function", {})
                lines.append(f"[调用工具] {fn.get('name')} {fn.get('arguments')}")
            if message.get("content"):
                lines.append(f"[助手] {message['content']}")
        elif role == "tool":
            lines.append(f"[工具结果] {str(message.get('content'))[:TOOL_RESULT_CHARS]}")
        else:
            lines.append(f"[{role}] {message.get('content')}")
    return "\n".join(lines)


def maybe_summarize(run: "_Run", history: list[dict[str, Any]], question_index: int, turn: int) -> list[dict[str, Any]]:
    cfg = run.config
    if cfg.compression != "summarize" or turn == 1:
        return history
    work = history[question_index + 1 :]
    before = _estimate(work)
    if before <= cfg.compress_after_tokens:
        return history
    rounds = [i for i, m in enumerate(work) if m.get("role") == "assistant" and m.get("tool_calls")]
    if len(rounds) < 2:
        return history
    last_start = rounds[-1]
    older = work[:last_start]
    messages = [{"role": "system", "content": SUMMARY_PROMPT}, {"role": "user", "content": render_transcript(older)}]
    response = run.call_model(turn, messages, None, purpose="summary")
    summary = {"role": "user", "content": f"{SUMMARY_HEADER}\n{response.message.get('content') or ''}"}
    rewritten = [*history[: question_index + 1], summary, *work[last_start:]]
    after = _estimate(rewritten[question_index + 1 :])
    run.info(turn, "compressed", {"mode": "summarize", "messages": len(older), "before": before, "after": after})
    return rewritten
