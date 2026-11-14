"""MCP token 管理：生成、保留、轮换与掩码。

token 只写在 `agent-lab/.env` 的 `LAB_MCP_TOKEN` 一行；部署脚本通过
`python -m agent_lab.mcp.token ensure|show|rotate` 调用，不自己拼字符串。
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
import sys
from pathlib import Path

KEY = "LAB_MCP_TOKEN"
MIN_LENGTH = 16
_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def _strip(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def read_token(env_path: Path) -> str:
    try:
        text = env_path.read_text(encoding="utf8", errors="replace")
    except FileNotFoundError:
        return ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        match = _LINE.match(line)
        if match and match.group(1) == KEY:
            return _strip(match.group(2))
    return ""


def mask(token: str) -> str:
    if not token:
        return ""
    if len(token) < 10:
        return "*" * len(token)
    return f"{token[:6]}…{token[-4:]}"


def _is_valid(token: str) -> bool:
    return len(token) >= MIN_LENGTH


def write_token(env_path: Path, token: str) -> None:
    env_path = Path(env_path)
    try:
        text = env_path.read_text(encoding="utf8", errors="replace")
    except FileNotFoundError:
        text = ""
    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines()
    kept: list[str] = []
    replaced = False
    for raw in lines:
        line = raw.strip()
        plain = line[7:].lstrip() if line.startswith("export ") else line
        match = _LINE.match(plain)
        if match and match.group(1) == KEY:
            if not replaced:
                kept.append(f"{KEY}={token}")
                replaced = True
            continue
        kept.append(raw)
    if not replaced:
        kept.append(f"{KEY}={token}")
    body = newline.join(kept) + newline
    if not env_path.parent.is_dir():
        raise FileNotFoundError(f"目录不存在：{env_path.parent}")
    tmp = env_path.with_name(f".{env_path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf8", newline="") as handle:
            handle.write(body)
        os.chmod(tmp, 0o600)
        os.replace(tmp, env_path)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


def _tighten(env_path: Path) -> None:
    try:
        mode = env_path.stat().st_mode & 0o777
    except OSError:
        return
    if mode & 0o077:
        os.chmod(env_path, 0o600)
        print(f"已把 {env_path.name} 权限收紧为 600", file=sys.stderr)


def ensure_token(env_path: Path) -> tuple[str, bool]:
    current = read_token(env_path)
    if _is_valid(current):
        return current, False
    token = secrets.token_hex(24)
    write_token(env_path, token)
    _tighten(env_path)
    return token, True


def rotate_token(env_path: Path) -> str:
    token = secrets.token_hex(24)
    write_token(env_path, token)
    _tighten(env_path)
    return token


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m agent_lab.mcp.token", description="维护 MCP Bearer token")
    parser.add_argument("action", choices=["ensure", "show", "rotate"])
    parser.add_argument("--env", default=".env", help=".env 路径，默认当前目录的 .env")
    parser.add_argument("--mask", action="store_true", help="show 时只输出掩码")
    args = parser.parse_args(argv)
    env_path = Path(args.env)
    try:
        if args.action == "ensure":
            token, created = ensure_token(env_path)
            print(f"{'created' if created else 'kept'} {mask(token)}")
        elif args.action == "rotate":
            print(f"rotated {mask(rotate_token(env_path))}")
        else:
            token = read_token(env_path)
            if not token:
                print(f"{KEY} 未设置", file=sys.stderr)
                return 1
            print(mask(token) if args.mask else token)
    except OSError as error:
        print(f"无法读写 {env_path}：{error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
