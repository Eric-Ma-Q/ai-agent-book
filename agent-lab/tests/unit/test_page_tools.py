import json

from agent_lab.page import PAGE_TOOL_NAMES, PageContext
from agent_lab.tools import all_tools
from agent_lab.tools.registry import RunState, ToolContext, ToolRegistry
from tests.helpers import page_snapshot

REGISTRY = ToolRegistry(all_tools())


def ctx(page=True):
    return ToolContext(page=PageContext.from_snapshot(page_snapshot()) if page else None, run_id="r", state=RunState())


def call(name, context, **args):
    outcome = REGISTRY.execute(name, json.dumps(args, ensure_ascii=False), context)
    return outcome, (json.loads(outcome.content) if outcome.error is None else None)


def test_page_context_and_scope():
    outcome, data = call("page_context", ctx())
    assert outcome.error is None
    assert data["scope"] == "current"
    assert data["page"]["title"].startswith("第 2 章")
    _, section = call("page_context", ctx(), scope="section")
    assert [block["index"] for block in section["blocks"]] == [3, 4, 5, 6]


def test_page_read_range_and_validation():
    _, data = call("page_read_range", ctx(), start_block=3, end_block=4)
    assert [block["index"] for block in data["blocks"]] == [3, 4]
    outcome, _ = call("page_read_range", ctx(), start_block=4, end_block=3)
    assert "不能小于" in outcome.error
    outcome, _ = call("page_read_range", ctx(), start_block=0, end_block=500)
    assert "400" in outcome.error


def test_page_find_outline_elements_selection():
    _, found = call("page_find", ctx(), query="上下文")
    assert found["count"] >= 2
    _, outline = call("page_outline", ctx())
    assert len(outline["headings"]) == 2
    _, elements = call("page_elements", ctx(), kind="code")
    assert elements["elements"][0]["index"] == 5
    _, selection = call("page_selection", ctx())
    assert selection["selected"] is True


def test_page_screenshot_does_not_leak_image_data():
    context = ctx()
    context.page.screenshot_available = True
    context.page.screenshot_url = "/__lab/page/screenshots/20261019-090000-abcd"
    context.page.screenshot_bytes = 1234
    outcome, data = call("page_screenshot", context)
    assert outcome.error is None
    assert data["available"] is True
    assert "vision" in data
    assert data["visible_blocks"][0]["index"] == 4
    assert "base64" not in outcome.content


def test_page_tools_require_a_snapshot():
    for name, args in [
        ("page_context", {}),
        ("page_read_range", {"start_block": 1, "end_block": 2}),
        ("page_find", {"query": "x"}),
        ("page_outline", {}),
        ("page_elements", {}),
        ("page_selection", {}),
        ("page_screenshot", {}),
    ]:
        outcome, _ = call(name, ctx(page=False), **args)
        assert outcome.error and "没有页面快照" in outcome.error


def test_page_tool_validation_error_is_structured():
    outcome = REGISTRY.execute("page_context", "not json", ctx())
    assert outcome.error and "JSON" in outcome.error
    outcome = REGISTRY.execute("page_find", json.dumps({"query": ""}), ctx())
    assert outcome.error and "query" in outcome.error


def test_page_tool_names_are_registered():
    names = {spec.name for spec in all_tools()}
    assert set(PAGE_TOOL_NAMES) <= names
