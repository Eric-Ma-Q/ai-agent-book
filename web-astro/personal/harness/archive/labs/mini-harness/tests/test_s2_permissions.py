"""S2 权限与 hooks：deny 拒绝路径（必测）、ask 默认拒绝、最严裁决。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from harness.loop import Agent, HarnessConfig, default_tools
from harness.models import FakeModel
from harness.permissions import Decision, RuleEngine, ToolEvent, run_hooks

import tutil


def make_agent(model, ws, rules_doc, **kw):
    cfg = kw.pop("config", None) or HarnessConfig()
    return Agent(model=model, tools=default_tools(ws, cfg), workspace=ws,
                 config=cfg, hooks=[RuleEngine(rules_doc)], **kw)


class TestDenyPath(unittest.TestCase):
    def test_deny_rm_rf_reason_returned_to_model(self):
        ws = tutil.temp_workspace(self)
        rules = {"default": "allow", "rules": [
            {"tool": "bash", "match": {"type": "regex", "pattern": r"\brm\s+-\w*r"},
             "decision": "deny", "reason": "禁止递归删除"},
        ]}
        model = FakeModel([("bash", {"command": "rm -rf /tmp/should-not-exist"}), "换个方案"])
        res = make_agent(model, ws, rules).run("删掉目录")
        tool_msg = tutil.msg_content(res.messages, "tool")
        self.assertIn("[已拒绝]", tool_msg)
        self.assertIn("禁止递归删除", tool_msg)  # 原因回传给模型
        self.assertEqual(res.content, "换个方案")  # 循环没崩，模型继续

    def test_deny_write_outside_workspace(self):
        ws = tutil.temp_workspace(self)
        rules = {"default": "allow", "rules": [
            {"tool": "write_file", "match": {"type": "outside_workspace"},
             "decision": "deny", "reason": "禁止写工作区外"},
        ]}
        model = FakeModel([("write_file", {"path": "../escape.txt", "content": "x"}), "好的"])
        make_agent(model, ws, rules).run("写外面")
        self.assertFalse((ws.parent / "escape.txt").exists())
        # 工作区内写入不受影响
        model2 = FakeModel([("write_file", {"path": "inside.txt", "content": "y"}), "完成"])
        make_agent(model2, ws, rules).run("写里面")
        self.assertTrue((ws / "inside.txt").exists())

    def test_strictest_wins_across_rules(self):
        event = ToolEvent(tool="bash", args={"command": "rm -rf /data"}, workspace="/tmp")
        doc = {"default": "allow", "rules": [
            {"tool": "bash", "decision": "allow", "reason": "放行"},
            {"tool": "bash", "match": {"type": "regex", "pattern": "rm"}, "decision": "ask", "reason": "确认?"},
            {"tool": "bash", "match": {"type": "regex", "pattern": r"rm\s+-\w*r"}, "decision": "deny", "reason": "禁"},
        ]}
        self.assertEqual(run_hooks([RuleEngine(doc)], event).verdict, "deny")


class TestAskPath(unittest.TestCase):
    def test_ask_denied_by_default_unattended(self):
        ws = tutil.temp_workspace(self)
        rules = {"default": "allow", "rules": [
            {"tool": "bash", "match": {"type": "regex", "pattern": r"\bcurl\b"},
             "decision": "ask", "reason": "联网命令需确认"},
        ]}
        model = FakeModel([("bash", {"command": "curl http://example.com"}), "不联网了"])
        res = make_agent(model, ws, rules).run("联网拉数据")
        tool_msg = tutil.msg_content(res.messages, "tool")
        self.assertIn("需要用户确认（ask）", tool_msg)
        self.assertIn("无人值守", tool_msg)

    def test_ask_interactive_handler_can_allow(self):
        ws = tutil.temp_workspace(self)
        rules = {"default": "allow", "rules": [
            {"tool": "bash", "match": {"type": "regex", "pattern": "echo"},
             "decision": "ask", "reason": "演示用"},
        ]}
        cfg = HarnessConfig(on_ask=lambda event, d: d.verdict == "ask")
        model = FakeModel([("bash", {"command": "echo approved"}), "完成"])
        res = make_agent(model, ws, rules, config=cfg).run("打招呼")
        self.assertIn("approved", tutil.msg_content(res.messages, "tool"))


class TestHookChain(unittest.TestCase):
    def test_custom_hook_joining_chain(self):
        event = ToolEvent(tool="bash", args={"command": "ls"}, workspace="/tmp")
        blocking = type("B", (), {"check": staticmethod(
            lambda e: Decision("deny", "自定义钩子拦截"))})()
        self.assertEqual(run_hooks([blocking], event).verdict, "deny")
        self.assertEqual(run_hooks([blocking], event).reason, "自定义钩子拦截")

    def test_rules_file_example_is_loadable_and_sane(self):
        engine = RuleEngine.from_file(pathlib.Path(__file__).resolve().parents[1] / "rules.example.json")
        d1 = engine.check(ToolEvent("bash", {"command": "rm -rf /"}, workspace="/"))
        d2 = engine.check(ToolEvent("bash", {"command": "ls"}, workspace="/"))
        d3 = engine.check(ToolEvent("write_file", {"path": "/etc/passwd"}, workspace="/tmp"))
        self.assertEqual(d1.verdict, "deny")
        self.assertEqual(d2.verdict, "allow")
        self.assertEqual(d3.verdict, "deny")

    def test_rules_example_blocks_rm_variants_and_find_write(self):
        """T08-r1：审核实测 rm -R/--recursive/旗标分开写/find -delete 全是 allow，现已封堵。"""
        engine = RuleEngine.from_file(pathlib.Path(__file__).resolve().parents[1] / "rules.example.json")
        must_deny = (
            "rm -rf /data", "rm -fr /data", "rm -R /data", "rm -r /data",
            "rm --recursive /data", "rm -f -r /data", "rm -r -f /data",
            "find . -name x -delete", "find . -name x -exec rm {} +",
        )
        must_allow = ("rm notes.txt", "ls -la", "npm test", "npm run test",
                      "find . -name '*.py'")
        for cmd in must_deny:
            d = engine.check(ToolEvent("bash", {"command": cmd}, workspace="/"))
            self.assertEqual(d.verdict, "deny", msg=cmd)
        for cmd in must_allow:
            d = engine.check(ToolEvent("bash", {"command": cmd}, workspace="/"))
            self.assertEqual(d.verdict, "allow", msg=cmd)


if __name__ == "__main__":
    unittest.main()
