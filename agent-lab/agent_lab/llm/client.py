"""兼容 OpenAI Chat Completions 的模型客户端。

用量字段直接取接口原值，缺失就是 None，不做估算。网络错误、429 和 5xx 有限重试，
每次重试都记录下来，由调用方写进轨迹。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class Usage(BaseModel):
    model_config = ConfigDict(frozen=True)

    prompt_tokens: int | None = None
    cached_tokens: int | None = None
    completion_tokens: int | None = None
    reasoning_tokens: int | None = None


class RetryInfo(BaseModel):
    model_config = ConfigDict(frozen=True)

    attempt: int
    reason: str
    wait_s: float


class ChatRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    model: str
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    temperature: float = 0.2
    max_tokens: int = 4096
    extra: dict[str, Any] = Field(default_factory=dict)  # 模型档案的推理参数等附加字段

    def body(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "model": self.model,
            "messages": self.messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        if self.tools:
            data["tools"] = self.tools
        for key, value in self.extra.items():
            data.setdefault(key, value)
        return data


class ChatResponse(BaseModel):
    message: dict[str, Any]
    usage: Usage
    latency_ms: int
    retries: list[RetryInfo] = []
    model: str | None = None
    finish_reason: str | None = None


class LLMError(Exception):
    def __init__(self, message: str, retries: list[RetryInfo] | None = None):
        super().__init__(message)
        self.retries = retries or []


class ChatClient(Protocol):
    def complete(self, request: ChatRequest) -> ChatResponse: ...


def parse_usage(raw: dict[str, Any] | None) -> Usage:
    if not raw:
        return Usage()
    prompt_details = raw.get("prompt_tokens_details") or {}
    completion_details = raw.get("completion_tokens_details") or {}
    return Usage(
        prompt_tokens=raw.get("prompt_tokens"),
        cached_tokens=prompt_details.get("cached_tokens"),
        completion_tokens=raw.get("completion_tokens"),
        reasoning_tokens=completion_details.get("reasoning_tokens"),
    )


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        message = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
    except ValueError:
        message = None
    return f"HTTP {response.status_code}: {message or response.text[:300]}"


@dataclass
class OpenAICompatClient:
    base_url: str
    api_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=120.0))
    max_retries: int = 2
    backoff_s: float = 1.5
    sleep: Callable[[float], None] = time.sleep

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def complete(self, request: ChatRequest) -> ChatResponse:
        retries: list[RetryInfo] = []
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        for attempt in range(self.max_retries + 1):
            started = time.monotonic()
            reason: str
            try:
                response = self.http.post(url, json=request.body(), headers=self._headers())
            except httpx.HTTPError as error:
                reason = f"{type(error).__name__}: {error}"
            else:
                if response.status_code == 200:
                    return self._parse(response, started, retries)
                if response.status_code not in RETRYABLE_STATUS:
                    raise LLMError(_error_text(response), retries)
                reason = f"HTTP {response.status_code}"
            if attempt == self.max_retries:
                raise LLMError(f"重试 {self.max_retries} 次后仍失败：{reason}", retries)
            wait = self.backoff_s * (2**attempt)
            retries.append(RetryInfo(attempt=attempt + 1, reason=reason, wait_s=wait))
            self.sleep(wait)
        raise AssertionError("unreachable")

    def _parse(self, response: httpx.Response, started: float, retries: list[RetryInfo]) -> ChatResponse:
        latency_ms = int((time.monotonic() - started) * 1000)
        try:
            data = response.json()
            choice = data["choices"][0]
            message = dict(choice["message"])
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise LLMError(f"模型返回格式无法解析：{response.text[:300]}", retries) from error
        return ChatResponse(
            message=message,
            usage=parse_usage(data.get("usage")),
            latency_ms=latency_ms,
            retries=retries,
            model=data.get("model"),
            finish_reason=choice.get("finish_reason"),
        )

    def list_models(self) -> list[str]:
        response = self.http.get(f"{self.base_url.rstrip('/')}/models", headers=self._headers())
        if response.status_code != 200:
            raise LLMError(_error_text(response))
        return [item["id"] for item in response.json().get("data", [])]
