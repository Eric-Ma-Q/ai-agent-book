"""提议者（proposer）：循环里唯一由模型扮演的角色。

两种实现：
  - MockProposer：离线、确定、零成本。按脚本逐轮"修好"一个函数，用来演示整条
    链路（含"到顶之后平台期停机"）。UI 上会明确标注「模拟模式」。
  - OpenAIProposer：任何 OpenAI 兼容的 /chat/completions 端点。
      SELFLOOP_BASE_URL  默认 https://api.deepseek.com/v1
      SELFLOOP_MODEL     默认 deepseek-chat
      SELFLOOP_API_KEY   没有则只允许 mock

关键设计：**不把隐藏用例喂给模型**。模型只能看到可见测试的失败项、以及聚合
分数。否则隐藏集就变成了训练集，"泛化"这个闸门就失效了。
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from .tasks import Task

DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_MODEL = "deepseek-chat"
PRICE_IN = float(os.environ.get("SELFLOOP_PRICE_IN", "0.28"))    # $/1M input tokens
PRICE_OUT = float(os.environ.get("SELFLOOP_PRICE_OUT", "0.42"))  # $/1M output tokens


def estimate_cost(tin: int, tout: int) -> float:
    return round(tin / 1_000_000 * PRICE_IN + tout / 1_000_000 * PRICE_OUT, 6)


@dataclass
class Proposal:
    source: str
    rationale: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = "mock"
    raw: str = ""
    error: str | None = None

    @property
    def cost_usd(self) -> float:
        return estimate_cost(self.tokens_in, self.tokens_out)


# --------------------------------------------------------------------------
# 提示词
# --------------------------------------------------------------------------

SYSTEM_PROMPT = """你是 SelfLoop 的提议者（proposer）。你在一个"提议 → 验证 → 归档"的
自举循环里工作：每一轮你只能改一个文件，然后由机器跑测试打分。

铁律：
1. 只输出**一个完整的 Python 文件**，放在 ```python 代码块里，不要输出其他代码块。
2. 只使用标准库；禁止 open/eval/exec/subprocess/importlib/inspect，禁止读写文件。
3. 不得试图读取或猜测测试内容；按语义把函数写正确才是唯一出路。
4. 不要删改函数名与签名：normalize / insert / gaps / coverage。
"""


def build_prompt(task: Task, current_source: str, best_score: float, visible: dict, history: list[dict]) -> str:
    fails = visible.get("failures") or []
    fail_txt = "\n".join(f"- {f['test']}: {f['reason']}" for f in fails) or "- （无）"
    hist_txt = "\n".join(
        f"- 第 {h['round']} 轮：score={h['score']:.3f}，{'接受' if h['accepted'] else '拒绝'}"
        for h in history[-6:]
    ) or "- （首轮）"
    return f"""# 目标

{task.spec}

# 当前状态

- 当前最优分数：{best_score:.4f}（满分 1.0；visible 占 35%，hidden 占 65%）
- 可见测试：{visible.get('passed', 0)}/{visible.get('total', 0)} 通过
- 隐藏用例：{visible.get('hidden_passed', 0)}/{visible.get('hidden_total', 0)} 通过（不展示细节）

## 可见测试失败项

{fail_txt}

## 最近几轮

{hist_txt}

# 当前代码

```python
{current_source}
```

# 你的任务

找出当前实现里**语义上**不正确的地方（不要只针对可见测试打补丁），输出改进后的完整文件。
如果认为已经无需改动，也要输出当前文件并说明原因。
"""


# --------------------------------------------------------------------------
# 模拟提议者
# --------------------------------------------------------------------------

_STAGE_RATIONALE = [
    ("基线跑分", "先不动，测一下当前基线。"),
    (
        "修 normalize 的两处语义",
        "normalize 用 s < prev_end 判断，导致相邻区间（end == start）没有合并；"
        "同时没有过滤 end <= start 的空区间。改成 s <= prev_end 并先过滤。",
    ),
    (
        "修 gaps：先归一再求空隙",
        "gaps 直接在原始输入上算相邻差，输入无序或含空区间时结果就错了。"
        "应该先 normalize 再取相邻边界。",
    ),
    (
        "修 coverage：先归一再求和",
        "coverage 直接对原始区间求和，重叠部分被重复计算。"
        "应该对 normalize 的结果求和。",
    ),
]


def _stage_sources(task: Task) -> list[tuple[str, str]]:
    """返回 [(源码, 理由)]，从初始实现逐级修到全对。"""
    base = task.initial_source
    b = base.replace(
        """    items = sorted(intervals)
    out = []
    for s, e in items:
        if out and s < out[-1][1]:""",
        """    items = [(s, e) for s, e in intervals if e > s]
    items.sort()
    out = []
    for s, e in items:
        if out and s <= out[-1][1]:""",
    )
    c = b.replace(
        """    out = []
    for i in range(len(intervals) - 1):
        out.append((intervals[i][1], intervals[i + 1][0]))
    return out""",
        """    norm = normalize(intervals)
    return [(norm[i][1], norm[i + 1][0]) for i in range(len(norm) - 1)]""",
    )
    d = c.replace(
        """    return sum(e - s for s, e in intervals)""",
        """    return sum(e - s for s, e in normalize(intervals))""",
    )
    return [(base, _STAGE_RATIONALE[0][1]), (b, _STAGE_RATIONALE[1][1]), (c, _STAGE_RATIONALE[2][1]), (d, _STAGE_RATIONALE[3][1])]


class MockProposer:
    """离线模拟：确定性地产出逐级改进的候选，用来跑通/演示整条链路。"""

    name = "mock"

    def __init__(self, task: Task):
        self._stages = _stage_sources(task)
        self._calls = 0

    def propose(self, prompt: str, round_no: int) -> Proposal:
        idx = min(self._calls + 1, len(self._stages) - 1)   # 第 0 级等于基线，直接跳过
        self._calls += 1
        source, why = self._stages[idx]
        if idx == len(self._stages) - 1:
            why = why if round_no <= 4 else "复查了一遍，没有发现新的语义问题；保持现状。"
        tin = max(1, len(prompt) // 4)
        tout = max(1, len(source) // 4)
        return Proposal(
            source=source,
            rationale=f"[模拟提议者] {why}",
            tokens_in=tin,
            tokens_out=tout,
            model="mock",
            raw=source,
        )


# --------------------------------------------------------------------------
# OpenAI 兼容提议者
# --------------------------------------------------------------------------

CODE_FENCE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)


def extract_code(text: str) -> str:
    blocks = CODE_FENCE.findall(text or "")
    if blocks:
        return max(blocks, key=len).strip() + "\n"
    # 没写围栏时，若整体像 Python，就直接用
    if text and ("def " in text) and "```" not in text:
        return text.strip() + "\n"
    return ""


class OpenAIProposer:
    name = "openai-compat"

    def __init__(self, base_url: str | None = None, model: str | None = None, api_key: str | None = None,
                 temperature: float = 0.2, max_tokens: int = 4000, timeout: float = 90.0):
        self.base_url = (base_url or os.environ.get("SELFLOOP_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.model = model or os.environ.get("SELFLOOP_MODEL") or DEFAULT_MODEL
        self.api_key = api_key or os.environ.get("SELFLOOP_API_KEY") or ""
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.api_key)

    def propose(self, prompt: str, round_no: int) -> Proposal:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     **({"Authorization": f"Bearer {self.api_key}"} if self.api_key else {})},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "ignore")[:400]
            return Proposal(source="", error=f"HTTP {e.code}: {detail}", model=self.model)
        except Exception as e:  # noqa: BLE001
            return Proposal(source="", error=f"{type(e).__name__}: {e}", model=self.model)

        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return Proposal(source="", error=f"响应格式异常：{str(data)[:300]}", model=self.model)

        usage = data.get("usage") or {}
        source = extract_code(text)
        return Proposal(
            source=source,
            rationale="（模型自述）" + (text.split("```")[0].strip()[:600] or "无"),
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            model=self.model,
            raw=text[:4000],
            error=None if source else "模型输出里没有找到 Python 代码块",
        )


def make_proposer(provider: str, task: Task, model: str | None = None,
                  temperature: float = 0.2, api_key: str | None = None) -> object:
    if provider == "mock":
        return MockProposer(task)
    if provider == "openai":
        p = OpenAIProposer(model=model, temperature=temperature, api_key=api_key)
        if not p.available():
            raise RuntimeError("没有配置 SELFLOOP_API_KEY，只能用 mock 模式")
        return p
    raise ValueError(f"unknown provider: {provider}")
