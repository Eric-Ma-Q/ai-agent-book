"""S4 大输出落盘：超阈值写 .harness/artifacts/，只回传路径 + 行数 + 前几行。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from harness.loop import Agent, HarnessConfig, default_tools
from harness.models import FakeModel
from harness.outputs import SPILL_DIR, process_output
from harness.tools import ToolContext

import tutil


def make_agent(model, ws, **kw):
    cfg = kw.pop("config", None) or HarnessConfig()
    return Agent(model=model, tools=default_tools(ws, cfg), workspace=ws, config=cfg, **kw)


class TestSpill(unittest.TestCase):
    def test_big_output_spilled_to_artifact(self):
        big = "\n".join(f"row-{i:04d}-aaaaaaaaaa" for i in range(300))  # 300 行，> 2000 字符
        ws = tutil.temp_workspace(self, {"data.txt": big})
        model = FakeModel([("bash", {"command": "cat data.txt"}), "收到"])
        res = make_agent(model, ws).run("看数据")
        tool_msg = tutil.msg_content(res.messages, "tool")
        # 落盘文件存在且内容完整
        artifact = ws / SPILL_DIR / "bash-0001.txt"
        self.assertTrue(artifact.exists())
        self.assertEqual(artifact.read_text(encoding="utf-8"), big)
        # 回传给模型的是路径 + 行数 + 前几行，而不是全文
        self.assertIn(f"{SPILL_DIR}/bash-0001.txt", tool_msg)
        self.assertIn("300 行", tool_msg)
        self.assertIn("row-0000", tool_msg)
        self.assertIn("read_file", tool_msg)  # 告诉模型怎么取完整内容
        self.assertNotIn("row-0299", tool_msg)

    def test_small_output_not_spilled(self):
        ws = tutil.temp_workspace(self)
        model = FakeModel([("bash", {"command": "echo small"}), "好"])
        make_agent(model, ws).run("跑一下")
        self.assertFalse((ws / SPILL_DIR).exists())

    def test_artifact_seq_increments(self):
        ws = tutil.temp_workspace(self)
        model = FakeModel([
            ("bash", {"command": "head -c 3000 /dev/zero | tr '\\0' 'a'"}),
            ("bash", {"command": "head -c 3000 /dev/zero | tr '\\0' 'b'"}),
            "完成",
        ])
        make_agent(model, ws).run("两次大输出")
        self.assertTrue((ws / SPILL_DIR / "bash-0001.txt").exists())
        self.assertTrue((ws / SPILL_DIR / "bash-0002.txt").exists())
        self.assertNotEqual((ws / SPILL_DIR / "bash-0001.txt").read_text(encoding="utf-8"),
                            (ws / SPILL_DIR / "bash-0002.txt").read_text(encoding="utf-8"))

    def test_spill_disabled_falls_back_to_truncation(self):
        raw = "y" * 12_000
        ctx = ToolContext(workspace=tutil.temp_workspace(self), state={})
        out = process_output(raw, ctx, spill_chars=None, max_chars=10_000)
        self.assertIn("[输出已截断", out)
        self.assertLess(len(out), 11_000)

    def test_preview_capped_even_for_single_long_line(self):
        raw = "z" * 5_000  # 单行超长，前 5 行预览本身也不能把窗口撑爆
        ws = tutil.temp_workspace(self)
        ctx = ToolContext(workspace=ws, state={})
        out = process_output(raw, ctx, spill_chars=2_000, max_chars=10_000)
        self.assertIn("已保存到", out)
        self.assertLess(len(out), 1_000)
        self.assertTrue((ws / SPILL_DIR).exists())  # 落盘写到工作区，绝不污染 CWD


if __name__ == "__main__":
    unittest.main()
