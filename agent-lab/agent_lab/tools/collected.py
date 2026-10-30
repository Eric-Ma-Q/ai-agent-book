"""个人收集网页（Harness 归档）的只读工具：目录、检索与阅读。

和 MCP 共用 `agent_lab.mcp.collected.CollectedService`，避免两套检索与抽取逻辑。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..mcp.collected import CollectedService
from ..mcp.models import ListPagesArgs, ReadPageArgs, SearchPagesArgs, ToolInputError
from .registry import ToolContext, ToolError, ToolSpec


class PageListArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str | None = Field(default=None, description="分类 id：pages / research / longform / docs / collab")
    offset: int = Field(default=0, ge=0, description="从第几条开始列")
    limit: int = Field(default=30, ge=1, le=100, description="本页条数")


class PageSearchArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=200, description="检索词，中文或英文关键词")
    top_k: int = Field(default=5, ge=1, le=10)
    category: str | None = Field(default=None, description="只检索这一分类；省略时检索内容页 pages")


class PageReadArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str | None = Field(default=None, description="归档相对路径，例如 archive/task-queue.html")
    url: str | None = Field(default=None, description="阅读器链接，例如 /harness/site/task-queue.html")
    offset: int = Field(default=0, ge=0, description="从第几个字开始读")

    @model_validator(mode="after")
    def _one_target(self) -> "PageReadArgs":
        if bool(self.path) == bool(self.url):
            raise ValueError("path 与 url 必须且只能提供一个")
        return self


def _service(ctx: ToolContext) -> CollectedService:
    if ctx.collected is None:
        raise ToolError("当前环境没有接入个人收集网页")
    return ctx.collected


def list_pages(ctx: ToolContext, args: PageListArgs) -> dict:
    try:
        result = _service(ctx).list_pages(ListPagesArgs(category=args.category, offset=args.offset, limit=args.limit))
    except ToolInputError as error:
        raise ToolError(str(error)) from error
    return result.structured or {}


def search_pages(ctx: ToolContext, args: PageSearchArgs) -> dict:
    try:
        result = _service(ctx).search_pages(SearchPagesArgs(query=args.query, top_k=args.top_k, category=args.category))
    except ToolInputError as error:
        raise ToolError(str(error)) from error
    return result.structured or {}


def read_page(ctx: ToolContext, args: PageReadArgs) -> dict:
    try:
        result = _service(ctx).read_page(ReadPageArgs(path=args.path, url=args.url, offset=args.offset))
    except ToolInputError as error:
        raise ToolError(str(error)) from error
    return result.structured or {}


COLLECTED_TOOLS = [
    ToolSpec(
        "list_pages",
        "列出读者收集的 Harness 归档网页（个人收集网页），可按分类过滤；只含可读文本归档。",
        "列出个人收集网页。",
        PageListArgs,
        list_pages,
    ),
    ToolSpec(
        "search_pages",
        "在读者收集的 Harness 归档网页中检索，返回片段、标题、路径、链接与分数。",
        "检索收集网页。",
        PageSearchArgs,
        search_pages,
    ),
    ToolSpec(
        "read_page",
        "阅读一篇收集网页的正文，按 6000 字分页，返回 remaining 与 next_offset。",
        "读收集网页。",
        PageReadArgs,
        read_page,
    ),
]
