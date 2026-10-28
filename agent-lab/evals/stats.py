"""评估统计：Wilson 区间、按任务聚类的 bootstrap、pass^k、McNemar 精确检验、分位数。

同一任务的多次试验不是独立样本（同一任务难度相同），所以区间估计用按任务重采样的 bootstrap；
Wilson 区间按全部试验计算，作为对照。
"""

from __future__ import annotations

import math
import random
from typing import Literal, Mapping, Sequence

Z95 = 1.959963984540054


def wilson(successes: int, trials: int, z: float = Z95) -> tuple[float, float]:
    if trials == 0:
        return (0.0, 0.0)
    p = successes / trials
    denom = 1 + z * z / trials
    centre = (p + z * z / (2 * trials)) / denom
    margin = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denom
    return (max(0.0, centre - margin), min(1.0, centre + margin))


def pass_hat_k(results: Mapping[str, Sequence[bool]], k: int) -> float | None:
    """τ-bench 的 pass^k：同一任务随机抽 k 次全部通过的概率，再对任务取平均。"""
    values = []
    for trials in results.values():
        n, c = len(trials), sum(trials)
        if n >= k:
            values.append(math.comb(c, k) / math.comb(n, k))
    return sum(values) / len(values) if values else None


def cluster_bootstrap(
    results: Mapping[str, Sequence[bool]], iterations: int = 2000, seed: int = 0, level: float = 0.95
) -> tuple[float, float]:
    tasks = [list(v) for v in results.values() if v]
    if not tasks:
        return (0.0, 0.0)
    rng = random.Random(seed)
    rates = []
    for _ in range(iterations):
        sample = [tasks[rng.randrange(len(tasks))] for _ in tasks]
        total = sum(len(t) for t in sample)
        rates.append(sum(sum(t) for t in sample) / total)
    rates.sort()
    tail = (1 - level) / 2
    return (rates[int(tail * iterations)], rates[min(int((1 - tail) * iterations), iterations - 1)])


def mcnemar_exact(b: int, c: int) -> float:
    """配对样本中只有一方通过的次数 b、c，双侧精确二项检验的 p 值。"""
    n = b + c
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, i) for i in range(0, min(b, c) + 1)) / 2**n
    return min(1.0, 2 * tail)


def verdict(b_only: int, a_only: int, alpha: float = 0.05) -> Literal["better", "worse", "inconclusive"]:
    """B 相对 A：只有 B 通过 b_only 次，只有 A 通过 a_only 次。"""
    if mcnemar_exact(b_only, a_only) >= alpha:
        return "inconclusive"
    return "better" if b_only > a_only else "worse"


def percentile(values: Sequence[float], p: float) -> float | None:
    """线性插值分位数（与 numpy 默认一致）。"""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p / 100
    low = math.floor(rank)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)
