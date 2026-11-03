"""第 5 章：代码即工具。run_python 在沙箱里运行代码；create_tool 让 Agent 现场写一个新工具。"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ..sandbox import SandboxUnavailable
from .registry import ToolContext, ToolError, ToolSpec

TOOL_NAME = re.compile(r"^[a-z][a-z0-9_]{2,30}$")
MAX_CUSTOM_TOOLS = 5
RUNNER = """

import json as _json, sys as _sys
_args = _json.loads(_sys.stdin.read() or "{}")
print(_json.dumps(run(_args), ensure_ascii=False, default=str))
"""


class RunPythonArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(description="要运行的 Python 代码，用 print 输出结果。只有标准库，不能联网，不能读写本地文件。")


class CreateToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(description="新工具名：小写字母开头，只含小写字母、数字、下划线")
    description: str = Field(description="工具用途说明")
    parameters: dict[str, Any] = Field(description="参数的 JSON Schema（type=object）")
    code: str = Field(description="Python 代码，必须定义 def run(args: dict)，返回可 JSON 序列化的结果")


def _sandbox(ctx: ToolContext):
    if ctx.sandbox is None:
        raise ToolError("当前环境没有沙箱，不能运行代码")
    return ctx.sandbox


def run_python(ctx: ToolContext, args: RunPythonArgs) -> dict:
    try:
        return _sandbox(ctx).run(args.code).to_dict()
    except SandboxUnavailable as error:
        raise ToolError(str(error)) from error


def _params_model(schema: dict[str, Any]) -> type[BaseModel]:
    class CustomArgs(BaseModel):
        model_config = ConfigDict(extra="allow")

        @classmethod
        def model_json_schema(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
            return dict(schema)

    return CustomArgs


def _custom_handler(code: str):
    def handler(ctx: ToolContext, args: BaseModel) -> Any:
        result = _sandbox(ctx).run(code + RUNNER, stdin=json.dumps(args.model_dump(), ensure_ascii=False))
        if result.timed_out:
            raise ToolError("自定义工具运行超时")
        if result.exit_code != 0:
            raise ToolError(f"自定义工具出错：{result.stderr[-800:]}")
        try:
            return json.loads(result.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            return result.stdout

    return handler


def create_tool(ctx: ToolContext, args: CreateToolArgs) -> dict:
    custom = ctx.state.custom_tools
    if not TOOL_NAME.match(args.name):
        raise ToolError("工具名不合法：小写字母开头，3–31 个字符，只含小写字母、数字、下划线")
    from . import all_tools
    from .distractors import DISTRACTOR_NAMES

    reserved = {spec.name for spec in all_tools()} | DISTRACTOR_NAMES
    if args.name in custom or args.name in reserved:
        raise ToolError(f"工具 {args.name} 已存在")
    if len(custom) >= MAX_CUSTOM_TOOLS:
        raise ToolError(f"一次运行最多创建 {MAX_CUSTOM_TOOLS} 个工具")
    if args.parameters.get("type") != "object":
        raise ToolError("parameters 必须是 type=object 的 JSON Schema")
    if not re.search(r"^def run\(", args.code, re.M):
        raise ToolError("代码必须定义顶层函数 def run(args)")
    check = _sandbox(ctx).run(args.code + "\nprint('ok')")
    if check.exit_code != 0:
        raise ToolError(f"代码无法加载：{check.stderr[-800:]}")
    custom[args.name] = ToolSpec(args.name, args.description, args.description, _params_model(args.parameters), _custom_handler(args.code))
    return {"created": args.name, "message": f"工具 {args.name} 已创建，下一轮起可以直接调用。"}


CODE_TOOLS = [
    ToolSpec(
        "run_python",
        "在沙箱中运行 Python 代码并返回 stdout、stderr 和退出码。用于计算、验证公式、生成示例数据。只有标准库，不能联网，不能访问本地文件，超时 10 秒。",
        "运行 Python。",
        RunPythonArgs,
        run_python,
        max_chars=9000,
    ),
    ToolSpec(
        "create_tool",
        "用 Python 写一个新工具：提供名称、说明、参数 JSON Schema 和定义了 run(args) 的代码。创建后可以像内置工具一样调用，代码在沙箱中运行。",
        "创建工具。",
        CreateToolArgs,
        create_tool,
    ),
]
