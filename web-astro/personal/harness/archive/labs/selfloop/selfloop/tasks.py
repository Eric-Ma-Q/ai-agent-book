"""任务定义：一个可被「自举循环」反复改进的工程任务。

设计要点（对应研究里的四条硬条件）：
  1. 适应度函数可判定：每个函数都有唯一正确答案，由**参考实现**在循环外计算；
  2. 可见测试 / 隐藏测试分离：agent 只看得到 tests/test_visible.py 的失败信息，
     真正决定成败的是用随机输入生成的隐藏用例（防止对可见测试过拟合）；
  3. canary 集：一组分布不同的退化输入，用来抓「硬编码 / 猜测试」；
  4. 初始代码是**部分正确**的：跑起来就能看到分，但离 verified 有明确差距。

任务：intervalkit —— 半开区间 [start, end) 的归并工具。
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable

# --------------------------------------------------------------------------
# 参考实现：只存在于验证器一侧，绝不写进 agent 的工作区。
# 隐藏用例的期望值全部由它算出来。
# --------------------------------------------------------------------------


def ref_normalize(intervals):
    items = [(s, e) for s, e in intervals if e > s]
    items.sort()
    out: list[tuple[int, int]] = []
    for s, e in items:
        if out and s <= out[-1][1]:          # 重叠或相邻（end == start）都合并
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def ref_insert(intervals, new):
    return ref_normalize(list(intervals) + [tuple(new)])


def ref_gaps(intervals):
    norm = ref_normalize(intervals)
    return [(norm[i][1], norm[i + 1][0]) for i in range(len(norm) - 1)]


def ref_coverage(intervals):
    return sum(e - s for s, e in ref_normalize(intervals))


REFERENCE: dict[str, Callable] = {
    "normalize": ref_normalize,
    "insert": ref_insert,
    "gaps": ref_gaps,
    "coverage": ref_coverage,
}

# 隐藏用例的输入形态：(函数名, 参数元组)
Case = tuple[str, tuple]


# --------------------------------------------------------------------------
# 任务
# --------------------------------------------------------------------------

SPEC_MD = """# 任务：intervalkit

实现一个处理**半开区间** `[start, end)` 的小工具库，四个函数：

| 函数 | 语义 |
|---|---|
| `normalize(intervals)` | 归一化：丢掉空区间（`end <= start`），排序，**合并重叠与相邻**的区间（`end == start` 也算相接） |
| `insert(intervals, new)` | 把一个区间插进去，返回归一化后的结果 |
| `gaps(intervals)` | 返回归一化后相邻区间之间的空隙（边界也不相邻才算空隙） |
| `coverage(intervals)` | 返回所有区间覆盖的总长度（重叠部分只算一次） |

约束：
- 输入是 `(start, end)` 二元组的列表，start/end 均为整数，可能是负数。
- 返回值同样是二元组列表；`gaps` / `coverage` 的返回值见下。
- **不要修改 tests/ 下的任何文件**，也不要读取隐藏用例；那会被闸门判为作弊。
- 只允许使用标准库。

示例：
```python
normalize([(1, 4), (2, 6)])      # [(1, 6)]
normalize([(1, 3), (3, 5)])      # [(1, 5)]      <- 相邻要合并
normalize([(5, 5), (1, 2)])      # [(1, 2)]      <- 空区间丢掉
gaps([(1, 3), (5, 7)])           # [(3, 5)]
coverage([(1, 3), (2, 5)])       # 4
```
"""

INITIAL_SOURCE = '''"""intervalkit —— 半开区间 [start, end) 工具。

TODO: 还有若干边界情况没处理，跑一下可见测试就知道差在哪。
"""


def normalize(intervals):
    """排序并合并重叠区间。"""
    items = sorted(intervals)
    out = []
    for s, e in items:
        if out and s < out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def insert(intervals, new):
    """插入一个区间后重新合并。"""
    return normalize(list(intervals) + [tuple(new)])


def gaps(intervals):
    """归一化后相邻区间之间的空隙。"""
    out = []
    for i in range(len(intervals) - 1):
        out.append((intervals[i][1], intervals[i + 1][0]))
    return out


def coverage(intervals):
    """区间覆盖的总长度。"""
    return sum(e - s for s, e in intervals)
'''

VISIBLE_TESTS = '''"""可见测试：agent 能看到并运行它们。

刻意只覆盖主路径——边界情况在隐藏用例里。跑绿了不等于 verified。
"""
import unittest

from intervalkit import coverage, gaps, insert, normalize


class TestIntervalKit(unittest.TestCase):
    def test_normalize_merges_overlap(self):
        self.assertEqual(normalize([(1, 4), (2, 6)]), [(1, 6)])

    def test_normalize_sorts(self):
        self.assertEqual(normalize([(5, 7), (1, 3)]), [(1, 3), (5, 7)])

    def test_insert_disjoint(self):
        self.assertEqual(insert([(1, 2), (8, 10)], (4, 6)), [(1, 2), (4, 6), (8, 10)])

    def test_gaps_simple(self):
        self.assertEqual(gaps([(1, 3), (5, 7)]), [(3, 5)])

    def test_coverage_overlap_counted_once(self):
        self.assertEqual(coverage([(1, 3), (2, 5)]), 4)

    def test_coverage_single(self):
        self.assertEqual(coverage([(0, 10)]), 10)
'''


def _rand_intervals(rng: random.Random, n: int, lo: int = -20, hi: int = 20) -> list[tuple[int, int]]:
    out = []
    for _ in range(n):
        a = rng.randint(lo, hi)
        b = rng.randint(lo, hi)
        out.append((a, b))
    return out


def make_hidden_cases(seed: int = 20261017, n_sets: int = 120) -> list[Case]:
    """隐藏用例：随机 + 边界混合。期望值由参考实现算出。"""
    rng = random.Random(seed)
    cases: list[Case] = []
    for _ in range(n_sets):
        ivs = _rand_intervals(rng, rng.randint(0, 7))
        new = (rng.randint(-20, 20), rng.randint(-20, 20))
        cases.append(("normalize", (ivs,)))
        cases.append(("insert", (ivs, new)))
        cases.append(("gaps", (ivs,)))
        cases.append(("coverage", (ivs,)))
    # 刻意构造的边界
    edges = [
        [],
        [(0, 0)],
        [(3, 3), (5, 5)],
        [(-5, -3), (-3, 0)],
        [(0, 10), (2, 4), (3, 9)],
        [(1, 3), (3, 5), (5, 7)],
        [(10, 5)],
        [(0, 1), (1, 2), (2, 3), (3, 4)],
        [(-100, 100)],
        [(4, 8), (0, 2), (2, 4)],
    ]
    for ivs in edges:
        cases.append(("normalize", (ivs,)))
        cases.append(("gaps", (ivs,)))
        cases.append(("coverage", (ivs,)))
        cases.append(("insert", (ivs, (0, 2))))
    return cases


def make_canary_cases(seed: int = 7) -> list[Case]:
    """canary：分布与隐藏集不同（更极端、更长、更贴边）。"""
    rng = random.Random(seed)
    cases: list[Case] = []
    for _ in range(30):
        ivs = _rand_intervals(rng, rng.randint(0, 14), lo=-200, hi=200)
        cases.append(("normalize", (ivs,)))
        cases.append(("coverage", (ivs,)))
        cases.append(("gaps", (ivs,)))
    cases += [
        ("coverage", ([],)),
        ("coverage", ([(5, 5)],)),
        ("gaps", ([(1, 2)],)),
        ("gaps", ([],)),
        ("normalize", ([(2**31 - 5, 2**31 - 1), (2**31 - 1, 2**31 + 5)],)),
    ]
    return cases


@dataclass
class Task:
    id: str
    title: str
    summary: str
    spec: str = SPEC_MD
    initial_source: str = INITIAL_SOURCE
    visible_tests: str = VISIBLE_TESTS
    reference: dict[str, Callable] = field(default_factory=lambda: REFERENCE)
    hidden_cases: list[Case] = field(default_factory=make_hidden_cases)
    canary_cases: list[Case] = field(default_factory=make_canary_cases)

    def expected(self, fn: str, args: tuple):
        return self.reference[fn](*args)


TASKS: dict[str, Task] = {}


def _register(task: Task) -> Task:
    TASKS[task.id] = task
    return task


register = _register

intervalkit = register(
    Task(
        id="intervalkit",
        title="intervalkit：区间归并工具",
        summary="半开区间的归一化 / 插入 / 空隙 / 覆盖长度。初始实现只覆盖主路径，边界情况靠循环自己补。",
    )
)


def get_task(task_id: str) -> Task:
    if task_id not in TASKS:
        raise KeyError(f"unknown task: {task_id}")
    return TASKS[task_id]
