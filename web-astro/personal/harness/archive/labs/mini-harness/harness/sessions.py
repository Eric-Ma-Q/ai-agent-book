"""S7 的真相源：会话记录（.harness/sessions/<id>.jsonl）+ 可注入时钟 + 密钥脱敏。

记忆层（memory.py）是派生缓存，这里是它的唯一来源（research/11 §8.4 第 14 条
"记忆库可重建：原始会话历史在，记忆是派生缓存"）。拆成两个文件正是为了把
"真相"和"缓存"在代码结构上分开：删掉 .harness/memory/ 不丢信息，删掉本模块写的
.harness/sessions/ 才真的丢。

- 一次 Agent.run 一个会话文件，每条消息/事件一行 JSON，逐条追加（崩溃也留得下前半段）；
- 落盘前整条记录过脱敏器：真相源也不该存明文密钥（代价：脱敏是有损的，见 README S7）；
- 时钟可注入（HarnessConfig.clock），让时间戳、重放顺序与重建结果在测试里完全确定。
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

SESSIONS_DIR = ".harness/sessions"   # 会话记录（真相源），相对工作区

# ---------------------------------------------------------------- 脱敏

_SECRET_PATTERNS = [
    (re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}"), "[REDACTED:sk-key]"),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]+"), r"\1 [REDACTED]"),
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)"
                r"(?!\[REDACTED\])(\"[^\"]*\"|'[^']*'|[^\s'\",;\\]+)"), r"\1\2[REDACTED]"),
]


def redact(text: str) -> tuple[str, int]:
    """抹掉疑似密钥，返回 (脱敏后文本, 命中处数)。幂等：对结果再跑一次命中 0 处。"""
    total = 0
    for pattern, repl in _SECRET_PATTERNS:
        text, n = pattern.subn(repl, text)
        total += n
    return text, total


def redact_obj(obj: object) -> object:
    """递归脱敏 JSON 结构里的所有字符串（会话记录落盘前用）。"""
    if isinstance(obj, str):
        return redact(obj)[0]
    if isinstance(obj, dict):
        return {k: redact_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_obj(v) for v in obj]
    return obj


# ---------------------------------------------------------------- 时钟与会话记录

def now(cfg: object) -> datetime:
    """可注入时钟（HarnessConfig.clock）；None 用系统时钟。统一成带时区的时间。"""
    clock = getattr(cfg, "clock", None)
    ts = clock() if clock else datetime.now()
    return ts if ts.tzinfo else ts.astimezone()


def ts_key(iso: str) -> float:
    try:
        return datetime.fromisoformat(iso).timestamp()
    except (TypeError, ValueError):
        return 0.0


class NullSession:
    """记忆层关闭时的空会话：所有记录都是空操作。"""

    session_id = "no-session"

    def event(self, type_: str, **fields) -> None:
        return None

    def record(self, message: dict) -> None:
        return None


class SessionLog(NullSession):
    """一次 Agent.run 一个 `.harness/sessions/<id>.jsonl`：逐条追加、落盘前脱敏。"""

    def __init__(self, workspace: Path | str, cfg: object):
        self.cfg = cfg
        started = now(cfg)
        self.session_id = f"{started:%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
        self.path = Path(workspace) / SESSIONS_DIR / f"{self.session_id}.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.event("session_start", session_id=self.session_id,
                   memory_gate=bool(getattr(cfg, "memory_gate", True)))

    def event(self, type_: str, **fields) -> None:
        rec = {"type": type_, "ts": now(self.cfg).isoformat(), **fields}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(redact_obj(rec), ensure_ascii=False) + "\n")

    def record(self, message: dict) -> None:
        self.event("message", message=message)


def open_session(workspace: Path | str, cfg: object) -> NullSession:
    return SessionLog(workspace, cfg) if getattr(cfg, "memory_enabled", False) else NullSession()


__all__ = ["SESSIONS_DIR", "redact", "redact_obj", "now", "ts_key",
           "NullSession", "SessionLog", "open_session"]
