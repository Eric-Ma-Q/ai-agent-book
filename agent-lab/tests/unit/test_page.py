import pytest

from agent_lab.page import MAX_BRIEF_CHARS, PageContext, PageError, PageSnapshot
from agent_lab.prompts import page_prompt
from tests.helpers import page_snapshot


def test_context_current_section_and_selection():
    page = PageContext.from_snapshot(page_snapshot())
    assert page.current_index == 4
    assert page.current_section == ("sec-2", "2.2 上下文窗口")
    data = page.context("current")
    assert data["page"]["title"] == "第 2 章 上下文工程"
    assert data["section"]["id"] == "sec-2"
    assert "[#4 paragraph]" in data["text"]
    assert data["truncated"] is False
    assert page.selection()["text"] == "选中原文"
    assert page.screenshot()["available"] is False


def test_current_falls_back_to_nearest_in_viewport():
    data = page_snapshot()
    data["current"] = {"blockIndex": 999}
    page = PageContext.from_snapshot(data)
    assert page.current_index in {4, 5}
    assert page.current_section[0] == "sec-2"


def test_section_scope_excludes_other_sections():
    page = PageContext.from_snapshot(page_snapshot())
    data = page.context("section")
    assert [block["index"] for block in data["blocks"]] == [3, 4, 5, 6]
    assert "前缀稳定" not in data["text"]


def test_page_scope_and_truncation():
    data = page_snapshot()
    page = PageContext.from_snapshot(data)
    full = page.context("page")
    assert [block["index"] for block in full["blocks"]] == [1, 2, 3, 4, 5, 6]
    tiny = page.context("page", 80)
    assert tiny["truncated"] is True
    assert len(tiny["text"]) <= 200


def test_read_range_reports_next_block():
    page = PageContext.from_snapshot(page_snapshot())
    data = page.read_range(3, 4)
    assert [block["index"] for block in data["blocks"]] == [3, 4]
    assert data["next_block"] == 5
    assert page.read_range(4, 3)["range"] == [3, 4]


def test_find_returns_snippets_and_errors_on_empty_query():
    page = PageContext.from_snapshot(page_snapshot())
    data = page.find("上下文")
    assert data["count"] >= 2
    assert data["hits"][0]["in_viewport"] in {True, False}
    with pytest.raises(PageError):
        page.find("  ")


def test_outline_elements_and_no_selection():
    data = page_snapshot()
    data["selection"] = {"text": "   "}
    page = PageContext.from_snapshot(data)
    outline = page.outline()
    assert [item["id"] for item in outline["headings"]] == ["sec-1", "sec-2"]
    assert page.selection()["selected"] is False
    elements = page.elements("code")
    assert elements["elements"][0]["index"] == 5
    assert page.elements("link")["links"][0]["href"] == "https://example.com/a"
    tables = page.elements("table")
    assert tables["elements"][0]["index"] == 6


def test_prelude_contains_position_selection_and_hint():
    page = PageContext.from_snapshot(page_snapshot())
    page.screenshot_available = True
    page.screenshot_url = "/x.jpg"
    page.vision = False
    text = page.prelude()
    assert "第 2 章 上下文工程" in text
    assert "2.2 上下文窗口" in text
    assert "选中：有" in text
    assert "选中文字：选中原文" in text
    assert "仅供读者查看" in text
    assert len(text) <= MAX_BRIEF_CHARS


def test_blocks_are_sorted_and_deduplicated_but_indexes_keep_original():
    data = page_snapshot()
    data["blocks"] = list(reversed(data["blocks"])) + [data["blocks"][0]]
    page = PageContext.from_snapshot(data)
    assert [block.index for block in page.snapshot.blocks] == [1, 2, 3, 4, 5, 6]


def test_bad_snapshot_is_page_error():
    with pytest.raises(PageError):
        PageContext.from_snapshot("nope")
    with pytest.raises(PageError):
        PageContext.from_snapshot(page_snapshot(viewport={"width": -1}))
    with pytest.raises(PageError):
        PageContext.from_snapshot(page_snapshot(blocks=[{"index": 0, "text": "x" * 5000}]))


def test_empty_page_is_tolerated():
    page = PageContext.from_snapshot(page_snapshot(blocks=[], headings=[]))
    assert page.current_index is None
    assert page.context("current")["text"] == ""
    assert page.read_range(0, 10)["blocks"] == []
    assert PageSnapshot.model_validate(page_snapshot()).blocks[0].role == "heading"


def test_oversized_page_text_is_trimmed_around_the_current_block():
    data = page_snapshot()
    data["blocks"] = [
        {"index": index, "tag": "p", "role": "paragraph", "sectionId": "s", "text": "长" * 3000, "top": index * 100, "height": 80, "inViewport": index == 4}
        for index in range(1, 101)
    ]
    page = PageContext.from_snapshot(data)
    assert page.snapshot.truncated is True
    assert page.current_index == 4
    assert 1 <= len(page.snapshot.blocks) < 100
    assert any(block.index == 4 for block in page.snapshot.blocks)



def test_page_assistant_budget_and_final_answer_defaults():
    from agent_lab.page import PAGE_DEFAULTS

    assert PAGE_DEFAULTS["max_turns"] == 12
    assert PAGE_DEFAULTS["max_total_tokens"] == 160_000
    assert PAGE_DEFAULTS["status_bar"] is True
    assert PAGE_DEFAULTS["final_answer"] is True


def test_concept_map_budget_only_reads_the_current_chapter():
    from agent_lab.page import PAGE_DEFAULTS, PAGE_MAP_DEFAULTS, page_config_overrides

    assert PAGE_MAP_DEFAULTS["max_turns"] == 4
    # 概念图不再单独收紧输出上限，跟着模型档案 / LAB_MAX_OUTPUT_TOKENS 走。
    assert "max_output_tokens" not in PAGE_MAP_DEFAULTS
    assert "max_output_tokens" not in PAGE_DEFAULTS
    assert set(PAGE_MAP_DEFAULTS["tools"]) == {"page_outline", "list_chapters", "search_book", "read_section"}
    config = page_config_overrides("", "map")
    assert config["max_turns"] == 4
    assert "web_search" not in config["tools"]
    ask = page_config_overrides("", "ask")
    assert ask["max_turns"] == 12 and "web_search" in ask["tools"]


def test_prelude_mentions_check_and_map_modes():
    page = PageContext.from_snapshot(page_snapshot())
    check = page.prelude(mode="check")
    assert "检验" in check and "check" in check
    assert check.endswith("页面前言不是读者的新问题。")
    map_text = page.prelude(mode="map")
    assert "概念图" in map_text and "concept" in map_text
    assert map_text.endswith("不要输出围栏外文字。")
    assert "list_chapters" in map_text
    assert "web_search" not in map_text


def test_prelude_carries_focus_block_and_neighbours():
    page = PageContext.from_snapshot(page_snapshot())
    page.screenshot_available = True
    page.screenshot_kind = "element"
    page.vision = True
    focus = page.blocks_by_index[6]
    text = page.prelude(focus=focus)
    assert "【聚焦元素】" in text
    assert "第 6 块（table）" in text
    assert "项目 | 值" in text
    assert "聚焦元素" in text
    assert "相邻上下文" in text
    assert len(text) <= MAX_BRIEF_CHARS


def test_focus_block_survives_truncation():
    data = page_snapshot()
    data["blocks"] = [
        {"index": index, "tag": "p", "role": "paragraph", "sectionId": "s", "text": "长" * 3000, "top": index * 100, "height": 80, "inViewport": index == 4}
        for index in range(1, 101)
    ]
    page = PageContext.from_snapshot(data, focus_index=100)
    assert page.snapshot.truncated is True
    assert any(block.index == 100 for block in page.snapshot.blocks)


def test_page_prompt_documents_both_page_reference_forms():
    prompt = page_prompt("ask")
    assert "[[#块号|原文片段]]" in prompt
    assert "第 N 块" in prompt
    assert "不要改写成 [[ch...]] 书稿引用" in prompt
