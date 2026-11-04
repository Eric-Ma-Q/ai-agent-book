from pathlib import Path

import pytest

from agent_lab.book.index import SearchService, chunk_chapter, tokenize
from agent_lab.book.parser import load_book, parse_chapter

REPO = Path(__file__).resolve().parents[3]

MD = """# 测试章

## 缓存

KV Cache 让前缀稳定的请求更便宜。缓存命中时只需计算新增部分。

## 工具

工具调用让 Agent 能够操作外部世界，例如搜索和执行代码。

## 记忆

用户记忆让 Agent 跨会话记住偏好。
"""


def service(kind="bm25"):
    book_chapter = parse_chapter(1, MD)
    from agent_lab.book.parser import Book

    return SearchService(Book({1: book_chapter}))


def test_tokenize_mixes_words_and_cjk_bigrams():
    tokens = tokenize("KV Cache 的原理")
    assert "kv" in tokens and "cache" in tokens
    assert "的原" in tokens and "原理" in tokens


def test_tokenize_single_cjk_char():
    assert tokenize("缓") == ["缓"]


def test_chunking_respects_size():
    long_md = "# 章\n\n## 节\n\n" + "\n\n".join("段落" * 100 for _ in range(5))
    chunks = chunk_chapter(parse_chapter(1, long_md), max_chars=350)
    assert len(chunks) >= 5
    assert all(len(c.text) <= 350 for c in chunks)
    assert all(c.section_id == "节" for c in chunks)


@pytest.mark.parametrize("kind", ["bm25", "tfidf", "hybrid"])
def test_search_finds_relevant_section(kind):
    hits = service().search("KV Cache 缓存", top_k=2, kind=kind)
    assert hits[0].section_id == "缓存"
    assert hits[0].score > 0


def test_search_filters_by_chapter():
    assert service().search("缓存", chapter=2) == []


def test_search_empty_query_returns_nothing():
    assert service().search("   ") == []


def test_unknown_kind_rejected():
    with pytest.raises(ValueError):
        service().search("缓存", kind="dense")


def test_real_book_kv_cache_hits_chapter_two():
    hits = SearchService(load_book(REPO / "book")).search("KV Cache 前缀缓存命中", top_k=5)
    assert any(h.chapter == 2 for h in hits[:3])
