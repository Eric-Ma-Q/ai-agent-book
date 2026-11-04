from agent_lab.book.parser import Book, parse_chapter
from agent_lab.citations import CitationChecker, parse_citations, reader_link

MD = """# 上下文工程

导语：上下文决定能力上限。

## KV Cache

前缀稳定时，**缓存**命中率更高，成本更低。

## 工具

工具让 Agent 能够操作外部世界。
"""

BOOK = Book({2: parse_chapter(2, MD)})


def test_parse_citations():
    answer = "见 [[ch2#kv-cache|前缀稳定时，缓存命中率更高]]，以及 [[ch2|上下文决定能力上限]]。"
    cites = parse_citations(answer)
    assert [(c.chapter, c.section_id, c.quote) for c in cites] == [
        (2, "kv-cache", "前缀稳定时，缓存命中率更高"),
        (2, None, "上下文决定能力上限"),
    ]


def test_parse_ignores_malformed():
    assert parse_citations("[[chx#a|b]] [[ch2#a]] 普通文本") == []


def test_verified_ignores_whitespace_and_markup():
    result = CitationChecker(BOOK).check(parse_citations("[[ch2#kv-cache|前缀稳定时， 缓存命中率更高]]"))
    assert result.items[0].status == "verified"
    assert result.summary == {"total": 1, "verified": 1, "wrong_section": 0, "not_found": 0, "too_short": 0}
    assert result.all_verified


def test_wrong_section_reports_actual_location():
    item = CitationChecker(BOOK).check(parse_citations("[[ch2#工具|前缀稳定时，缓存命中率更高]]")).items[0]
    assert item.status == "wrong_section"
    assert item.found_section_id == "kv-cache"


def test_chapter_only_citation_verified_anywhere_in_chapter():
    item = CitationChecker(BOOK).check(parse_citations("[[ch2|工具让 Agent 能够操作外部世界]]")).items[0]
    assert item.status == "verified" and item.found_section_id == "工具"


def test_not_found_and_bad_chapter():
    checker = CitationChecker(BOOK)
    result = checker.check(parse_citations("[[ch2#kv-cache|书里没有这句话哦]] [[ch9#x|上下文决定能力上限]]"))
    assert [i.status for i in result.items] == ["not_found", "not_found"]
    assert not result.all_verified


def test_too_short_quote():
    item = CitationChecker(BOOK).check(parse_citations("[[ch2#kv-cache|缓存]]")).items[0]
    assert item.status == "too_short"


def test_no_citations_is_not_all_verified():
    assert not CitationChecker(BOOK).check([]).all_verified


def test_reader_link():
    link = reader_link(2, "kv-cache", "前缀 稳定")
    assert link.startswith("/book/chapter2/?quote=")
    assert link.endswith("#kv-cache")
    assert reader_link(3, None, "x") == "/book/chapter3/?quote=x"
