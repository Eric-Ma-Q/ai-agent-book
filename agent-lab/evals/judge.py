"""LLM 评判（辅助指标）：按评分细则给回答打分。

结果标记为 informational，只展示、不参与通过判定，因为它本身是一个需要校准的模型输出。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from agent_lab.llm.client import ChatClient, ChatRequest

if TYPE_CHECKING:
    from .verifiers import TrialView, VerifierResult

JUDGE_PROMPT = """你是严格的评审。根据评分细则给助教的回答打分，只输出 JSON：{"score": 1到{scale}的整数, "reason": "一句话理由"}。

评分细则：
{rubric}"""


@dataclass(frozen=True)
class Judge:
    client: ChatClient
    model: str


def _question(view: "TrialView") -> str:
    start = view.events[0] if view.events else None
    return getattr(start, "question", "")


def llm_rubric(view: "TrialView", judge: Judge | None = None, rubric: str = "", scale: int = 5, pass_score: int = 4, **_: Any) -> "VerifierResult":
    from .verifiers import VerifierResult

    if judge is None:
        return VerifierResult("llm_rubric", True, "未配置评判模型，跳过", informational=True)
    messages = [
        {"role": "system", "content": JUDGE_PROMPT.replace("{scale}", str(scale)).replace("{rubric}", rubric)},
        {"role": "user", "content": f"问题：{_question(view)}\n\n回答：{view.answer}"},
    ]
    try:
        response = judge.client.complete(ChatRequest(model=judge.model, messages=messages, temperature=0.0, max_tokens=300))
        content = response.message.get("content") or ""
        match = re.search(r"\{.*\}", content, re.S)
        data = json.loads(match.group(0)) if match else {}
        score = int(data["score"])
    except Exception as error:  # noqa: BLE001 - 评判失败如实记录
        return VerifierResult("llm_rubric", False, f"评判失败：{type(error).__name__}", informational=True)
    return VerifierResult("llm_rubric", score >= pass_score, f"{score}/{scale}：{data.get('reason', '')}", informational=True)
