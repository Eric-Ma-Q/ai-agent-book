from agent_lab.llm.client import Usage
from agent_lab.totals import Totals


def usage(prompt, cached, completion):
    return Usage(prompt_tokens=prompt, cached_tokens=cached, completion_tokens=completion, reasoning_tokens=0)


def test_single_agent_has_no_breakdown():
    totals = Totals(None)
    totals.add_llm(usage(100, 10, 5), 20, None, 0.1)
    assert "by_agent" not in totals.to_dict(turns=1)


def test_breakdown_by_agent_sums_to_total():
    totals = Totals(None)
    totals.add_llm(usage(100, 10, 5), 20, None, 0.1)
    totals.add_llm(usage(300, 0, 50), 40, None, 0.3, agent="sub-1")
    totals.add_llm(usage(80, 0, 10), 10, None, 0.05, agent="reviewer")
    totals.add_llm(usage(120, 100, 8), 15, None, 0.02)
    out = totals.to_dict(turns=2)
    by = out["by_agent"]
    assert list(by) == ["main", "sub-1", "reviewer"]
    main = dict(by["main"])
    assert abs(main.pop("reference_cost") - 0.12) < 1e-9
    assert main == {"llm_calls": 2, "prompt_tokens": 220, "cached_tokens": 110, "completion_tokens": 13}
    for key in ("llm_calls", "prompt_tokens", "cached_tokens", "completion_tokens"):
        assert sum(item[key] for item in by.values()) == out[key]
    assert abs(sum(item["reference_cost"] for item in by.values()) - out["reference_cost"]) < 1e-9
