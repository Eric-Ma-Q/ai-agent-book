"""把轨迹渲染成终端文本（agent_lab show）。"""

from __future__ import annotations

from typing import Iterable

from .trace.schema import Event, Gate, Info, LlmRequest, LlmResponse, RunEnd, RunStart, ToolCall

PREVIEW = 160
SEGMENT_LABELS = {"system": "系统", "tools": "工具定义", "user": "用户", "assistant": "模型", "tool": "工具结果"}
STATUS_LABELS = {
    "ok": "完成",
    "max_turns": "达到最大轮数",
    "budget_exceeded": "超出 token 预算",
    "llm_error": "模型接口出错",
    "cancelled": "已取消",
    "error": "出错",
}


def _short(text: str, limit: int = PREVIEW) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= limit else flat[:limit] + "…"


def _num(value) -> str:
    return "未知" if value is None else str(value)


def _money(value) -> str:
    return "未知" if value is None else f"${value:.4f}"


def render_event(event: Event) -> list[str]:
    if isinstance(event, RunStart):
        return [f"运行 {event.run_id} · 模型 {event.config.get('model')} · 配置 {event.config_hash}", f"问题：{event.question}"]
    if isinstance(event, LlmRequest):
        label = "摘要压缩" if event.purpose == "summary" else f"第 {event.turn} 轮"
        seg = " · ".join(f"{SEGMENT_LABELS[k]} {v}" for k, v in event.segments.items() if v)
        return [f"── {label} " + "─" * 30, f"  上下文 {len(event.messages)} 条消息（估计 token：{seg}）"]
    if isinstance(event, LlmResponse):
        if event.error:
            return [f"  模型出错：{event.error}"]
        u = event.usage
        line = f"  模型：输入 {_num(u.get('prompt_tokens'))}（缓存命中 {_num(u.get('cached_tokens'))}）输出 {_num(u.get('completion_tokens'))} · {event.latency_ms} ms"
        if event.retries:
            line += f" · 重试 {len(event.retries)} 次"
        lines = [line]
        content = (event.message or {}).get("content")
        if content and (event.message or {}).get("tool_calls"):
            lines.append(f"  思路：{_short(content)}")
        return lines
    if isinstance(event, ToolCall):
        mark = "✗" if event.error else "←"
        return [f"  → {event.name} {_short(event.args, 100)}", f"    {mark} {_short(event.error or event.result)}"]
    if isinstance(event, Info):
        return [f"  ※ {event.kind} {event.detail}"]
    if isinstance(event, Gate):
        return [f"  ⚑ 待确认动作 {event.action_id}（{event.kind}）：{event.status}"]
    if isinstance(event, RunEnd):
        return _render_end(event)
    return []


def _render_end(event: RunEnd) -> list[str]:
    lines = ["── 结果 " + "─" * 30, f"状态：{STATUS_LABELS.get(event.status, event.status)}"]
    if event.error:
        lines.append(f"原因：{event.error}")
    if event.answer:
        lines += ["", event.answer, ""]
    c = event.citation_check
    if c:
        lines.append(
            f"引用 {c.get('total', 0)} 条：核对通过 {c.get('verified', 0)} · 小节不符 {c.get('wrong_section', 0)} · "
            f"原文找不到 {c.get('not_found', 0)} · 太短 {c.get('too_short', 0)}"
        )
    for item in event.citations:
        if item["status"] != "verified":
            lines.append(f"  ✗ [{item['status']}] ch{item['chapter']}#{item.get('section_id')}：{_short(item['quote'], 60)}")
    t = event.totals
    if t:
        lines.append(
            f"合计：{t.get('turns')} 轮 · 模型调用 {t.get('llm_calls')} 次 · 工具调用 {t.get('tool_calls')} 次 · "
            f"输入 {t.get('prompt_tokens')}（缓存命中率 {_rate(t.get('cache_hit_rate'))}）· 输出 {t.get('completion_tokens')} · "
            f"耗时 {t.get('latency_ms')} ms · 成本 {_money(t.get('cost'))}（按参考价 {_money(t.get('reference_cost'))}）"
        )
    return lines


def _rate(value) -> str:
    return "未知" if value is None else f"{value:.0%}"


def render_run(events: Iterable[Event]) -> str:
    return "\n".join(line for event in events for line in render_event(event))
