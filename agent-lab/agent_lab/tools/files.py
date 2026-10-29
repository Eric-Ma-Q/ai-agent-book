"""文件、Glob、Grep 与工作区写工具（需求 016）。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..workspace import WorkspaceError
from .registry import ToolContext, ToolError, ToolSpec


def _workspace(ctx: ToolContext):
    if ctx.workspace is None:
        raise ToolError("当前环境没有接入文件工作区")
    return ctx.workspace


class ReadFileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=500, description="仓库内相对路径，例如 docs/dev/README.md")
    offset: int = Field(default=0, ge=0, description="从第几个字符开始读")
    limit: int = Field(default=4000, ge=200, le=12_000, description="最多返回多少字符")


class GlobArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pattern: str = Field(default="**/*", min_length=1, max_length=300, description="相对 glob，例如 **/*.py、docs/dev/**/*.md")
    limit: int = Field(default=100, ge=1, le=200, description="最多返回几个文件")


class GrepArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pattern: str = Field(min_length=1, max_length=300, description="正则；特殊字符可用 fixed=true 按字面匹配")
    glob: str = Field(default="**/*", max_length=300, description="限定文件模式，例如 **/*.mjs")
    max_results: int = Field(default=30, ge=1, le=50, description="最多返回多少条")
    context: int = Field(default=0, ge=0, le=2, description="每条命中前后各带几行")
    fixed: bool = Field(default=False, description="true 时按字面字符串匹配，不解释正则")


class WriteFileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=300, description="工作区内的相对路径")
    content: str = Field(max_length=200_000, description="完整文件内容")
    overwrite: bool = Field(default=False, description="文件已存在时是否覆盖")


class EditFileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=300, description="工作区内的相对路径")
    old: str = Field(min_length=1, max_length=20_000, description="要替换的原文，必须逐字匹配")
    new: str = Field(max_length=200_000, description="替换后的内容")
    replace_all: bool = Field(default=False, description="原文出现多次时是否全部替换")


def read_file(ctx: ToolContext, args: ReadFileArgs) -> dict:
    try:
        return _workspace(ctx).read_file(args.path, args.offset, args.limit)
    except WorkspaceError as error:
        raise ToolError(str(error)) from error


def glob_files(ctx: ToolContext, args: GlobArgs) -> dict:
    try:
        return _workspace(ctx).glob(args.pattern, args.limit)
    except WorkspaceError as error:
        raise ToolError(str(error)) from error


def grep_files(ctx: ToolContext, args: GrepArgs) -> dict:
    try:
        return _workspace(ctx).grep(args.pattern, args.glob, args.max_results, args.context, args.fixed)
    except WorkspaceError as error:
        raise ToolError(str(error)) from error


def write_file(ctx: ToolContext, args: WriteFileArgs) -> dict:
    try:
        return _workspace(ctx).write_file(args.path, args.content, args.overwrite)
    except WorkspaceError as error:
        raise ToolError(str(error)) from error


def edit_file(ctx: ToolContext, args: EditFileArgs) -> dict:
    try:
        return _workspace(ctx).edit_file(args.path, args.old, args.new, args.replace_all)
    except WorkspaceError as error:
        raise ToolError(str(error)) from error


FILE_TOOLS = [
    ToolSpec(
        "read_file",
        "读取仓库里的文本文件（代码、文档、配置）。返回内容、偏移和下一页位置。"
        "不能读 personal/ 读者数据、.env、密钥、依赖目录或二进制文件。",
        "读文件。",
        ReadFileArgs,
        read_file,
        max_chars=14_000,
    ),
    ToolSpec(
        "glob",
        "按相对 glob 查找文件名，例如 **/*.py、docs/dev/**/*.md。只返回公开文本文件，最多 200 条。",
        "找文件。",
        GlobArgs,
        glob_files,
    ),
    ToolSpec(
        "grep",
        "在仓库文本文件里搜索内容，返回路径、行号、命中行和可选上下文。"
        "查代码引用、文档表述、配置位置时优先用它；不能读读者数据与密钥。",
        "搜内容。",
        GrepArgs,
        grep_files,
        max_chars=12_000,
    ),
    ToolSpec(
        "write_file",
        "在实验台工作区（personal/lab/page-assistant/workspace/）创建或覆盖文件，用于生成示例、笔记草稿或临时产物。"
        "不能写书稿、读者数据或仓库其他位置。",
        "写工作区文件。",
        WriteFileArgs,
        write_file,
    ),
    ToolSpec(
        "edit_file",
        "对实验台工作区里的文件做精确替换。old 必须逐字匹配；多处匹配时需 replace_all=true。"
        "不能修改书稿、读者数据或仓库其他位置。",
        "编辑工作区文件。",
        EditFileArgs,
        edit_file,
    ),
]
