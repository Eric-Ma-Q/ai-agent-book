"""ReAct 循环：组装上下文 → 调用模型 → 执行工具 → 回填结果，直到给出回答或触发终止条件。

每一步都以事件形式交给 emit 记录。终止状态如实记录：ok / max_turns / budget_exceeded /
llm_error / cancelled / error。
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .book.index import SearchService
from .book.parser import Book
from .citations import CitationChecker, parse_citations
from .compression import maybe_summarize
from .config import AgentConfig, Settings, config_hash
from .context import ContextInputs, build_context, build_system_prompt
from .llm.client import ChatClient, ChatRequest, LLMError
from .llm.pricing import REFERENCE_PRICE, Price, cost_of, price_for
from .multi.reviewer import RETRY_MESSAGE, Verdict, feedback_message, parse_verdict, review_messages
from .multi.subagent import DELEGATE, MAX_DELEGATIONS, main_tools, parse_task, sub_config, sub_history
from .prompts import SUBAGENT_PROMPT, system_prompt_for
from .tools.distractors import distractor_tools
from .tools.registry import RunState, ToolContext, ToolOutcome, ToolRegistry, _truncate
from .trace.schema import MAIN_AGENT, Event, Info, LlmRequest, LlmResponse, RunEnd, RunStart, ToolCall
from .trace.tokens import segment_tokens
from .totals import Totals

Emit = Callable[[Event], Event]
REVIEWER = "reviewer"


@dataclass
class AgentDeps:
    client: ChatClient
    registry: ToolRegistry
    book: Book
    search: SearchService
    checker: CitationChecker
    settings: Settings | None = None
    gate: Any = None
    notes: Any = None
    sandbox: Any = None
    page: Any = None  # PageContext：随页问答的页面快照（需求 016）
    workspace: Any = None  # Workspace：文件、命令与工作区
    web: Any = None  # WebClient：联网搜索与抓取
    system_prompt: str | None = None  # 非空时替换默认的书本助教提示词
    memory: Any = None  # recall(question) -> list[str]; remember(question, answer)
    rules: Any = None  # active() -> list[str]
    request_extra: dict[str, Any] = field(default_factory=dict)  # 模型档案的请求附加字段
    price: Price | None = None  # 模型档案的挂牌单价；None 时按内置规则
    git_sha: str | None = None


@dataclass(frozen=True)
class RunOutcome:
    run_id: str
    status: str
    answer: str | None
    citations: list[dict[str, Any]] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)


class _Stop(Exception):
    def __init__(self, status: str, error: str | None = None):
        super().__init__(status)
        self.status, self.error = status, error


def _assistant_for_history(message: dict[str, Any]) -> dict[str, Any]:
    kept = {"role": "assistant", "content": message.get("content")}
    if message.get("tool_calls"):
        kept["tool_calls"] = message["tool_calls"]
    return kept


DATA_URL = re.compile(r"data:image/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+", re.IGNORECASE)


def _redact_content(content: Any) -> Any:
    """轨迹里不重复保存截图 base64；模型请求仍使用原消息。"""
    if isinstance(content, str):
        return DATA_URL.sub("data:image/…;base64,<redacted>", content)
    if isinstance(content, list):
        out = []
        for part in content:
            if isinstance(part, dict):
                item = dict(part)
                image = item.get("image_url")
                if isinstance(image, dict) and isinstance(image.get("url"), str):
                    item["image_url"] = {**image, "url": "data:image/…;base64,<redacted>"}
                if isinstance(item.get("text"), str):
                    item["text"] = DATA_URL.sub("data:image/…;base64,<redacted>", item["text"])
                out.append(item)
            else:
                out.append(part)
        return out
    return content


def _redact_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    redacted = []
    for message in messages:
        item = dict(message)
        item["content"] = _redact_content(item.get("content"))
        redacted.append(item)
    return redacted


class _Run:
    """一个 Agent 的循环。第 10 章的子 Agent 也是一个 _Run：换了提示词和工具集，共享客户端、事件流、取消信号和用量。"""

    def __init__(
        self, deps: AgentDeps, question: str, config: AgentConfig, run_id: str, emit: Emit, cancel,
        agent: str = MAIN_AGENT, totals: Totals | None = None,
    ):
        self.deps, self.question, self.config, self.run_id, self.emit = deps, question, config, run_id, emit
        self.cancel = cancel or threading.Event()
        self.state = RunState()
        self.price = deps.price if deps.price is not None else price_for(config.model)
        self.totals = totals or Totals(self.price)
        self.agent = agent
        self.is_sub = agent != MAIN_AGENT
        self.delegating = not self.is_sub and config.subagent != "none"
        base = deps.registry.subset(main_tools(config))
        self.base_registry = base.with_specs([DELEGATE]) if self.delegating else base
        self.distractors = distractor_tools(config.distractor_tools)
        self.memories: list[str] = []
        self.rules: list[str] = []
        self.turn = 0  # 本 Agent 已用的轮数；审核退回后继续累加
        self.delegations = 0

    def registry(self) -> ToolRegistry:
        return self.base_registry.with_specs([*self.distractors, *self.state.custom_tools.values()])

    def tool_definitions(self) -> list[dict[str, Any]] | None:
        if self.config.drop_tool_definitions:
            return None
        registry = self.registry()
        return registry.definitions(registry.names(), style=self.config.tool_descriptions) or None

    def info(self, turn: int, kind: str, detail: dict[str, Any], agent: str | None = None) -> None:
        self.emit(Info(turn=turn, kind=kind, detail=detail, agent=agent or self.agent))

    def check_budget(self) -> None:
        if self.totals.tokens_used > self.config.max_total_tokens:
            raise _Stop("budget_exceeded", f"已用 {self.totals.tokens_used} token，超过上限 {self.config.max_total_tokens}")

    def call_model(
        self, turn: int, messages: list[dict], tools: list[dict] | None, purpose: str = "agent", agent: str | None = None
    ):
        cfg = self.config
        agent = agent or self.agent
        self.emit(LlmRequest(turn=turn, purpose=purpose, agent=agent, messages=_redact_messages(messages), tools=tools, segments=segment_tokens(messages, tools)))
        request = ChatRequest(
            model=cfg.model,
            messages=messages,
            tools=tools,
            temperature=cfg.temperature,
            max_tokens=cfg.max_output_tokens,
            extra=self.deps.request_extra,
        )
        try:
            response = self.deps.client.complete(request)
        except LLMError as error:
            self.emit(LlmResponse(turn=turn, purpose=purpose, agent=agent, error=str(error), retries=[r.model_dump() for r in error.retries]))
            raise _Stop("llm_error", str(error)) from error
        except Exception as error:  # noqa: BLE001 - 例如回放缺失：记录后结束运行
            message = f"{type(error).__name__}: {error}"
            self.emit(LlmResponse(turn=turn, purpose=purpose, agent=agent, error=message))
            raise _Stop("error", message) from error
        cost = cost_of(response.usage, self.price)
        self.emit(
            LlmResponse(
                turn=turn,
                purpose=purpose,
                agent=agent,
                message=response.message,
                usage=response.usage.model_dump(),
                latency_ms=response.latency_ms,
                cost=cost,
                reference_cost=cost_of(response.usage, REFERENCE_PRICE),
                retries=[r.model_dump() for r in response.retries],
                model=response.model,
                finish_reason=response.finish_reason,
            )
        )
        self.totals.add_llm(response.usage, response.latency_ms, cost, cost_of(response.usage, REFERENCE_PRICE), agent=agent)
        return response

    def run_tools(self, turn: int, calls: list[dict[str, Any]], history: list[dict[str, Any]]) -> None:
        ctx = ToolContext(
            book=self.deps.book, search=self.deps.search, config=self.config, settings=self.deps.settings,
            gate=self.deps.gate, notes=self.deps.notes, sandbox=self.deps.sandbox, page=self.deps.page,
            workspace=self.deps.workspace, web=self.deps.web, run_id=self.run_id, state=self.state,
            emit=self.emit,
        )
        for index, call in enumerate(calls):
            if self.cancel.is_set():
                raise _Stop("cancelled")
            call_id = call.get("id") or f"call_{turn}_{index}"
            fn = call.get("function") or {}
            started = time.monotonic()
            if self.delegating and fn.get("name") == "delegate":
                outcome = self.delegate(call_id, fn.get("arguments"), history)
            else:
                outcome = self.registry().execute(fn.get("name", ""), fn.get("arguments"), ctx)
            self.state.tool_calls += 1
            self.totals.tool_calls += 1
            self.emit(
                ToolCall(
                    turn=turn, agent=self.agent, call_id=call_id, name=fn.get("name", ""), args=fn.get("arguments") or "",
                    result=outcome.content, truncated=outcome.truncated,
                    duration_ms=int((time.monotonic() - started) * 1000), error=outcome.error,
                )
            )
            history.append({"role": "tool", "tool_call_id": call_id, "content": outcome.content})

    def delegate(self, call_id: str, raw_args: str | None, history: list[dict[str, Any]]) -> ToolOutcome:
        """第 10 章管理者模式：运行一个子 Agent，把它的回答作为 delegate 的工具结果。

        子 Agent 轮数用尽或模型出错 → 错误交给主 Agent；预算超限、取消 → 结束整个运行。
        """
        task, error = parse_task(raw_args)
        if error is None and self.delegations >= MAX_DELEGATIONS:
            error = f"本次运行最多委派 {MAX_DELEGATIONS} 次，已经用完；请根据已有信息作答"
        if error is not None:
            return ToolOutcome(content=json.dumps({"error": error}, ensure_ascii=False), error=error)
        self.delegations += 1
        name = f"sub-{self.delegations}"
        mode = self.config.subagent
        sub_messages, question_index = sub_history(mode, history, task or "")
        self.info(self.turn, "subagent_start", {"agent": name, "mode": mode, "task": task, "call_id": call_id, "input_messages": len(sub_messages)})
        sub = _Run(self.deps, task or "", sub_config(self.config), self.run_id, self.emit, self.cancel, agent=name, totals=self.totals)
        status, answer = "ok", ""
        try:
            answer = sub.loop(sub_messages, question_index)
        except _Stop as stop:
            if stop.status not in ("max_turns", "llm_error", "error"):
                raise
            status = stop.status
        used = self.totals.by_agent.get(name, {})
        tokens = (used.get("prompt_tokens") or 0) + (used.get("completion_tokens") or 0)
        self.info(self.turn, "subagent_end", {"agent": name, "status": status, "turns": sub.turn, "tokens": tokens})
        if status != "ok":
            partial = next((m.get("content") for m in reversed(sub_messages) if m.get("role") == "assistant" and m.get("content")), None)
            message = f"子 Agent 未完成（{status}）"
            return ToolOutcome(content=json.dumps({"error": message, "partial": partial}, ensure_ascii=False), error=message)
        content, truncated = _truncate(answer, DELEGATE.max_chars)
        return ToolOutcome(content=content, truncated=truncated)

    def prepare_hooks(self) -> None:
        if self.config.memory and self.deps.memory is not None:
            self.memories = list(self.deps.memory.recall(self.question))
            self.info(0, "memory_recalled", {"items": self.memories})
        if self.config.learned_rules and self.deps.rules is not None:
            self.rules = list(self.deps.rules.active())
            self.info(0, "rules_applied", {"items": self.rules})

    def loop(self, history: list[dict[str, Any]], question_index: int) -> str:
        cfg = self.config
        base_prompt = SUBAGENT_PROMPT if self.is_sub else (self.deps.system_prompt or system_prompt_for(self.registry().names()))
        while self.turn < cfg.max_turns:
            self.turn += 1
            turn = self.turn
            if self.cancel.is_set():
                raise _Stop("cancelled")
            history[:] = maybe_summarize(self, history, question_index, turn)
            context = build_context(
                ContextInputs(
                    system_prompt=build_system_prompt(base_prompt, cfg, self.memories, self.rules),
                    history=history, question_index=question_index, config=cfg, state=self.state,
                    turn=turn, tokens_used=self.totals.tokens_used,
                )
            )
            for note in context.notes:
                self.info(turn, note["kind"], note["detail"])
            final = cfg.final_answer and turn >= cfg.max_turns
            response = self.call_model(turn, context.messages, None if final else self.tool_definitions())
            history.append(_assistant_for_history(response.message))
            if final:
                # 最后一轮不再给工具：已有材料必须变成回答，避免整轮白跑。
                text = response.message.get("content") or ""
                if text.strip():
                    return text
                self.check_budget()
                raise _Stop("max_turns", f"最后一轮没有给出回答（轮数上限 {cfg.max_turns}）")
            self.check_budget()
            calls = response.message.get("tool_calls") or []
            if not calls:
                return response.message.get("content") or ""
            self.run_tools(turn, calls, history)
        raise _Stop("max_turns", f"达到最大轮数 {cfg.max_turns}")

    def ask_reviewer(self, round_no: int, messages: list[dict[str, Any]]) -> Verdict | None:
        """调用审核者；输出无法解析时提醒后重试一次。出错或仍无法解析返回 None（按通过处理，并记录）。"""
        for attempt in (1, 2):
            try:
                response = self.call_model(self.turn, messages, None, purpose="review", agent=REVIEWER)
            except _Stop as stop:
                if stop.status not in ("llm_error", "error"):
                    raise
                self.info(self.turn, "review_failed", {"round": round_no, "error": stop.error}, agent=REVIEWER)
                return None
            self.check_budget()
            raw = response.message.get("content") or ""
            verdict = parse_verdict(raw)
            if verdict is not None:
                return verdict
            kind = "review_retry" if attempt == 1 else "review_unparsed"
            self.info(self.turn, kind, {"round": round_no, "raw": raw[:2000]}, agent=REVIEWER)
            messages = [*messages, RETRY_MESSAGE]
        return None

    def review(self, history: list[dict[str, Any]], question_index: int, answer: str) -> str:
        """第 10 章提议者-审核者：审核者通过就结束；退回则意见交回主 Agent 继续，最多 review_rounds 次。"""
        cfg = self.config
        for round_no in range(1, cfg.review_rounds + 1):
            check = self.deps.checker.check(parse_citations(answer))
            messages = review_messages(cfg.reviewer, self.question, answer, check)  # type: ignore[arg-type]
            verdict = self.ask_reviewer(round_no, messages)
            if verdict is None:
                return answer
            detail = {"round": round_no, "mode": cfg.reviewer, "verdict": verdict.verdict, "issues": list(verdict.issues)}
            self.info(self.turn, "review_verdict", detail, agent=REVIEWER)
            if verdict.verdict == "pass":
                return answer
            history.append(feedback_message(verdict))
            previous = answer
            try:
                answer = self.loop(history, question_index)
            except _Stop as stop:
                if stop.status != "max_turns":
                    raise
                # 修改没能在轮数内完成：保留上一版完整回答，并如实记录。
                self.info(self.turn, "revision_incomplete", {"round": round_no, "status": stop.status})
                return previous
        return answer


def run_agent(
    deps: AgentDeps,
    question: str,
    config: AgentConfig,
    *,
    run_id: str,
    emit: Emit,
    session_history: list[dict[str, Any]] | tuple = (),
    session_id: str | None = None,
    meta: dict[str, Any] | None = None,
    cancel: threading.Event | None = None,
    prelude: str | None = None,
    images: list[str] | None = None,
) -> RunOutcome:
    emit(
        RunStart(
            run_id=run_id, question=question, config=config.model_dump(mode="json"), config_hash=config_hash(config),
            git_sha=deps.git_sha, session_id=session_id, meta=meta or {},
        )
    )
    try:
        run = _Run(deps, question, config, run_id, emit, cancel)
    except KeyError as error:
        message = f"配置中有未知工具：{error}"
        emit(RunEnd(status="error", error=message))
        return RunOutcome(run_id, "error", None)
    history = [*session_history]
    if prelude:
        history.append({"role": "user", "content": prelude})
    question_index = len(history)
    content: Any = question
    if images:
        content = [
            {"type": "text", "text": question},
            *({"type": "image_url", "image_url": {"url": image}} for image in images),
        ]
    history.append({"role": "user", "content": content})
    status, answer, error = "ok", None, None
    try:
        run.prepare_hooks()
        answer = run.loop(history, question_index=question_index)
        if config.reviewer != "none":
            answer = run.review(history, question_index, answer)
    except _Stop as stop:
        status, error = stop.status, stop.error
    check = deps.checker.check(parse_citations(answer or ""))
    citations = [item.to_dict() for item in check.items]
    if status == "ok" and config.memory and deps.memory is not None and answer:
        deps.memory.remember(question, answer)
        run.info(0, "memory_saved", {"question": question})
    totals = run.totals.to_dict(turns=sum(1 for m in history if m.get("role") == "assistant"))
    emit(RunEnd(status=status, answer=answer, citations=citations, citation_check=check.summary, totals=totals, error=error))
    return RunOutcome(run_id, status, answer, citations, totals)
