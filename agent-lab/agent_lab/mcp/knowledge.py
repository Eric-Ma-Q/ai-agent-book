"""MCP 只读知识工具：书稿、划线、补充与批注。

所有输出都先给人读的文本，再给结构化的同义数据；两层共用同一批对象，避免
外部模型看到的内容和程序拿到的字段不一致。
"""

from __future__ import annotations

from typing import Any

from ..book.parser import Chapter
from ..stores import NotesStore
from .format import absolute_link, cap, number
from .models import (
    AnnotationsArgs,
    HighlightsArgs,
    InsertsArgs,
    ListChaptersArgs,
    ReadSectionArgs,
    SearchArgs,
    ToolInputError,
    ToolResult,
)

READ_CHARS = 6000
CHAPTER_CHARS = 12_000
SNIPPET_CHARS = 400
ITEM_LIMIT = 200
ITEM_TEXT_CHARS = 1200
KIND_LABELS = {"term": "术语", "ref": "出处", "entity": "实体", "update": "时效", "extend": "延伸"}


class KnowledgeService:
    def __init__(self, lab: Any, *, personal: bool, reader_url: str):
        self.lab = lab
        self.personal = personal
        self.reader_url = reader_url

    # -- 基础 -------------------------------------------------------------

    def _chapter(self, number: int) -> Chapter:
        chapter = self.lab.book.chapters.get(number) if self.lab.book else None
        if chapter is None:
            available = "、".join(str(n) for n in sorted(self.lab.book.chapters)) if self.lab.book else ""
            raise ToolInputError(f"第 {number} 章不存在；可用的章：{available or '无'}")
        return chapter

    def _notes(self) -> NotesStore:
        notes = (self.lab.extras or {}).get("notes") if hasattr(self.lab, "extras") else None
        if notes is None:
            raise ToolInputError("当前环境没有接入读者笔记")
        return notes

    def _link(self, chapter: int, section_id: str | None = None, quote_text: str = "") -> str:
        return absolute_link(self.reader_url, chapter, section_id, quote_text)

    def _known(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """忽略已不存在的章（例如书稿改版后残留的 chapter11 笔记）。"""
        chapters = set(self.lab.book.chapters) if self.lab.book else set()
        return [item for item in items if item["chapter"] in chapters]

    @staticmethod
    def _chapter_label(chapter: Chapter) -> str:
        title = chapter.title.strip()
        if title.startswith(f"第 {chapter.number} 章") or title.startswith(f"第{chapter.number}章"):
            return title
        return f"第 {chapter.number} 章 · {title}" if title else f"第 {chapter.number} 章"

    @staticmethod
    def _section_path(chapter: int, section_id: str) -> str:
        return f"第 {chapter} 章 · {section_id or '章首导语'}"

    # -- 书稿 -------------------------------------------------------------

    def list_chapters(self, args: ListChaptersArgs) -> ToolResult:
        numbers = [args.chapter] if args.chapter else sorted(self.lab.book.chapters)
        chapters: list[dict[str, Any]] = []
        lines: list[str] = [f"全书 {len(numbers)} 章：" if not args.chapter else f"第 {args.chapter} 章的目录："]
        for number in numbers:
            chapter = self._chapter(number)
            sections = [
                section
                for section in chapter.sections
                if section.id and (args.chapter is not None or section.depth == 2)
            ]
            item = {
                "chapter": number,
                "title": chapter.title,
                "link": self._link(number),
                "sections": [
                    {"id": section.id, "title": section.title, "depth": section.depth, "parent_id": section.parent_id}
                    for section in sections
                ],
            }
            chapters.append(item)
            lines.append(f"## {self._chapter_label(chapter)}")
            lines.append(f"链接：{item['link']}")
            if sections:
                for section in sections:
                    lines.append(f"- {section.title}（section_id={section.id}）")
            else:
                lines.append("- （这一章没有二级小节）")
        text = "\n".join(lines)
        if len(text) > CHAPTER_CHARS:
            text = f"{text[:CHAPTER_CHARS]}\n\n…（目录较长，已截断；指定 chapter 查看单章）"
        return ToolResult(cap(text), {"chapters": chapters})

    def search_book(self, args: SearchArgs) -> ToolResult:
        query = args.query.strip()
        if not query:
            raise ToolInputError("检索词不能为空")
        if args.chapter is not None:
            self._chapter(args.chapter)
        hits = self.lab.search.search(query, top_k=args.top_k, chapter=args.chapter, kind="bm25")
        results = [
            {
                "chapter": hit.chapter,
                "section_id": hit.section_id,
                "section_title": hit.section_title,
                "snippet": hit.snippet[:SNIPPET_CHARS],
                "score": hit.score,
                "link": self._link(hit.chapter, hit.section_id, hit.snippet[:120]),
            }
            for hit in hits
        ]
        if not results:
            text = f"检索「{query}」（bm25）没有命中。可以换更短的关键词，或去掉 chapter 限制再试。"
            return ToolResult(text, {"query": query, "retrieval": "bm25", "results": []})
        lines = [f"检索「{query}」（bm25），命中 {len(results)} 条："]
        for index, item in enumerate(results, 1):
            lines.append(
                f"{index}. 第 {item['chapter']} 章 · {item['section_title']}"
                f"（section_id={item['section_id'] or '章首导语'}，score={item['score']}）"
            )
            lines.append(f"   {item['snippet']}")
            lines.append(f"   链接：{item['link']}")
        return ToolResult(cap("\n".join(lines)), {"query": query, "retrieval": "bm25", "results": results})

    def read_section(self, args: ReadSectionArgs) -> ToolResult:
        chapter = self._chapter(args.chapter)
        section = chapter.section(args.section_id)
        if section is None:
            ids = [s.id for s in chapter.sections if s.id][:30]
            hint = "、".join(ids) if ids else "无"
            raise ToolInputError(f"第 {args.chapter} 章没有小节 {args.section_id!r}；可用的小节 id：{hint}")
        total = len(section.text)
        if args.offset > total:
            raise ToolInputError(f"offset 超出小节长度：这一小节共 {total} 字，offset={args.offset}")
        page = section.text[args.offset : args.offset + READ_CHARS]
        end = args.offset + len(page)
        remaining = max(total - end, 0)
        link = self._link(args.chapter, section.id)
        header = (
            f"{self._chapter_label(chapter)} · {section.title}"
            f"（section_id={section.id or '章首导语'}，共 {number(total)} 字）"
        )
        if not page:
            reason = "offset 已经到这一小节的末尾。" if total else "这一小节没有正文。"
            text = f"{header}\n\n{reason}\n链接：{link}"
        else:
            text = f"{header}\n\n{page}"
            if remaining:
                text += f"\n\n---\n剩余 {number(remaining)} 字；继续读：offset={end}\n链接：{link}"
            else:
                text += f"\n\n---\n已读完这一小节。\n链接：{link}"
        structured = {
            "chapter": args.chapter,
            "section_id": section.id,
            "title": section.title,
            "text": page,
            "total_chars": total,
            "remaining": remaining,
            "next_offset": end if remaining else None,
            "link": link,
        }
        return ToolResult(cap(text), structured)

    # -- 读者数据 ---------------------------------------------------------

    def list_highlights(self, args: HighlightsArgs) -> ToolResult:
        if not self.personal:
            raise ToolInputError("读者划线工具已关闭")
        if args.chapter is not None:
            self._chapter(args.chapter)
        items = self._known(self._notes().highlights(args.chapter))
        if args.only_with_notes:
            items = [item for item in items if item.get("note")]
        trimmed = items[:ITEM_LIMIT]
        rows = [
            {
                "chapter": item["chapter"],
                "quote": item["quote"],
                "note": (item.get("note") or "")[:ITEM_TEXT_CHARS],
                "created_at": item.get("created_at"),
                "link": self._link(item["chapter"], None, item["quote"]),
            }
            for item in trimmed
        ]
        if not rows:
            return ToolResult("没有找到划线记录。", {"count": 0, "highlights": []})
        lines = [f"读者的划线 {len(items)} 条" + ("（只显示前 200 条）" if len(items) > ITEM_LIMIT else "") + "："]
        current = None
        for row in rows:
            if row["chapter"] != current:
                current = row["chapter"]
                chapter = self._chapter(current)
                lines.append(f"## {self._chapter_label(chapter)}")
            lines.append(f"- 「{row['quote']}」")
            if row["note"]:
                lines.append(f"  笔记：{row['note']}")
            lines.append(f"  链接：{row['link']}")
        return ToolResult(cap("\n".join(lines)), {"count": len(items), "highlights": rows})

    def list_inserts(self, args: InsertsArgs) -> ToolResult:
        if not self.personal:
            raise ToolInputError("读者补充工具已关闭")
        if args.chapter is not None:
            self._chapter(args.chapter)
        items = self._known(self._notes().inserts(args.chapter))
        trimmed = items[:ITEM_LIMIT]
        rows = [
            {
                "chapter": item["chapter"],
                "id": item["id"],
                "after": item.get("after", ""),
                "markdown": (item.get("markdown") or "")[:ITEM_TEXT_CHARS],
                "link": self._link(item["chapter"], None, item.get("after", "")),
            }
            for item in trimmed
        ]
        if not rows:
            return ToolResult("没有找到补充内容。", {"count": 0, "inserts": []})
        lines = [f"读者的补充 {len(items)} 条" + ("（只显示前 200 条）" if len(items) > ITEM_LIMIT else "") + "："]
        current = None
        for row in rows:
            if row["chapter"] != current:
                current = row["chapter"]
                chapter = self._chapter(current)
                lines.append(f"## {self._chapter_label(chapter)}")
            lines.append(f"### {row['id']}（跟随「{row['after'] or '章末'}」）")
            lines.append(row["markdown"] or "（空）")
            lines.append(f"链接：{row['link']}")
        return ToolResult(cap("\n".join(lines)), {"count": len(items), "inserts": rows})

    def list_annotations(self, args: AnnotationsArgs) -> ToolResult:
        if not self.personal:
            raise ToolInputError("读者批注工具已关闭")
        if args.chapter is not None:
            self._chapter(args.chapter)
        items = self._known(self._notes().annotations(args.chapter))
        if args.kind:
            items = [item for item in items if item.get("kind") == args.kind]
        if args.query:
            needle = args.query.strip().lower()
            items = [
                item
                for item in items
                if needle in (item.get("quote", "") + item.get("title", "") + item.get("body", "")).lower()
            ]
        trimmed = items[:ITEM_LIMIT]
        rows = [
            {
                "chapter": item["chapter"],
                "id": item["id"],
                "quote": item["quote"],
                "context": item.get("context", ""),
                "kind": item["kind"],
                "title": item["title"],
                "body": item["body"][:ITEM_TEXT_CHARS],
                "sources": item.get("sources", []),
                "link": self._link(item["chapter"], None, item["quote"]),
            }
            for item in trimmed
        ]
        if not rows:
            return ToolResult("没有找到批注。", {"count": 0, "annotations": []})
        lines = [f"读者的批注 {len(items)} 条" + ("（只显示前 200 条）" if len(items) > ITEM_LIMIT else "") + "："]
        current = None
        for row in rows:
            if row["chapter"] != current:
                current = row["chapter"]
                chapter = self._chapter(current)
                lines.append(f"## {self._chapter_label(chapter)}")
            lines.append(f"- [{KIND_LABELS.get(row['kind'], row['kind'])}] {row['title']}")
            lines.append(f"  引文：「{row['quote']}」")
            lines.append(f"  正文：{row['body']}")
            if row["sources"]:
                for source in row["sources"]:
                    lines.append(f"  来源：{source['title']} {source['url']}")
            lines.append(f"  链接：{row['link']}")
        return ToolResult(cap("\n".join(lines)), {"count": len(items), "annotations": rows})
