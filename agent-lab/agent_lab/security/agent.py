"""一次提示注入试验里的单个 Agent 会话。"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from ..config import AgentConfig
from ..llm.client import ChatClient, ChatRequest, LLMError
from ..llm.pricing import Price, cost_of
from ..trace.schema import Info, LlmRequest, LlmResponse, RunEnd, RunStart, ToolCall
from ..trace.store import RunStore, new_run_id
from ..trace.tokens import segment_tokens
from ..totals import Totals
from .catalog import ATTACKER_EMAIL, MAX_STEPS_PER_TURN, MAX_TOOL_RESULT_CHARS, MAX_TRIAL_TOKENS, AttackSpec, DefenseSpec
from .prompts import build_system_prompt
from .tools import MockToolbox, ToolExecution, TrialWorkspace

Emit = Callable[[Any], Any]


def _truncate(text: str, limit: int = MAX_TOOL_RESULT_CHARS) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit] + f"\n…（已截断，共 {len(text)} 字）", True


def _assistant_for_history(message: dict[str, Any]) -> dict[str, Any]:
    kept: dict[str, Any] = {"role": "assistant", "content": message.get("content")}
    if message.get("tool_calls"):
        kept["tool_calls"] = message["tool_calls"]
    if message.get("reasoning_content"):
        kept["reasoning_content"] = message["reasoning_content"]
    return kept


def security_config(config: AgentConfig, attack: str, defense: str, trial: int, session: int, protocol: str) -> dict[str, Any]:
    data = config.model_dump(mode="json")
    data["security"] = {
        "protocol": protocol,
        "attack": attack,
        "defense": defense,
        "trial": trial,
        "session": session,
    }
    return data


def security_config_hash(data: dict[str, Any]) -> str:
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf8")).hexdigest()[:12]


@dataclass
class SessionResult:
    run_id: str
    status: str
    final_text: str
    turns: int
    totals: dict[str, Any]
    executions: list[ToolExecution] = field(default_factory=list)
    error: str | None = None


class SecurityAgent:
    """一个会话：系统提示 → 若干用户轮 → 模型 / 工具循环。"""

    def __init__(
        self,
        *,
        client: ChatClient,
        config: AgentConfig,
        defense: DefenseSpec,
        attack: AttackSpec,
        workspace: TrialWorkspace,
        store: RunStore,
        campaign_id: str,
        trial: int,
        session: int,
        protocol: str,
        price: Price | None,
        request_extra: dict[str, Any] | None = None,
        git_sha: str | None = None,
        cancel: threading.Event | None = None,
        run_id: str | None = None,
        on_event: Emit | None = None,
    ):
        self.client = client
        self.config = config
        self.defense = defense
        self.attack = attack
        self.workspace = workspace
        self.store = store
        self.campaign_id = campaign_id
        self.trial = trial
        self.session = session
        self.protocol = protocol
        self.price = price
        self.request_extra = request_extra or {}
        self.git_sha = git_sha
        self.cancel = cancel or threading.Event()
        self.run_id = run_id or new_run_id()
        self.on_event = on_event
        self.totals = Totals(price)
        self.turns = 0
        self.toolbox = MockToolbox(workspace, defense)

    def emit(self, event: Any) -> Any:
        stamped = self.store.append(self.run_id, event)
        if self.on_event:
            self.on_event(stamped)
        return stamped

    def info(self, turn: int, kind: str, detail: dict[str, Any]) -> None:
        self.emit(Info(turn=turn, kind=kind, detail=detail))

    def run(self, user_messages: list[str]) -> SessionResult:
        config_data = security_config(self.config, self.attack.id, self.defense.id, self.trial, self.session, self.protocol)
        memories = self.workspace.memory()
        self.emit(
            RunStart(
                run_id=self.run_id,
                question=user_messages[0] if user_messages else "",
                config=config_data,
                config_hash=security_config_hash(config_data),
                git_sha=self.git_sha,
                meta={
                    "source": "security",
                    "campaign_id": self.campaign_id,
                    "attack": self.attack.id,
                    "defense": self.defense.id,
                    "trial": self.trial,
                    "session": self.session,
                },
            )
        )
        self.info(0, "security_defense", {
            "defense": self.defense.id,
            "prompt_hardening": self.defense.prompt_hardening,
            "source_tagging": self.defense.source_tagging,
            "runtime_guard": self.defense.runtime_guard,
        })
        if memories:
            self.info(0, "security_memory_loaded", {"count": len(memories), "poisoned": any(ATTACKER_EMAIL.lower() in str(item.get("content", "")).lower() for item in memories)})

        messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt(self.defense, memories)}]
        final_text = ""
        status = "ok"
        error: str | None = None
        tools = self.toolbox.definitions()

        try:
            for user_text in user_messages:
                if self.cancel.is_set():
                    status = "cancelled"
                    break
                messages.append({"role": "user", "content": user_text})
                finished_turn = False
                for _ in range(MAX_STEPS_PER_TURN):
                    if self.cancel.is_set():
                        status = "cancelled"
                        break
                    if self.totals.tokens_used > MAX_TRIAL_TOKENS:
                        status = "budget_exceeded"
                        error = f"已用 {self.totals.tokens_used} token，超过上限 {MAX_TRIAL_TOKENS}"
                        break

                    self.turns += 1
                    turn = self.turns
                    self.emit(
                        LlmRequest(
                            turn=turn,
                            purpose="agent",
                            messages=messages,
                            tools=tools,
                            segments=segment_tokens(messages, tools),
                        )
                    )
                    request = ChatRequest(
                        model=self.config.model,
                        messages=messages,
                        tools=tools,
                        temperature=self.config.temperature,
                        max_tokens=self.config.max_output_tokens,
                        extra=self.request_extra,
                    )
                    try:
                        response = self.client.complete(request)
                    except LLMError as exc:
                        self.emit(LlmResponse(turn=turn, purpose="agent", error=str(exc), retries=[r.model_dump() for r in exc.retries]))
                        status = "llm_error"
                        error = str(exc)
                        break
                    except Exception as exc:  # noqa: BLE001 - 回放缺失等边界错误
                        self.emit(LlmResponse(turn=turn, purpose="agent", error=f"{type(exc).__name__}: {exc}"))
                        status = "error"
                        error = f"{type(exc).__name__}: {exc}"
                        break

                    cost = cost_of(response.usage, self.price)
                    self.emit(
                        LlmResponse(
                            turn=turn,
                            purpose="agent",
                            message=response.message,
                            usage=response.usage.model_dump(),
                            latency_ms=response.latency_ms,
                            cost=cost,
                            retries=[r.model_dump() for r in response.retries],
                            model=response.model,
                            finish_reason=response.finish_reason,
                        )
                    )
                    self.totals.add_llm(response.usage, response.latency_ms, cost, None)

                    message = response.message or {}
                    messages.append(_assistant_for_history(message))
                    calls = message.get("tool_calls") or []
                    if not calls:
                        final_text = str(message.get("content") or "")
                        finished_turn = True
                        break

                    for call in calls:
                        function = call.get("function") or {}
                        name = str(function.get("name") or "")
                        raw_args = function.get("arguments") or "{}"
                        try:
                            args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
                            if not isinstance(args, dict):
                                args = {}
                        except (json.JSONDecodeError, TypeError, ValueError):
                            args = {}

                        started = time.monotonic()
                        execution = self.toolbox.execute(name, args, user_text)
                        duration_ms = int((time.monotonic() - started) * 1000)
                        self.totals.tool_calls += 1
                        result, truncated = _truncate(execution.result)
                        self.emit(
                            ToolCall(
                                turn=turn,
                                call_id=str(call.get("id") or ""),
                                name=name,
                                args=json.dumps(args, ensure_ascii=False),
                                result=result,
                                truncated=truncated,
                                duration_ms=duration_ms,
                                error=execution.error,
                            )
                        )
                        if execution.blocked:
                            target = str(args.get("path" if name == "write_file" else "to", ""))
                            self.info(turn, "security_guard_blocked", {"tool": name, "target": target, "reason": "runtime_guard"})
                        messages.append({"role": "tool", "tool_call_id": str(call.get("id") or ""), "content": result})

                    if status != "ok":
                        break
                if status != "ok" or not finished_turn:
                    if status == "ok":
                        status = "max_turns"
                        error = f"单个用户轮超过 {MAX_STEPS_PER_TURN} 个模型步"
                    break
        except Exception as exc:  # noqa: BLE001 - 任何未预期错误都要落一条 run_end
            status = "error"
            error = f"{type(exc).__name__}: {exc}"

        totals = self.totals.to_dict(self.turns)
        self.emit(
            RunEnd(
                status=status,
                answer=final_text or None,
                citations=[],
                citation_check={},
                totals=totals,
                error=error,
            )
        )
        return SessionResult(
            run_id=self.run_id,
            status=status,
            final_text=final_text,
            turns=self.turns,
            totals=totals,
            executions=self.toolbox.executions,
            error=error,
        )
