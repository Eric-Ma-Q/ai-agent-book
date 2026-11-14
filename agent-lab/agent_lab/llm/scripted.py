"""按顺序返回预设响应的客户端，用于单元测试和离线演示。"""

from __future__ import annotations

from collections import deque
from typing import Iterable

from .client import ChatRequest, ChatResponse, LLMError


class ScriptedClient:
    def __init__(self, script: Iterable[ChatResponse | LLMError]):
        self._script = deque(script)
        self.requests: list[ChatRequest] = []

    def complete(self, request: ChatRequest) -> ChatResponse:
        self.requests.append(request)
        if not self._script:
            raise AssertionError("ScriptedClient 的预设响应已用完")
        item = self._script.popleft()
        if isinstance(item, LLMError):
            raise item
        return item
