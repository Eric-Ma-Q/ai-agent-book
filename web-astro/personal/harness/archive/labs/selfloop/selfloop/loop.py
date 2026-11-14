"""循环控制器：提议 → 验证 → 闸门 → 归档，直到收敛、超预算或到顶。

它只做三件事，每件都必须可被外部观察：
  1. 每轮产出一个候选，连同**机器证据**（测试结果）一起落盘；
  2. 只有严格变好才接受（提升最优解），否则只入档不改现状——这是防止漂移的关键；
  3. 到顶 / 超预算 / 连续 K 轮无提升 时停，而不是无限跑。

终止条件是写死的代码，不依赖提示词——这一点比什么提示工程都重要。
"""
from __future__ import annotations

import threading
import time
import traceback
from dataclasses import asdict, dataclass, field
from queue import Queue

from .archive import Candidate, RunStore, new_id
from .providers import Proposal, build_prompt, make_proposer
from .tasks import get_task
from .verify import verify_source


@dataclass
class RunConfig:
    task_id: str = "intervalkit"
    provider: str = "mock"
    model: str | None = None
    temperature: float = 0.2
    max_rounds: int = 10
    budget_usd: float = 2.0
    plateau_k: int = 3
    stop_on_verified: bool = True
    api_key: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("api_key", None)  # 密钥绝不落盘、绝不出现在 API 响应里
        return d


@dataclass
class _State:
    run_id: str | None = None
    status: str = "idle"          # idle | running | paused | finished | error
    stop_reason: str | None = None
    round: int = 0
    best_score: float = 0.0
    plateau: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    verified: bool = False
    error: str | None = None
    gates: dict = field(default_factory=dict)


class Controller:
    def __init__(self, store: RunStore):
        self.store = store
        self._lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._resume = threading.Event()
        self._resume.set()
        self._subs: list[Queue] = []
        self._events: list[dict] = []
        self._seq = 0
        self.state = _State()
        self.config = RunConfig()
        self._best_source = ""
        self._best_visible: dict = {}
        self._proposer = None
        self._task = get_task(self.config.task_id)

    # ---------------- 事件 ----------------
    def _emit(self, type_: str, **payload) -> dict:
        with self._lock:
            self._seq += 1
            ev = {"seq": self._seq, "type": type_, "ts": time.time(), **payload}
            self._events.append(ev)
            self._events[:] = self._events[-600:]
            if self.state.run_id:
                try:
                    self.store.append_event(self.state.run_id, ev)
                except OSError:
                    pass
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(ev)
            except Exception:  # noqa: BLE001
                pass
        return ev

    def subscribe(self) -> Queue:
        q: Queue = Queue(maxsize=200)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: Queue) -> None:
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    def recent_events(self, limit: int = 200) -> list[dict]:
        with self._lock:
            return self._events[-limit:]

    # ---------------- 对外状态 ----------------
    def snapshot(self) -> dict:
        with self._lock:
            meta = self.store.read_meta(self.state.run_id) if self.state.run_id else None
            cands = self.store.candidates(self.state.run_id) if self.state.run_id else []
            return {
                "status": self.state.status,
                "stop_reason": self.state.stop_reason,
                "run_id": self.state.run_id,
                "round": self.state.round,
                "best_score": self.state.best_score,
                "plateau": self.state.plateau,
                "tokens_in": self.state.tokens_in,
                "tokens_out": self.state.tokens_out,
                "cost_usd": round(self.state.cost_usd, 6),
                "verified": self.state.verified,
                "error": self.state.error,
                "gates": self.state.gates,
                "config": self.config.to_dict(),
                "candidates": cands,
                "events": self._events[-120:],
                "meta": meta,
                "task": {
                    "id": self._task.id if self._task else self.config.task_id,
                    "title": self._task.title if self._task else "",
                    "summary": self._task.summary if self._task else "",
                    "spec": self._task.spec if self._task else "",
                    "initial_source": self._task.initial_source if self._task else "",
                    "visible_tests": self._task.visible_tests if self._task else "",
                },
            }

    # ---------------- 控制 ----------------
    def start(self, cfg: RunConfig) -> str:
        with self._lock:
            if self.state.status in ("running", "paused"):
                raise RuntimeError("已经有运行中的循环，先停止它")
            self.config = cfg
            self._task = get_task(cfg.task_id)
            self._proposer = make_proposer(cfg.provider, self._task, cfg.model, cfg.temperature, cfg.api_key)
            self._stop.clear()
            self._resume.set()
            self.state = _State(status="running")
            run_id = self.store.create(cfg.to_dict())
            self.state.run_id = run_id
            self._best_source = self._task.initial_source
            self._best_visible = {}
        self._emit("run_started", run_id=run_id, config=cfg.to_dict())
        with self._lock:
            self._thread = threading.Thread(target=self._run, name="selfloop", daemon=True)
            self._thread.start()
        return run_id

    def pause(self) -> None:
        self._resume.clear()
        with self._lock:
            self.state.status = "paused"
            if self.state.run_id:
                self.store.update_meta(self.state.run_id, status="paused")
        self._emit("paused")

    def resume(self) -> None:
        self._resume.set()
        with self._lock:
            self.state.status = "running"
            if self.state.run_id:
                self.store.update_meta(self.state.run_id, status="running")
        self._emit("resumed")

    def stop(self) -> None:
        self._stop.set()
        self._resume.set()

    # ---------------- 主循环 ----------------
    def _run(self) -> None:
        cfg = self.config
        task = self._task
        try:
            self._emit("phase", phase="baseline", message="先给初始实现打分，作为基线")
            baseline = verify_source(task.initial_source, task)
            self._record(0, self.state.run_id, Proposal(source=task.initial_source, rationale="[基线] 未改动的初始实现"),
                         baseline, accepted=True, is_baseline=True)

            for round_no in range(1, cfg.max_rounds + 1):
                if self._stop.is_set():
                    self._finish("stopped")
                    return
                while not self._resume.wait(0.2):
                    if self._stop.is_set():
                        self._finish("stopped")
                        return

                with self._lock:
                    self.state.round = round_no
                self._emit("round_started", round=round_no)

                prompt = build_prompt(task, self._best_source, self.state.best_score,
                                      self._best_visible, self.store.candidates(self.state.run_id or ""))
                self._emit("phase", phase="propose", round=round_no, message="提议者生成候选")

                t0 = time.time()
                prop = self._proposer.propose(prompt, round_no)  # type: ignore[union-attr]
                if prop.error and not prop.source:
                    self._emit("round_failed", round=round_no, error=prop.error)
                    with self._lock:
                        self.state.plateau += 1
                    if self.state.plateau >= cfg.plateau_k:
                        self._finish("plateau")
                        return
                    continue

                self._emit("phase", phase="verify", round=round_no, message="沙箱里跑可见/隐藏/canary")
                res = verify_source(prop.source, task)
                accepted = res.score > self.state.best_score + 1e-9
                cand = self._record(round_no, self.state.run_id, prop, res, accepted=accepted)
                self._emit("candidate", round=round_no, candidate=cand, verify=res.to_dict(),
                           rationale=prop.rationale[:600], accepted=accepted,
                           duration_ms=int((time.time() - t0) * 1000))

                if res.verified and cfg.stop_on_verified:
                    self._finish("verified")
                    return
                if self.state.cost_usd >= cfg.budget_usd:
                    self._finish("budget")
                    return
                if self.state.plateau >= cfg.plateau_k:
                    self._finish("plateau")
                    return

            self._finish("max_rounds")
        except Exception as e:  # noqa: BLE001
            with self._lock:
                self.state.error = f"{type(e).__name__}: {e}"
                self.state.status = "error"
            self._emit("error", error=self.state.error, trace=traceback.format_exc(limit=3)[-1200:])
            self._finish("error")

    def _record(self, round_no: int, run_id: str | None, prop: Proposal, res, *, accepted: bool,
                is_baseline: bool = False) -> dict:
        cid = new_id("b" if is_baseline else "c")
        cost = 0.0 if is_baseline else prop.cost_usd
        with self._lock:
            if accepted:
                self.state.best_score = res.score
                self.state.plateau = 0
                self._best_source = prop.source
                self._best_visible = {
                    "passed": res.visible_passed, "total": res.visible_total,
                    "hidden_passed": res.hidden_passed, "hidden_total": res.hidden_total,
                    "failures": res.visible_failures,
                }
            else:
                self.state.plateau += 1
            self.state.tokens_in += prop.tokens_in
            self.state.tokens_out += prop.tokens_out
            self.state.cost_usd += cost
            self.state.verified = self.state.verified or res.verified
            self.state.gates = {
                "integrity_ok": res.integrity_ok,
                "canary_ok": res.canary_ok,
                "verified": res.verified,
                "hidden_passed": res.hidden_passed,
                "hidden_total": res.hidden_total,
                "visible_passed": res.visible_passed,
                "visible_total": res.visible_total,
                "integrity_issues": res.integrity_issues,
                "warnings": res.warnings,
            }

        cand = Candidate(
            id=cid, round=round_no, parent_id=None, score=res.score, verified=res.verified,
            accepted=accepted, rationale=prop.rationale[:800], source_bytes=res.source_bytes,
            tokens_in=prop.tokens_in, tokens_out=prop.tokens_out, cost_usd=cost,
            duration_ms=res.duration_ms, gates=res.to_dict(),
        )
        if run_id:
            cand.source_path = self.store.save_source(run_id, cid, prop.source)
            self.store.append_candidate(run_id, cand)
            if accepted:
                self.store.save_best(run_id, prop.source)
            self.store.update_meta(
                run_id,
                round=round_no,
                best_score=round(self.state.best_score, 4),
                best_candidate=cid if accepted else (self.store.read_meta(run_id) or {}).get("best_candidate"),
                verified=self.state.verified,
                plateau_count=self.state.plateau,
                tokens_in=self.state.tokens_in,
                tokens_out=self.state.tokens_out,
                cost_usd=round(self.state.cost_usd, 6),
            )
        return asdict(cand)

    def _finish(self, reason: str) -> None:
        with self._lock:
            self.state.status = "finished"
            self.state.stop_reason = reason
            if self.state.run_id:
                self.store.update_meta(self.state.run_id, status="finished", stop_reason=reason,
                                       verified=self.state.verified, best_score=round(self.state.best_score, 4))
        self._emit("finished", reason=reason, best_score=self.state.best_score, verified=self.state.verified)
