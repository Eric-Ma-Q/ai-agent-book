"""随页问答的页面快照与切片（需求 016）。

浏览器把当前页面整理成一份结构化快照：标题层级、内容块、视口位置、选中文字
与页面元信息。本模块只做校验、索引和切片，不访问 DOM；服务端模型每次只看到
当前视口附近的一小段，需要时再用工具扩大范围。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_BLOCKS = 3000
MAX_BLOCK_CHARS = 4000
MAX_TOTAL_CHARS = 250_000
MAX_BRIEF_CHARS = 6000
MAX_RANGE_CHARS = 12_000
MAX_HEADINGS = 300
MAX_LINKS = 200
PAGE_TOOL_NAMES = (
    "page_context",
    "page_read_range",
    "page_find",
    "page_outline",
    "page_elements",
    "page_selection",
    "page_screenshot",
    "search_book",
    "read_section",
    "list_chapters",
    "list_highlights",
    "list_inserts",
    "read_file",
    "glob",
    "grep",
    "write_file",
    "edit_file",
    "bash",
    "code_interpreter",
    "web_search",
    "web_fetch",
)
PAGE_DEFAULTS = {
    "tools": PAGE_TOOL_NAMES,
    "max_turns": 12,
    "max_total_tokens": 160_000,
    "temperature": 0.2,
    "compression": "truncate",
    "keep_recent_tool_results": 3,
    "status_bar": True,
    "final_answer": True,
    "reviewer": "none",
    "subagent": "none",
    "distractor_tools": 0,
}

# 概念图只读本章结构，4 轮内收尾；输出上限跟随模型配置。
PAGE_MAP_DEFAULTS = {
    **PAGE_DEFAULTS,
    "tools": ("page_outline", "list_chapters", "search_book", "read_section"),
    "max_turns": 4,
    "max_total_tokens": 80_000,
    "keep_recent_tool_results": 2,
}

ROLE_TAGS = {
    "h1": "heading",
    "h2": "heading",
    "h3": "heading",
    "h4": "heading",
    "p": "paragraph",
    "li": "list",
    "pre": "code",
    "code": "code",
    "blockquote": "quote",
    "table": "table",
    "figure": "figure",
    "figcaption": "figure",
    "dt": "list",
    "dd": "list",
}


class PageError(ValueError):
    """页面快照不合法；消息可以直接给读者看。"""


def _limit_snapshot(snapshot: PageSnapshot, focus_index: int | None = None) -> PageSnapshot:
    """超出文本上限时优先保留当前块和视口附近，再按距离补足。

    读者明确选中的元素必须保留：它可能在页面末尾，按距离排序会被先丢掉。
    """
    blocks = snapshot.blocks
    center = snapshot.current.blockIndex
    if center not in {block.index for block in blocks}:
        center = next((block.index for block in blocks if block.inViewport), blocks[0].index if blocks else 0)
    ordered = sorted(blocks, key=lambda block: -1 if block.index == center else abs(block.index - center))
    keep: set[int] = set()
    used = 0
    if focus_index is not None:
        focus = next((block for block in blocks if block.index == focus_index), None)
        if focus is not None:
            keep.add(focus.index)
            used += len(focus.text)
    for block in ordered:
        if block.index in keep:
            continue
        if used + len(block.text) > MAX_TOTAL_CHARS and keep:
            continue
        keep.add(block.index)
        used += len(block.text)
    return snapshot.model_copy(
        update={
            "blocks": [block for block in blocks if block.index in keep],
            "headings": [heading for heading in snapshot.headings if heading.blockIndex is None or heading.blockIndex in keep],
            "links": [link for link in snapshot.links if link.blockIndex is None or link.blockIndex in keep],
            "truncated": True,
        }
    )


class Viewport(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    width: int = Field(default=0, ge=0, le=100_000)
    height: int = Field(default=0, ge=0, le=100_000)
    scrollY: float = Field(default=0, ge=0)
    pageHeight: float = Field(default=0, ge=0)
    scrollRatio: float = Field(default=0, ge=0, le=1)
    devicePixelRatio: float = Field(default=1, gt=0, le=10)

    @model_validator(mode="after")
    def _ratio(self) -> "Viewport":
        if not self.scrollRatio and self.pageHeight > self.height:
            usable = self.pageHeight - self.height
            object.__setattr__(self, "scrollRatio", min(max(self.scrollY / usable, 0), 1) if usable > 0 else 0)
        return self


class ChapterInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    number: int | None = Field(default=None, ge=1, le=999)
    key: str = Field(default="", max_length=200)
    title: str = Field(default="", max_length=300)


class CurrentInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    blockIndex: int | None = Field(default=None, ge=0)
    blockId: str = Field(default="", max_length=300)
    sectionId: str = Field(default="", max_length=300)
    sectionTitle: str = Field(default="", max_length=300)
    percent: float = Field(default=0, ge=0, le=1)


class SelectionInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(default="", max_length=20_000)
    blockIndex: int | None = Field(default=None, ge=0)
    sectionId: str = Field(default="", max_length=300)


class Heading(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default="", max_length=300)
    text: str = Field(default="", max_length=300)
    level: int = Field(default=2, ge=1, le=6)
    blockIndex: int | None = Field(default=None, ge=0)


class Block(BaseModel):
    model_config = ConfigDict(extra="ignore")

    index: int = Field(ge=0)
    id: str = Field(default="", max_length=300)
    tag: str = Field(default="", max_length=20)
    role: str = Field(default="other", max_length=20)
    sectionId: str = Field(default="", max_length=300)
    sectionTitle: str = Field(default="", max_length=300)
    text: str = Field(default="", max_length=MAX_BLOCK_CHARS)
    top: float = Field(default=0, ge=0)
    height: float = Field(default=0, ge=0)
    inViewport: bool = False

    @field_validator("role")
    @classmethod
    def _role(cls, value: str) -> str:
        return value if value in {"heading", "paragraph", "list", "code", "quote", "table", "figure", "other"} else ROLE_TAGS.get(value, "other")

    @field_validator("text")
    @classmethod
    def _text(cls, value: str) -> str:
        return re.sub(r"[ \t]+\n", "\n", value).strip()


class Link(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(default="", max_length=300)
    href: str = Field(default="", max_length=2000)
    blockIndex: int | None = Field(default=None, ge=0)


class PageSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: int = Field(default=1, ge=1, le=10)
    url: str = Field(default="", max_length=4000)
    title: str = Field(default="", max_length=500)
    path: str = Field(default="", max_length=2000)
    lang: str = Field(default="", max_length=40)
    pageType: str = Field(default="other", max_length=40)
    capturedAt: str = Field(default="", max_length=60)
    viewport: Viewport = Field(default_factory=Viewport)
    chapter: ChapterInfo = Field(default_factory=ChapterInfo)
    current: CurrentInfo = Field(default_factory=CurrentInfo)
    selection: SelectionInfo | None = None
    headings: list[Heading] = Field(default_factory=list, max_length=MAX_HEADINGS)
    blocks: list[Block] = Field(default_factory=list, max_length=MAX_BLOCKS)
    links: list[Link] = Field(default_factory=list, max_length=MAX_LINKS)
    truncated: bool = False

    @field_validator("blocks")
    @classmethod
    def _blocks(cls, value: list[Block]) -> list[Block]:
        seen: set[int] = set()
        out: list[Block] = []
        for block in value:
            if block.index in seen:
                continue
            seen.add(block.index)
            out.append(block)
        out.sort(key=lambda item: item.index)
        if sum(len(item.text) for item in out) > MAX_TOTAL_CHARS * 2:
            raise ValueError(f"页面文本超过 {MAX_TOTAL_CHARS * 2} 字，请只发送当前页面")
        return out

    @field_validator("headings")
    @classmethod
    def _headings(cls, value: list[Heading]) -> list[Heading]:
        return [item for item in value if item.text.strip()][:MAX_HEADINGS]

    @model_validator(mode="after")
    def _consistent(self) -> "PageSnapshot":
        if self.selection is not None and not self.selection.text.strip():
            object.__setattr__(self, "selection", None)
        return self


@dataclass(frozen=True)
class PageStats:
    block_count: int
    text_chars: int
    truncated: bool
    viewport_blocks: int


@dataclass
class PageContext:
    """一次运行内的页面视图；只读，工具通过它切片。"""

    snapshot: PageSnapshot
    screenshot_url: str = ""
    screenshot_bytes: int = 0
    screenshot_width: int = 0
    screenshot_height: int = 0
    screenshot_kind: str = "viewport"
    vision: bool = False
    screenshot_available: bool = False
    blocks_by_index: dict[int, Block] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.blocks_by_index = {block.index: block for block in self.snapshot.blocks}
        if not self.blocks_by_index:
            return
        current = self.snapshot.current.blockIndex
        if current in self.blocks_by_index:
            self._current = current
        else:
            self._current = self._nearest_index()

    @classmethod
    def from_snapshot(cls, data: dict[str, Any], focus_index: int | None = None, **kwargs: Any) -> "PageContext":
        try:
            snapshot = PageSnapshot.model_validate(data)
        except (ValueError, TypeError) as error:
            raise PageError(f"页面快照不合法：{error}") from error
        if sum(len(block.text) for block in snapshot.blocks) > MAX_TOTAL_CHARS:
            snapshot = _limit_snapshot(snapshot, focus_index)
        return cls(snapshot=snapshot, **kwargs)

    @property
    def stats(self) -> PageStats:
        return PageStats(
            block_count=len(self.snapshot.blocks),
            text_chars=sum(len(block.text) for block in self.snapshot.blocks),
            truncated=self.snapshot.truncated,
            viewport_blocks=sum(1 for block in self.snapshot.blocks if block.inViewport),
        )

    @property
    def current_index(self) -> int | None:
        return getattr(self, "_current", None)

    @property
    def current_block(self) -> Block | None:
        return self.blocks_by_index.get(self.current_index) if self.current_index is not None else None

    @property
    def current_section(self) -> tuple[str, str]:
        block = self.current_block
        if block is not None and block.sectionId:
            return block.sectionId, block.sectionTitle
        return self.snapshot.current.sectionId, self.snapshot.current.sectionTitle

    def _nearest_index(self) -> int | None:
        blocks = self.snapshot.blocks
        if not blocks:
            return None
        target = self.snapshot.viewport.scrollY + self.snapshot.viewport.height / 2
        visible = [block for block in blocks if block.inViewport]
        pool = visible or blocks
        return min(pool, key=lambda block: abs(block.top + block.height / 2 - target)).index

    def _section_blocks(self) -> list[Block]:
        section_id, _ = self.current_section
        if section_id:
            selected = [block for block in self.snapshot.blocks if block.sectionId == section_id]
            if selected:
                return selected
        return self._window_blocks(around=self.current_index, before=4, after=10)

    def _window_blocks(self, around: int | None, before: int = 2, after: int = 8) -> list[Block]:
        blocks = self.snapshot.blocks
        if not blocks:
            return []
        if around is None or around not in self.blocks_by_index:
            return blocks[: before + after + 1]
        order = blocks
        at = next(index for index, block in enumerate(order) if block.index == around)
        return order[max(0, at - before) : at + after + 1]

    def _trim(self, blocks: Iterable[Block], max_chars: int) -> tuple[list[Block], bool]:
        out: list[Block] = []
        used = 0
        for block in blocks:
            text = block.text
            if not text:
                continue
            if out and used + len(text) > max_chars:
                return out, True
            if len(text) > max_chars:
                out.append(block)
                return out, True
            out.append(block)
            used += len(text)
        return out, False

    @staticmethod
    def _block_payload(block: Block) -> dict[str, Any]:
        return {
            "index": block.index,
            "tag": block.tag,
            "role": block.role,
            "section_id": block.sectionId,
            "section_title": block.sectionTitle,
            "in_viewport": block.inViewport,
            "text": block.text,
        }

    @staticmethod
    def _join(blocks: list[Block], max_chars: int) -> tuple[str, bool]:
        chunks: list[str] = []
        used = 0
        for block in blocks:
            head = f"[#{block.index} {block.role}]"
            text = block.text.strip()
            if not text:
                continue
            room = max_chars - used - len(head) - 2
            if room <= 80:
                return "\n".join(chunks), True
            piece = text if len(text) <= room else text[:room] + "…"
            chunks.append(f"{head} {piece}")
            used += len(head) + len(piece) + 2
        return "\n".join(chunks), False

    def context(self, scope: str = "current", max_chars: int = MAX_BRIEF_CHARS) -> dict[str, Any]:
        scope = scope if scope in {"current", "section", "page", "selection", "outline"} else "current"
        if scope == "selection":
            return self.selection()
        if scope == "outline":
            return self.outline()
        if scope == "section":
            blocks, truncated = self._trim(self._section_blocks(), max_chars)
        elif scope == "page":
            blocks, truncated = self._trim(self.snapshot.blocks, max_chars)
        else:
            blocks, truncated = self._trim(self._window_blocks(self.current_index), max_chars)
        section_id, section_title = self.current_section
        text, cut = self._join(blocks, max_chars)
        return {
            "scope": scope,
            "page": self.meta(),
            "section": {"id": section_id, "title": section_title},
            "blocks": [self._block_payload(block) for block in blocks],
            "text": text,
            "truncated": truncated or cut,
            "available_blocks": [self.snapshot.blocks[0].index, self.snapshot.blocks[-1].index] if self.snapshot.blocks else [],
            "hint": "需要更大范围时用 page_read_range；需要定位关键词时用 page_find。",
        }

    def read_range(self, start: int, end: int, max_chars: int = MAX_RANGE_CHARS) -> dict[str, Any]:
        if end < start:
            start, end = end, start
        blocks = [block for block in self.snapshot.blocks if start <= block.index <= end]
        selected, truncated = self._trim(blocks, max_chars)
        text, cut = self._join(selected, max_chars)
        next_block = None
        if selected:
            after = [block for block in self.snapshot.blocks if block.index > selected[-1].index]
            next_block = after[0].index if after else None
        return {
            "range": [start, end],
            "blocks": [self._block_payload(block) for block in selected],
            "text": text,
            "truncated": truncated or cut,
            "next_block": next_block,
            "available_blocks": [self.snapshot.blocks[0].index, self.snapshot.blocks[-1].index] if self.snapshot.blocks else [],
        }

    def find(self, query: str, limit: int = 5) -> dict[str, Any]:
        query = query.strip()
        if not query:
            raise PageError("检索词不能为空")
        needle = query.casefold()
        hits: list[dict[str, Any]] = []
        for block in self.snapshot.blocks:
            haystack = block.text.casefold()
            at = haystack.find(needle)
            if at < 0:
                continue
            start = max(0, at - 80)
            end = min(len(block.text), at + len(query) + 120)
            snippet = block.text[start:end]
            if start:
                snippet = f"…{snippet}"
            if end < len(block.text):
                snippet = f"{snippet}…"
            hits.append(
                {
                    "index": block.index,
                    "role": block.role,
                    "section_id": block.sectionId,
                    "section_title": block.sectionTitle,
                    "in_viewport": block.inViewport,
                    "snippet": snippet,
                }
            )
            if len(hits) >= limit:
                break
        return {"query": query, "count": len(hits), "hits": hits, "limit": limit}

    def outline(self) -> dict[str, Any]:
        headings = [item.model_dump() for item in self.snapshot.headings]
        if not headings:
            headings = [
                {"id": block.id, "text": block.text, "level": 2, "blockIndex": block.index}
                for block in self.snapshot.blocks
                if block.role == "heading"
            ]
        current = self.current_block
        return {
            "title": self.snapshot.title,
            "chapter": self.snapshot.chapter.model_dump(),
            "current_block": current.index if current else None,
            "headings": headings,
        }

    def elements(self, kind: str = "all", limit: int = 10) -> dict[str, Any]:
        kind = kind if kind in {"all", "table", "code", "figure", "link", "formula"} else "all"
        roles = {"table": "table", "code": "code", "figure": "figure"}.get(kind)
        out: list[dict[str, Any]] = []
        if kind in {"all", "table", "code", "figure"}:
            for block in self.snapshot.blocks:
                if roles and block.role != roles:
                    continue
                if block.role not in {"table", "code", "figure"}:
                    continue
                out.append(self._block_payload(block))
                if len(out) >= limit:
                    break
        links = []
        if kind in {"all", "link"}:
            links = [item.model_dump() for item in self.snapshot.links[:limit]]
        formulas = []
        if kind in {"all", "formula"}:
            for block in self.snapshot.blocks:
                if "$" in block.text or "\\(" in block.text:
                    formulas.append(self._block_payload(block))
                    if len(formulas) >= limit:
                        break
        return {"kind": kind, "elements": out, "links": links, "formulas": formulas}

    def selection(self) -> dict[str, Any]:
        selection = self.snapshot.selection
        if selection is None or not selection.text.strip():
            return {"selected": False, "text": "", "hint": "读者当前没有选中文字；可以问当前视口或指定小节。"}
        return {
            "selected": True,
            "text": selection.text,
            "block_index": selection.blockIndex,
            "section_id": selection.sectionId,
            "block": self._block_payload(self.blocks_by_index[selection.blockIndex]) if selection.blockIndex in self.blocks_by_index else None,
        }

    def screenshot(self) -> dict[str, Any]:
        visible = [
            {
                "index": block.index,
                "role": block.role,
                "top": round(block.top, 1),
                "height": round(block.height, 1),
                "text": block.text[:160],
            }
            for block in self.snapshot.blocks
            if block.inViewport
        ][:40]
        if not self.vision:
            note = "当前模型只接收文本快照；截图仅供读者在面板查看，不要声称看到了像素内容。"
        elif self.screenshot_kind == "element":
            note = "截图只包含读者选中的页面元素，已作为图片消息提供给视觉模型；不要描述元素之外的页面内容。"
        else:
            note = "截图已作为图片消息提供给视觉模型，可以描述布局与可见内容。"
        return {
            "available": self.screenshot_available,
            "kind": self.screenshot_kind,
            "width": self.screenshot_width,
            "height": self.screenshot_height,
            "bytes": self.screenshot_bytes,
            "url": self.screenshot_url,
            "vision": self.vision,
            "note": note,
            "viewport": self.snapshot.viewport.model_dump(),
            "current": self.snapshot.current.model_dump(),
            "visible_blocks": visible,
        }

    def meta(self) -> dict[str, Any]:
        section_id, section_title = self.current_section
        current = self.current_block
        return {
            "url": self.snapshot.url,
            "title": self.snapshot.title,
            "page_type": self.snapshot.pageType,
            "chapter": self.snapshot.chapter.model_dump(),
            "section": {"id": section_id, "title": section_title},
            "scroll_ratio": round(self.snapshot.viewport.scrollRatio, 3),
            "current_block": current.index if current else None,
            "selection": (self.snapshot.selection.text[:120] if self.snapshot.selection else ""),
            "blocks": len(self.snapshot.blocks),
            "truncated": self.snapshot.truncated,
            "screenshot_kind": self.screenshot_kind,
        }

    def prelude(self, max_chars: int = MAX_BRIEF_CHARS, mode: str = "ask", focus: Block | None = None) -> str:
        data = self.context("current", max_chars)
        page = data["page"]
        lines = [
            "【页面快照 · 系统自动采集】",
            f"标题：{page['title'] or '（无标题）'}",
            f"地址：{page['url'] or '（未知）'}",
            f"类型：{page['page_type']}；章节：{page['chapter'].get('title') or page['chapter'].get('number') or '无'}",
            f"当前小节：{page['section'].get('title') or page['section'].get('id') or '无'}；滚动位置：{round(page['scroll_ratio'] * 100)}%",
            f"页面共 {page['blocks']} 块；当前视口 {self.stats.viewport_blocks} 块；选中：{'有' if page['selection'] else '无'}",
        ]
        if mode == "check":
            lines.append("【本轮模式】检验：回答最后用 ```check 围栏出一道题；读者下一条消息视为作答，先判卷再补充。")
        elif mode == "map":
            lines.append("【本轮模式】概念图：只输出一个 ```concept 围栏，里面是 JSON；不要输出围栏外文字。")
        if focus is not None:
            where = focus.sectionTitle or focus.sectionId
            lines.append(
                f"【聚焦元素】读者选择了第 {focus.index} 块（{focus.role}）"
                + (f"，所在小节：{where}" if where else "")
            )
            lines.append("截图只包含这个元素；需要更大范围时用 page_read_range 读相邻块。")
            lines.append(focus.text[:MAX_BLOCK_CHARS])
            neighbors = [block for block in self._window_blocks(focus.index, before=2, after=2) if block.index != focus.index]
            neighbor_text, _ = self._join(neighbors, 2_000)
            if neighbor_text:
                lines.append("相邻上下文：")
                lines.append(neighbor_text)
            if not self.vision:
                lines.append("当前模型是文本模型，看不到图片；只能依据图注、聚焦块文字和相邻正文回答。")
        if self.screenshot_available:
            target = "聚焦元素" if self.screenshot_kind == "element" else "当前视口"
            lines.append(f"截图：已采集{target}" + ("，并已提供给视觉模型" if self.vision else "，仅供读者查看"))
        if self.snapshot.selection is not None:
            selected = " ".join(self.snapshot.selection.text.split())
            lines.append(f"选中文字：{selected[:1200]}")
        if self.snapshot.truncated:
            lines.append("注意：页面文本超过采集上限，已截断。")
        lines.append("")
        lines.append(data["text"])
        if data["truncated"]:
            lines.append("…（当前范围已截断；需要更多内容请调用 page_read_range）")
        lines.append("")
        if mode == "map":
            lines.append("【使用提示】先用 page_outline 看本章小节，需要完整小节 id 用 list_chapters(chapter=N)，需要核对概念用 read_section；只输出 concept 围栏。")
        else:
            lines.append("【使用提示】先用页面工具确认读者所指的内容；需要更大范围用 page_read_range，需要书稿对照用 search_book/read_section，需要仓库事实用 grep/read_file/bash，需要外部资料用 web_search/web_fetch。")
        tail = ""
        if mode == "check":
            tail = "【检验提示】读者下一条消息是对上一条 check 题的作答；先判卷（对 / 部分对 / 不对），指出漏掉或说错的点，再补充。页面前言不是读者的新问题。"
        elif mode == "map":
            tail = "【概念图提示】只输出一个 ```concept 围栏，里面是 JSON；不要输出围栏外文字。"
        text = "\n".join(lines)
        if tail:
            room = MAX_BRIEF_CHARS - len(tail) - 2
            if len(text) > room:
                text = text[:room]
            text = f"{text}\n\n{tail}"
        return text[:MAX_BRIEF_CHARS] if len(text) > MAX_BRIEF_CHARS else text


def page_tool_names() -> tuple[str, ...]:
    return PAGE_TOOL_NAMES


def page_config_overrides(model_profile: str = "", mode: str = "ask") -> dict[str, Any]:
    base = PAGE_MAP_DEFAULTS if mode == "map" else PAGE_DEFAULTS
    return {**base, "model_profile": model_profile}


__all__ = [
    "MAX_BRIEF_CHARS",
    "PAGE_DEFAULTS",
    "PAGE_MAP_DEFAULTS",
    "PAGE_TOOL_NAMES",
    "Block",
    "PageContext",
    "PageError",
    "PageSnapshot",
    "PageStats",
]
