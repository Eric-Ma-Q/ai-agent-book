from __future__ import annotations

import json
import re
import threading
import time

from agent_lab.llm.client import LLMError
from agent_lab.trace.schema import RunEnd, RunStart
from tests.helpers import GOOD_ANSWER, text, tool
from tests.mcp_helpers import make_mcp

RUN_ID = re.compile(r"运行(?: id)?：(\d{8}-\d{6}-[0-9a-f]{4,})")
SESSION = re.compile(r"会话：(mcp-[0-9a-f]+)")


class SlowClient:
    def __init__(self, delay: float = 0.6):
        self.delay = delay
        self.requests = []

    def complete(self, request):
        self.requests.append(request)
        time.sleep(self.delay)
        return text("慢慢答")


def add_start(h, run_id="20261025-213000-abcd", *, source="mcp", session="mcp-test"):
    h.lab.store.append(
        run_id,
        RunStart(
            run_id=run_id,
            question="之前的问题",
            config={"model": "test-model"},
            config_hash="x",
            session_id=session,
            meta={"source": source},
        ),
    )


def test_ask_uses_book_and_reader_tools_and_returns_citations(tmp_path):
    h = make_mcp(tmp_path, [tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])
    headers = h.init(client_name="cursor")
    result = h.tool(headers, "ask_book", {"question": "为什么前缀稳定重要？"})
    assert result["isError"] is False
    body = result["content"][0]["text"]
    assert "前缀稳定很重要" in body
    assert "引用核对" in body and "通过" in body
    assert "http://reader.test/book/chapter2/" in body

    run_id = RUN_ID.search(body).group(1)
    start = next(event for event in h.lab.store.read(run_id) if isinstance(event, RunStart))
    assert start.meta["source"] == "mcp"
    assert start.meta["client"] == "cursor"
    assert start.session_id and start.session_id.startswith("mcp-")

    request = h.scripted.requests[0]
    names = {item["function"]["name"] for item in request.tools}
    assert names == {"list_chapters", "search_book", "read_section", "list_pages", "search_pages", "read_page"}
    assert not ({"read_file", "bash", "write_file", "web_search", "propose_insert"} & names)

    again = h.tool(headers, "get_answer", {"run_id": run_id}, request_id=11)
    assert again["isError"] is False
    assert "前缀稳定很重要" in again["content"][0]["text"]


def test_ask_context_is_prelude_and_question_stays_clean(tmp_path):
    h = make_mcp(tmp_path, [text("好")])
    headers = h.init()
    result = h.tool(
        headers,
        "ask_book",
        {"question": "这和上下文窗口有什么关系？", "context": "读者正在看第 2 章的缓存小节。"},
    )
    assert result["isError"] is False
    body = result["content"][0]["text"]
    run_id = RUN_ID.search(body).group(1)
    start = next(event for event in h.lab.store.read(run_id) if isinstance(event, RunStart))
    assert start.question == "这和上下文窗口有什么关系？"

    messages = h.scripted.requests[0].messages
    assert any("外部应用提供的背景资料" in str(message.get("content")) for message in messages)
    assert any("读者正在看第 2 章" in str(message.get("content")) for message in messages)


def test_session_reuses_previous_qa(tmp_path):
    script = [
        tool("search_book", {"query": "缓存"}),
        text(GOOD_ANSWER),
        tool("search_book", {"query": "工具"}),
        text("工具让 Agent 能操作外部世界。[[ch2#工具|工具让 Agent 能够操作外部世界]]"),
    ]
    h = make_mcp(tmp_path, script)
    headers = h.init()
    first = h.tool(headers, "ask_book", {"question": "前缀稳定为什么重要？"})
    session = SESSION.search(first["content"][0]["text"]).group(1)
    second = h.tool(headers, "ask_book", {"question": "那工具呢？", "session_id": session}, request_id=11)
    assert second["isError"] is False

    second_request = h.scripted.requests[2]
    joined = json.dumps(second_request.messages, ensure_ascii=False)
    assert "前缀稳定为什么重要？" in joined
    assert "前缀稳定很重要" in joined
    run_id = RUN_ID.search(second["content"][0]["text"]).group(1)
    start = next(event for event in h.lab.store.read(run_id) if isinstance(event, RunStart))
    assert start.session_id == session


def test_timeout_returns_running_and_get_answer_finishes(tmp_path):
    slow = SlowClient()
    h = make_mcp(tmp_path, client=slow)
    headers = h.init()
    result = h.tool(headers, "ask_book", {"question": "慢慢答", "wait_seconds": 0})
    assert result["isError"] is False
    body = result["content"][0]["text"]
    assert "问答还在运行" in body
    run_id = RUN_ID.search(body).group(1)

    got = h.tool(headers, "get_answer", {"run_id": run_id, "wait_seconds": 5}, request_id=11)
    assert got["isError"] is False
    assert "慢慢答" in got["content"][0]["text"]


def test_get_answer_rejects_non_mcp_and_unknown_runs(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    add_start(h, source="page-assistant", session="pa-test")
    rejected = h.tool(headers, "get_answer", {"run_id": "20261025-213000-abcd"})
    assert rejected["isError"] is True
    assert "不是 MCP" in rejected["content"][0]["text"]

    unknown = h.tool(headers, "get_answer", {"run_id": "20261025-213000-ffff"}, request_id=11)
    assert unknown["isError"] is True
    assert "找不到这次运行" in unknown["content"][0]["text"]


def test_get_answer_waits_for_pending_run(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    add_start(h)
    pending = h.tool(headers, "get_answer", {"run_id": "20261025-213000-abcd", "wait_seconds": 0})
    assert pending["isError"] is False
    assert "问答还在运行" in pending["content"][0]["text"]

    h.lab.store.append(
        "20261025-213000-abcd",
        RunEnd(status="ok", answer="补上的回答", citations=[], totals={"prompt_tokens": 10, "completion_tokens": 2}),
    )
    done = h.tool(headers, "get_answer", {"run_id": "20261025-213000-abcd"}, request_id=11)
    assert done["isError"] is False
    assert "补上的回答" in done["content"][0]["text"]


def test_cancel_run_sets_event_and_formats_cancelled(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    run_id = "20261025-213000-abcd"
    add_start(h, run_id=run_id)
    event = threading.Event()
    h.client.app.state.service.cancels[run_id] = event
    cancelled = h.tool(headers, "cancel_run", {"run_id": run_id})
    assert cancelled["isError"] is False
    assert event.is_set()

    h.lab.store.append(run_id, RunEnd(status="cancelled", answer=None))
    got = h.tool(headers, "get_answer", {"run_id": run_id}, request_id=11)
    assert got["isError"] is False
    assert "运行已取消" in got["content"][0]["text"]


def test_rate_limit(tmp_path):
    h = make_mcp(tmp_path, [text("一次")], settings_overrides={"mcp_asks_per_minute": 1})
    headers = h.init()
    first = h.tool(headers, "ask_book", {"question": "第一个"})
    assert first["isError"] is False
    second = h.tool(headers, "ask_book", {"question": "第二个"}, request_id=11)
    assert second["isError"] is True
    assert "太频繁" in second["content"][0]["text"]


def test_active_limit(tmp_path):
    h = make_mcp(tmp_path, [text("x")], settings_overrides={"mcp_max_active_asks": 1})
    headers = h.init()
    run_id = "20261025-213000-abcd"
    add_start(h, run_id=run_id)
    h.client.app.state.mcp.ask._active[run_id] = time.monotonic()
    result = h.tool(headers, "ask_book", {"question": "再问一个"})
    assert result["isError"] is True
    assert "上限 1" in result["content"][0]["text"] or "已有 1 个" in result["content"][0]["text"]


def test_model_error_is_tool_error(tmp_path):
    h = make_mcp(tmp_path, [LLMError("连接失败")])
    headers = h.init()
    result = h.tool(headers, "ask_book", {"question": "会失败"})
    assert result["isError"] is True
    assert "运行未完成" in result["content"][0]["text"]
    assert "连接失败" in result["content"][0]["text"]
