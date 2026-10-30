"""引用的解析与逐字核对。

回答中的引用格式：[[ch2#小节id|原文片段]]，小节可以省略：[[ch2|原文片段]]。
核对时忽略空白、全半角和残留的 Markdown 符号，其余必须逐字一致。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import quote as url_quote

from .book.parser import Book, normalize_for_match

CITATION = re.compile(r"\[\[ch(\d+)(?:#([^|\]]*))?\|([^\]]+)\]\]")
MIN_QUOTE_CHARS = 6
Status = Literal["verified", "wrong_section", "not_found", "too_short"]


@dataclass(frozen=True)
class Citation:
    chapter: int
    section_id: str | None
    quote: str
    raw: str


@dataclass(frozen=True)
class CheckedCitation:
    chapter: int
    section_id: str | None
    quote: str
    status: Status
    found_section_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "chapter": self.chapter,
            "section_id": self.section_id,
            "quote": self.quote,
            "status": self.status,
            "found_section_id": self.found_section_id,
            "link": reader_link(self.chapter, self.found_section_id or self.section_id, self.quote),
        }


@dataclass(frozen=True)
class CheckResult:
    items: tuple[CheckedCitation, ...]
    summary: dict[str, int] = field(default_factory=dict)

    @property
    def all_verified(self) -> bool:
        return bool(self.items) and all(i.status == "verified" for i in self.items)


def parse_citations(answer: str) -> list[Citation]:
    return [
        Citation(int(m.group(1)), (m.group(2) or None), m.group(3).strip(), m.group(0))
        for m in CITATION.finditer(answer or "")
    ]


def reader_link(chapter: int, section_id: str | None, quote: str) -> str:
    link = f"/book/chapter{chapter}/?quote={url_quote(quote[:200])}"
    return f"{link}#{url_quote(section_id)}" if section_id else link


class CitationChecker:
    def __init__(self, book: Book):
        self._texts: dict[int, list[tuple[str, str]]] = {
            number: [(s.id, normalize_for_match(s.text)) for s in chapter.sections]
            for number, chapter in book.chapters.items()
        }

    def _check_one(self, citation: Citation) -> CheckedCitation:
        quote = normalize_for_match(citation.quote)
        base = {"chapter": citation.chapter, "section_id": citation.section_id, "quote": citation.quote}
        if len(quote) < MIN_QUOTE_CHARS:
            return CheckedCitation(**base, status="too_short")
        sections = self._texts.get(citation.chapter, [])
        found = next((sid for sid, text in sections if quote in text), None)
        if found is None:
            return CheckedCitation(**base, status="not_found")
        in_claimed = any(sid == citation.section_id and quote in text for sid, text in sections)
        if citation.section_id is None or in_claimed:
            located = citation.section_id if in_claimed else found
            return CheckedCitation(**base, status="verified", found_section_id=located)
        return CheckedCitation(**base, status="wrong_section", found_section_id=found)

    def check(self, citations: list[Citation]) -> CheckResult:
        items = tuple(self._check_one(c) for c in citations)
        summary = {s: sum(1 for i in items if i.status == s) for s in ("verified", "wrong_section", "not_found", "too_short")}
        return CheckResult(items, {"total": len(items), **summary})
