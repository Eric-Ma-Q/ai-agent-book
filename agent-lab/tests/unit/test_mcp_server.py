from __future__ import annotations

import re

from tests.helpers import GOOD_ANSWER, text, tool
from tests.mcp_helpers import make_mcp

RUN_ID = re.compile(r"运行(?: id)?：(\d{8}-\d{6}-[0-9a-f]{4,})")
META = {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}


def test_legacy_end_to_end(tmp_path):
    h = make_mcp(tmp_path, [tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])
    headers = h.init()
    tools = h.rpc(headers, 2, "tools/list").json()["result"]["tools"]
    assert "ask_book" in {item["name"] for item in tools}

    search = h.tool(headers, "search_book", {"query": "缓存", "top_k": 1}, request_id=3)
    assert "kv-cache-的原理与约束" in search["content"][0]["text"]

    read = h.tool(headers, "read_section", {"chapter": 2, "section_id": "kv-cache-的原理与约束"}, request_id=4)
    assert "前缀稳定时" in read["content"][0]["text"]

    answer = h.tool(headers, "ask_book", {"question": "为什么前缀稳定重要？"}, request_id=5)
    assert answer["isError"] is False
    body = answer["content"][0]["text"]
    run_id = RUN_ID.search(body).group(1)
    got = h.tool(headers, "get_answer", {"run_id": run_id}, request_id=6)
    assert "前缀稳定很重要" in got["content"][0]["text"]


def test_modern_end_to_end(tmp_path):
    h = make_mcp(tmp_path, [tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])

    discover = h.client.post(
        "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": META}, headers={"Authorization": "Bearer test-token-1234567890"}
    )
    assert discover.status_code == 200
    assert discover.json()["result"]["resultType"] == "complete"

    search = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {**META, "name": "search_book", "arguments": {"query": "缓存"}},
        },
        headers={"Authorization": "Bearer test-token-1234567890"},
    ).json()["result"]
    assert search["resultType"] == "complete"
    assert search["structuredContent"]["results"][0]["section_id"] == "kv-cache-的原理与约束"

    answer = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {**META, "name": "ask_book", "arguments": {"question": "为什么前缀稳定重要？"}},
        },
        headers={"Authorization": "Bearer test-token-1234567890"},
    ).json()["result"]
    assert answer["isError"] is False
    run_id = answer["structuredContent"]["run_id"]
    got = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {**META, "name": "get_answer", "arguments": {"run_id": run_id}},
        },
        headers={"Authorization": "Bearer test-token-1234567890"},
    ).json()["result"]
    assert "前缀稳定很重要" in got["content"][0]["text"]
    assert got["structuredContent"]["status"] == "ok"


def test_ask_toolset_respects_personal_off(tmp_path):
    h = make_mcp(tmp_path, [text("好")], personal=False)
    headers = h.init()
    result = h.tool(headers, "ask_book", {"question": "工具是什么？"})
    assert result["isError"] is False
    names = {item["function"]["name"] for item in h.scripted.requests[0].tools}
    assert names == {"list_chapters", "search_book", "read_section"}
