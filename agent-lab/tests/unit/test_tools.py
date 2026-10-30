import json

import pytest
from pydantic import BaseModel

from agent_lab.book.index import SearchService
from agent_lab.book.parser import Book, parse_chapter
from agent_lab.config import AgentConfig
from agent_lab.tools.book import BOOK_TOOLS
from agent_lab.tools.distractors import distractor_tools
from agent_lab.tools.registry import ToolContext, ToolError, ToolRegistry, ToolSpec

MD = """# 上下文工程

导语段落。

## KV Cache

前缀稳定时缓存命中。""" + "长" * 7000 + """

### 子节

子节正文。

## 工具

工具让 Agent 操作外部世界。
"""


@pytest.fixture
def ctx():
    book = Book({2: parse_chapter(2, MD)})
    return ToolContext(book=book, search=SearchService(book), config=AgentConfig())


@pytest.fixture
def registry():
    return ToolRegistry(BOOK_TOOLS)


def run(registry, ctx, name, **args):
    outcome = registry.execute(name, json.dumps(args, ensure_ascii=False), ctx)
    return outcome, (json.loads(outcome.content) if outcome.error is None else None)


def test_definitions_openai_format(registry):
    defs = registry.definitions(["search_book"], style="detailed")
    assert defs[0]["type"] == "function"
    fn = defs[0]["function"]
    assert fn["name"] == "search_book"
    assert "query" in fn["parameters"]["properties"]
    assert "query" in fn["parameters"]["required"]


def test_terse_descriptions_are_shorter(registry):
    detailed = registry.definitions(["search_book"], style="detailed")[0]["function"]["description"]
    terse = registry.definitions(["search_book"], style="terse")[0]["function"]["description"]
    assert len(terse) < len(detailed)


def test_definitions_unknown_tool(registry):
    with pytest.raises(KeyError):
        registry.definitions(["nope"])


def test_list_chapters_overview_and_detail(registry, ctx):
    _, overview = run(registry, ctx, "list_chapters")
    assert overview["chapters"][0]["title"] == "上下文工程"
    assert [s["id"] for s in overview["chapters"][0]["sections"]] == ["kv-cache", "工具"]
    _, detail = run(registry, ctx, "list_chapters", chapter=2)
    assert "子节" in [s["id"] for s in detail["chapters"][0]["sections"]]


def test_search_book(registry, ctx):
    _, data = run(registry, ctx, "search_book", query="缓存命中")
    assert data["results"][0]["section_id"] == "kv-cache"
    assert data["results"][0]["chapter"] == 2


def test_search_book_records_retrieval_kind(registry):
    book = Book({2: parse_chapter(2, MD)})
    ctx = ToolContext(book=book, search=SearchService(book), config=AgentConfig(retrieval="hybrid"))
    _, data = run(registry, ctx, "search_book", query="缓存")
    assert data["retrieval"] == "hybrid"


def test_read_section_pages_long_text(registry, ctx):
    _, first = run(registry, ctx, "read_section", chapter=2, section_id="kv-cache")
    assert first["title"] == "KV Cache"
    assert first["remaining"] > 0
    _, second = run(registry, ctx, "read_section", chapter=2, section_id="kv-cache", offset=first["next_offset"])
    assert second["remaining"] == 0
    assert ctx.state.sections_read == [(2, "kv-cache")]


def test_read_section_errors(registry, ctx):
    outcome, _ = run(registry, ctx, "read_section", chapter=9, section_id="x")
    assert "第 9 章不存在" in outcome.error
    outcome, _ = run(registry, ctx, "read_section", chapter=2, section_id="../../etc/passwd")
    assert "没有小节" in outcome.error


def test_invalid_json_and_validation_errors(registry, ctx):
    outcome = registry.execute("search_book", "{not json", ctx)
    assert outcome.error and "JSON" in outcome.error
    outcome = registry.execute("search_book", json.dumps({"top_k": 3}), ctx)
    assert outcome.error and "query" in outcome.error
    outcome = registry.execute("nope", "{}", ctx)
    assert outcome.error == "未知工具：nope"


def test_empty_arguments_mean_no_params(registry, ctx):
    assert registry.execute("list_chapters", "", ctx).error is None


def test_output_is_truncated():
    class P(BaseModel):
        pass

    spec = ToolSpec("big", "d", "d", P, lambda ctx, args: {"text": "x" * 500}, max_chars=100)
    outcome = ToolRegistry([spec]).execute("big", "{}", None)
    assert outcome.truncated and len(outcome.content) < 160
    assert "已截断" in outcome.content


def test_tool_error_and_crash_are_reported():
    class P(BaseModel):
        pass

    def fail(ctx, args):
        raise ToolError("业务错误")

    def crash(ctx, args):
        raise RuntimeError("boom")

    reg = ToolRegistry([ToolSpec("fail", "d", "d", P, fail), ToolSpec("crash", "d", "d", P, crash)])
    assert reg.execute("fail", "{}", None).error == "业务错误"
    assert "RuntimeError" in reg.execute("crash", "{}", None).error


def test_distractors_are_unavailable(ctx):
    specs = distractor_tools(3)
    assert len(specs) == 3 and len({s.name for s in specs}) == 3
    reg = ToolRegistry(specs)
    outcome = reg.execute(specs[0].name, "{}", ctx)
    assert outcome.error and "不可用" in outcome.error
    assert distractor_tools(0) == []
