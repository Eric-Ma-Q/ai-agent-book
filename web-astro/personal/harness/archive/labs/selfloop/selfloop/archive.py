"""档案库：把每一轮候选连证据一起落盘。

为什么必须有档案（而不是只留最优解）：
  - 单条轨迹一旦退步就回不去；档案里每个候选都可重新采样、可作为下次的父本；
  - 失败候选连同失败原因一起存，是最便宜的"负样本"；
  - 出现分歧时，可以回放任意一轮的证据，判断是真进步还是分数通胀。

落盘结构（默认 .selfloop/runs/<run_id>/）：
  meta.json            运行配置 + 状态
  candidates.jsonl     一行一个候选（分数、闸门、diff 摘要、token）
  snapshots/<id>.py    候选源码
  best.py              当前最优源码
  events.jsonl         事件流（可回放）
"""
from __future__ import annotations

import json
import secrets
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

DEFAULT_ROOT = Path(".selfloop/runs")


def new_id(prefix: str = "c") -> str:
    return f"{prefix}{int(time.time() * 1000) % 10_000_000:07d}{secrets.token_hex(2)}"


@dataclass
class Candidate:
    id: str
    round: int
    parent_id: str | None
    score: float
    verified: bool
    accepted: bool
    rationale: str = ""
    source_path: str = ""
    source_bytes: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    duration_ms: int = 0
    gates: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


class RunStore:
    def __init__(self, root: Path | str = DEFAULT_ROOT):
        self.root = Path(root)

    # ---- 目录 ----
    def run_dir(self, run_id: str) -> Path:
        return self.root / run_id

    def create(self, config: dict) -> str:
        run_id = time.strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(2)
        d = self.run_dir(run_id)
        (d / "snapshots").mkdir(parents=True, exist_ok=True)
        meta = {
            "run_id": run_id,
            "created_at": time.time(),
            "status": "running",
            "stop_reason": None,
            "config": config,
            "round": 0,
            "best_score": 0.0,
            "best_candidate": None,
            "verified": False,
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "plateau_count": 0,
        }
        self._write_meta(run_id, meta)
        (d / "candidates.jsonl").touch()
        (d / "events.jsonl").touch()
        return run_id

    # ---- 读写 ----
    def _write_meta(self, run_id: str, meta: dict) -> None:
        p = self.run_dir(run_id) / "meta.json"
        p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    def read_meta(self, run_id: str) -> dict | None:
        p = self.run_dir(run_id) / "meta.json"
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def update_meta(self, run_id: str, **kw) -> dict:
        meta = self.read_meta(run_id) or {}
        meta.update(kw)
        self._write_meta(run_id, meta)
        return meta

    def append_candidate(self, run_id: str, cand: Candidate) -> None:
        with (self.run_dir(run_id) / "candidates.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(cand), ensure_ascii=False) + "\n")

    def save_source(self, run_id: str, cand_id: str, source: str) -> str:
        p = self.run_dir(run_id) / "snapshots" / f"{cand_id}.py"
        p.write_text(source, encoding="utf-8")
        return str(p)

    def read_source(self, run_id: str, cand_id: str) -> str:
        p = self.run_dir(run_id) / "snapshots" / f"{cand_id}.py"
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def save_best(self, run_id: str, source: str) -> None:
        (self.run_dir(run_id) / "best.py").write_text(source, encoding="utf-8")

    def read_best(self, run_id: str) -> str:
        p = self.run_dir(run_id) / "best.py"
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def candidates(self, run_id: str) -> list[dict]:
        p = self.run_dir(run_id) / "candidates.jsonl"
        if not p.exists():
            return []
        out = []
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return out

    def append_event(self, run_id: str, event: dict) -> None:
        p = self.run_dir(run_id) / "events.jsonl"
        if p.exists():
            with p.open("a", encoding="utf-8") as f:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def list_runs(self) -> list[dict]:
        if not self.root.exists():
            return []
        runs = []
        for d in self.root.iterdir():
            if d.is_dir():
                meta = self.read_meta(d.name)
                if meta:
                    runs.append(
                        {
                            "run_id": meta.get("run_id"),
                            "status": meta.get("status"),
                            "stop_reason": meta.get("stop_reason"),
                            "round": meta.get("round"),
                            "best_score": meta.get("best_score"),
                            "verified": meta.get("verified"),
                            "created_at": meta.get("created_at"),
                            "provider": (meta.get("config") or {}).get("provider"),
                        }
                    )
        return sorted(runs, key=lambda r: r.get("created_at") or 0, reverse=True)
