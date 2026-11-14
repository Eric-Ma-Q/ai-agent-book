"""S3 上下文压缩：阈值触发、system 与首条 user 消息保留、边界不拆散工具消息对。"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from harness.compaction import DEFAULT_PROMPT_PATH, compact_messages, should_compact
from harness.loop import Agent, HarnessConfig, default_tools
from harness.models import FakeModel, estimate_tokens

import tutil

BIG = "R" * 2_000  # 大工具结果的唯一标记


class TestCompaction(unittest.TestCase):
    def test_triggers_and_keeps_system_prompt(self):
        ws = tutil.temp_workspace(self, {"big.txt": BIG})
        cfg = HarnessConfig(context_token_limit=200, compact_keep_last_n=2, max_steps=6)
        model = FakeModel(
            [("bash", {"command": "cat big.txt"}), ("bash", {"command": "echo ok"}), "任务完成"],
            compaction_script=["早期处理了一个大文件，无异常", "第二次压缩摘要"],
        )
        agent = Agent(model=model, tools=default_tools(ws, cfg), workspace=ws, config=cfg)
        res = agent.run("看看 big.txt 再收尾")
        self.assertGreaterEqual(res.compactions, 1)
        self.assertEqual(res.content, "任务完成")
        # system 提示保留
        self.assertEqual(res.messages[0]["role"], "system")
        # 原始任务（首条 user 消息）原样保留，不只活在摘要里
        self.assertIn("看看 big.txt 再收尾", str(res.messages))
        # 大输出最终被压掉，不再出现在上下文里
        self.assertNotIn(BIG, str(res.messages))
        # 摘要注入了历史位置
        self.assertIn("<历史摘要>", str(res.messages))

    def test_no_compaction_under_threshold(self):
        ws = tutil.temp_workspace(self)
        cfg = HarnessConfig(context_token_limit=1_000_000)
        model = FakeModel([("bash", {"command": "echo hi"}), "完成"])
        res = Agent(model=model, tools=default_tools(ws, cfg), workspace=ws,
                    config=cfg).run("随便跑一条命令")
        self.assertEqual(res.compactions, 0)
        self.assertFalse(should_compact(res.messages, 1_000_000))

    def test_compaction_prompt_file_is_used(self):
        # 默认压缩提示词单独成文件，且含占位符
        template = DEFAULT_PROMPT_PATH.read_text(encoding="utf-8")
        self.assertIn("{{TRANSCRIPT}}", template)
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "goal"},
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "t1", "type": "function",
                             "function": {"name": "bash", "arguments": "{\"command\": \"ls\"}"}}]},
            {"role": "tool", "tool_call_id": "t1", "content": "a.py"},
            {"role": "user", "content": "继续"},
            {"role": "assistant", "content": "done"},
        ]
        model = FakeModel(["摘要内容"])
        new, summary = compact_messages(model, messages, keep_last_n=2)
        self.assertEqual(summary, "摘要内容")
        sent = model.calls[0][0]["content"]
        self.assertIn("调用工具: bash", sent)  # assistant 的工具调用进了压缩输入
        self.assertIn("[tool] (工具结果) a.py", sent)
        self.assertNotIn("[user] goal", sent)  # 首条 user 消息不进压缩，原样保留
        self.assertEqual(new[1], {"role": "user", "content": "goal"})

    def test_boundary_does_not_split_tool_message_pair(self):
        rest = [
            {"role": "user", "content": "u1"},  # 首条任务：保留、不进压缩
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "t1", "type": "function",
                             "function": {"name": "bash", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "t1", "content": "r1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "t2", "type": "function",
                             "function": {"name": "bash", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "t2", "content": "r2"},
            {"role": "user", "content": "u3"},
            {"role": "assistant", "content": "final"},
        ]
        model = FakeModel(["s"])
        new, summary = compact_messages(model, [{"role": "system", "content": "sys"}] + rest,
                                        keep_last_n=3)
        self.assertEqual(summary, "s")
        after = [m for m in new if m["role"] != "system"]
        self.assertEqual(after[0]["content"], "u1")          # 首条 user 原样保留
        self.assertIn("<历史摘要>", after[1]["content"])      # 摘要紧随其后
        self.assertEqual(after[2]["role"], "assistant")      # 摘要后不能是孤儿 tool
        self.assertEqual(after[3]["content"], "r2")          # assistant/tool 配对完好
        self.assertNotIn("r1", json.dumps(new))              # 旧历史（含 r1）已被压掉

    def test_tokens_estimation_is_chars_over_four(self):
        msg = [{"role": "user", "content": "x" * 400}]
        est = estimate_tokens(msg)
        # 契约：约为 (消息 JSON 字符数)/4，这里 JSON 总长 430 上下，允许 90–140 的宽区间
        self.assertTrue(90 <= est <= 140, msg=est)
        self.assertEqual(estimate_tokens([{"role": "user", "content": "x"}]),
                         max(1, len('{"role": "user", "content": "x"}') // 4))


if __name__ == "__main__":
    unittest.main()
