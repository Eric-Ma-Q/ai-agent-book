"""调用阅读器的 /__personal API 写入补充。

定位锚点的计算与 .claude/skills/reader-sync/scripts/add_insert.py 相同：从章节页 HTML 中取
#chapter-content 的直接子元素作为段落块，按段落开头文字匹配，记录所在 h2/h3 的 id 和块偏移。
这样写入的补充与网页上手动添加的完全一致。
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any

import httpx

from .book.parser import normalize_for_match
from .citations import CITATION, reader_link

VOID = {"br", "img", "hr", "input", "meta", "link", "source", "wbr", "col"}
ANCHOR_LENGTH = 120


class InsertError(Exception):
    pass


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class ChapterBlocks(HTMLParser):
    """收集 #chapter-content 的直接子元素，和浏览器端的 bookBlocks() 一致。"""

    def __init__(self) -> None:
        super().__init__()
        self.depth = 0
        self.root_depth: int | None = None
        self.done = False
        self.blocks: list[dict[str, Any]] = []
        self.current: dict[str, Any] | None = None

    @property
    def inside(self) -> bool:
        return self.root_depth is not None and not self.done

    def _open(self, tag: str, attrs: list) -> None:
        self.current = {"tag": tag, "id": dict(attrs).get("id"), "text": ""}
        self.blocks.append(self.current)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if self.root_depth is None and dict(attrs).get("id") == "chapter-content":
            self.root_depth = self.depth
        elif self.inside and self.depth == self.root_depth + 1:
            self._open(tag, attrs)
        if tag not in VOID:
            self.depth += 1

    def handle_startendtag(self, tag: str, attrs: list) -> None:
        if self.inside and self.depth == self.root_depth + 1:
            self._open(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        self.depth -= 1
        if self.inside and self.depth == self.root_depth:
            self.done = True

    def handle_data(self, data: str) -> None:
        if self.inside and self.current is not None:
            self.current["text"] += data


def parse_blocks(page_html: str) -> list[dict[str, Any]]:
    parser = ChapterBlocks()
    parser.feed(page_html)
    return parser.blocks


def find_anchor(blocks: list[dict[str, Any]], prefix: str) -> dict[str, Any]:
    # 匹配时忽略空白与 Markdown 符号（定位文字来自书稿 Markdown，和网页 HTML 的空白不一定一致）；
    # 写给阅读器的 after 仍按浏览器的规则从网页文本生成。
    wanted = normalize_for_match(prefix)
    hits = [i for i, b in enumerate(blocks) if wanted and normalize_for_match(b["text"]).startswith(wanted)]
    if not hits:
        raise InsertError(f"章节中没有以这段文字开头的段落：{normalize(prefix)[:40]!r}")
    if len(hits) > 1:
        raise InsertError(f"有 {len(hits)} 个段落以这段文字开头，需要更长的定位文字")
    index = hits[0]
    starts = [i for i in range(index + 1) if blocks[i]["tag"] in ("h2", "h3") and blocks[i]["id"]]
    start = starts[-1] if starts else -1
    return {
        "after": normalize(blocks[index]["text"])[:ANCHOR_LENGTH],
        "section": blocks[start]["id"] if starts else "",
        "offset": index - start,
    }


def citations_to_links(markdown: str) -> str:
    """补充里的 [[chN#id|原文]] 转成阅读器里可点击的原文链接（阅读器不认识引用标记）。"""

    def link(match: re.Match) -> str:
        chapter, section, quote = int(match.group(1)), match.group(2) or None, match.group(3).strip()
        return f"[「{quote}」]({reader_link(chapter, section, quote)})"

    return CITATION.sub(link, markdown)


class InsertWriter:
    def __init__(self, reader_url: str, http: httpx.Client | None = None, locale: str = "zh-CN"):
        self.reader_url = reader_url.rstrip("/")
        self.http = http or httpx.Client(timeout=240.0)
        self.locale = locale

    def save(self, payload: dict[str, Any]) -> dict[str, Any]:
        chapter = int(payload["chapter"])
        try:
            page = self.http.get(f"{self.reader_url}/book/chapter{chapter}/")
            page.raise_for_status()
        except httpx.HTTPError as error:
            raise InsertError(f"无法读取阅读器章节页：{error}") from error
        blocks = parse_blocks(page.text)
        if not blocks:
            raise InsertError("章节页中找不到 #chapter-content")
        anchor = find_anchor(blocks, payload["after"])
        markdown = citations_to_links(payload["markdown"])
        body = {"chapter": f"ai-agents-in-depth:{self.locale}:chapter{chapter}", "insert": {"markdown": markdown, **anchor}}
        try:
            reply = self.http.post(f"{self.reader_url}/__personal/inserts/save", json=body, headers={"x-personal-api": "1"})
            data = reply.json()
        except (httpx.HTTPError, ValueError) as error:
            raise InsertError(f"阅读器保存接口出错：{error}") from error
        if not data.get("ok"):
            raise InsertError(f"阅读器拒绝保存：{data.get('error')}")
        return {"insert_id": data["data"]["id"], "anchor": anchor}
