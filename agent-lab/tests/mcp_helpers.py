"""MCP 测试共用：临时书稿、读者数据、TestClient 与会话。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from tests.helpers import BOOK_MD

TOKEN = "test-token-1234567890"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@dataclass
class McpHarness:
    client: TestClient
    lab: Lab
    settings: Settings
    scripted: Any
    root: Path
    personal: Path
    token: str = TOKEN

    def init(self, version: str = "2025-11-25", client_name: str = "test") -> dict[str, str]:
        response = self.client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": version, "clientInfo": {"name": client_name, "version": "1.0"}},
            },
            headers=AUTH,
        )
        assert response.status_code == 200, response.text
        session = response.headers.get("mcp-session-id")
        assert session
        headers = {**AUTH, "Mcp-Session-Id": session}
        notification = self.client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            headers=headers,
        )
        assert notification.status_code == 202
        return headers

    def rpc(self, headers: dict[str, str], request_id: int, method: str, params: dict | None = None):
        body: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            body["params"] = params
        return self.client.post("/mcp", json=body, headers=headers)

    def tool(self, headers: dict[str, str], name: str, arguments: dict | None = None, request_id: int = 10) -> dict:
        response = self.rpc(headers, request_id, "tools/call", {"name": name, "arguments": arguments or {}})
        assert response.status_code == 200, response.text
        return response.json()["result"]


def make_mcp(
    tmp_path: Path,
    script: list | None = None,
    *,
    personal: bool = True,
    token: str = TOKEN,
    settings_overrides: dict | None = None,
    client: Any | None = None,
) -> McpHarness:
    root = tmp_path
    book = root / "book"
    book.mkdir(exist_ok=True)
    (book / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    personal_dir = root / "personal"
    notes = personal_dir / "notes" / "zh-CN"
    notes.mkdir(parents=True, exist_ok=True)
    (notes / "chapter2.json").write_text(
        json.dumps(
            {
                "highlights": [
                    {"quote": "前缀稳定时，缓存命中率更高", "note": "记一下", "createdAt": "2026-10-08T15:03:57Z"},
                    {"quote": "工具让 Agent 能够操作外部世界", "createdAt": "2026-10-07T00:00:00Z"},
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf8",
    )
    inserts = personal_dir / "inserts" / "zh-CN" / "chapter2"
    inserts.mkdir(parents=True, exist_ok=True)
    (inserts / "a.md").write_text(
        "---\nafter: \"前缀稳定时，缓存命中率更高\"\nsection: \"kv-cache-的原理与约束\"\noffset: 1\n---\n\n## 补充\n缓存命中率会受前缀影响。\n",
        encoding="utf8",
    )
    annotations = personal_dir / "annotations" / "zh-CN"
    annotations.mkdir(parents=True, exist_ok=True)
    (annotations / "chapter2.json").write_text(
        json.dumps(
            {
                "format": "ai-agent-book-annotations",
                "version": 1,
                "chapter": "2",
                "annotations": [
                    {
                        "id": "c2-a",
                        "quote": "前缀稳定时，缓存命中率更高",
                        "kind": "term",
                        "title": "前缀缓存",
                        "body": "前缀不变的部分可以复用缓存。",
                        "sources": [{"title": "示例来源", "url": "https://example.com/cache"}],
                    },
                    {
                        "id": "c2-b",
                        "quote": "工具让 Agent 能够操作外部世界",
                        "kind": "extend",
                        "title": "工具边界",
                        "body": "工具的描述会影响调用准确率。",
                        "sources": [],
                    },
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf8",
    )
    values = dict(
        book_dir_override=book,
        personal_dir_override=personal_dir,
        data_dir_override=root / "data",
        llm_api_key="k",
        reader_url="http://reader.test",
        mcp_token=token,
        mcp_personal=personal,
        mcp_ask_wait_s=5,
    )
    values.update(settings_overrides or {})
    settings = Settings(**values)
    scripted = client if client is not None else ScriptedClient(script or [])
    lab = Lab.create(settings, client=scripted)
    return McpHarness(TestClient(create_app(settings, lab=lab)), lab, settings, scripted, root, personal_dir, token)
