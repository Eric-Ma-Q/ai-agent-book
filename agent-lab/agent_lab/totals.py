"""一次运行的用量与成本累计。缺失的用量字段单独计数，不当作 0 掩盖。"""

from __future__ import annotations

from typing import Any

from .llm.client import Usage
from .llm.pricing import Price


class Totals:
    def __init__(self, price: Price | None):
        self.price = price
        self.prompt_tokens = 0
        self.cached_tokens = 0
        self.completion_tokens = 0
        self.reasoning_tokens = 0
        self.unknown = {"prompt": 0, "cached": 0, "completion": 0, "reasoning": 0}
        self.latency_ms = 0
        self.cost: float | None = 0.0
        self.reference_cost: float | None = 0.0
        self.llm_calls = 0
        self.tool_calls = 0
        self.by_agent: dict[str, dict[str, Any]] = {}

    @property
    def tokens_used(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def add_llm(
        self, usage: Usage, latency_ms: int, cost: float | None, reference_cost: float | None, agent: str = "main"
    ) -> None:
        self._add_agent(agent, usage, reference_cost)
        self.llm_calls += 1
        self.latency_ms += latency_ms
        for name, value in (
            ("prompt", usage.prompt_tokens),
            ("cached", usage.cached_tokens),
            ("completion", usage.completion_tokens),
            ("reasoning", usage.reasoning_tokens),
        ):
            if value is None:
                self.unknown[name] += 1
            else:
                attr = f"{name}_tokens"
                setattr(self, attr, getattr(self, attr) + value)
        self.cost = None if cost is None or self.cost is None else self.cost + cost
        self.reference_cost = None if reference_cost is None or self.reference_cost is None else self.reference_cost + reference_cost

    def _add_agent(self, agent: str, usage: Usage, reference_cost: float | None) -> None:
        item = self.by_agent.setdefault(
            agent, {"llm_calls": 0, "prompt_tokens": 0, "cached_tokens": 0, "completion_tokens": 0, "reference_cost": 0.0}
        )
        item["llm_calls"] += 1
        item["prompt_tokens"] += usage.prompt_tokens or 0
        item["cached_tokens"] += usage.cached_tokens or 0
        item["completion_tokens"] += usage.completion_tokens or 0
        item["reference_cost"] = None if reference_cost is None or item["reference_cost"] is None else item["reference_cost"] + reference_cost

    def to_dict(self, turns: int) -> dict[str, Any]:
        cache_rate = (self.cached_tokens / self.prompt_tokens) if self.prompt_tokens else None
        extra = {"by_agent": {name: dict(item) for name, item in self.by_agent.items()}} if len(self.by_agent) > 1 else {}
        return {
            "turns": turns,
            "llm_calls": self.llm_calls,
            "tool_calls": self.tool_calls,
            "prompt_tokens": self.prompt_tokens,
            "cached_tokens": self.cached_tokens,
            "completion_tokens": self.completion_tokens,
            "reasoning_tokens": self.reasoning_tokens,
            "unknown_usage": {k: v for k, v in self.unknown.items() if v},
            "cache_hit_rate": round(cache_rate, 4) if cache_rate is not None else None,
            "latency_ms": self.latency_ms,
            "cost": self.cost,
            "reference_cost": self.reference_cost,
            **extra,
        }
