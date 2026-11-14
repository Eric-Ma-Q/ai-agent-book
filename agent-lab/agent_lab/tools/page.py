"""随页问答的页面工具（需求 016）：只读当前页面快照，按块切片。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..page import MAX_BRIEF_CHARS, MAX_RANGE_CHARS, PageError
from .registry import ToolContext, ToolError, ToolSpec

Scope = Literal["current", "section", "page", "selection", "outline"]
ElementKind = Literal["all", "table", "code", "figure", "link", "formula"]


def _page(ctx: ToolContext):
    if ctx.page is None:
        raise ToolError("当前问题没有页面快照；这个工具只在随页问答里可用")
    return ctx.page


class ContextArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Scope = Field(default="current", description="current=当前视口附近；section=当前小节；page=整页；selection=选中文字；outline=大纲")
    max_chars: int = Field(default=MAX_BRIEF_CHARS, ge=500, le=20_000, description="返回文本的字符上限")


class RangeArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_block: int = Field(ge=0, description="起始块序号（含）")
    end_block: int = Field(ge=0, description="结束块序号（含）")
    max_chars: int = Field(default=MAX_RANGE_CHARS, ge=500, le=20_000, description="返回文本的字符上限")


class FindArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=200, description="要检索的词或短语")
    limit: int = Field(default=5, ge=1, le=10, description="最多返回几个命中块")


class ElementsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ElementKind = Field(default="all", description="要提取的元素类型")
    limit: int = Field(default=10, ge=1, le=20, description="每类最多返回几个")


class NoArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


def page_context(ctx: ToolContext, args: ContextArgs) -> dict:
    try:
        return _page(ctx).context(args.scope, args.max_chars)
    except PageError as error:
        raise ToolError(str(error)) from error


def page_read_range(ctx: ToolContext, args: RangeArgs) -> dict:
    if args.end_block < args.start_block:
        raise ToolError("end_block 不能小于 start_block")
    if args.end_block - args.start_block > 400:
        raise ToolError("一次最多读取 400 个块；请缩小范围")
    return _page(ctx).read_range(args.start_block, args.end_block, args.max_chars)


def page_find(ctx: ToolContext, args: FindArgs) -> dict:
    try:
        return _page(ctx).find(args.query, args.limit)
    except PageError as error:
        raise ToolError(str(error)) from error


def page_outline(ctx: ToolContext, _args: NoArgs) -> dict:
    return _page(ctx).outline()


def page_elements(ctx: ToolContext, args: ElementsArgs) -> dict:
    return _page(ctx).elements(args.kind, args.limit)


def page_selection(ctx: ToolContext, _args: NoArgs) -> dict:
    return _page(ctx).selection()


def page_screenshot(ctx: ToolContext, _args: NoArgs) -> dict:
    return _page(ctx).screenshot()


PAGE_TOOLS = [
    ToolSpec(
        "page_context",
        "读取读者当前页面的结构化上下文。默认返回当前视口附近的块，带块序号、小节和是否在视口。"
        "scope=section 看当前小节，scope=page 看整页（受字符上限截断），scope=selection 看选中文字，"
        "scope=outline 看标题大纲。读者说「这里」「这段」时先用它确认位置。",
        "读当前页面。",
        ContextArgs,
        page_context,
        max_chars=22_000,
    ),
    ToolSpec(
        "page_read_range",
        "按块序号读取页面中更大的范围（含首尾）。page_context 只给当前视口附近；"
        "需要前后文、整节或整页时用它，单次最多 12000 字。",
        "按块读页面。",
        RangeArgs,
        page_read_range,
        max_chars=22_000,
    ),
    ToolSpec(
        "page_find",
        "在当前页面快照里检索关键词，返回命中块、小节和上下文片段。适合定位读者提到的词或检查页面是否讲到某个概念。",
        "在页面里找。",
        FindArgs,
        page_find,
    ),
    ToolSpec("page_outline", "返回当前页面的标题层级、当前块和小节大纲。", "页面大纲。", NoArgs, page_outline),
    ToolSpec(
        "page_elements",
        "提取页面里的表格、代码块、图注、公式或链接。读者问「这个表/这段代码/这张图」时用它。",
        "提取页面元素。",
        ElementsArgs,
        page_elements,
    ),
    ToolSpec("page_selection", "返回读者在页面上选中的文字及所在块；没有选中时如实说明。", "读选中文字。", NoArgs, page_selection),
    ToolSpec(
        "page_screenshot",
        "返回当前视口截图的元信息（尺寸、是否提供给视觉模型、截图地址）以及视口与当前位置。"
        "截图在提问时自动采集；这个工具不会重新截屏，也不要声称看到了像素内容。",
        "看截图信息。",
        NoArgs,
        page_screenshot,
    ),
]
