"""S1：核心主循环。

Agent.run 的骨架（每轮 5 步）：
  1. 若上下文估算 token 超阈值 → 压缩（S3，见 compaction.py）
  2. 调模型（带工具 schema）
  3. 记账（步数、token 估算/真实 usage）
  4. 模型没调工具 → 循环结束
  5. 每个工具调用：过 PreToolUse 钩子链（S2）→ 拒绝则把原因当工具结果回给模型；
     放行则执行 → 输出经落盘/截断加工（S1/S4）→ 作为 tool 消息回给模型
到达 max_steps 仍未收敛就停，stopped_reason="max_steps"。
S7（memory.py / sessions.py）在循环外围加两件事：开头把记忆薄索引包进边界标记拼到系统提示；
全程把每条消息与事件追加写入 .harness/sessions/<id>.jsonl（记忆的唯一真相源）。

对应 research/08 §3.1（单循环仍是主流）与 §4.4（最佳组合清单）。
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from . import memory
from .compaction import compact_messages, should_compact
from .models import Model, estimate_tokens
from .outputs import process_output
from .permissions import ToolEvent, run_hooks
from .tools import BASH_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL, ToolContext, ToolSpec, tool_schemas

DEFAULT_SYSTEM_PROMPT = (
    "你是一个谨慎的编码 agent。只能用提供的工具完成任务；"
    "工具结果被拒绝/截断/落盘时，按结果里的提示继续。"
)


@dataclass
class HarnessConfig:
    max_steps: int = 25                  # S1：循环上限
    max_chars: int = 10_000              # S1：硬截断阈值
    spill_chars: int | None = 2_000      # S4：落盘阈值；None 关闭落盘
    context_token_limit: int = 100_000   # S3：压缩阈值（估算 token）；None 关闭压缩
    compact_keep_last_n: int = 6         # S3：压缩时保留的最近消息数
    compact_prompt: str | None = None    # S3：自定义压缩提示词路径
    subagent_max_steps: int = 8          # S5：子代理步数上限
    bash_timeout: int = 60               # bash 超时秒数
    on_ask: object = None                # S2：ask 裁决的处理器 (event, decision) -> bool；None=拒绝
    memory_enabled: bool = True          # S7：会话记录 + 记忆工具 + 索引注入；False 整层关闭
    memory_gate: bool = True             # S7：写入闸门——会话碰过外部内容，remember 只写草稿区
    memory_index_max_lines: int = 50     # S7：MEMORY.md 行数上限（含表头与截断提示）
    clock: object = None                 # S7：可注入时钟 () -> datetime；None=系统时钟


@dataclass
class RunResult:
    content: str          # 最终文本回复
    steps: int            # 模型调用次数
    tool_calls: int       # 工具调用总次数
    token_estimate: int   # 全程 token（真模型用 usage 累加，假模型用字符/4 估算）
    stopped_reason: str   # "final" | "max_steps"
    compactions: int      # S3 触发次数
    messages: list = field(default_factory=list)  # 完整轨迹，调试/测试用
    taint: list = field(default_factory=list)     # S7：本次运行碰过的外部内容来源（子代理回传给父会话）


class Agent:
    """一个最小 harness 实例。主代理与只读子代理共用这个类（S5）。"""

    def __init__(self, model: Model, tools: list[ToolSpec], *, workspace: Path | str,
                 config: HarnessConfig | None = None,
                 system_prompt: str = DEFAULT_SYSTEM_PROMPT,
                 hooks: list | None = None):
        self.model = model
        self.tools: dict[str, ToolSpec] = {t.name: t for t in tools}
        self.hooks = list(hooks or [])
        self.config = config or HarnessConfig()
        self.workspace = Path(workspace)
        self.system_prompt = system_prompt

    def run(self, user_message: str) -> RunResult:
        cfg = self.config
        ctx = ToolContext(workspace=self.workspace, config=cfg)
        ctx.model = self.model
        # -- S7：会话记录（真相源）+ 记忆索引注入系统提示（关闭时都是空操作）----
        session = ctx.state["session"] = memory.open_session(self.workspace, cfg)
        system = memory.system_prompt_with_memory(self.system_prompt, self.workspace, cfg)
        messages: list[dict] = []
        for m in ({"role": "system", "content": system}, {"role": "user", "content": user_message}):
            _push(messages, m, session)
        steps = tool_calls_count = compactions = tokens = 0
        stopped = "max_steps"

        for _ in range(cfg.max_steps):
            # -- S3：模型调用前先看是否需要压缩 ------------------------------
            if should_compact(messages, cfg.context_token_limit):
                pre = estimate_tokens(messages)
                messages, summary = compact_messages(
                    self.model, messages,
                    keep_last_n=cfg.compact_keep_last_n,
                    prompt_path=cfg.compact_prompt,
                )
                if summary:
                    compactions += 1
                    session.event("compaction", summary=summary)  # 轨迹不丢：压缩前的消息已逐条落盘
                    tokens += pre + max(1, len(summary) // 4)

            # -- 2/3：调模型并记账。有真实 usage 用 usage（T08-r1：修复 completion
            # token 被重复估算的 bug），没有才退回字符/4 估算 -----------------------
            prompt_est = estimate_tokens(messages)
            resp = self.model.chat(messages, tool_schemas(self.tools))
            used_real_usage = bool(resp.usage and "prompt_tokens" in resp.usage)
            if used_real_usage:
                tokens += int(resp.usage["prompt_tokens"]) + int(resp.usage["completion_tokens"])
            else:
                tokens += prompt_est
            amsg = _assistant_message(resp)
            if not used_real_usage:
                tokens += estimate_tokens([amsg])
            _push(messages, amsg, session)
            steps += 1

            # -- 4：模型不调工具，循环结束 ------------------------------------
            if not resp.tool_calls:
                stopped = "final"
                break

            # -- 5：逐个执行工具调用 ------------------------------------------
            tool_calls_count += len(resp.tool_calls)
            for tc in resp.tool_calls:
                result = self._execute_tool(tc, ctx)
                _push(messages, {"role": "tool", "tool_call_id": tc.id, "content": result}, session)

        content = _last_assistant_text(messages)
        session.event("session_end", stopped_reason=stopped, steps=steps, tool_calls=tool_calls_count)
        return RunResult(
            content=content, steps=steps, tool_calls=tool_calls_count,
            token_estimate=tokens, stopped_reason=stopped,
            compactions=compactions, messages=messages, taint=list(ctx.state.get("taint", [])),
        )

    def _execute_tool(self, tc, ctx: ToolContext) -> str:
        cfg = self.config
        spec = self.tools.get(tc.name)
        if spec is None:
            return f"[错误] 未知工具: {tc.name}。可用工具: {', '.join(self.tools)}"
        # -- S2：PreToolUse 钩子链，拒绝时把原因当工具结果回给模型 ------------
        decision = run_hooks(self.hooks, ToolEvent(tool=tc.name, args=tc.arguments, workspace=self.workspace))
        if decision.verdict == "deny":
            return f"[已拒绝] {decision.reason or '策略拒绝'}（来源: {decision.source}）。请调整方案"
        if decision.verdict == "ask":
            allowed = bool(cfg.on_ask(ToolEvent(tool=tc.name, args=tc.arguments, workspace=self.workspace), decision)) \
                if cfg.on_ask else False
            if not allowed:
                return (f"[已拒绝] 该操作需要用户确认（ask），当前无人值守，已按默认拒绝。"
                        f"原因: {decision.reason or '未说明'}")
        try:
            raw = spec.execute(tc.arguments, ctx)
        except Exception as e:  # 工具异常不当致命错误，回传给模型自行调整
            return f"[错误] 工具 {tc.name} 执行异常: {type(e).__name__}: {e}"
        return process_output(raw, ctx, tool_name=tc.name,
                              spill_chars=cfg.spill_chars, max_chars=cfg.max_chars)


def default_tools(workspace: Path | str, config: HarnessConfig | None = None) -> list[ToolSpec]:
    """主代理默认工具集：read_file / write_file / bash + S5 explore + S7 fetch_external / remember。

    S7 开启时 read_file 换成"读 external/ 会标污点"的版本（同名同 schema）。
    """
    from . import subagent  # 局部导入：subagent 需要引用 loop.Agent，避免循环依赖
    if config is not None and not config.memory_enabled:
        return [READ_FILE_TOOL, WRITE_FILE_TOOL, BASH_TOOL, subagent.explore_tool()]
    return [memory.TAINTING_READ_FILE_TOOL, WRITE_FILE_TOOL, BASH_TOOL, subagent.explore_tool(),
            memory.FETCH_EXTERNAL_TOOL, memory.REMEMBER_TOOL]


def _push(messages: list[dict], m: dict, session) -> None:
    """追加一条消息到上下文，同时逐条写进会话记录（S7）。"""
    messages.append(m)
    session.record(m)


def _assistant_message(resp) -> dict:
    m: dict = {"role": "assistant", "content": resp.content}
    if resp.tool_calls:
        m["tool_calls"] = [
            {"id": tc.id, "type": "function",
             "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)}}
            for tc in resp.tool_calls
        ]
    return m


def _last_assistant_text(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m["role"] == "assistant" and m.get("content"):
            return str(m["content"])
    return ""
