"""S5：只读探索子代理（explore 工具）。

对应 research/12 §三（子代理契约：出生上下文显式给足 → 过程隔离 → 只回传摘要）
与 research/08 §3.4（子代理"干净窗口 + 摘要回传"是全行业标配）。

实现要点：
- 子代理复用 loop.Agent，但工具集只有 read_file + 只读版 bash；
- 子代理有独立消息列表（干净窗口），父代理的上下文不进来；
- 只把最终摘要回传给父代理，过程轨迹不回流（防"传话失真"与窗口挤压）；
- 只读 bash 三层闸（T08-r1 审核教训：**命令名白名单不够，旗标也是攻击面**，
  `find -delete`、`sort -o` 都是首词白名单放行的写操作）：
    1. shell 元字符黑名单——重定向/管道/命令拼接直接拒；
    2. 命令首词白名单——只有"看"没有"写"的命令；
    3. 参数级检查——写文件旗标（find -delete/-exec、sort -o、git log --output 等）与
       "第二个位置参数是输出文件"（uniq）逐条拒。
  三层都是形态级防御，不是安全边界；进程级沙箱（seatbelt/landlock）才能封死，
  对照 research/10 §3.4-3.5。
"""
from __future__ import annotations

import shlex
from dataclasses import replace

from . import memory
from .tools import BASH_TOOL, ToolSpec, bash_execute

# 只读命令白名单：只有"看"没有"写"的命令。刻意保守——awk/python 等能在
# 脚本内部写文件的解释器一律不放行。
READONLY_COMMANDS = {
    "ls", "cat", "head", "tail", "grep", "find", "wc",
    "pwd", "file", "stat", "diff", "sort", "uniq",
}
GIT_READ_ONLY = {"log", "show", "diff", "status", "branch"}
# shell 元字符：重定向/管道/命令拼接都能把"只读命令"变成写操作，出现即拒
FORBIDDEN_CHARS = ";|&><`$"

# 参数级写旗标黑名单（T08-r1）：白名单命令自己也有能写文件的旗标，逐个点名。
# 未收录的旗标一律按"形态匹配有上限"对待——这是防御深度问题，不是清单问题。
_WRITE_FLAGS: dict[str, set[str]] = {
    "find": {"-delete", "-exec", "-execdir", "-ok", "-okdir",
             "-fprint", "-fprint0", "-fprintf", "-fls"},
    "sort": {"-o", "--output"},
    "diff": {"--output"},
}
# git branch 只放行"看分支"，建/删/改名分支是写操作
_GIT_BRANCH_READONLY = {"--list", "-a", "-r", "-v", "-vv", "--all", "--remotes"}
# git 只读子命令自己的写旗标（F02 回归）：log/show/diff 都支持 --output[=文件]，
# 不拦的话"只读"子代理能直接写出文件——旗标也是攻击面的又一例
_GIT_WRITE_FLAGS = {"--output"}

EXPLORE_SYSTEM_PROMPT = (
    "你是只读探索子代理。任务：只观察、不修改，用 read_file 和只读 bash 回答"
    "委派给你的问题。最后用一段 200 字以内的摘要回答，不要粘贴大段原文；"
    "摘要是父代理唯一能看到的东西。"
)

_WHITELIST_HINT = "、".join(sorted(READONLY_COMMANDS)) + "、git " + "/".join(sorted(GIT_READ_ONLY))


def _readonly_violation(parts: list[str]) -> str | None:
    """参数级检查：返回拒绝原因，None 表示通过。"""
    head = parts[0]
    flags = _WRITE_FLAGS.get(head)
    if flags:
        for tok in parts[1:]:
            if tok in flags or (tok.startswith("--") and tok.split("=", 1)[0] in flags):
                return f"{head} 的旗标 {tok} 会写文件或执行命令（只读子代理禁止）"
    if head == "uniq":
        positional = [t for t in parts[1:] if not t.startswith("-")]
        if len(positional) > 1:
            return "uniq 的第二个位置参数是输出文件（uniq 输入 输出 会写文件）"
    if head == "git" and parts[1] == "branch":
        extra = [t for t in parts[2:] if not t.startswith("-")]
        if extra or not set(parts[2:]) <= _GIT_BRANCH_READONLY:
            return "git branch 只允许无参数或 --list/-a/-r/-v/-vv（建分支是写操作）"
    if head == "git" and len(parts) > 1 and parts[1] in GIT_READ_ONLY:
        for tok in parts[2:]:
            if tok in _GIT_WRITE_FLAGS or (tok.startswith("--") and tok.split("=", 1)[0] in _GIT_WRITE_FLAGS):
                return f"git {parts[1]} 的旗标 {tok} 会写文件（只读子代理禁止）"
    return None


def readonly_bash_execute(args: dict, ctx) -> str:
    cmd = str(args.get("command") or "").strip()
    if not cmd:
        return "[错误] bash 缺少 command 参数"
    bad = [c for c in FORBIDDEN_CHARS if c in cmd]
    if bad:
        return (f"[错误] 只读子代理禁止 shell 元字符 {' '.join(bad)}（可被用来写文件）: {cmd}。"
                f"请改用单条只读命令")
    try:
        parts = shlex.split(cmd)
    except ValueError:
        return f"[错误] 命令解析失败（引号不配对）: {cmd}"
    if not parts:
        return "[错误] 空命令"
    head = parts[0]
    ok = head in READONLY_COMMANDS or (head == "git" and len(parts) > 1 and parts[1] in GIT_READ_ONLY)
    if not ok:
        return f"[错误] 命令不在只读白名单: {cmd}。可用: {_WHITELIST_HINT}"
    violation = _readonly_violation(parts)  # 第二层：旗标/位置参数也是攻击面
    if violation:
        return f"[错误] 只读子代理拒绝: {violation}。命令: {cmd}"
    return bash_execute(args, ctx)


READONLY_BASH_TOOL = ToolSpec(
    name="bash",
    description="只读 shell：仅限查看类命令（白名单），禁止重定向、管道与其他写操作。",
    parameters=dict(BASH_TOOL.parameters),
    execute=readonly_bash_execute,
)


def sub_tools() -> list[ToolSpec]:
    """子代理的工具集：read_file + 只读 bash。刻意没有 write_file。

    read_file 用 S7 的污点版：子代理读了 external/，污点随摘要回传父会话（见 explore_tool）。
    """
    return [memory.TAINTING_READ_FILE_TOOL, READONLY_BASH_TOOL]


def explore_tool() -> ToolSpec:
    """父代理视角的 explore 工具：每个实例内起一个只读子代理。"""

    def execute(args: dict, ctx) -> str:
        prompt = str(args.get("prompt") or "").strip()
        if not prompt:
            return "[错误] explore 缺少 prompt 参数。请写清要探索的问题与期望的摘要内容"
        from .loop import Agent, HarnessConfig  # 局部导入避免与 loop.py 循环依赖

        cfg: HarnessConfig = ctx.config
        # 子代理不写会话记录、不注入记忆索引（S7）：它的轨迹只以摘要形式进父会话
        sub_cfg = replace(cfg, max_steps=cfg.subagent_max_steps, memory_enabled=False)
        sub = Agent(
            model=ctx.model,
            tools=sub_tools(),
            workspace=ctx.workspace,
            config=sub_cfg,
            system_prompt=EXPLORE_SYSTEM_PROMPT,
            hooks=[],  # 子代理不走父钩子；只读约束已内建在工具里
        )
        result = sub.run(prompt)
        if result.taint:  # S7：子代理碰过外部内容 → 父会话同样被污染（摘要可能转述了注入）
            memory.mark_tainted(ctx, "explore", "; ".join(result.taint))
        ctx.state.setdefault("subagent_runs", []).append(
            {"steps": result.steps, "tool_calls": result.tool_calls, "token_estimate": result.token_estimate}
        )
        summary = (result.content or "").strip() or "(子代理没有产出摘要)"
        return f"{summary}\n[explore 子代理共 {result.steps} 步，以上为摘要，过程轨迹不回传]"

    return ToolSpec(
        name="explore",
        description="启动一个只读子代理去探索工作区（独立上下文，只有 read_file 和只读 bash）。"
                    "它只回传一段摘要，适合大范围搜索/盘点类任务，避免大输出挤占主对话。",
        parameters={
            "type": "object",
            "properties": {
                "prompt": {"type": "string",
                           "description": "委派给子代理的问题：目标 + 期望摘要包含什么（委派四件套）"},
            },
            "required": ["prompt"],
        },
        execute=execute,
    )


__all__ = ["READONLY_COMMANDS", "GIT_READ_ONLY", "FORBIDDEN_CHARS", "EXPLORE_SYSTEM_PROMPT",
           "readonly_bash_execute", "READONLY_BASH_TOOL", "sub_tools", "explore_tool"]
