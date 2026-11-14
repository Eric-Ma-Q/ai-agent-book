"""Interview routes (requirement 013): one model call per turn or report.

The reader owns the session and transcript; this module never writes state.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .interview import (
    InterviewError,
    build_report_prompt,
    build_turn_prompt,
    parse_report,
    parse_turn_reply,
    validate_report_request,
    validate_turn_request,
)
from .interview_dedupe import WAIT_S, ReportCalls, report_key
from .llm.client import ChatRequest, LLMError
from .llm.pricing import cost_of, price_for

log = logging.getLogger(__name__)
# 输出上限不在这里写常量：选了模型档案就用档案的 max_output_tokens（设置页里填的），
# 没选档案用 LAB_MAX_OUTPUT_TOKENS。这里只保留温度这类行为参数。
TURN_TEMPERATURE = 0.4
REPORT_TEMPERATURE = 0.2
SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{6,}"),
    re.compile(r"(?i)bearer\s+\S+"),
)


class InterviewBody(BaseModel):
    settings: dict[str, Any]
    profile: dict[str, Any] = Field(default_factory=dict)
    plan: list[dict[str, Any]]
    answeredSlot: dict[str, Any] | None = None
    nextSlot: dict[str, Any] | None = None
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    followupAllowed: bool = False
    skipped: bool = False
    modelProfile: str = ""


class ReportBody(InterviewBody):
    # Keep this permissive so our validator can return a readable 400 instead
    # of FastAPI's 422 for a malformed option list.
    reviewOptions: Any = Field(default_factory=list)
    sessionId: str = ""


def _safe_error(error: Exception) -> str:
    message = str(error).replace("\n", " ").strip()
    for pattern in SECRET_PATTERNS:
        message = pattern.sub("***", message)
    return message[:300] or type(error).__name__


def _confidence(answered: int, planned: int) -> str:
    if planned <= 0 or answered < 3:
        return "low"
    if answered >= planned - 1:
        return "high"
    if answered >= (planned + 1) // 2:
        return "medium"
    return "low"


def _config(service, model_profile: str):
    try:
        return service.config_from({"model_profile": model_profile})
    except ValueError as error:  # adapt_config already turns this into ApiError; keep the guard
        from .server import ApiError

        raise ApiError(400, str(error)) from error


def _call(service, config, system: str, user: str, temperature: float):
    lab = service.lab
    client = lab.client_for(config)
    cap = config.max_output_tokens
    request = ChatRequest(
        model=config.model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=cap,
        extra=lab.request_extra(config),
    )
    try:
        response = client.complete(request)
    except LLMError as error:
        from .server import ApiError

        log.warning("interview model call failed: %s", _safe_error(error))
        raise ApiError(502, f"模型调用失败：{_safe_error(error)}") from error
    price = lab.price_for(config) or price_for(config.model)
    return response, {
        "model": response.model or config.model,
        "modelProfile": config.model_profile,
        "usage": response.usage.model_dump(mode="json"),
        "latency_ms": response.latency_ms,
        "cost": cost_of(response.usage, price),
        "maxTokens": cap,
    }


def _content(response) -> str:
    content = response.message.get("content")
    if not isinstance(content, str):
        return ""
    return content


def _truncated(response) -> bool:
    """True when the provider stopped at max_tokens instead of end_turn."""
    return (response.finish_reason or "").strip().lower() == "length"


def _usage_text(response) -> str:
    usage = response.usage
    return (
        f"finish={response.finish_reason or '?'} completion={usage.completion_tokens}"
        f" reasoning={usage.reasoning_tokens}"
    )


def interview_routes(service) -> APIRouter:
    router = APIRouter()
    # 幂等：同一场面试、同一份输入的并发复盘请求共用一次模型调用。
    calls = ReportCalls()

    def turn(body: InterviewBody) -> dict:
        from .server import ApiError

        payload = body.model_dump()
        try:
            request = validate_turn_request(payload)
            system, user = build_turn_prompt(request)
        except InterviewError as error:
            raise ApiError(400, str(error)) from error
        config = _config(service, request["modelProfile"])
        response, meta = _call(service, config, system, user, TURN_TEMPERATURE)
        try:
            parsed = parse_turn_reply(_content(response), followup_allowed=request["followupAllowed"])
        except InterviewError as error:
            raise ApiError(502, f"模型返回无法解析：{error}") from error
        if _truncated(response):
            log.warning("interview turn truncated at %s tokens: %s", meta["maxTokens"], _usage_text(response))
        closing = bool(parsed["closing"] and request["nextSlot"] is None)
        return {**parsed, "closing": closing, **meta}

    def _report_data(request: dict[str, Any]) -> dict:
        from .server import ApiError

        system, user = build_report_prompt(request)
        config = _config(service, request["modelProfile"])
        response, meta = _call(service, config, system, user, REPORT_TEMPERATURE)
        try:
            parsed = parse_report(_content(response), request["reviewOptions"])
        except InterviewError as error:
            raise ApiError(502, f"复盘解析失败：{error}") from error
        truncated = _truncated(response)
        if truncated and parsed.get("parse") != "structured":
            log.warning(
                "interview report truncated before any structured section: %s", _usage_text(response)
            )
            raise ApiError(
                502,
                f"复盘输出被截断（达到 {meta['maxTokens']} tokens 上限），没有生成可用的复盘；请重新生成。",
            )
        if truncated:
            log.warning("interview report truncated at %s tokens: %s", meta["maxTokens"], _usage_text(response))
        elif parsed.get("parse") != "structured":
            log.warning("interview report fell back to plain text: %s", _usage_text(response))
        parsed["truncated"] = truncated
        answered = sum(
            1
            for item in request["transcript"]
            if item["role"] == "candidate" and item["text"].strip() and not item.get("skipped")
        )
        planned = len(request["plan"])
        parsed["answered"] = answered
        parsed["planned"] = planned
        parsed["confidence"] = "low" if parsed.get("parse") == "text" else _confidence(answered, planned)
        return {
            "report": parsed,
            "parsed": parsed.get("parse") == "structured",
            **meta,
        }

    def report(body: ReportBody) -> dict:
        from .server import ApiError

        payload = body.model_dump()
        try:
            request = validate_report_request(payload)
        except InterviewError as error:
            raise ApiError(400, str(error)) from error
        key = report_key(request)
        slot, leader = calls.claim(key)
        if not leader:
            if not slot.event.wait(WAIT_S):
                raise ApiError(504, "同一份复盘还在生成，等待超时；稍后重试。")
            if slot.error is not None:
                status, message = slot.error
                raise ApiError(status, message)
            return {**(slot.data or {}), "deduped": True}
        try:
            data = _report_data(request)
        except ApiError as error:
            calls.fail(key, error.status, str(error))
            raise
        except Exception:  # noqa: BLE001 - 未预期的错误也要唤醒等待方
            calls.fail(key, 500, "复盘生成失败")
            raise
        calls.finish(key, data)
        return {**data, "deduped": False}

    @router.post("/interview/turn")
    def interview_turn(body: InterviewBody) -> dict:
        return {"success": True, "data": turn(body), "error": None}

    @router.post("/interview/report")
    def interview_report(body: ReportBody) -> dict:
        return {"success": True, "data": report(body), "error": None}

    return router
