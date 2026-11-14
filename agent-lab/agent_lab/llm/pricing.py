"""单价与成本计算（美元 / 百万 token）。

免费模型单价为 0；不认识的模型返回 None，不猜测。REFERENCE_PRICE 是一个**假设的**参考价，
只用于学习第 7 章成本分析：同一条轨迹，如果按这个价格计费会花多少钱。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, NamedTuple

from .client import Usage

if TYPE_CHECKING:
    from ..models import ModelPricing


class Price(NamedTuple):
    input: float
    cached_input: float
    output: float


FREE = Price(0.0, 0.0, 0.0)
REFERENCE_PRICE = Price(input=3.0, cached_input=0.3, output=15.0)
REFERENCE_LABEL = "参考价（假设）：输入 $3、缓存命中 $0.3、输出 $15 / 百万 token"

_KNOWN: dict[str, Price] = {"big-pickle": FREE}


def price_for(model: str) -> Price | None:
    if model in _KNOWN:
        return _KNOWN[model]
    if model.endswith("-free"):
        return FREE
    return None


def price_from_pricing(pricing: "ModelPricing") -> Price:
    """档案里的挂牌价 → 计费用的单价。缓存命中按 cache_read 计。"""
    return Price(input=pricing.input, cached_input=pricing.cache_read, output=pricing.output)


def cost_of(usage: Usage, price: Price | None) -> float | None:
    if price is None or usage.prompt_tokens is None:
        return None
    cached = usage.cached_tokens or 0
    uncached = max(usage.prompt_tokens - cached, 0)
    output = usage.completion_tokens or 0
    return (uncached * price.input + cached * price.cached_input + output * price.output) / 1_000_000
