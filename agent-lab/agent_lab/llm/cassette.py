"""录制与回放模型响应。

回放模式下，请求按内容哈希匹配；同一请求出现多次时按录制顺序依次返回。
匹配不上就抛出 CassetteMiss，绝不偷偷访问真实接口。
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import defaultdict
from pathlib import Path
from typing import Literal

from .client import ChatClient, ChatRequest, ChatResponse

Mode = Literal["record", "replay"]


class CassetteMiss(Exception):
    pass


def request_key(request: ChatRequest) -> str:
    canonical = json.dumps(request.body(), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf8")).hexdigest()[:20]


class CassetteClient:
    def __init__(self, path: Path, mode: Mode, inner: ChatClient | None = None):
        if mode == "record" and inner is None:
            raise ValueError("录制模式需要一个真实客户端")
        self.path = Path(path)
        self.mode = mode
        self.inner = inner
        self._lock = threading.Lock()
        self._cursor: dict[str, int] = defaultdict(int)
        self._entries: dict[str, list[dict]] = {} if mode == "record" else self._load()

    def _load(self) -> dict[str, list[dict]]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf8")).get("entries", {})

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"version": 1, "entries": self._entries}, ensure_ascii=False, indent=1), "utf8")
        tmp.replace(self.path)

    def complete(self, request: ChatRequest) -> ChatResponse:
        key = request_key(request)
        if self.mode == "record":
            assert self.inner is not None
            response = self.inner.complete(request)
            with self._lock:
                self._entries.setdefault(key, []).append(response.model_dump(mode="json"))
                self._save()
            return response
        with self._lock:
            recorded = self._entries.get(key, [])
            index = self._cursor[key]
            if index >= len(recorded):
                raise CassetteMiss(f"{self.path.name} 中没有匹配的录制响应（key={key}，第 {index + 1} 次）")
            self._cursor[key] = index + 1
        return ChatResponse.model_validate(recorded[index])
