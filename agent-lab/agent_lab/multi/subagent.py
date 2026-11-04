"""管理者 + 子 Agent：主 Agent 用 delegate 把查书任务交给子 Agent。

子 Agent 是换了系统提示词和工具集的另一个 _Run（第 10 章：切换提示词和工具集就是一个新 Agent）。
两种模式（第 10 章「维度一：上下文是否共享」）：
- shared：子 Agent 拿到主 Agent 到目前为止的完整对话，再加上任务说明；
- isolated：只拿到任务说明，必须靠任务说明本身把信息带过去。

delegate 的执行在 agent.py 的 _Run.run_tools 里直接处理，不走注册表的异常兜底，
这样子 Agent 的预算超限和取消能结束整个运行。
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..config import AgentConfig
from ..tools.registry import ToolContext, ToolError, ToolSpec

MAX_DELEGATIONS = 4
SUB_TOOLS = ("list_chapters", "search_book", "read_section")
_READING_TOOLS = ("search_book", "read_section")


class DelegateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task: str = Field(min_length=4, max_length=500, description="交给助手的查书任务：要查什么、为什么查、需要哪些原文")


def _not_here(_ctx: ToolContext, _args: DelegateArgs) -> Any:
    raise ToolError("delegate 只能由主 Agent 在子 Agent 模式下调用")


DELEGATE = ToolSpec(
    name="delegate",
    description=(
        "把一个查书任务交给助手 Agent。助手会检索、阅读书中相关小节，返回带原文引用的要点。"
        "任务说明要具体、自包含；一次运行最多委派 4 次。"
    ),
    terse="委派查书任务",
    params=DelegateArgs,
    handler=_not_here,
    max_chars=8000,
)


def main_tools(cfg: AgentConfig) -> tuple[str, ...]:
    """子 Agent 模式下主 Agent 只规划和作答：去掉查书工具（delegate 另外加入）。"""
    if cfg.subagent == "none":
        return cfg.tools
    return tuple(name for name in cfg.tools if name not in _READING_TOOLS)


def sub_config(cfg: AgentConfig) -> AgentConfig:
    """子 Agent 的配置：只查书，不再委派、不审核、不注入记忆和规则；其余开关（如压缩、干扰工具）沿用。"""
    return cfg.model_copy(
        update={
            "tools": SUB_TOOLS,
            "max_turns": cfg.subagent_max_turns,
            "subagent": "none",
            "reviewer": "none",
            "memory": False,
            "learned_rules": False,
        }
    )


def sub_history(mode: str, history: list[dict[str, Any]], task: str) -> tuple[list[dict[str, Any]], int]:
    """子 Agent 的初始对话和其中「当前问题」的位置（供上下文组装使用）。

    shared 时带上主 Agent 发出这次委派之前的全部对话：去掉最后一条助手消息（委派调用本身）
    以及它之后已回填的工具结果，否则消息里会出现没有结果的工具调用。
    """
    request = {"role": "user", "content": f"任务：{task}"}
    if mode != "shared":
        return [request], 0
    last = max((i for i, m in enumerate(history) if m.get("role") == "assistant"), default=len(history))
    prior = list(history[:last])
    return [*prior, request], len(prior)


def parse_task(raw_args: str | None) -> tuple[str | None, str | None]:
    """delegate 的参数 → (任务, 错误说明)。参数不合法时返回错误，交给主 Agent 自己改正。"""
    try:
        data = json.loads(raw_args) if raw_args and raw_args.strip() else {}
        return DelegateArgs.model_validate(data).task.strip(), None
    except (ValueError, ValidationError) as error:
        return None, f"delegate 参数不合法（需要 {{\"task\": \"4–500 字的任务说明\"}}）：{error}"
