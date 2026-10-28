"""token 粗估：只用于上下文分段条的比例展示，明确标为估计值。

真实用量一律取模型接口返回的 usage。中文约 0.7 token/字，其他字符约 4 字符/token。
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

_CJK = re.compile(r"[　-鿿＀-￯]")


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = len(_CJK.findall(text))
    return math.ceil(cjk * 0.7 + (len(text) - cjk) / 4)


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, list):
        content = " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    parts = [content or "", message.get("reasoning_content") or ""]
    for call in message.get("tool_calls") or []:
        fn = call.get("function", {})
        parts.append(f"{fn.get('name', '')} {fn.get('arguments', '')}")
    return " ".join(parts)


def segment_tokens(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None) -> dict[str, int]:
    segments = {"system": 0, "tools": 0, "user": 0, "assistant": 0, "tool": 0}
    if tools:
        segments["tools"] = estimate_tokens(json.dumps(tools, ensure_ascii=False))
    for message in messages:
        role = message.get("role", "user")
        key = role if role in segments else "user"
        segments[key] += estimate_tokens(_message_text(message))
    return segments
