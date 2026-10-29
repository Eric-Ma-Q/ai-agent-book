"""S1 主循环：工具循环、终止条件、read_file 分页（截断可续）。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from harness.loop import Agent, HarnessConfig, default_tools
from harness.models import FakeModel, ModelResponse
from harness.outputs import SPILL_DIR

import tutil


def make_agent(model, ws, **kw):
    cfg = kw.pop("config", None) or HarnessConfig()
    return Agent(model=model, tools=default_tools(ws, cfg), workspace=ws, config=cfg, **kw)


class TestMainLoop(unittest.TestCase):
    def test_loop_runs_tools_until_final(self):
        ws = tutil.temp_workspace(self)
        model = FakeModel([
            ("write_file", {"path": "hi.txt", "content": "hello harness"}),
            "任务完成",
        ])
        res = make_agent(model, ws).run("写一个文件")
        self.assertEqual((ws / "hi.txt").read_text(encoding="utf-8"), "hello harness")
        self.assertEqual(res.content, "任务完成")
        self.assertEqual(res.stopped_reason, "final")
        self.assertEqual(res.steps, 2)
        self.assertEqual(res.tool_calls, 1)
        # 工具结果确实作为 tool 消息回给了模型
        self.assertIn("已新建 hi.txt", tutil.msg_content(res.messages, "tool"))

    def test_max_steps_stops_loop(self):
        ws = tutil.temp_workspace(self)
        three_calls = [("write_file", {"path": f"{name}.txt", "content": "x"}) for name in ("a", "b", "c")]
        model = FakeModel(three_calls + ["收尾"])
        res = make_agent(model, ws, config=HarnessConfig(max_steps=2)).run("连写三个文件")
        self.assertEqual(res.steps, 2)
        self.assertEqual(res.stopped_reason, "max_steps")
        self.assertFalse((ws / "c.txt").exists())
        self.assertTrue((ws / "a.txt").exists())

    def test_unknown_tool_reports_error_to_model(self):
        ws = tutil.temp_workspace(self)
        model = FakeModel([("nope", {}), "改用已有工具"])
        res = make_agent(model, ws).run("调一个不存在的工具")
        tool_msg = tutil.msg_content(res.messages, "tool")
        self.assertIn("未知工具", tool_msg)
        self.assertIn("可用工具", tool_msg)

    def test_read_file_paginates_with_continuation_hint(self):
        ws = tutil.temp_workspace(self, {"big.txt": "\n".join(f"line-{i}" for i in range(1, 301))})
        model = FakeModel([("read_file", {"path": "big.txt"}), "读完"])
        res = make_agent(model, ws).run("读文件")
        tool_msg = tutil.msg_content(res.messages, "tool")
        self.assertIn("第 1-200 行 / 共 300 行", tool_msg)
        self.assertIn('read_file(path="big.txt", offset=201)', tool_msg)
        self.assertIn("还有 100 行未显示", tool_msg)

    def test_bash_output_truncated_with_hint(self):
        ws = tutil.temp_workspace(self, {"big.txt": "x" * 12_000})
        # 关闭落盘，验证 S1 硬截断兜底路径
        cfg = HarnessConfig(spill_chars=None, max_chars=10_000)
        model = FakeModel([("bash", {"command": "cat big.txt"}), "知道了"])
        res = make_agent(model, ws, config=cfg).run("看大文件")
        tool_msg = tutil.msg_content(res.messages, "tool")
        self.assertIn("[输出已截断：显示 10000 / 共 12000 字符", tool_msg)
        self.assertIn("缩小输出范围", tool_msg)
        self.assertNotIn(SPILL_DIR, tool_msg)
        self.assertLess(len(tool_msg), 11_000)

    def test_real_usage_tokens_not_double_counted(self):
        """T08-r1：有真实 usage 时只累计 usage，不再叠加字符估算。"""
        ws = tutil.temp_workspace(self)
        model = FakeModel([
            ModelResponse(content="完成", usage={"prompt_tokens": 100, "completion_tokens": 20}),
        ])
        res = make_agent(model, ws).run("打个招呼")
        self.assertEqual(res.content, "完成")
        self.assertEqual(res.token_estimate, 120)


if __name__ == "__main__":
    unittest.main()
