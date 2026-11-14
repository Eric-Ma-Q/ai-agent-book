"""把一次失败的运行转成回归任务：保留原问题和失败原因，以后每次评估都会跑。

来自评估的运行沿用原任务的验证器；普通提问的运行使用通用验证器（完成 + 引用全部核对通过）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from agent_lab.trace.schema import RunEnd, RunStart
from agent_lab.trace.store import RunStore

from . import tasks as task_module
from .tasks import Task, load_file

GENERIC_VERIFIERS = [{"type": "status_ok"}, {"type": "citations_verified", "min_count": 1}]


def _find_task(task_id: str, tasks_root: Path) -> Task | None:
    for path in sorted(tasks_root.glob("*/*.yaml")):
        for task in load_file(path):
            if task.id == task_id:
                return task
    return None


def _failure_note(end: RunEnd | None) -> str:
    if end is None:
        return "运行没有结束记录"
    check = end.citation_check or {}
    bad = check.get("total", 0) - check.get("verified", 0)
    return f"状态 {end.status}；引用 {check.get('total', 0)} 条，未通过核对 {bad} 条" + (f"；{end.error}" if end.error else "")


def promote(run_id: str, store: RunStore, regressions_dir: Path | None = None, tasks_root: Path | None = None) -> dict[str, Any]:
    # 默认目录在调用时解析（而不是定义时绑定），测试才能可靠地把它指向临时目录
    regressions_dir = regressions_dir or task_module.REGRESSIONS_DIR
    tasks_root = tasks_root or task_module.TASKS_ROOT
    events = store.read(run_id)
    start = next(e for e in events if isinstance(e, RunStart))
    end = next((e for e in events if isinstance(e, RunEnd)), None)
    source = _find_task(start.meta["task_id"], tasks_root) if start.meta.get("task_id") else None
    task_id = f"reg-{run_id}"
    entry: dict[str, Any] = {
        "id": task_id,
        "kind": source.kind if source else "qa_citation",
        "input": start.question,
        "verifiers": [v.model_dump() for v in source.verifiers] if source else GENERIC_VERIFIERS,
        "tags": ["regression", *([f"from:{source.id}"] if source else [])],
        "note": _failure_note(end),
        "source_run": run_id,
    }
    if source and source.chapter:
        entry["chapter"] = source.chapter
    if source and source.requires_tools:
        entry["requires_tools"] = source.requires_tools
    Task.model_validate(entry)
    regressions_dir.mkdir(parents=True, exist_ok=True)
    path = regressions_dir / f"{task_id}.yaml"
    if path.exists():
        raise ValueError(f"回归任务已存在：{path.name}")
    path.write_text(yaml.safe_dump({"tasks": [entry]}, allow_unicode=True, sort_keys=False), encoding="utf8")
    return {"task_id": task_id, "path": str(path)}
