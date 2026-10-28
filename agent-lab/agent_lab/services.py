"""工具依赖的外部服务（门禁、笔记、沙箱、记忆、学习规则）的默认实例。"""

from __future__ import annotations

from typing import Any

from .config import Settings
from .gate import GateStore
from .reader_client import InsertWriter
from .sandbox import Sandbox
from .stores import MemoryStore, NotesStore, RulesStore
from .web import WebClient
from .workspace import Workspace


def default_services(settings: Settings) -> dict[str, Any]:
    writer = InsertWriter(settings.reader_url)
    return {
        "gate": GateStore(settings.data_dir, executors={"insert": writer.save}),
        "notes": NotesStore(settings.personal_dir),
        "sandbox": Sandbox(),
        "memory": MemoryStore(settings.data_dir),
        "rules": RulesStore(settings.data_dir),
        "workspace": Workspace(settings.repo_root, settings.data_dir / "page-assistant" / "workspace"),
        "web": WebClient(
            primary_url=settings.web_search_url,
            primary_timeout_s=settings.web_search_timeout_s,
        ),
    }
