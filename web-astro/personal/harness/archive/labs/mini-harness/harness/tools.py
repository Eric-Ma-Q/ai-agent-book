"""内置工具：read_file / write_file / bash。

设计立场（对应 research/09 §八 工具设计审查清单）：
- 工具只管干活，策略（允许/拒绝）在 hooks 层（permissions.py），两层解耦；
- 错误信息可执行：报错时带"下一步该怎么做"（清单第 10 条）；
- 截断必须可续：read_file 按行分页，翻页提示带具体调用参数（第 8 条）；
- 空结果显式说明，防模型幻觉（第 9 条）。
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

READ_DEFAULT_LINES = 200   # read_file 单次默认返回的行数
READ_CHAR_BUDGET = 10_000  # read_file 单次返回的字符上限（防超长行撑爆上下文）


@dataclass
class ToolSpec:
    """一个工具的完整定义：名字 + 给模型看的描述 + JSON Schema + 执行函数。"""

    name: str
    description: str
    parameters: dict
    execute: object  # (args: dict, ctx: ToolContext) -> str


@dataclass
class ToolContext:
    """执行工具时可用的运行时上下文；由 Agent.run 每轮创建并传递。"""

    workspace: Path
    config: object = None                # loop.HarnessConfig
    state: dict = field(default_factory=dict)  # 跨步骤共享状态（如落盘文件计数）
    model: object = None                 # 模型句柄，子代理工具（explore）需要


def resolve_path(ctx: ToolContext, path: str) -> Path:
    """把工具参数里的相对路径解析到工作区内；绝对路径原样使用。"""
    p = Path(path)
    if not p.is_absolute():
        p = ctx.workspace / p
    return p


def rel_path(ctx: ToolContext, p: Path) -> str:
    """展示用：能相对工作区就相对，否则给绝对路径。"""
    try:
        return str(p.resolve().relative_to(Path(ctx.workspace).resolve()))
    except ValueError:
        return str(p)


def read_file_execute(args: dict, ctx: ToolContext) -> str:
    """按行分页读文件。分页即"截断 + 告诉模型怎么取下一段"（S1）。"""
    path = args.get("path")
    if not path:
        return "[错误] read_file 缺少 path 参数。示例: {\"path\": \"src/a.py\"}"
    p = resolve_path(ctx, path)
    if not p.exists():
        return f"[错误] 文件不存在: {path}（当前工作区: {ctx.workspace}，用相对路径）"
    if p.is_dir():
        return f"[错误] {path} 是目录。用 bash 执行 ls 查看目录内容"
    try:
        text = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"[错误] {path} 不是 UTF-8 文本，无法读取"
    lines = text.splitlines()
    total = len(lines)
    offset = max(1, int(args.get("offset") or 1))
    limit = int(args.get("limit") or READ_DEFAULT_LINES)
    if total and offset > total:
        return f"[错误] offset={offset} 超出总行数 {total}"
    start, end = offset - 1, min(total, offset - 1 + limit)
    shown: list[str] = []
    chars = 0
    for i in range(start, end):
        ln = lines[i]
        if shown and chars + len(ln) + 1 > READ_CHAR_BUDGET:  # 超长行撑爆预算，停在这一行前
            end = i
            break
        shown.append(ln)
        chars += len(ln) + 1
    body = "\n".join(shown) if shown else "(文件为空)"
    out = f"{rel_path(ctx, p)} 第 {offset}-{end} 行 / 共 {total} 行\n{body}"
    if end < total:
        out += (
            f"\n[还有 {total - end} 行未显示。继续读取: "
            f'read_file(path="{rel_path(ctx, p)}", offset={end + 1})]'
        )
    return out


def write_file_execute(args: dict, ctx: ToolContext) -> str:
    path = args.get("path")
    if not path:
        return "[错误] write_file 缺少 path 参数。示例: {\"path\": \"a.txt\", \"content\": \"...\"}"
    content = args.get("content")
    if content is None:
        content = ""
    p = resolve_path(ctx, path)
    existed = p.exists()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    note = "覆盖" if existed else "新建"
    return f"已{note} {rel_path(ctx, p)}（{len(content)} 字符）"


def bash_execute(args: dict, ctx: ToolContext) -> str:
    """shell 执行。stdout/stderr 合并返回，退出码和超时显式告知模型。"""
    cmd = args.get("command")
    if not cmd or not str(cmd).strip():
        return "[错误] bash 缺少 command 参数"
    timeout = getattr(ctx.config, "bash_timeout", 60) if ctx.config else 60
    try:
        proc = subprocess.run(
            str(cmd), shell=True, cwd=ctx.workspace,
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return f"[错误] 命令超过 {timeout}s 被终止: {cmd}。请拆小或加超时控制"
    out = proc.stdout or ""
    if proc.stderr:
        out += ("\n" if out else "") + "[stderr]\n" + proc.stderr
    if proc.returncode != 0:
        out += f"\n[退出码: {proc.returncode}]"
    if not out.strip():
        return "(命令执行成功，无输出)"  # 空结果显式说明，防模型把空当失败
    return out


READ_FILE_TOOL = ToolSpec(
    name="read_file",
    description="读取工作区内文本文件。按行分页返回，默认前 200 行；"
                "结果末尾会提示是否还有剩余行以及如何继续读取。",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "相对工作区的文件路径"},
            "offset": {"type": "integer", "description": "起始行号（1 起），默认 1"},
            "limit": {"type": "integer", "description": "本次读取的行数，默认 200"},
        },
        "required": ["path"],
    },
    execute=read_file_execute,
)

WRITE_FILE_TOOL = ToolSpec(
    name="write_file",
    description="把内容写入工作区内的文件（覆盖式）。父目录不存在会自动创建。",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "相对工作区的目标路径"},
            "content": {"type": "string", "description": "完整文件内容"},
        },
        "required": ["path", "content"],
    },
    execute=write_file_execute,
)

BASH_TOOL = ToolSpec(
    name="bash",
    description="在工作区目录里执行一条 shell 命令，返回合并后的 stdout/stderr。"
                "输出过大会被落盘或截断，请按提示缩小范围。",
    parameters={
        "type": "object",
        "properties": {"command": {"type": "string", "description": "要执行的命令"}},
        "required": ["command"],
    },
    execute=bash_execute,
)


def tool_schemas(tools: dict) -> list[dict]:
    """转成发给模型的 OpenAI function schema（去掉 execute 字段）。"""
    return [
        {"name": t.name, "description": t.description, "parameters": t.parameters}
        for t in tools.values()
    ]


__all__ = [
    "ToolSpec", "ToolContext", "resolve_path", "rel_path", "tool_schemas",
    "READ_FILE_TOOL", "WRITE_FILE_TOOL", "BASH_TOOL",
    "read_file_execute", "write_file_execute", "bash_execute",
]
