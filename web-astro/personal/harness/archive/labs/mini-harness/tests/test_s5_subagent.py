"""S5 只读子代理：独立上下文、摘要回传、只读白名单拦截写操作。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from harness.loop import Agent, HarnessConfig, default_tools
from harness.models import FakeModel
from harness.subagent import EXPLORE_SYSTEM_PROMPT, readonly_bash_execute, sub_tools
from harness.tools import ToolContext

import tutil

SECRET = "SUB_SECRET_MARKER_12345"


class TestExploreTool(unittest.TestCase):
    def test_summary_returned_and_transcript_isolated(self):
        ws = tutil.temp_workspace(self, {"secret.txt": f"内容: {SECRET}\n"})
        # 主对话：explore → 收摘要 → 收尾；子对话：cat 文件 → 摘要
        model = FakeModel(
            [("explore", {"prompt": "看看 secret.txt 里有什么"}), "主代理总结"],
            compaction_script=[],
        )
        # 子代理的调用也走主队列（explore 内部创建的子 Agent 用同一个 FakeModel）：
        # 顺序 = 父第1步 → 子第1步 → 子第2步 → 父第2步
        model.script.insert(1, ("bash", {"command": "cat secret.txt"}))
        model.script.insert(2, f"子代理摘要：文件共 1 行，{len(SECRET)} 个字符的标记")
        cfg = HarnessConfig(context_token_limit=None)
        res = Agent(model=model, tools=default_tools(ws, cfg), workspace=ws,
                    config=cfg).run("委托探索")
        # 父代理只拿到摘要，看不到子代理读到的原文
        tool_msgs = [m["content"] for m in res.messages if m["role"] == "tool"]
        self.assertTrue(any("子代理摘要" in str(c) for c in tool_msgs))
        self.assertNotIn(SECRET, str(res.messages))
        # 摘要结果带元信息
        self.assertTrue(any("以上为摘要" in str(c) for c in tool_msgs))

    def test_sub_agent_has_no_write_file(self):
        names = {t.name for t in sub_tools()}
        self.assertEqual(names, {"read_file", "bash"})


class TestReadonlyBash(unittest.TestCase):
    def _run(self, cmd, ws):
        ctx = ToolContext(workspace=ws, config=HarnessConfig())
        return readonly_bash_execute({"command": cmd}, ctx)

    def test_denies_redirection_write(self):
        ws = tutil.temp_workspace(self)
        out = self._run("echo hacked > evil.txt", ws)
        self.assertIn("禁止 shell 元字符", out)
        self.assertFalse((ws / "evil.txt").exists())

    def test_denies_commands_outside_whitelist(self):
        ws = tutil.temp_workspace(self)
        for cmd in ("python3 -c 'open(\"x\",\"w\").write(1)'", "rm -rf x", "touch new.txt"):
            out = self._run(cmd, ws)
            self.assertIn("不在只读白名单", out, msg=cmd)
        self.assertEqual(list(ws.iterdir()), [])  # 什么都没被创建/删除

    def test_allows_readonly_commands(self):
        ws = tutil.temp_workspace(self, {"notes/a.md": "TODO: x\n"})
        out = self._run("grep -rn TODO notes/", ws)
        self.assertIn("TODO: x", out)
        self.assertIn("notes/a.md", out)
        out2 = self._run("git status", ws)  # git 只读子命令放行（无 .git 时自然报错但通过白名单）
        self.assertNotIn("白名单", out2)

    def test_explore_sub_agent_system_prompt_declares_readonly(self):
        self.assertIn("只读", EXPLORE_SYSTEM_PROMPT)
        self.assertIn("摘要", EXPLORE_SYSTEM_PROMPT)


class TestReadonlyParameterChecks(unittest.TestCase):
    """T08-r1 回归：审核实测的 4 条绕过 + 参数级检查的正反两面。

    教训：命令首词白名单挡不住旗标——find -delete、sort -o 都是"白名单命令
    的写操作"。三个强度档：首词白名单 → 参数级检查 → 进程级沙箱（10 分册）。
    F02 补充：git 只读子命令也带写旗标——git log/show/diff 都支持 --output[=文件]，
    r1 复审实测 `git log --output=o6` 被放行并写出了文件，已列入参数级检查。
    """

    def _run(self, cmd, ws):
        ctx = ToolContext(workspace=ws, config=HarnessConfig())
        return readonly_bash_execute({"command": cmd}, ctx)

    def test_find_delete_blocked(self):
        ws = tutil.temp_workspace(self, {"victim.txt": "data\n"})
        out = self._run("find . -name victim.txt -delete", ws)
        self.assertIn("只读子代理拒绝", out)
        self.assertIn("-delete", out)
        self.assertTrue((ws / "victim.txt").exists())  # 文件必须还在

    def test_find_exec_blocked(self):
        ws = tutil.temp_workspace(self, {"in.txt": "data\n"})
        out = self._run("find . -name in.txt -exec rm {} +", ws)
        self.assertIn("只读子代理拒绝", out)
        self.assertTrue((ws / "in.txt").exists())

    def test_sort_output_flag_blocked(self):
        ws = tutil.temp_workspace(self, {"in.txt": "b\na\n"})
        out = self._run("sort -o out.txt in.txt", ws)
        self.assertIn("只读子代理拒绝", out)
        self.assertFalse((ws / "out.txt").exists())
        # 不带写旗标的 sort 仍可用
        self.assertIn("a\nb", self._run("sort in.txt", ws))

    def test_sort_output_long_form_blocked(self):
        ws = tutil.temp_workspace(self, {"in.txt": "b\na\n"})
        out = self._run("sort --output=out.txt in.txt", ws)
        self.assertIn("只读子代理拒绝", out)
        self.assertFalse((ws / "out.txt").exists())

    def test_git_branch_creation_blocked(self):
        ws = tutil.temp_workspace(self)
        out = self._run("git branch evil", ws)
        self.assertIn("拒绝", out)
        self.assertFalse((ws / ".git").exists())

    def test_git_branch_list_flags_allowed(self):
        ws = tutil.temp_workspace(self)
        out = self._run("git branch -a", ws)  # 看分支放行；执行层面无 .git 的报错不算拒绝
        self.assertNotIn("拒绝", out)
        self.assertNotIn("白名单", out)

    def test_uniq_second_positional_blocked(self):
        ws = tutil.temp_workspace(self, {"in.txt": "a\na\n"})
        out = self._run("uniq in.txt out.txt", ws)
        self.assertIn("拒绝", out)
        self.assertFalse((ws / "out.txt").exists())

    def test_git_readonly_subcommand_output_flag_blocked(self):
        # F02 回归：git log/show/diff 都支持 --output[=文件]，不拦会绕过"只读"写出文件
        ws = tutil.temp_workspace(self)
        for cmd in ("git log --output=o6", "git log --output=o6 --oneline",
                    "git show --output=o7 HEAD", "git diff --output=o8"):
            out = self._run(cmd, ws)
            self.assertIn("只读子代理拒绝", out, msg=cmd)
        self.assertEqual(list(ws.iterdir()), [])  # 断言：一个文件都没被写出来
        # 不带写旗标的 git 只读命令仍然放行（无 .git 的执行报错不算拒绝）
        out2 = self._run("git log --oneline", ws)
        self.assertNotIn("拒绝", out2)


if __name__ == "__main__":
    unittest.main()
