"""SelfLoop 的核心测试：验证器可信 + 循环按预期收敛/停机。

跑法：
    cd labs/selfloop && python3 -m unittest discover -s tests -v
"""
from __future__ import annotations

import shutil
import tempfile
import time
import unittest
from pathlib import Path

from selfloop.archive import RunStore
from selfloop.loop import Controller, RunConfig
from selfloop.providers import MockProposer, extract_code
from selfloop.tasks import get_task
from selfloop.verify import verify_source


def correct_source() -> str:
    base = get_task("intervalkit").initial_source
    return (
        base.replace(
            "    items = sorted(intervals)",
            "    items = [(s, e) for s, e in intervals if e > s]\n    items.sort()",
        )
        .replace("if out and s < out[-1][1]:", "if out and s <= out[-1][1]:")
        .replace(
            """    out = []
    for i in range(len(intervals) - 1):
        out.append((intervals[i][1], intervals[i + 1][0]))
    return out""",
            """    norm = normalize(intervals)
    return [(norm[i][1], norm[i + 1][0]) for i in range(len(norm) - 1)]""",
        )
        .replace("return sum(e - s for s, e in intervals)", "return sum(e - s for s, e in normalize(intervals))")
    )


class TestVerifier(unittest.TestCase):
    def setUp(self):
        self.task = get_task("intervalkit")

    def test_初始实现不通过且分数介于0和1(self):
        r = verify_source(self.task.initial_source, self.task)
        self.assertTrue(r.ok)
        self.assertFalse(r.verified)
        self.assertGreater(r.score, 0.0)
        self.assertLess(r.score, 1.0)
        # 可见测试几乎全绿、隐藏用例明显落后：这正是"分数通胀"的可观测形态
        self.assertGreater(r.visible_passed, 0)
        self.assertLess(r.hidden_passed, r.hidden_total)

    def test_正确实现可以verified(self):
        r = verify_source(correct_source(), self.task)
        self.assertTrue(r.verified, msg=f"hidden {r.hidden_passed}/{r.hidden_total}, canary {r.canary_passed}/{r.canary_total}")
        self.assertEqual(r.score, 1.0)
        self.assertTrue(r.canary_ok)
        self.assertTrue(r.integrity_ok)

    def test_文件读写被判定作弊且分数归零(self):
        bad = correct_source() + "\n\ndata = open('tests/test_visible.py').read()\n"
        r = verify_source(bad, self.task)
        self.assertFalse(r.integrity_ok)
        self.assertEqual(r.score, 0.0)
        self.assertTrue(any("open()" in i for i in r.integrity_issues))

    def test_缺少函数会被发现(self):
        r = verify_source("def normalize(x):\n    return x\n", self.task)
        self.assertFalse(r.integrity_ok)
        self.assertTrue(any("缺少函数" in i for i in r.integrity_issues))

    def test_语法错误不会让验证器崩溃(self):
        r = verify_source("def normalize(:\n", self.task)
        self.assertFalse(r.ok)
        self.assertEqual(r.score, 0.0)
        self.assertTrue(r.error)

    def test_全部返回空列表会被隐藏用例抓住(self):
        stub = "def normalize(x):\n    return []\n\ndef insert(a, b):\n    return []\n\ndef gaps(x):\n    return []\n\ndef coverage(x):\n    return 0\n"
        r = verify_source(stub, self.task)
        self.assertFalse(r.verified)
        self.assertLess(r.hidden_passed, r.hidden_total)

    def test_结果可复现(self):
        a = verify_source(correct_source(), self.task)
        b = verify_source(correct_source(), self.task)
        self.assertEqual((a.score, a.hidden_passed, a.canary_passed), (b.score, b.hidden_passed, b.canary_passed))


class TestProviders(unittest.TestCase):
    def test_提取代码围栏(self):
        text = "说明\n```python\nprint(1)\n```\n结尾"
        self.assertEqual(extract_code(text), "print(1)\n")

    def test_模拟提议者逐级改进(self):
        task = get_task("intervalkit")
        p = MockProposer(task)
        scores = []
        for i in range(4):
            prop = p.propose("prompt", i + 1)
            scores.append(verify_source(prop.source, task).score)
        self.assertEqual(scores[-1], 1.0)
        self.assertEqual(scores, sorted(scores))


class TestLoop(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="selfloop-test-"))
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)
        self.store = RunStore(self.dir)

    def _wait(self, c: Controller, timeout: float = 30.0) -> None:
        t0 = time.time()
        while c.state.status in ("running", "paused") and time.time() - t0 < timeout:
            time.sleep(0.05)

    def test_跑到verified就停(self):
        c = Controller(self.store)
        rid = c.start(RunConfig(max_rounds=10, plateau_k=3, stop_on_verified=True))
        self._wait(c)
        self.assertEqual(c.state.stop_reason, "verified")
        self.assertEqual(c.state.best_score, 1.0)
        cands = self.store.candidates(rid)
        self.assertGreaterEqual(len(cands), 4)          # 基线 + 3 轮
        self.assertEqual(cands[0]["round"], 0)          # 基线也入档
        self.assertTrue((self.store.run_dir(rid) / "best.py").exists())
        self.assertIn("def coverage", (self.store.run_dir(rid) / "best.py").read_text())

    def test_无提升会触发平台期停机(self):
        c = Controller(self.store)
        rid = c.start(RunConfig(max_rounds=20, plateau_k=2, stop_on_verified=False))
        self._wait(c)
        self.assertEqual(c.state.stop_reason, "plateau")
        self.assertEqual(c.state.best_score, 1.0)
        cands = self.store.candidates(rid)
        self.assertFalse(cands[-1]["accepted"])
        self.assertEqual(cands[-1]["score"], 1.0)

    def test_预算会停机(self):
        c = Controller(self.store)
        rid = c.start(RunConfig(max_rounds=20, plateau_k=99, budget_usd=0.000001, stop_on_verified=False))
        self._wait(c)
        self.assertEqual(c.state.stop_reason, "budget")
        self.assertGreaterEqual(len(self.store.candidates(rid)), 1)

    def test_暂停与继续(self):
        c = Controller(self.store)
        c.start(RunConfig(max_rounds=20, plateau_k=99, budget_usd=100, stop_on_verified=False))
        time.sleep(0.05)
        c.pause()
        time.sleep(0.4)
        self.assertEqual(c.state.status, "paused")
        c.resume()
        self._wait(c, timeout=10)
        self.assertEqual(c.state.status, "finished")

    def test_密钥不会落盘(self):
        c = Controller(self.store)
        rid = c.start(RunConfig(provider="mock", api_key="sk-secret-should-not-leak"))
        self._wait(c)
        meta = (self.store.run_dir(rid) / "meta.json").read_text()
        self.assertNotIn("sk-secret-should-not-leak", meta)


if __name__ == "__main__":
    unittest.main()
