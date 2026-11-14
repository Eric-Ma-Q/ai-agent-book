"""复盘生成的幂等（需求 013）。

同一场面试、同一份输入只跑一次模型：双击、超时重试、另一个标签页再点，都会
挂到正在跑的那次调用上并拿到同一份结果；完成后短暂保留，让紧随其后的重复提交
复用结果。想换一版时，等这一版结束再点一次，就是新的一次调用。

只在内存里记进行中的调用，不落盘；进程重启即清空。
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any

DONE_WINDOW_S = 10.0
WAIT_S = 360.0
MAX_SLOTS = 32


@dataclass
class ReportSlot:
    """一次复盘调用；等待方通过 event 挂上，成功后读到同一份 data。"""

    event: threading.Event = field(default_factory=threading.Event)
    data: dict[str, Any] | None = None
    error: tuple[int, str] | None = None
    finished_at: float = 0.0


class ReportCalls:
    """请求键 → 进行中的复盘调用；`claim` 返回 (slot, 是否由本请求执行)。"""

    def __init__(self, done_window_s: float = DONE_WINDOW_S, max_slots: int = MAX_SLOTS):
        self._lock = threading.Lock()
        self._slots: dict[str, ReportSlot] = {}
        self._order: list[str] = []
        self.done_window_s = done_window_s
        self.max_slots = max_slots

    def claim(self, key: str) -> tuple[ReportSlot, bool]:
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            slot = self._slots.get(key)
            if slot is not None:
                return slot, False
            slot = ReportSlot()
            self._slots[key] = slot
            self._order.append(key)
            self._trim()
            return slot, True

    def finish(self, key: str, data: dict[str, Any]) -> None:
        with self._lock:
            slot = self._slots.get(key)
            if slot is None:
                return
            slot.data = data
            slot.finished_at = time.monotonic()
        slot.event.set()

    def fail(self, key: str, status: int, message: str) -> None:
        """失败不缓存：把键清掉，下一次重试重新调用模型。"""
        with self._lock:
            slot = self._slots.pop(key, None)
            if key in self._order:
                self._order.remove(key)
            if slot is None:
                return
            slot.error = (status, message)
        slot.event.set()

    def _purge(self, now: float) -> None:
        for key in list(self._order):
            slot = self._slots.get(key)
            if slot is None:
                self._order.remove(key)
                continue
            if slot.event.is_set() and now - slot.finished_at > self.done_window_s:
                self._slots.pop(key, None)
                self._order.remove(key)

    def _trim(self) -> None:
        """只淘汰已经结束的旧槽位，进行中的调用不动。"""
        while len(self._slots) > self.max_slots:
            for key in list(self._order):
                slot = self._slots.get(key)
                if slot is not None and slot.event.is_set():
                    self._slots.pop(key, None)
                    self._order.remove(key)
                    break
            else:
                return


def report_key(request: dict[str, Any]) -> str:
    """会话 + 全部输入 + 模型档案的指纹；同一份请求得到同一个键。"""
    payload = json.dumps(request, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf8")).hexdigest()[:32]
