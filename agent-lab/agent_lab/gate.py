"""确认门禁：Agent 只能提交写操作请求，必须由读者批准后才执行。

动作持久化为 actions/<id>.json；30 分钟内未处理即过期。批准时调用对应 kind 的执行器，
执行失败记为 failed 并保留原因，不会重试。
"""

from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from pydantic import BaseModel

Status = Literal["pending", "approved", "rejected", "expired", "failed"]
Executor = Callable[[dict[str, Any]], dict[str, Any]]
EXPIRE_AFTER = timedelta(minutes=30)


class GateError(Exception):
    pass


class Action(BaseModel):
    action_id: str
    kind: str
    run_id: str
    payload: dict[str, Any]
    status: Status = "pending"
    created_at: str
    expires_at: str
    detail: str | None = None
    result: dict[str, Any] | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GateStore:
    def __init__(self, data_dir: Path, executors: dict[str, Executor] | None = None, clock: Callable[[], datetime] = _now):
        self.root = Path(data_dir) / "actions"
        self.executors = executors or {}
        self.clock = clock
        self._lock = threading.Lock()

    def _path(self, action_id: str) -> Path:
        if not action_id.isalnum():
            raise GateError(f"非法的动作 id：{action_id!r}")
        return self.root / f"{action_id}.json"

    def _save(self, action: Action) -> Action:
        self.root.mkdir(parents=True, exist_ok=True)
        self._path(action.action_id).write_text(action.model_dump_json(indent=1), encoding="utf8")
        return action

    def _expire(self, action: Action) -> Action:
        if action.status == "pending" and datetime.fromisoformat(action.expires_at) <= self.clock():
            return self._save(action.model_copy(update={"status": "expired", "detail": "30 分钟内未确认，已过期"}))
        return action

    def create(self, kind: str, payload: dict[str, Any], run_id: str) -> Action:
        if kind not in self.executors:
            raise GateError(f"不支持的动作类型：{kind}")
        now = self.clock()
        action = Action(
            action_id=secrets.token_hex(6), kind=kind, run_id=run_id, payload=payload,
            created_at=now.isoformat(timespec="seconds"), expires_at=(now + EXPIRE_AFTER).isoformat(timespec="seconds"),
        )
        with self._lock:
            return self._save(action)

    def get(self, action_id: str) -> Action:
        path = self._path(action_id)
        if not path.exists():
            raise GateError(f"动作 {action_id} 不存在")
        with self._lock:
            return self._expire(Action.model_validate(json.loads(path.read_text(encoding="utf8"))))

    def list(self, status: str | None = None) -> list[Action]:
        if not self.root.exists():
            return []
        actions = [self.get(p.stem) for p in self.root.glob("*.json")]
        actions.sort(key=lambda a: a.created_at, reverse=True)
        return [a for a in actions if status is None or a.status == status]

    def _require_pending(self, action_id: str) -> Action:
        action = self.get(action_id)
        if action.status != "pending":
            raise GateError(f"动作 {action_id} 当前状态为 {action.status}，不能再处理")
        return action

    def approve(self, action_id: str) -> Action:
        action = self._require_pending(action_id)
        try:
            result = self.executors[action.kind](action.payload)
        except Exception as error:  # noqa: BLE001 - 执行失败如实记录
            update = {"status": "failed", "detail": f"{type(error).__name__}: {error}"}
        else:
            update = {"status": "approved", "result": result, "detail": "已执行"}
        with self._lock:
            return self._save(action.model_copy(update=update))

    def reject(self, action_id: str) -> Action:
        action = self._require_pending(action_id)
        with self._lock:
            return self._save(action.model_copy(update={"status": "rejected", "detail": "读者拒绝"}))
