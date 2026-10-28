"""把 book/chapterN.md 切成小节和段落块。

小节 id 与阅读器一致：Astro 用 github-slugger 给**所有**标题生成 id（重名加 -1、-2），
所以这里也让每个标题都经过同一个 Slugger，只有 h2/h3 切成小节。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_FOOTNOTE_DEF = re.compile(r"^\[\^[^\]]+\]:\s*")
_FOOTNOTE_REF = re.compile(r"\[\^[^\]]+\]")
_HTML_TAG = re.compile(r"</?[A-Za-z][^>]*>")
_QUOTES = str.maketrans({"“": '"', "”": '"', "„": '"', "‟": '"', "‘": "'", "’": "'", "「": '"', "」": '"'})
_MATCH_DROP = re.compile(r"[\s*#>|`]+")


_SLUG_KEEP = {"Nd", "Nl"}  # 上标数字等 No 类字符会被 github-slugger 删除（如 τ²-bench → τ-bench）


class Slugger:
    """github-slugger 的规则：小写，删除字母/十进制数字/组合符/连字符/下划线/空格以外的字符，空格变连字符。"""

    def __init__(self) -> None:
        self._seen: dict[str, int] = {}

    @staticmethod
    def _base(text: str) -> str:
        kept = [
            ch for ch in text.lower() if ch in "-_ " or unicodedata.category(ch) in _SLUG_KEEP or unicodedata.category(ch)[0] in "LM"
        ]
        return "".join(kept).replace(" ", "-")

    def slug(self, text: str) -> str:
        base = self._base(text)
        slug = base
        while slug in self._seen:
            self._seen[base] += 1
            slug = f"{base}-{self._seen[base]}"
        self._seen[slug] = 0
        return slug


def markdown_to_text(line: str) -> str:
    text = _FOOTNOTE_DEF.sub("", line)
    text = _IMAGE.sub("", text)
    text = _LINK.sub(r"\1", text)
    text = _FOOTNOTE_REF.sub("", text)
    text = _HTML_TAG.sub("", text)
    return text.replace("**", "").replace("__", "").replace("*", "").replace("`", "")


def normalize_for_match(text: str) -> str:
    """引用核对用：全角转半角、统一引号、去掉空白和残留的 Markdown 符号。"""
    return _MATCH_DROP.sub("", unicodedata.normalize("NFKC", text).translate(_QUOTES))


@dataclass(frozen=True)
class Section:
    chapter: int
    id: str  # 导语（第一个 h2 之前）的 id 为空字符串
    title: str
    depth: int
    parent_id: str | None
    text: str


@dataclass(frozen=True)
class Block:
    chapter: int
    section_id: str
    text: str
    is_heading: bool = False


@dataclass(frozen=True)
class Chapter:
    number: int
    title: str
    sections: tuple[Section, ...]
    blocks: tuple[Block, ...]

    def section(self, section_id: str) -> Section | None:
        return next((s for s in self.sections if s.id == section_id), None)


@dataclass(frozen=True)
class Book:
    chapters: dict[int, Chapter] = field(default_factory=dict)


class _Builder:
    def __init__(self, number: int) -> None:
        self.number = number
        self.title = ""
        self.sections: list[Section] = []
        self.blocks: list[Block] = []
        self.current = {"id": "", "title": "", "depth": 1, "parent": None, "lines": []}
        self.h2: str | None = None
        self.block_lines: list[str] = []

    def flush_block(self) -> None:
        text = " ".join(line.strip() for line in self.block_lines if line.strip())
        if text:
            self.blocks.append(Block(self.number, self.current["id"], text))
        self.block_lines = []

    def flush_section(self) -> None:
        cur = self.current
        title = cur["title"] or self.title
        text = "\n".join(cur["lines"]).strip()
        if cur["id"] or text:
            self.sections.append(Section(self.number, cur["id"], title, cur["depth"], cur["parent"], text))

    def open_section(self, slug: str, title: str, depth: int) -> None:
        self.flush_block()
        self.flush_section()
        parent = self.h2 if depth == 3 else None
        if depth == 2:
            self.h2 = slug
        self.current = {"id": slug, "title": title, "depth": depth, "parent": parent, "lines": []}
        self.blocks.append(Block(self.number, slug, title, is_heading=True))


def parse_chapter(number: int, markdown: str) -> Chapter:
    builder = _Builder(number)
    slugger = Slugger()
    fence: str | None = None
    for raw in markdown.splitlines():
        fence_match = FENCE.match(raw)
        if fence_match:
            marker = fence_match.group(1)
            fence = None if fence == marker else (fence or marker)
            builder.current["lines"].append("")
            continue
        if fence:
            builder.current["lines"].append(raw)
            builder.block_lines.append(raw)
            continue
        heading = HEADING.match(raw)
        if heading:
            depth, title = len(heading.group(1)), markdown_to_text(heading.group(2)).strip()
            slug = slugger.slug(title)
            if depth == 1:
                builder.title = builder.title or title
            elif depth in (2, 3):
                builder.open_section(slug, title, depth)
            else:  # h4–h6 不切小节，标题文字留在小节正文里
                builder.flush_block()
                builder.current["lines"].append(title)
                builder.blocks.append(Block(number, builder.current["id"], title, is_heading=True))
            continue
        if not raw.strip():
            builder.flush_block()
            builder.current["lines"].append("")
            continue
        text = markdown_to_text(raw)
        builder.current["lines"].append(text)
        builder.block_lines.append(text)
    builder.flush_block()
    builder.flush_section()
    return Chapter(number, builder.title, tuple(builder.sections), tuple(builder.blocks))


def load_book(book_dir: Path) -> Book:
    chapters: dict[int, Chapter] = {}
    for path in sorted(Path(book_dir).glob("chapter*.md")):
        match = re.fullmatch(r"chapter(\d+)\.md", path.name)
        if match:
            number = int(match.group(1))
            chapters[number] = parse_chapter(number, path.read_text(encoding="utf8"))
    return Book(chapters)
