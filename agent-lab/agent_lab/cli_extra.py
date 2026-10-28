"""对比、评估、确认动作、学习规则等子命令。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Callable

from .config import AgentConfig, Settings, apply_overrides, config_hash, load_config_file

ROWS = [
    ("状态", lambda o: o.status),
    ("轮数", lambda o: o.totals.get("turns")),
    ("工具调用", lambda o: o.totals.get("tool_calls")),
    ("输入 token", lambda o: o.totals.get("prompt_tokens")),
    ("缓存命中率", lambda o: o.totals.get("cache_hit_rate")),
    ("输出 token", lambda o: o.totals.get("completion_tokens")),
    ("耗时 ms", lambda o: o.totals.get("latency_ms")),
    ("参考价成本", lambda o: o.totals.get("reference_cost")),
    ("引用通过/总数", lambda o: f"{sum(c['status'] == 'verified' for c in o.citations)}/{len(o.citations)}"),
]


def _settings(args: argparse.Namespace) -> Settings:
    settings = Settings.load()
    if getattr(args, "book_dir", None):
        settings = settings.model_copy(update={"book_dir_override": Path(args.book_dir)})
    return settings


def _arm_config(base: AgentConfig, path: str | None, sets: list[str] | None, profile: str | None = None) -> AgentConfig:
    cfg = load_config_file(Path(path)) if path else base
    cfg = apply_overrides(cfg, sets or [])
    return cfg.model_copy(update={"model_profile": profile}) if profile else cfg


def cmd_compare(args: argparse.Namespace) -> int:
    from .runtime import Lab

    settings = _settings(args)
    lab = Lab.create(settings)
    base = AgentConfig(model=settings.model)
    configs = [
        _arm_config(base, args.a, args.a_set, getattr(args, "profile", None)),
        _arm_config(base, args.b, args.b_set, getattr(args, "profile", None)),
    ]
    outcomes = [lab.run(args.question, cfg, meta={"source": "compare"}) for cfg in configs]
    diff = {k: (configs[0].model_dump()[k], configs[1].model_dump()[k]) for k in configs[0].model_dump() if configs[0].model_dump()[k] != configs[1].model_dump()[k]}
    print(f"配置差异：{diff or '无'}")
    print(f"{'':<14}{'A':<24}{'B':<24}")
    for label, getter in ROWS:
        print(f"{label:<14}{str(getter(outcomes[0])):<24}{str(getter(outcomes[1])):<24}")
    print(f"\nrun_id：A={outcomes[0].run_id}  B={outcomes[1].run_id}（用 show 查看完整轨迹）")
    return 0


def _client_factory(args: argparse.Namespace, settings: Settings):
    if not (args.record or args.replay):
        return None
    from .llm.cassette import CassetteClient
    from .runtime import default_client

    root = Path(args.record or args.replay)
    real = default_client(settings) if args.record else None

    def make(task, arm, trial):
        path = root / task.id / f"{arm.name}-{config_hash(task.config_for(arm.config))}" / f"{trial}.json"
        return CassetteClient(path, mode="record", inner=real) if args.record else CassetteClient(path, mode="replay")

    return make


def cmd_eval(args: argparse.Namespace) -> int:
    from evals.runner import Arm, EvalRequest, EvalRunner

    from .runtime import Lab

    settings = _settings(args)
    lab = Lab.create(settings)
    base = AgentConfig(model=settings.model)
    arms = [Arm("A", _arm_config(base, args.config, args.set, getattr(args, "profile", None)))]
    if args.b_config or args.b_set:
        arms.append(Arm("B", _arm_config(base, args.b_config, args.b_set, getattr(args, "profile", None))))
    from evals.tasks import TASKS_ROOT

    runner = EvalRunner(
        lab, Path(args.out or settings.data_dir / "evals"), tasks_root=Path(args.tasks_dir) if args.tasks_dir else TASKS_ROOT,
        client_factory=_client_factory(args, settings),
    )
    request = EvalRequest(
        suite=args.suite, arms=tuple(arms), trials=args.trials, label=args.label or "",
        include_regressions=not args.no_regressions, concurrency=args.concurrency,
        max_total_tokens=args.max_total_tokens, task_ids=tuple(args.task) if args.task else None,
    )
    report = runner.run(request)
    from evals.report import render_markdown

    print(render_markdown(report))
    verdicts = {f"{a['name']}/{t['task_id']}": [tr["passed"] for tr in t["trials"]] for a in report["arms"] for t in a["tasks"]}
    if args.record or (args.replay and args.write_expected):
        # 回放的期望判定：自动测试要求回放结果与录制时逐项一致（而不是要求全部通过）
        expected = Path(args.record or args.replay) / "expected.json"
        expected.write_text(json.dumps(verdicts, ensure_ascii=False, indent=1, sort_keys=True), "utf8")
        print(f"期望判定已写入：{expected}")
    elif args.replay and args.check_expected:
        expected = json.loads((Path(args.replay) / "expected.json").read_text("utf8"))
        mismatched = sorted(k for k in expected.keys() | verdicts.keys() if expected.get(k) != verdicts.get(k))
        if mismatched:
            print(f"回放结果与录制时的判定不一致：{mismatched}")
            return 1
        print("回放结果与录制时的判定逐项一致")
    print(f"报告目录：{runner.out_root / report['eval_id']}")
    failed_regressions = any(a["summary"]["regressions_failed"] for a in report["arms"])
    below = args.min_pass_rate is not None and any((a["summary"]["pass_rate"] or 0) < args.min_pass_rate for a in report["arms"])
    return 1 if failed_regressions or below else 0


def cmd_rescore(args: argparse.Namespace) -> int:
    from evals.report import render_markdown
    from evals.rescore import rescore
    from evals.tasks import TASKS_ROOT

    from .runtime import Lab

    settings = _settings(args)
    out_root = Path(args.out or settings.data_dir / "evals")
    source = json.loads((out_root / args.eval_id / "report.json").read_text("utf8"))
    lab = Lab.create(settings)
    report = rescore(source, lab, out_root, tasks_root=Path(args.tasks_dir) if args.tasks_dir else TASKS_ROOT)
    print(render_markdown(report))
    print(f"重新评分自 {args.eval_id}；报告目录：{out_root / report['eval_id']}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    from evals.report import verify_manifest

    from .trace.store import RunStore

    settings = _settings(args)
    problems = verify_manifest(Path(args.eval_dir), RunStore(settings.data_dir))
    print("\n".join(problems) if problems else "manifest 复核通过：报告与全部轨迹的哈希一致")
    return 1 if problems else 0


def cmd_promote(args: argparse.Namespace) -> int:
    from evals.promote import promote

    from .trace.store import RunStore

    result = promote(args.run_id, RunStore(_settings(args).data_dir))
    print(f"已加入回归集：{result['task_id']} → {result['path']}")
    return 0


def cmd_actions(args: argparse.Namespace) -> int:
    from .services import default_services

    gate = default_services(_settings(args))["gate"]
    if args.approve:
        action = gate.approve(args.approve)
    elif args.reject:
        action = gate.reject(args.reject)
    else:
        for a in gate.list(args.status):
            print(f"{a.action_id}  {a.status:<9} {a.kind}  第 {a.payload.get('chapter')} 章  {a.payload.get('after', '')[:30]}")
        return 0
    print(f"{action.action_id}：{action.status}（{action.detail}）")
    return 0 if action.status in ("approved", "rejected") else 1


def cmd_rules(args: argparse.Namespace) -> int:
    from .stores import RulesStore

    store = RulesStore(_settings(args).data_dir)
    if args.activate is not None:
        store.activate(args.activate)
    state = store.state()
    for v in state["versions"]:
        mark = "*" if v["version"] == state["active_version"] else " "
        print(f"{mark} v{v['version']}  {v['source']}  {v['rules']}")
    return 0


def cmd_improve(args: argparse.Namespace) -> int:
    from evals.improve import Improver, adopt
    from evals.runner import EvalRunner

    from .runtime import Lab
    from .stores import RulesStore

    settings = _settings(args)
    lab = Lab.create(settings)
    rules = RulesStore(settings.data_dir)
    candidates = settings.data_dir / "rules_candidates"
    if args.adopt:
        version = adopt(candidates, args.adopt, rules)
        print(f"已采用，规则版本 v{version['version']} 生效：{version['rules']}")
        return 0
    report = json.loads((settings.data_dir / "evals" / args.eval_id / "report.json").read_text("utf8"))
    config = apply_overrides(AgentConfig(), report["arms"][0]["config"])
    improver = Improver(EvalRunner(lab, settings.data_dir / "evals"), rules, lab.client, config.model, candidates)
    candidate = improver.run(report, config, trials=args.trials)
    print(json.dumps({k: candidate[k] for k in ("candidate_id", "status", "rules", "gate")}, ensure_ascii=False, indent=1))
    return 0


def register(sub: Any, add_config_args: Callable, build_config: Callable) -> None:
    compare = sub.add_parser("compare", help="同一问题用两套配置各跑一次并对比")
    compare.add_argument("question")
    compare.add_argument("--a", help="A 的 YAML 配置")
    compare.add_argument("--a-set", action="append", metavar="KEY=VALUE")
    compare.add_argument("--b", help="B 的 YAML 配置")
    compare.add_argument("--b-set", action="append", metavar="KEY=VALUE")
    compare.add_argument("--profile", help="模型档案 id（默认用实验台里设的默认档案）")
    compare.add_argument("--book-dir")
    compare.set_defaults(func=cmd_compare)

    ev = sub.add_parser("eval", help="运行评估任务集")
    ev.add_argument("--suite", required=True)
    ev.add_argument("--trials", type=int, default=3)
    ev.add_argument("--label")
    add_config_args(ev)
    ev.add_argument("--b-config", help="B 臂的 YAML 配置（提供时做 A/B 评估）")
    ev.add_argument("--b-set", action="append", metavar="KEY=VALUE")
    ev.add_argument("--task", action="append", help="只跑指定任务，可重复")
    ev.add_argument("--no-regressions", action="store_true", help="不附带回归任务")
    ev.add_argument("--concurrency", type=int, default=2)
    ev.add_argument("--max-total-tokens", type=int, help="整次评估的 token 预算，超出后跳过剩余试验")
    ev.add_argument("--min-pass-rate", type=float, help="通过率低于该值时以非零状态退出")
    ev.add_argument("--record", metavar="DIR", help="调用真实模型并按任务/臂/试验录制响应")
    ev.add_argument("--replay", metavar="DIR", help="用录制的响应回放")
    ev.add_argument("--check-expected", action="store_true", help="回放时要求判定与 DIR/expected.json 逐项一致")
    ev.add_argument("--write-expected", action="store_true", help="用这次回放的判定更新 DIR/expected.json（验证器改动后使用）")
    ev.add_argument("--out", help="报告输出目录（默认 personal/lab/evals）")
    ev.add_argument("--tasks-dir", help="任务集根目录（默认 agent-lab/evals/tasks）")
    ev.add_argument("--book-dir")
    ev.set_defaults(func=cmd_eval)

    rescore = sub.add_parser("rescore", help="用当前验证器重新判定一次评估的已存轨迹（不调用模型）")
    rescore.add_argument("eval_id")
    rescore.add_argument("--out", help="评估目录根（默认 personal/lab/evals）")
    rescore.add_argument("--tasks-dir")
    rescore.set_defaults(func=cmd_rescore)

    verify = sub.add_parser("verify", help="复核评估报告的 manifest 哈希")
    verify.add_argument("eval_dir")
    verify.set_defaults(func=cmd_verify)

    promote = sub.add_parser("promote", help="把失败的运行加入回归集")
    promote.add_argument("run_id")
    promote.set_defaults(func=cmd_promote)

    actions = sub.add_parser("actions", help="查看或处理待确认动作")
    actions.add_argument("--status", default="pending")
    actions.add_argument("--approve", metavar="ACTION_ID")
    actions.add_argument("--reject", metavar="ACTION_ID")
    actions.set_defaults(func=cmd_actions)

    rules = sub.add_parser("rules", help="查看学习规则版本；--activate 切换版本（回滚）")
    rules.add_argument("--activate", type=int)
    rules.set_defaults(func=cmd_rules)

    improve = sub.add_parser("improve", help="从评估失败中生成候选规则并跑门禁；--adopt 采用候选")
    improve.add_argument("eval_id", nargs="?")
    improve.add_argument("--trials", type=int, default=2)
    improve.add_argument("--adopt", metavar="CANDIDATE_ID")
    improve.set_defaults(func=cmd_improve)
