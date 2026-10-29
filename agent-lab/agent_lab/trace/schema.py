"""轨迹事件。每次运行是一个 JSONL 文件，每行一个事件。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class _Event(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seq: int | None = None
    ts: str | None = None


# 第 10 章多 Agent：每一步属于哪个 Agent（main / sub-1、sub-2… / reviewer）。旧轨迹没有这个字段，读出来是 main。
MAIN_AGENT = "main"
Purpose = Literal["agent", "summary", "proposal", "review"]


class RunStart(_Event):
    type: Literal["run_start"] = "run_start"
    run_id: str
    question: str
    config: dict[str, Any]
    config_hash: str
    git_sha: str | None = None
    session_id: str | None = None
    meta: dict[str, Any] = {}


class LlmRequest(_Event):
    type: Literal["llm_request"] = "llm_request"
    turn: int
    purpose: Purpose = "agent"
    agent: str = MAIN_AGENT
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    segments: dict[str, int] = {}  # 各类消息的 token 估计值，只用于展示


class LlmResponse(_Event):
    type: Literal["llm_response"] = "llm_response"
    turn: int
    purpose: Purpose = "agent"
    agent: str = MAIN_AGENT
    message: dict[str, Any] | None = None
    usage: dict[str, int | None] = {}
    latency_ms: int | None = None
    cost: float | None = None
    reference_cost: float | None = None
    retries: list[dict[str, Any]] = []
    model: str | None = None
    finish_reason: str | None = None
    error: str | None = None


class ToolCall(_Event):
    type: Literal["tool_call"] = "tool_call"
    turn: int
    agent: str = MAIN_AGENT
    call_id: str
    name: str
    args: str
    result: str
    truncated: bool = False
    duration_ms: int = 0
    error: str | None = None


class Gate(_Event):
    type: Literal["gate"] = "gate"
    action_id: str
    kind: str
    payload: dict[str, Any]
    status: Literal["pending", "approved", "rejected", "expired", "failed"]
    detail: str | None = None


class Info(_Event):
    """上下文被改写等需要在时间线上标出的事件（压缩、注入记忆、注入规则、子 Agent 起止、审核结论）。"""

    type: Literal["info"] = "info"
    turn: int
    agent: str = MAIN_AGENT
    kind: str
    detail: dict[str, Any] = {}


class RunEnd(_Event):
    type: Literal["run_end"] = "run_end"
    status: Literal["ok", "max_turns", "budget_exceeded", "llm_error", "cancelled", "error"]
    answer: str | None = None
    citations: list[dict[str, Any]] = []
    citation_check: dict[str, Any] = {}
    totals: dict[str, Any] = {}
    error: str | None = None


Event = RunStart | LlmRequest | LlmResponse | ToolCall | Gate | Info | RunEnd
_TYPES: dict[str, type[_Event]] = {
    cls.model_fields["type"].default: cls for cls in (RunStart, LlmRequest, LlmResponse, ToolCall, Gate, Info, RunEnd)
}


def parse_event(data: dict[str, Any]) -> Event:
    cls = _TYPES.get(data.get("type", ""))
    if cls is None:
        raise ValueError(f"未知事件类型：{data.get('type')!r}")
    return cls.model_validate(data)  # type: ignore[return-value]
