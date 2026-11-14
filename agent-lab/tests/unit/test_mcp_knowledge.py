from __future__ import annotations

from types import SimpleNamespace

from agent_lab.book.index import SearchService
from agent_lab.book.parser import Book, parse_chapter
from agent_lab.mcp.knowledge import KnowledgeService
from agent_lab.mcp.models import ListChaptersArgs, ReadSectionArgs
from agent_lab.mcp.format import cap
from tests.mcp_helpers import make_mcp


def test_chapters_all_and_one(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    all_result = h.tool(headers, "list_chapters")
    assert all_result["isError"] is False
    assert "第 2 章 · 上下文工程" in all_result["content"][0]["text"]
    assert "KV Cache 的原理与约束" in all_result["content"][0]["text"]
    # 旧式结果没有 structuredContent，文本里必须包含 section_id。
    assert "section_id=kv-cache-的原理与约束" in all_result["content"][0]["text"]

    one = h.tool(headers, "list_chapters", {"chapter": 2}, request_id=11)
    assert "第 2 章的目录" in one["content"][0]["text"]
    assert one["isError"] is False

    bad = h.tool(headers, "list_chapters", {"chapter": 9}, request_id=12)
    assert bad["isError"] is True
    assert "第 9 章不存在" in bad["content"][0]["text"]


def test_search_book_and_limits(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    result = h.tool(headers, "search_book", {"query": "缓存", "top_k": 3})
    text = result["content"][0]["text"]
    assert "命中 1 条" in text
    assert "section_id=kv-cache-的原理与约束" in text
    assert "http://reader.test/book/chapter2/" in text
    assert result["isError"] is False

    none = h.tool(headers, "search_book", {"query": "不存在的词", "chapter": 2}, request_id=11)
    assert "没有命中" in none["content"][0]["text"]
    assert none["isError"] is False

    empty = h.tool(headers, "search_book", {"query": ""}, request_id=12)
    assert empty["isError"] is True and "参数不合法" in empty["content"][0]["text"]

    blank = h.tool(headers, "search_book", {"query": "   "}, request_id=13)
    assert blank["isError"] is True and "检索词不能为空" in blank["content"][0]["text"]

    bad_chapter = h.tool(headers, "search_book", {"query": "缓存", "chapter": 9}, request_id=14)
    assert bad_chapter["isError"] is True and "第 9 章不存在" in bad_chapter["content"][0]["text"]


def test_read_section_pagination_and_errors(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    result = h.tool(headers, "read_section", {"chapter": 2, "section_id": "kv-cache-的原理与约束"})
    text = result["content"][0]["text"]
    assert "前缀稳定时" in text
    assert "已读完这一小节" in text
    assert "http://reader.test/book/chapter2/#kv-cache" in text
    assert result["isError"] is False

    intro = h.tool(headers, "read_section", {"chapter": 2, "section_id": ""}, request_id=11)
    assert "导语" in intro["content"][0]["text"]

    unknown = h.tool(headers, "read_section", {"chapter": 2, "section_id": "nope"}, request_id=12)
    assert unknown["isError"] is True
    assert "没有小节" in unknown["content"][0]["text"]

    beyond = h.tool(headers, "read_section", {"chapter": 2, "section_id": "kv-cache-的原理与约束", "offset": 99999}, request_id=13)
    assert beyond["isError"] is True and "offset 超出" in beyond["content"][0]["text"]


def test_read_section_pages_long_text():
    md = "# 长章\n\n## 长小节\n\n" + "很长的一段。" * 1200
    book = Book({2: parse_chapter(2, md)})
    lab = SimpleNamespace(book=book, search=SearchService(book), extras={})
    service = KnowledgeService(lab, reader_url="http://reader.test")
    first = service.read_section(ReadSectionArgs(chapter=2, section_id="长小节"))
    assert first.structured["remaining"] > 0
    assert first.structured["next_offset"] == 6000
    assert "继续读" in first.text
    second = service.read_section(ReadSectionArgs(chapter=2, section_id="长小节", offset=6000))
    assert second.structured["text"]
    assert second.structured["remaining"] == 0


def test_output_cap_marks_truncation():
    text = "字" * 40
    assert cap(text, 10).startswith("字" * 10)
    assert "已截断" in cap(text, 10)
