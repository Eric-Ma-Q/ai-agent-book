"""轨迹存储：runs/<日期>/<run_id>.jsonl。支持等待新事件（SSE 实时推送用）。"""

from __future__ import annotations

import json
import re
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .schema import Event, parse_event

RUN_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4,}$")


def new_run_id() -> str:
    return f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class RunStore:
    def __init__(self, data_dir: Path):
        self.root = Path(data_dir) / "runs"
        self._cond = threading.Condition()
        self._counts: dict[str, int] = {}

    def path(self, run_id: str) -> Path:
        if not RUN_ID.match(run_id):
            raise ValueError(f"非法的 run_id：{run_id!r}")
        return self.root / run_id[:8] / f"{run_id}.jsonl"

    def _count(self, run_id: str) -> int:
        if run_id not in self._counts:
            path = self.path(run_id)
            self._counts[run_id] = sum(1 for _ in path.open(encoding="utf8")) if path.exists() else 0
        return self._counts[run_id]

    def append(self, run_id: str, event: Event) -> Event:
        with self._cond:
            seq = self._count(run_id)
            stamped = event.model_copy(update={"seq": seq, "ts": now_iso()})
            path = self.path(run_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf8") as handle:
                handle.write(json.dumps(stamped.model_dump(mode="json"), ensure_ascii=False) + "\n")
            self._counts[run_id] = seq + 1
            self._cond.notify_all()
        return stamped

    def exists(self, run_id: str) -> bool:
        return self.path(run_id).exists()

    def read(self, run_id: str) -> list[Event]:
        path = self.path(run_id)
        if not path.exists():
            raise FileNotFoundError(f"运行 {run_id} 不存在")
        return [parse_event(json.loads(line)) for line in path.read_text(encoding="utf8").splitlines() if line]

    def wait(self, run_id: str, after: int, timeout: float) -> list[Event]:
        """返回序号 >= after 的事件；没有新事件时最多等 timeout 秒。"""
        with self._cond:
            if self._count(run_id) <= after:
                self._cond.wait_for(lambda: self._count(run_id) > after, timeout=timeout)
            if self._count(run_id) <= after:
                return []
        return self.read(run_id)[after:]

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.root.exists():
            return []
        paths = sorted(self.root.glob("*/*.jsonl"), key=lambda p: p.stem, reverse=True)[:limit]
        return [self._summary(p) for p in paths]

    def session_runs(self, session_id: str, limit: int = 500) -> list[dict[str, Any]]:
        """同一会话里已结束的运行，按开始时间正序。

        run_id 的随机后缀会在同一秒内压过时间前缀，所以这里不能依赖
        list_runs 的倒序，得用 run_start 的 ts 排序。
        """
        items = [
            item
            for item in self.list_runs(limit=limit)
            if item.get("session_id") == session_id and item.get("status") != "running"
        ]
        items.sort(key=lambda item: (item.get("started_at") or "", item.get("run_id") or ""))
        return items

    def _summary(self, path: Path) -> dict[str, Any]:
        lines = [line for line in path.read_text(encoding="utf8").splitlines() if line]
        first = json.loads(lines[0]) if lines else {}
        # run_end 之后还可能追加门禁事件（读者稍后批准/拒绝），所以从后往前找
        last = next((json.loads(line) for line in reversed(lines) if '"type": "run_end"' in line), {})
        ended = bool(last)
        return {
            "run_id": path.stem,
            "question": first.get("question"),
            "config_hash": first.get("config_hash"),
            "model": (first.get("config") or {}).get("model"),
            "session_id": first.get("session_id"),
            "meta": first.get("meta", {}),
            "started_at": first.get("ts"),
            "status": last.get("status") if ended else "running",
            "totals": last.get("totals", {}) if ended else {},
        }
