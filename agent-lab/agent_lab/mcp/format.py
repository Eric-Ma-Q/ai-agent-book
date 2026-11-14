"""MCP 工具输出的排版与边界：截断、阅读器链接、引用列表、错误脱敏。"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote as url_quote

from ..citations import reader_link

OUTPUT_CHARS = 30_000
_SECRET = re.compile(r"sk-[A-Za-z0-9_-]{6,}")
_BASE64 = re.compile(r"data:[^;\s]+;base64,[A-Za-z0-9+/=]+")


def cap(text: str, limit: int = OUTPUT_CHARS) -> str:
    """单次工具结果的硬上限；超出时保留开头并明确标注。"""
    text = str(text or "")
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n…（输出超过 {limit} 字，已截断；请缩小范围或分页读取）"


def safe_error(error: Any, limit: int = 400) -> str:
    text = str(error or "").replace("\n", " ").strip()
    text = _BASE64.sub("[图片数据]", text)
    text = _SECRET.sub("***", text)
    return text[:limit] or type(error).__name__


def absolute_link(reader_url: str, chapter: int, section_id: str | None = None, quote_text: str = "") -> str:
    """阅读器里的可点击回链；有原文片段时带 quote 与小节锚点。"""
    base = (reader_url or "").rstrip("/")
    if quote_text:
        path = reader_link(chapter, section_id, quote_text)
    elif section_id:
        path = f"/book/chapter{chapter}/#{url_quote(section_id)}"
    else:
        path = f"/book/chapter{chapter}/"
    return f"{base}{path}"


def reference_lines(citations: list[dict[str, Any]], reader_url: str) -> list[str]:
    """把 RunEnd.citations 排成外部应用可读的引用核对清单。"""
    if not citations:
        return ["没有书稿引用。"]
    lines = ["## 引用核对"]
    for item in citations:
        chapter = int(item.get("chapter") or 0)
        section = item.get("found_section_id") or item.get("section_id")
        quote_text = str(item.get("quote") or "")
        status = str(item.get("status") or "")
        label = {"verified": "通过", "wrong_section": "小节不符", "not_found": "未找到", "too_short": "片段太短"}.get(status, status)
        location = f"第 {chapter} 章" + (f" · {section}" if section else "")
        lines.append(f"- [{location}]「{quote_text}」：{label}")
        lines.append(f"  链接：{absolute_link(reader_url, chapter, section, quote_text)}")
    summary = {}
    for item in citations:
        key = str(item.get("status") or "")
        summary[key] = summary.get(key, 0) + 1
    parts = [f"{summary.get('verified', 0)} 条通过"]
    for key, label in (("wrong_section", "小节不符"), ("not_found", "未找到"), ("too_short", "片段太短")):
        if summary.get(key):
            parts.append(f"{summary[key]} 条{label}")
    lines.append(f"- 核对汇总：{len(citations)} 条，" + "，".join(parts))
    return lines


def number(value: Any) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return "0"
