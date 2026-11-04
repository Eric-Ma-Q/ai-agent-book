"""036：token 生成、保留、轮换与掩码。"""

from __future__ import annotations

import string
import time

import pytest

from agent_lab.mcp.token import ensure_token, mask, read_token, rotate_token, write_token

HEX = set(string.hexdigits.lower())


def _valid(token: str) -> bool:
    return len(token) == 48 and set(token) <= HEX


def test_ensure_creates_file_with_private_mode(tmp_path):
    env = tmp_path / ".env"
    token, created = ensure_token(env)
    assert created is True
    assert _valid(token)
    assert env.read_text(encoding="utf8") == f"LAB_MCP_TOKEN={token}\n"
    assert env.stat().st_mode & 0o777 == 0o600


def test_ensure_fills_empty_value_and_keeps_other_keys(tmp_path):
    env = tmp_path / ".env"
    env.write_text("# 模型接口\nLAB_MODEL=demo\nLAB_MCP_TOKEN=\nLAB_READER_URL=http://127.0.0.1:4321\n", encoding="utf8")
    token, created = ensure_token(env)
    assert created is True and _valid(token)
    text = env.read_text(encoding="utf8")
    assert "LAB_MODEL=demo" in text and "# 模型接口" in text
    assert "LAB_READER_URL=http://127.0.0.1:4321" in text
    assert f"LAB_MCP_TOKEN={token}" in text
    assert text.count("LAB_MCP_TOKEN=") == 1


def test_ensure_overwrites_short_value(tmp_path):
    env = tmp_path / ".env"
    env.write_text("LAB_MCP_TOKEN=short\n", encoding="utf8")
    token, created = ensure_token(env)
    assert created is True and _valid(token)
    assert "short" not in env.read_text(encoding="utf8")


def test_ensure_keeps_valid_value_untouched(tmp_path):
    env = tmp_path / ".env"
    original = "a" * 48
    env.write_text(f"LAB_MCP_TOKEN={original}\n", encoding="utf8")
    before = env.stat().st_mtime_ns
    time.sleep(0.01)
    token, created = ensure_token(env)
    assert token == original and created is False
    assert env.stat().st_mtime_ns == before


def test_rotate_changes_value(tmp_path):
    env = tmp_path / ".env"
    first, _ = ensure_token(env)
    second = rotate_token(env)
    assert second != first and _valid(second)
    assert read_token(env) == second


def test_mask_does_not_leak_middle():
    token = "abcdef0123456789abcdef0123456789abcdef0123456789"
    masked = mask(token)
    assert masked.startswith("abcdef") and masked.endswith("6789")
    assert "…" in masked
    assert token[6:44] not in masked
    assert mask("short") == "*****"


def test_quotes_export_and_crlf(tmp_path):
    env = tmp_path / ".env"
    env.write_bytes(b"export LAB_MCP_TOKEN='0123456789abcdef'\r\n")
    assert read_token(env) == "0123456789abcdef"
    token, created = ensure_token(env)
    assert created is False and token == "0123456789abcdef"
    write_token(env, token)
    assert env.read_bytes().count(b"LAB_MCP_TOKEN=") == 1


def test_rotate_on_missing_file_creates(tmp_path):
    env = tmp_path / ".env"
    token = rotate_token(env)
    assert _valid(token) and read_token(env) == token
    with pytest.raises(OSError):
        rotate_token(tmp_path / "missing-dir" / ".env")
