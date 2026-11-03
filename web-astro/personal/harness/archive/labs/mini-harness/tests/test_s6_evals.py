"""S6 迷你 eval：5 个任务可执行判分、结果表，以及判分器自身的两道自检闸门。

T08-r1 教训：判分器是攻击面（13 §4.2）。fixture 是 9 行而判分器曾写死 8，
FakeModel 脚本也写死 "8"——参考解抄答案，假模型 5/5 只证明"错得一致"。
两道闸门（13 §4.6 / §八 的做法）：
  1. no-op 必不过：什么都不做的模型跑全部任务必须 5/5 FAIL；
  2. 独立参考解必过：由测试内另写的纯 Python 从 fixture 现算答案写入工作区，
     判分器必须 5/5 PASS（不复用 evals.py 的计算函数与脚本字面量）。
"""
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest
from pathlib import Path

from harness.evals import default_cases, render_table, run_evals
from harness.models import FakeModel


class TestMiniEvals(unittest.TestCase):
    def test_all_five_tasks_pass_with_fake_model(self):
        rows = run_evals(FakeModel())
        self.assertEqual(len(rows), 5)
        for r in rows:
            self.assertTrue(r.passed, msg=f"{r.task}: {r.note}")
            self.assertGreater(r.steps, 0)
            self.assertGreater(r.token_estimate, 0)
        table = render_table(rows)
        self.assertIn("通过率: 5/5", table)
        for header in ("任务", "步数", "token 估算"):
            self.assertIn(header, table)

    def test_checker_catches_wrong_answer(self):
        case = default_cases()[1]  # T2 精确改配置
        wrong = FakeModel([
            ("write_file", {"path": "config.json", "content": '{"retries": 6, "timeout": 30}'}),
            "改好了",
        ])
        rows = run_evals(wrong, [case])
        self.assertFalse(rows[0].passed)
        self.assertIn("改动不符", rows[0].note)

    def test_missing_answer_file_fails_cleanly(self):
        case = default_cases()[2]  # T3 统计行数
        lazy = FakeModel([("bash", {"command": "wc -l src/*.py"}), "（没写答案文件）"])
        rows = run_evals(lazy, [case])
        self.assertFalse(rows[0].passed)
        self.assertIn("answer.txt 不存在", rows[0].note)

    def test_each_case_has_executable_check(self):
        for case in default_cases():
            self.assertTrue(callable(case.setup), msg=case.name)
            self.assertTrue(callable(case.check), msg=case.name)
            self.assertTrue(case.name and case.instruction, msg=case.name)


# ------------------------------------------------------------ 判分器自检闸门

def _write_reference_answer(ws: Path, case_name: str) -> None:
    """测试内独立实现的参考解：从 fixture 现算，与 evals.py 内部实现零共享。"""
    if case_name.startswith("T1"):
        defined, callers = None, []
        for p in sorted(ws.glob("*.py")):
            text = p.read_text(encoding="utf-8")
            if any(ln.lstrip().startswith("def format_price") for ln in text.splitlines()):
                defined = p.name
            elif "format_price" in text:
                callers.append(p.name)
        (ws / "answer.md").write_text(
            f"定义: {defined}\n调用者: {', '.join(callers)}\n", encoding="utf-8")
    elif case_name.startswith("T2"):
        data = json.loads((ws / "config.json").read_text(encoding="utf-8"))
        data["retries"] = 5
        (ws / "config.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    elif case_name.startswith("T3"):
        n = sum(len(p.read_text(encoding="utf-8").splitlines()) for p in ws.glob("src/*.py"))
        (ws / "answer.txt").write_text(str(n), encoding="utf-8")
    elif case_name.startswith("T4"):
        items = []
        for p in sorted(ws.glob("notes/*.md")):
            for i, ln in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
                if "TODO" in ln:
                    items.append({"file": p.relative_to(ws).as_posix(), "line": i})
        (ws / "answer.json").write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    elif case_name.startswith("T5"):
        counts: dict[str, int] = {}
        for ln in (ws / "logs" / "app.log").read_text(encoding="utf-8").splitlines():
            if ln.startswith("ERROR"):
                counts[ln] = counts.get(ln, 0) + 1
        (ws / "answer.txt").write_text(max(counts, key=counts.get), encoding="utf-8")
    else:
        raise AssertionError(f"未知任务: {case_name}")


class TestCheckerGates(unittest.TestCase):
    def test_noop_model_fails_all_five(self):
        """闸门 1：什么都不做的假模型必须 5/5 FAIL，判分器不能无脑放行。"""
        rows = run_evals(FakeModel(["已完成"]))
        self.assertEqual(len(rows), 5)
        for r in rows:
            self.assertFalse(r.passed, msg=f"{r.task}: {r.note}")

    def test_independent_reference_solution_passes_all_five(self):
        """闸门 2：独立参考解必须 5/5 PASS，判分器期望值与 fixture 一致。"""
        for case in default_cases():
            with tempfile.TemporaryDirectory(prefix="mh-ref-") as td:
                ws = Path(td) / "ws"
                ws.mkdir()
                case.setup(ws)
                _write_reference_answer(ws, case.name)
                ok, note = case.check(ws, "")
                self.assertTrue(ok, msg=f"{case.name}: {note}")

    def test_scripts_do_not_leak_across_cases(self):
        """每题独立假模型：上一题没用完的脚本不得漏到下一题。"""
        noisy = FakeModel([
            ("bash", {"command": "echo leak-marker"}),
            "跑题输出",
        ])
        rows = run_evals(noisy)
        self.assertEqual(len(rows), 5)
        # 每题都重放同一段"跑题"脚本，没有任何一题吃到别的题的脚本
        for r in rows:
            self.assertFalse(r.passed, msg=f"{r.task}: {r.note}")


if __name__ == "__main__":
    unittest.main()
