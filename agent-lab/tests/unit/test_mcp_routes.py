from __future__ import annotations

from tests.mcp_helpers import AUTH, make_mcp


def test_content_type_and_body_limits(tmp_path):
    h = make_mcp(tmp_path)
    wrong_type = h.client.post("/mcp", content=b"{}", headers=AUTH)
    assert wrong_type.status_code == 415

    too_large = h.client.post(
        "/mcp",
        content=b"{" + b" " * 1_048_576,
        headers={**AUTH, "Content-Type": "application/json"},
    )
    assert too_large.status_code == 413

    empty = h.client.post("/mcp", content=b"", headers={**AUTH, "Content-Type": "application/json"})
    assert empty.status_code == 400
    assert empty.json()["error"]["code"] == -32700


def test_get_and_delete(tmp_path):
    h = make_mcp(tmp_path)
    get = h.client.get("/mcp", headers=AUTH)
    assert get.status_code == 405
    assert get.headers["allow"] == "POST, DELETE"

    assert h.client.delete("/mcp", headers={"Authorization": "Bearer wrong-token-1234567890"}).status_code == 401
    headers = h.init()
    assert h.client.delete("/mcp", headers=headers).status_code == 204


def test_protocol_header_is_echoed(tmp_path):
    h = make_mcp(tmp_path)
    response = h.client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25"}},
        headers={**AUTH, "MCP-Protocol-Version": "2025-11-25"},
    )
    assert response.status_code == 200
    assert response.headers["mcp-protocol-version"] == "2025-11-25"


def test_disabled_and_short_token(tmp_path):
    assert make_mcp(tmp_path, token="").client.post("/mcp", json={}).status_code == 503
    assert make_mcp(tmp_path, token="short").client.post("/mcp", json={}).status_code == 503


def test_auth_accepts_bearer_and_x_token(tmp_path):
    h = make_mcp(tmp_path)
    body = {"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {}}
    assert h.client.post("/mcp", json=body, headers={"Authorization": "Bearer test-token-1234567890"}).status_code == 200
    assert h.client.post("/mcp", json=body, headers={"X-MCP-Token": "test-token-1234567890"}).status_code == 200
    assert h.client.post("/mcp", json=body, headers={"Authorization": "Bearer nope"}).status_code == 401
