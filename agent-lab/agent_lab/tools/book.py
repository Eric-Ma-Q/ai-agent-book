"""书稿工具：只读 book/（中文版）。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .registry import ToolContext, ToolError, ToolSpec

READ_PAGE_CHARS = 6000


class ListChaptersArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int | None = Field(default=None, description="章号（1–10）。省略时只列各章标题和二级小节")


class SearchArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(description="检索词，中文或英文关键词")
    top_k: int = Field(default=5, ge=1, le=8, description="返回结果数")
    chapter: int | None = Field(default=None, description="只在这一章里检索")


class ReadSectionArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int = Field(description="章号")
    section_id: str = Field(description="小节 id，来自 search_book 或 list_chapters；空字符串表示章首导语")
    offset: int = Field(default=0, ge=0, description="从第几个字开始读，用于分页读取长小节")


def _chapter(ctx: ToolContext, number: int):
    chapter = ctx.book.chapters.get(number) if ctx.book else None
    if chapter is None:
        raise ToolError(f"第 {number} 章不存在")
    return chapter


def list_chapters(ctx: ToolContext, args: ListChaptersArgs) -> dict:
    numbers = [args.chapter] if args.chapter else sorted(ctx.book.chapters)
    chapters = []
    for number in numbers:
        chapter = _chapter(ctx, number)
        sections = [
            {"id": s.id, "title": s.title, "depth": s.depth}
            for s in chapter.sections
            if s.id and (args.chapter or s.depth == 2)
        ]
        chapters.append({"chapter": number, "title": chapter.title, "sections": sections})
    return {"chapters": chapters}


def search_book(ctx: ToolContext, args: SearchArgs) -> dict:
    kind = ctx.config.retrieval if ctx.config else "bm25"
    hits = ctx.search.search(args.query, top_k=args.top_k, chapter=args.chapter, kind=kind)
    return {
        "retrieval": kind,
        "results": [
            {
                "chapter": h.chapter,
                "section_id": h.section_id,
                "section_title": h.section_title,
                "snippet": h.snippet,
                "score": h.score,
            }
            for h in hits
        ],
    }


def read_section(ctx: ToolContext, args: ReadSectionArgs) -> dict:
    chapter = _chapter(ctx, args.chapter)
    section = chapter.section(args.section_id)
    if section is None:
        raise ToolError(f"第 {args.chapter} 章没有小节 {args.section_id!r}，请先用 list_chapters 查看目录")
    page = section.text[args.offset : args.offset + READ_PAGE_CHARS]
    end = args.offset + len(page)
    key = (args.chapter, args.section_id)
    if key not in ctx.state.sections_read:
        ctx.state.sections_read.append(key)
    return {
        "chapter": args.chapter,
        "section_id": section.id,
        "title": section.title,
        "parent_id": section.parent_id,
        "text": page,
        "remaining": max(len(section.text) - end, 0),
        "next_offset": end if end < len(section.text) else None,
    }


BOOK_TOOLS = [
    ToolSpec(
        "list_chapters",
        "列出全书目录。不带参数时返回各章标题和二级小节；指定 chapter 时返回该章全部小节（含三级）。"
        "小节 id 可以直接用于 read_section 和引用。",
        "列出目录。",
        ListChaptersArgs,
        list_chapters,
        max_chars=8000,
    ),
    ToolSpec(
        "search_book",
        "在全书正文中检索，返回最相关的片段及其所在章节和小节 id。"
        "适合先定位相关内容，再用 read_section 阅读完整小节。可以换不同关键词多次检索。",
        "检索书稿。",
        SearchArgs,
        search_book,
    ),
    ToolSpec(
        "read_section",
        "阅读某一小节的完整正文。长小节会分页，返回 remaining 和 next_offset，"
        "需要时用 offset 继续读。引用原文前应先阅读对应小节。",
        "读小节。",
        ReadSectionArgs,
        read_section,
        max_chars=READ_PAGE_CHARS + 1000,
    ),
]
