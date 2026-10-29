import math

import pytest

from evals.stats import cluster_bootstrap, mcnemar_exact, pass_hat_k, percentile, verdict, wilson


def test_wilson_known_values():
    lo, hi = wilson(8, 10)
    assert lo == pytest.approx(0.4902, abs=1e-3)
    assert hi == pytest.approx(0.9433, abs=1e-3)


def test_wilson_edges():
    assert wilson(0, 0) == (0.0, 0.0)
    lo, hi = wilson(0, 10)
    assert lo == 0.0 and hi == pytest.approx(0.2775, abs=1e-3)
    lo, hi = wilson(10, 10)
    assert hi == pytest.approx(1.0) and lo == pytest.approx(0.7225, abs=1e-3)


def test_pass_hat_k():
    results = {"a": [True, True, True], "b": [True, False, False], "c": [False, False, False]}
    assert pass_hat_k(results, 1) == pytest.approx((1 + 1 / 3 + 0) / 3)
    assert pass_hat_k(results, 3) == pytest.approx(1 / 3)
    assert pass_hat_k(results, 2) == pytest.approx((1 + 0 + 0) / 3)


def test_pass_hat_k_skips_tasks_with_too_few_trials():
    assert pass_hat_k({"a": [True]}, 2) is None
    assert pass_hat_k({}, 1) is None


def test_cluster_bootstrap_brackets_mean_and_is_seeded():
    results = {f"t{i}": [i % 3 != 0, True] for i in range(12)}
    lo, hi = cluster_bootstrap(results, iterations=500, seed=1)
    mean = sum(sum(v) for v in results.values()) / sum(len(v) for v in results.values())
    assert lo <= mean <= hi
    assert (lo, hi) == cluster_bootstrap(results, iterations=500, seed=1)


def test_cluster_bootstrap_empty():
    assert cluster_bootstrap({}) == (0.0, 0.0)


def test_mcnemar_exact():
    assert mcnemar_exact(0, 0) == 1.0
    assert mcnemar_exact(10, 0) == pytest.approx(2 * 0.5**10)
    assert mcnemar_exact(3, 3) == pytest.approx(1.0)
    p = mcnemar_exact(1, 9)
    assert p == pytest.approx(2 * sum(math.comb(10, i) for i in range(0, 2)) / 2**10)


def test_verdict():
    assert verdict(b_only=10, a_only=0, alpha=0.05) == "better"
    assert verdict(b_only=0, a_only=10, alpha=0.05) == "worse"
    assert verdict(b_only=3, a_only=2, alpha=0.05) == "inconclusive"


def test_percentile():
    assert percentile([], 50) is None
    assert percentile([5], 95) == 5
    assert percentile([1, 2, 3, 4], 50) == 2.5
    assert percentile(list(range(1, 101)), 95) == pytest.approx(95.05)
