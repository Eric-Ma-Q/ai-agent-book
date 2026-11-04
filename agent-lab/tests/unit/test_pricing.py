import pytest

from agent_lab.llm.client import Usage
from agent_lab.llm.pricing import REFERENCE_PRICE, Price, cost_of, price_for


def test_free_models_cost_zero():
    assert cost_of(Usage(prompt_tokens=1000, completion_tokens=100), price_for("mimo-v2.6-flash-free")) == 0.0
    assert price_for("big-pickle") == Price(0, 0, 0)


def test_unknown_model_has_no_price():
    assert price_for("some-paid-model") is None
    assert cost_of(Usage(prompt_tokens=10), None) is None


def test_cached_tokens_billed_at_cached_rate():
    price = Price(input=3.0, cached_input=0.3, output=15.0)
    usage = Usage(prompt_tokens=1_000_000, cached_tokens=400_000, completion_tokens=100_000)
    assert cost_of(usage, price) == pytest.approx(0.6 * 3.0 + 0.4 * 0.3 + 0.1 * 15.0)


def test_missing_usage_gives_none():
    assert cost_of(Usage(), REFERENCE_PRICE) is None


def test_missing_cached_treated_as_uncached():
    price = Price(input=1.0, cached_input=0.1, output=2.0)
    assert cost_of(Usage(prompt_tokens=1_000_000, completion_tokens=0), price) == pytest.approx(1.0)
