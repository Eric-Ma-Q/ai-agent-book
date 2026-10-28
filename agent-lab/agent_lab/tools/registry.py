"""工具注册、参数校验与执行。

工具出错时返回结构化错误给模型（{"error": ...}），不抛异常中断运行；
输出超过上限就截断，并明确告诉模型截掉了多少。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Iterable

from pydantic import BaseModel, ValidationError

if TYPE_CHECKING:
    from ..book.index import SearchService
    from ..book.parser import Book
    from ..config import AgentConfig, Settings

log = logging.getLogger(__name__)


class ToolError(Exception):
    """工具的业务错误：消息会原样返回给模型。"""


@dataclass
class RunState:
    """一次运行内工具共享的可变状态（只在本次运行内使用）。"""

    sections_read: list[tuple[int, str]] = field(default_factory=list)
    tool_calls: int = 0
    proposed_actions: list[str] = field(default_factory=list)
    custom_tools: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolContext:
    book: "Book | None" = None
    search: "SearchService | None" = None
    config: "AgentConfig | None" = None
    settings: "Settings | None" = None
    gate: Any = None
    notes: Any = None
    sandbox: Any = None
    page: Any = None  # PageContext：随页问答的页面快照（需求 016）
    workspace: Any = None  # Workspace：文件、Glob、Grep 与 Bash
    web: Any = None  # WebClient：联网搜索与抓取
    run_id: str = ""
    state: RunState = field(default_factory=RunState)
    emit: Callable[[Any], Any] | None = None  # 把门禁等事件写进轨迹


Handler = Callable[[ToolContext, Any], Any]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    terse: str
    params: type[BaseModel]
    handler: Handler
    max_chars: int = 6000


@dataclass(frozen=True)
class ToolOutcome:
    content: str
    truncated: bool = False
    error: str | None = None


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema.pop("title", None)
    for prop in schema.get("properties", {}).values():
        prop.pop("title", None)
    schema.setdefault("properties", {})
    return schema


def _truncate(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return f"{text[:limit]}…（已截断，共 {len(text)} 字，只显示前 {limit} 字）", True


class ToolRegistry:
    def __init__(self, specs: Iterable[ToolSpec]):
        self._specs: dict[str, ToolSpec] = {}
        for spec in specs:
            self._specs[spec.name] = spec

    def __contains__(self, name: str) -> bool:
        return name in self._specs

    def names(self) -> list[str]:
        return list(self._specs)

    def with_specs(self, extra: Iterable[ToolSpec]) -> "ToolRegistry":
        return ToolRegistry([*self._specs.values(), *extra])

    def subset(self, names: Iterable[str]) -> "ToolRegistry":
        """只包含指定工具的新注册表；名字不存在时抛 KeyError。"""
        return ToolRegistry([self._specs[name] for name in names])

    def definitions(self, names: Iterable[str], style: str = "detailed") -> list[dict[str, Any]]:
        defs = []
        for name in names:
            spec = self._specs[name]
            defs.append(
                {
                    "type": "function",
                    "function": {
                        "name": spec.name,
                        "description": spec.terse if style == "terse" else spec.description,
                        "parameters": _schema(spec.params),
                    },
                }
            )
        return defs

    def execute(self, name: str, raw_args: str | None, ctx: ToolContext | None) -> ToolOutcome:
        spec = self._specs.get(name)
        if spec is None:
            return self._error(f"未知工具：{name}")
        try:
            data = json.loads(raw_args) if raw_args and raw_args.strip() else {}
            if not isinstance(data, dict):
                raise ValueError("参数必须是 JSON 对象")
        except ValueError as error:
            return self._error(f"参数不是合法的 JSON：{error}")
        try:
            args = spec.params.model_validate(data)
        except ValidationError as error:
            details = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in error.errors())
            return self._error(f"参数校验失败：{details}")
        try:
            result = spec.handler(ctx, args)
        except ToolError as error:
            return self._error(str(error))
        except Exception as error:  # noqa: BLE001 - 工具崩溃也要如实交给模型和轨迹
            log.exception("tool %s crashed", name)
            return self._error(f"工具内部错误：{type(error).__name__}: {error}")
        text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        content, truncated = _truncate(text, spec.max_chars)
        return ToolOutcome(content=content, truncated=truncated)

    @staticmethod
    def _error(message: str) -> ToolOutcome:
        return ToolOutcome(content=json.dumps({"error": message}, ensure_ascii=False), error=message)
