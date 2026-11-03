"""mini-harness：从零实现的最小 agent harness（教学实验，配套 research/08–14 分册）。

七个阶段一个模块：
  S1 主循环        loop.py      （tools.py / outputs.py 协作）
  S2 权限与 hooks  permissions.py
  S3 上下文压缩    compaction.py （+ prompts/compact.md）
  S4 大输出落盘    outputs.py
  S5 只读子代理    subagent.py
  S6 迷你 eval     evals.py
  S7 记忆层        memory.py    （sessions.py 会话记录 = 真相源）
模型层 models.py：FakeModel（离线确定）+ OpenAICompatModel（urllib，零依赖）。
"""
from .compaction import compact_messages, should_compact
from .evals import EvalCase, EvalRow, default_cases, render_table, run_evals
from .loop import Agent, HarnessConfig, RunResult, default_tools
from .memory import (FETCH_EXTERNAL_TOOL, REMEMBER_TOOL, list_memory, rebuild_memory,
                     system_prompt_with_memory, write_index)
from .models import FakeModel, Model, ModelResponse, OpenAICompatModel, ToolCall, estimate_tokens
from .outputs import process_output, spill_to_artifact, truncate_with_hint
from .permissions import Decision, Hook, RuleEngine, ToolEvent, run_hooks
from .sessions import SessionLog, redact
from .tools import BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, ToolContext, ToolSpec

__version__ = "0.1.0"

__all__ = [
    "Agent", "HarnessConfig", "RunResult", "default_tools",
    "FakeModel", "Model", "ModelResponse", "OpenAICompatModel", "ToolCall", "estimate_tokens",
    "RuleEngine", "Hook", "Decision", "ToolEvent", "run_hooks",
    "ToolSpec", "ToolContext", "READ_FILE_TOOL", "WRITE_FILE_TOOL", "BASH_TOOL",
    "process_output", "spill_to_artifact", "truncate_with_hint",
    "compact_messages", "should_compact",
    "EvalCase", "EvalRow", "default_cases", "run_evals", "render_table",
    "FETCH_EXTERNAL_TOOL", "REMEMBER_TOOL", "rebuild_memory", "list_memory", "write_index",
    "system_prompt_with_memory", "SessionLog", "redact",
]
