"""个人收集网页：归档目录、文本抽取、分块检索与分页阅读。

数据源是 `web-astro/personal/harness/library.json`（由 manifest 生成）与
`archive/` 下的只读副本。这里只读文件，不写归档、不跑校验、不缓存到磁盘。
"""

from __future__ import annotations

import json
import math
import re
import threading
from collections import Counter
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from ..book.index import tokenize
from .format import cap
from .models import ListPagesArgs, ReadPageArgs, SearchPagesArgs, ToolInputError, ToolResult

READ_CHARS = 6000
CHUNK_CHARS = 500
SNIPPET_CHARS = 300
DEFAULT_CATEGORY = "pages"
READABLE_SUFFIXES = (".html", ".htm", ".md", ".markdown", ".txt")
MAX_TEXT_CHARS = 2_000_000
MAX_CACHED_PAGES = 200

_BLOCK_TAGS = {
    "p", "div", "section", "article", "br", "li", "ul", "ol", "tr", "td", "th",
    "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "table", "hr",
}
_DROP_TAGS = ("script", "style", "nav", "footer", "header", "noscript", "svg", "form", "aside")
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


@dataclass(frozen=True)
class Page:
    path: str
    title: str
    url: str
    bytes: int
    category: str
    category_label: str
    readable: bool


@dataclass(frozen=True)
class PageChunk:
    page: str
    index: int
    text: str


def _strip_block(pattern: str, text: str) -> str:
    return re.sub(rf"<{pattern}\b[^>]*>.*?</{pattern}>", " ", text, flags=re.IGNORECASE | re.DOTALL)


def clean_html(html: str) -> str:
    """去掉脚本、样式、导航与页脚，避免把模板噪声当正文检索。"""
    text = _COMMENT.sub(" ", html)
    for tag in _DROP_TAGS:
        text = _strip_block(tag, text)
    return text


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001 - 标准库签名
        if tag in _DROP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _DROP_TAGS and self._skip:
            self._skip -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        joined = "".join(self.parts)
        lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in joined.splitlines()]
        return "\n".join(line for line in lines if line)


def html_to_text(html: str) -> str:
    cleaned = clean_html(html)
    try:
        import trafilatura

        extracted = trafilatura.extract(
            cleaned,
            output_format="markdown",
            include_links=False,
            include_comments=False,
            include_tables=True,
        )
    except Exception:  # noqa: BLE001 - 抽取失败必须回退，而不是让工具整体失败
        extracted = None
    fallback = _TextExtractor()
    fallback.feed(cleaned)
    plain = fallback.text()
    if extracted and len(extracted.strip()) >= min(200, len(plain) // 2):
        return unescape(extracted).strip()
    return plain


def chunk_text(text: str, max_chars: int = CHUNK_CHARS) -> list[str]:
    chunks: list[str] = []
    buffer = ""
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        for piece in (paragraph[i : i + max_chars] for i in range(0, len(paragraph), max_chars)):
            candidate = f"{buffer}\n{piece}" if buffer else piece
            if len(candidate) <= max_chars:
                buffer = candidate
            else:
                chunks.append(buffer)
                buffer = piece
    if buffer:
        chunks.append(buffer)
    return chunks


class _Bm25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.tfs = [Counter(d) for d in docs]
        self.lengths = [len(d) for d in docs]
        self.avgdl = (sum(self.lengths) / len(docs)) if docs else 0.0
        df = Counter(t for tf in self.tfs for t in tf)
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def scores(self, query: list[str]) -> list[float]:
        result = []
        for tf, length in zip(self.tfs, self.lengths):
            score = 0.0
            for term in set(query):
                freq = tf.get(term)
                if freq:
                    norm = freq + self.k1 * (1 - self.b + self.b * length / (self.avgdl or 1))
                    score += self.idf[term] * freq * (self.k1 + 1) / norm
            result.append(score)
        return result


class CollectedService:
    def __init__(self, harness_dir: Path, *, reader_url: str = ""):
        self.harness_dir = Path(harness_dir)
        self.reader_url = reader_url.rstrip("/")
        self._lock = threading.RLock()
        self._pages: list[Page] | None = None
        self._labels: dict[str, str] = {}
        self._texts: dict[str, str] = {}
        self._chunks: list[PageChunk] | None = None
        self._bm25: _Bm25 | None = None

    # -- 目录 -------------------------------------------------------------

    def _load(self) -> list[Page]:
        with self._lock:
            if self._pages is not None:
                return self._pages
            path = self.harness_dir / "library.json"
            try:
                data = json.loads(path.read_text(encoding="utf8"))
            except FileNotFoundError as error:
                raise ToolInputError("归档目录不可用：缺少 library.json") from error
            except (OSError, ValueError) as error:
                raise ToolInputError(f"归档目录不可读：{error}") from error
            pages: list[Page] = []
            for category in data.get("categories") or []:
                cid = str(category.get("id") or "")
                label = str(category.get("label") or cid)
                self._labels[cid] = label
                for item in category.get("files") or []:
                    rel = str(item.get("path") or "")
                    if not rel:
                        continue
                    pages.append(
                        Page(
                            path=rel,
                            title=str(item.get("title") or rel),
                            url=str(item.get("url") or self._url_for(rel)),
                            bytes=int(item.get("bytes") or 0),
                            category=cid,
                            category_label=label,
                            readable=rel.lower().endswith(READABLE_SUFFIXES),
                        )
                    )
            self._pages = pages
            return pages

    def _url_for(self, rel: str) -> str:
        tail = rel[len("archive/") :] if rel.startswith("archive/") else rel
        return f"/harness/site/{tail}"

    def _absolute(self, url: str) -> str:
        if not url.startswith("/"):
            return url
        return f"{self.reader_url}{url}" if self.reader_url else url

    def _category(self, category: str | None) -> tuple[str, str]:
        pages = self._load()
        if category is None:
            category = DEFAULT_CATEGORY
        if category not in self._labels:
            available = "、".join(f"{cid}（{label}）" for cid, label in self._labels.items())
            raise ToolInputError(f"未知分类：{category}；可用分类：{available}")
        return category, self._labels[category]

    # -- 工具：目录 -------------------------------------------------------

    def list_pages(self, args: ListPagesArgs) -> ToolResult:
        category, label = self._category(args.category)
        rows = [page for page in self._load() if page.category == category and page.readable]
        window = rows[args.offset : args.offset + args.limit]
        next_offset = args.offset + len(window) if args.offset + len(window) < len(rows) else None
        if not window:
            return ToolResult(
                f"「{label}」没有更多条目（共 {len(rows)} 条，offset={args.offset}）。",
                {"category": category, "label": label, "total": len(rows), "count": 0, "next_offset": None, "pages": []},
            )
        lines = [f"个人收集网页 · {label}（共 {len(rows)} 条，本页 {len(window)} 条）："]
        payload: list[dict] = []
        for page in window:
            lines.append(f"- {page.title}")
            lines.append(f"  路径：{page.path}")
            lines.append(f"  链接：{self._absolute(page.url)}")
            payload.append(
                {
                    "title": page.title,
                    "path": page.path,
                    "url": self._absolute(page.url),
                    "bytes": page.bytes,
                    "readable": page.readable,
                }
            )
        if next_offset is not None:
            lines.append(f"还有 {len(rows) - next_offset} 条；用 offset={next_offset} 继续。")
        return ToolResult(
            cap("\n".join(lines)),
            {
                "category": category,
                "label": label,
                "total": len(rows),
                "count": len(window),
                "next_offset": next_offset,
                "pages": payload,
            },
        )

    # -- 工具：检索 -------------------------------------------------------

    def _page_by_path(self, rel: str) -> Page:
        for page in self._load():
            if page.path == rel:
                return page
        raise ToolInputError(f"未知页面：{rel}；先用 list_pages 查可用路径")

    def _resolve(self, args: ReadPageArgs) -> Page:
        if args.path:
            rel = args.path.strip().lstrip("./")
            if rel.startswith("/harness/site/"):
                rel = "archive/" + unquote(rel[len("/harness/site/") :])
            return self._page_by_path(rel)
        parsed = urlsplit(args.url or "")
        if parsed.scheme and parsed.netloc:
            if self.reader_url and not args.url.startswith(self.reader_url):
                raise ToolInputError("只接受阅读器本站链接：/harness/site/...")
            if not self.reader_url:
                raise ToolInputError("只接受相对链接：/harness/site/...")
        path = unquote(parsed.path)
        if not path.startswith("/harness/site/"):
            raise ToolInputError("只接受阅读器本站链接：/harness/site/...")
        return self._page_by_path("archive/" + path[len("/harness/site/") :])

    def _text(self, page: Page) -> str:
        if page.path in self._texts:
            return self._texts[page.path]
        if not page.readable:
            raise ToolInputError(f"该归档不是可读文本：{page.path}")
        target = self.harness_dir / page.path
        try:
            raw = target.read_text(encoding="utf8", errors="replace")
        except OSError as error:
            raise ToolInputError(f"归档文件读取失败：{page.path}") from error
        if len(raw) > MAX_TEXT_CHARS:
            raw = raw[:MAX_TEXT_CHARS]
        text = html_to_text(raw) if page.path.lower().endswith((".html", ".htm")) else raw.strip()
        if len(self._texts) >= MAX_CACHED_PAGES:
            self._texts.clear()
        self._texts[page.path] = text
        return text

    def _index(self) -> tuple[list[PageChunk], _Bm25]:
        with self._lock:
            if self._chunks is not None and self._bm25 is not None:
                return self._chunks, self._bm25
            chunks: list[PageChunk] = []
            for page in self._load():
                if not page.readable:
                    continue
                try:
                    text = self._text(page)
                except ToolInputError:
                    continue
                for index, piece in enumerate(chunk_text(text)):
                    chunks.append(PageChunk(page.path, index, piece))
            self._chunks = chunks
            self._bm25 = _Bm25([tokenize(chunk.text) for chunk in chunks])
            return chunks, self._bm25

    def search_pages(self, args: SearchPagesArgs) -> ToolResult:
        query = args.query.strip()
        terms = tokenize(query)
        if not terms:
            raise ToolInputError("检索词不能为空")
        category, label = self._category(args.category)
        allowed = {page.path for page in self._load() if page.category == category and page.readable}
        if not allowed:
            raise ToolInputError(f"「{label}」没有可检索的文本归档")
        chunks, bm25 = self._index()
        scores = bm25.scores(terms)
        ranked: list[int] = []
        seen: set[str] = set()
        for index in sorted(
            (i for i, chunk in enumerate(chunks) if chunk.page in allowed and scores[i] > 0),
            key=lambda i: (-scores[i], chunks[i].page, chunks[i].index),
        ):
            if chunks[index].page in seen:
                continue
            seen.add(chunks[index].page)
            ranked.append(index)
            if len(ranked) >= args.top_k:
                break
        titles = {page.path: page.title for page in self._load()}
        urls = {page.path: self._absolute(page.url) for page in self._load()}
        hits: list[dict] = []
        for index in ranked:
            chunk = chunks[index]
            hits.append(
                {
                    "title": titles.get(chunk.page, chunk.page),
                    "path": chunk.page,
                    "url": urls.get(chunk.page, ""),
                    "score": round(scores[index], 4),
                    "snippet": chunk.text[:SNIPPET_CHARS],
                }
            )
        if not hits:
            return ToolResult(
                f"「{label}」里没有匹配「{query}」的收集网页。",
                {"query": query, "category": category, "count": 0, "hits": []},
            )
        lines = [f"在「{label}」中检索「{query}」，命中 {len(hits)} 条："]
        for position, hit in enumerate(hits, start=1):
            lines.append(f"{position}. {hit['title']}（{hit['path']}）分数 {hit['score']}")
            lines.append(f"   链接：{hit['url']}")
            lines.append(f"   片段：{hit['snippet']}")
        return ToolResult(
            cap("\n".join(lines)),
            {"query": query, "category": category, "count": len(hits), "hits": hits},
        )

    # -- 工具：阅读 -------------------------------------------------------

    def read_page(self, args: ReadPageArgs) -> ToolResult:
        page = self._resolve(args)
        text = self._text(page)
        total = len(text)
        offset = min(args.offset, total)
        piece = text[offset : offset + READ_CHARS]
        remaining = max(total - offset - len(piece), 0)
        next_offset = offset + len(piece) if remaining else None
        lines = [f"# {page.title}", f"链接：{self._absolute(page.url)}"]
        lines.append(f"（offset {offset}，全文 {total} 字，剩余 {remaining}）")
        lines.append("")
        lines.append(piece)
        if next_offset is not None:
            lines.append("")
            lines.append(f"还有 {remaining} 字；用 offset={next_offset} 继续读。")
        return ToolResult(
            cap("\n".join(lines)),
            {
                "path": page.path,
                "title": page.title,
                "url": self._absolute(page.url),
                "offset": offset,
                "total": total,
                "remaining": remaining,
                "next_offset": next_offset,
                "text": piece,
            },
        )
