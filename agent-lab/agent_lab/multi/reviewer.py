"""提议者-审核者：构造审核者的输入、解析它的结论、把退回意见交回主 Agent。

两种模式（第 10 章表 10-1）：
- self：审核者只看问题和回答——没有引入新信息；
- evidence：另外拿到引用核对器的逐条结果——外部工具反馈。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from ..citations import CheckResult
from ..prompts import REVIEWER_PROMPT

ReviewMode = Literal["self", "evidence"]

STATUS_TEXT = {
    "verified": "通过",
    "not_found": "原文中找不到",
    "wrong_section": "原文存在，但不在标注的小节",
    "too_short": "片段太短，无法核对",
}


@dataclass(frozen=True)
class Verdict:
    verdict: Literal["pass", "revise"]
    issues: tuple[str, ...] = ()


def _evidence(check: CheckResult) -> str:
    if not check.items:
        return "## 引用核对结果\n回答中没有引用。"
    lines = ["## 引用核对结果（由程序逐字比对原文得出）"]
    for index, item in enumerate(check.items, 1):
        where = f"ch{item.chapter}#{item.section_id or '（未标小节）'}"
        status = STATUS_TEXT.get(item.status, item.status)
        if item.status == "wrong_section" and item.found_section_id:
            status += f"，实际在小节 {item.found_section_id}"
        lines.append(f"{index}. {where}「{item.quote}」：{status}")
    return "\n".join(lines)


def review_messages(mode: ReviewMode, question: str, answer: str, check: CheckResult) -> list[dict[str, Any]]:
    parts = [f"## 读者的问题\n{question}", f"## 助教的回答\n{answer}"]
    if mode == "evidence":
        parts.append(_evidence(check))
    return [{"role": "system", "content": REVIEWER_PROMPT}, {"role": "user", "content": "\n\n".join(parts)}]


_JSON_OBJECT = re.compile(r"\{.*\}", re.S)


def parse_verdict(text: str | None) -> Verdict | None:
    """解析审核者的 JSON 结论；无法解析时返回 None（由调用方记录并按通过处理）。"""
    match = _JSON_OBJECT.search(text or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    verdict = str(data.get("verdict", "")).strip().lower()
    if verdict not in ("pass", "revise"):
        return None
    raw = data.get("issues") or []
    raw = [raw] if isinstance(raw, str) else raw if isinstance(raw, list) else []
    issues = tuple(str(item).strip() for item in raw if str(item).strip())
    # 退回却说不出要改什么，主 Agent 无从下手：按通过处理。
    if verdict == "revise" and not issues:
        return Verdict("pass")
    return Verdict(verdict, issues if verdict == "revise" else ())  # type: ignore[arg-type]


def feedback_message(verdict: Verdict) -> dict[str, Any]:
    issues = "\n".join(f"{index}. {issue}" for index, issue in enumerate(verdict.issues, 1))
    return {
        "role": "user",
        "content": f"审核意见：\n{issues}\n\n请据此修改回答，需要时可以再查书；引用的原文片段必须从工具返回的正文中逐字复制。输出完整的新回答。",
    }


# 审核者的输出无法解析时重试一次用的提醒。真实录制中出现过：请求里没有任何工具，模型仍然调用 bash、glob 等不存在的工具，正文为空。
RETRY_MESSAGE = {"role": "user", "content": "你不能调用任何工具，也不需要再查资料。请根据上面的内容直接给出结论，只输出一个 JSON 对象。"}
