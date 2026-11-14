"""评估任务：YAML 文件定义，一个文件可以包含多个任务。"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from agent_lab.config import AgentConfig, apply_overrides

Kind = Literal["qa_citation", "insert", "quiz", "sandbox_calc", "safety"]
TASKS_ROOT = Path(__file__).resolve().parent / "tasks"
REGRESSIONS_DIR = Path(__file__).resolve().parent / "regressions"


class VerifierSpec(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str

    @property
    def params(self) -> dict[str, Any]:
        return dict(self.model_extra or {})


class Task(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    kind: Kind
    input: str
    chapter: int | None = None
    requires_tools: list[str] = []
    verifiers: list[VerifierSpec]
    tags: list[str] = []
    note: str | None = None
    source_run: str | None = None

    def config_for(self, arm: AgentConfig) -> AgentConfig:
        """任务需要的工具加到臂的配置上（两臂一视同仁），其余开关不变。"""
        tools = tuple(dict.fromkeys([*arm.tools, *self.requires_tools]))
        return apply_overrides(arm, {"tools": tools})

    @property
    def is_regression(self) -> bool:
        return "regression" in self.tags


def load_file(path: Path) -> list[Task]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf8")) or {}
    items = data.get("tasks", []) if isinstance(data, dict) else data
    return [Task.model_validate(item) for item in items]


def suite_files(suite: str, include_regressions: bool = True, root: Path = TASKS_ROOT, regressions_dir: Path | None = None) -> list[Path]:
    suite_dir = root / suite
    if not suite_dir.is_dir():
        raise ValueError(f"任务集不存在：{suite}")
    files = sorted(suite_dir.glob("*.yaml"))
    reg_dir = regressions_dir or REGRESSIONS_DIR
    if include_regressions and reg_dir.is_dir():
        files += sorted(reg_dir.glob("*.yaml"))
    return files


def load_suite(suite: str, include_regressions: bool = True, root: Path = TASKS_ROOT, regressions_dir: Path | None = None) -> list[Task]:
    tasks: list[Task] = []
    for path in suite_files(suite, include_regressions, root, regressions_dir):
        tasks.extend(load_file(path))
    ids = [t.id for t in tasks]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        raise ValueError(f"任务 id 重复：{duplicates}")
    return tasks


def files_hash(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def list_suites(root: Path = TASKS_ROOT) -> list[dict[str, Any]]:
    suites = []
    for suite_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        tasks = load_suite(suite_dir.name, include_regressions=False, root=root)
        kinds: dict[str, int] = {}
        for task in tasks:
            kinds[task.kind] = kinds.get(task.kind, 0) + 1
        suites.append({"name": suite_dir.name, "task_count": len(tasks), "kinds": kinds})
    return suites
