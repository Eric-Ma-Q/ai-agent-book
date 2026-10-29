"""命令与代码解释器工具（需求 016）。

Bash 只在实验台工作区可写，仓库其他位置只读；代码解释器复用第 5 章的 macOS
sandbox。两者都不联网，失败时把可读原因交给模型。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..sandbox import SandboxUnavailable
from ..workspace import BashUnavailable, WorkspaceError
from .registry import ToolContext, ToolError, ToolSpec


class BashArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command: str = Field(min_length=1, max_length=4000, description="要执行的 shell 命令；可以用管道和重定向，但仓库只读")
    cwd: str = Field(default="", max_length=300, description="仓库内相对目录；留空为仓库根，填 workspace 为实验台工作区")
    timeout_s: float = Field(default=10.0, ge=1.0, le=30.0, description="超时秒数")


class CodeInterpreterArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=20_000, description="要运行的 Python 代码，用 print 输出；只有标准库")


def bash(ctx: ToolContext, args: BashArgs) -> dict:
    if ctx.workspace is None:
        raise ToolError("当前环境没有接入工作区，不能运行 shell")
    try:
        result = ctx.workspace.bash(args.command, args.cwd, args.timeout_s)
    except BashUnavailable as error:
        raise ToolError(str(error)) from error
    except WorkspaceError as error:
        raise ToolError(str(error)) from error
    if result.get("timed_out"):
        result["note"] = "命令超时，已终止；请缩小范围或改用 grep/read_file。"
    elif result.get("exit_code") not in (0, None):
        result["note"] = "命令以非零状态退出；stderr 里通常有原因。"
    return result


def code_interpreter(ctx: ToolContext, args: CodeInterpreterArgs) -> dict:
    if ctx.sandbox is None:
        raise ToolError("当前环境没有沙箱，不能运行代码")
    try:
        return ctx.sandbox.run(args.code).to_dict()
    except SandboxUnavailable as error:
        raise ToolError(str(error)) from error


SHELL_TOOLS = [
    ToolSpec(
        "bash",
        "在终端执行 shell 命令，适合用 rg/grep 查代码、用 git 看历史、用 sed/awk 处理文本。"
        "仓库其他位置只读，只能写实验台工作区；不能联网；超时 10 秒；输出会截断。",
        "运行 shell。",
        BashArgs,
        bash,
        max_chars=9000,
    ),
    ToolSpec(
        "code_interpreter",
        "在隔离的 Python 沙箱里运行代码，用于计算、验证公式、解析文本或生成示例数据。"
        "只有标准库，不能联网，不能读写本地文件，超时 10 秒。",
        "运行 Python。",
        CodeInterpreterArgs,
        code_interpreter,
        max_chars=9000,
    ),
]
