from __future__ import annotations

import threading

import pytest

from tests.mcp_helpers import AUTH, TOKEN, make_mcp


def test_initialize_negotiates_legacy_versions_and_returns_session(tmp_path):
    h = make_mcp(tmp_path)
    for version, expected in (("2025-11-25", "2025-11-25"), ("2024-11-05", "2024-11-05"), ("1900-01-01", "2025-11-25")):
        response = h.client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": version}},
            headers=AUTH,
        )
        assert response.status_code == 200
        assert response.headers["mcp-session-id"]
        result = response.json()["result"]
        assert result["protocolVersion"] == expected
        assert result["capabilities"] == {"tools": {"listChanged": False}}
        assert result["serverInfo"]["name"] == "ai-agent-book"
        assert "search_book" in result["instructions"]


def test_legacy_tools_list_requires_session(tmp_path):
    h = make_mcp(tmp_path)
    missing = h.rpc(AUTH, 2, "tools/list")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == -32602
    headers = h.init()
    ok = h.rpc(headers, 3, "tools/list")
    assert ok.status_code == 200
    names = [tool["name"] for tool in ok.json()["result"]["tools"]]
    assert names[:3] == ["list_chapters", "search_book", "read_section"]
    assert "ask_book" in names and "list_annotations" in names


def test_delete_session_and_expired_session(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    deleted = h.client.delete("/mcp", headers=headers)
    assert deleted.status_code == 204
    assert h.rpc(headers, 2, "tools/list").status_code == 404

    headers = h.init()
    session = headers["Mcp-Session-Id"]
    mcp = h.client.app.state.mcp
    mcp._sessions[session].created_at = 0
    expired = h.rpc(headers, 3, "tools/list")
    assert expired.status_code == 404


def test_personal_off_hides_reader_tools(tmp_path):
    h = make_mcp(tmp_path, personal=False)
    headers = h.init()
    names = [tool["name"] for tool in h.rpc(headers, 2, "tools/list").json()["result"]["tools"]]
    assert "list_highlights" not in names
    assert "list_inserts" not in names
    assert "list_annotations" not in names
    result = h.rpc(headers, 10, "tools/call", {"name": "list_highlights", "arguments": {}})
    assert result.status_code == 200
    assert result.json()["error"]["code"] == -32602
    assert "未知工具" in result.json()["error"]["message"]


def test_modern_discover_and_tools_list(tmp_path):
    h = make_mcp(tmp_path)
    discover = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {}},
        headers=AUTH,
    )
    assert discover.status_code == 200
    result = discover.json()["result"]
    assert result["resultType"] == "complete"
    assert "2026-07-28" in result["supportedVersions"]
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    assert result["ttlMs"] == 60_000 and result["cacheScope"] == "private"
    assert result["_meta"]["io.modelcontextprotocol/serverInfo"]["name"] == "ai-agent-book"

    meta = {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}
    listing = h.client.post(
        "/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": meta}, headers=AUTH
    )
    assert listing.status_code == 200
    body = listing.json()["result"]
    assert body["resultType"] == "complete"
    assert body["ttlMs"] == 60_000
    assert [tool["name"] for tool in body["tools"]][0] == "list_chapters"


def test_modern_tools_call_returns_structured_content(tmp_path):
    h = make_mcp(tmp_path)
    response = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "search_book",
                "arguments": {"query": "缓存"},
                "_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"},
            },
        },
        headers=AUTH,
    )
    result = response.json()["result"]
    assert result["resultType"] == "complete"
    assert result["isError"] is False
    assert result["structuredContent"]["results"][0]["section_id"] == "kv-cache-的原理与约束"
    assert "kv-cache-的原理与约束" in result["content"][0]["text"]


def test_modern_requires_meta_version_and_supports_header(tmp_path):
    h = make_mcp(tmp_path)
    missing = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        headers={**AUTH, "MCP-Protocol-Version": "2026-07-28"},
    )
    assert missing.status_code == 400
    assert missing.json()["error"]["code"] == -32602

    unsupported = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "1900-01-01"}},
        },
        headers=AUTH,
    )
    assert unsupported.status_code == 400
    assert unsupported.json()["error"]["code"] == -32022

    mismatch = h.client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/list",
            "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}},
        },
        headers={**AUTH, "MCP-Protocol-Version": "2025-11-25"},
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["error"]["code"] == -32020


def test_jsonrpc_errors_and_batch(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    method = h.rpc(headers, 2, "unknown/method")
    assert method.status_code == 200
    assert method.json()["error"]["code"] == -32601

    tool = h.rpc(headers, 10, "tools/call", {"name": "not_a_tool", "arguments": {}})
    assert tool.status_code == 200
    assert tool.json()["error"]["code"] == -32602
    assert "未知工具" in tool.json()["error"]["message"]

    batch = h.client.post("/mcp", json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"}], headers=headers)
    assert batch.status_code == 400
    assert batch.json()["error"]["code"] == -32600

    bad_json = h.client.post(
        "/mcp",
        content=b"{not json",
        headers={**headers, "Content-Type": "application/json"},
    )
    assert bad_json.status_code == 400
    assert bad_json.json()["error"]["code"] == -32700

    null_id = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": None, "method": "ping"},
        headers=headers,
    )
    assert null_id.status_code == 400
    assert null_id.json()["error"]["code"] == -32600


def test_notifications_and_cancel_event(tmp_path):
    h = make_mcp(tmp_path)
    headers = h.init()
    # 无 id 的 initialized 是通知，返回 202。
    note = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
        headers=headers,
    )
    assert note.status_code == 202 and note.content == b""

    mcp = h.client.app.state.mcp
    event = threading.Event()
    mcp._inflight[f"{headers['Mcp-Session-Id']}:99"] = event
    cancelled = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 99}},
        headers=headers,
    )
    assert cancelled.status_code == 202
    assert event.is_set()


def test_duplicate_inflight_request_id(tmp_path):
    h = make_mcp(tmp_path)
    mcp = h.client.app.state.mcp
    mcp._begin("session:7")
    with pytest.raises(Exception) as info:
        mcp._begin("session:7")
    assert getattr(info.value, "code", None) == -32600
    mcp._end("session:7")


def test_auth_modes(tmp_path):
    short = make_mcp(tmp_path, token="short")
    assert short.client.post("/mcp", json={}).status_code == 503

    empty = make_mcp(tmp_path, token="")
    assert empty.client.post("/mcp", json={}).status_code == 503

    h = make_mcp(tmp_path)
    assert h.client.post("/mcp", json={}).status_code == 401
    wrong = h.client.post("/mcp", json={}, headers={"Authorization": "Bearer wrong-token-1234567890"})
    assert wrong.status_code == 401 and wrong.headers["www-authenticate"].startswith("Bearer")

    x_token = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {}},
        headers={"X-MCP-Token": TOKEN},
    )
    assert x_token.status_code == 200
