"""命令行入口。

    python3 -m harness chat   --model real [--workspace DIR] [--rules FILE] [--interactive]
    python3 -m harness evals  --model fake|real [--rules FILE]
    python3 -m harness memory rebuild|list [--workspace DIR]   （S7）

真模型的地址/模型名/密钥一律读环境变量 HARNESS_BASE_URL / HARNESS_MODEL / HARNESS_API_KEY。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .loop import Agent, HarnessConfig, default_tools
from .models import FakeModel, OpenAICompatModel
from .permissions import Decision, RuleEngine


def build_model(name: str, args) -> object:
    if name == "fake":
        return FakeModel()
    if name == "real":
        return OpenAICompatModel()
    raise SystemExit(f"--model 只支持 fake|real，得到: {name}")


def build_config(args) -> HarnessConfig:
    cfg = HarnessConfig()
    if args.interactive:
        def on_ask(event, decision: Decision) -> bool:
            print(f"\n[需要确认] {event.tool} {event.args}\n原因: {decision.reason or '未说明'}")
            return input("允许执行? [y/N] ").strip().lower() == "y"
        cfg.on_ask = on_ask
    return cfg


def cmd_chat(args) -> int:
    ws = Path(args.workspace or Path.cwd()).resolve()
    ws.mkdir(parents=True, exist_ok=True)
    cfg = build_config(args)
    hooks = [RuleEngine.from_file(args.rules)] if args.rules else []
    agent = Agent(build_model(args.model, args), default_tools(ws, cfg),
                  workspace=ws, config=cfg, hooks=hooks)
    print(f"mini-harness | 工作区: {ws} | 模型: {args.model} | 规则: {args.rules or '无'} | Ctrl-C 退出")
    while True:
        try:
            user = input("\n你> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not user:
            continue
        if user in {"exit", "quit", "q"}:
            return 0
        result = agent.run(user)
        print(f"\nassistant> {result.content or '(无文本回复)'}")
        print(f"[{result.steps} 步 / {result.tool_calls} 次工具调用 / ≈{result.token_estimate} tokens"
              f" / 压缩 {result.compactions} 次 / {result.stopped_reason}]")


def cmd_evals(args) -> int:
    from .evals import run_evals, render_table

    cfg = build_config(args)
    hooks = [RuleEngine.from_file(args.rules)] if args.rules else []
    if hooks:
        print("注意：evals 加了规则文件，deny 会影响任务通过率（可当负向测试用）")
    model = build_model(args.model, args)
    if args.model == "fake":
        print("== FakeModel eval（验证判分机制，不代表模型能力）==")
    rows = run_evals(model, config=cfg)
    print(render_table(rows))
    return 0 if all(r.passed for r in rows) else 1


def cmd_memory(args) -> int:
    from .memory import list_memory, rebuild_memory

    ws = Path(args.workspace or Path.cwd()).resolve()
    if args.action == "list":
        print(list_memory(ws))
        return 0
    cfg = HarnessConfig()  # 闸门、索引上限都按当前默认配置重新裁决
    try:
        st = rebuild_memory(ws, cfg)
    except ValueError as e:  # 记忆目录被软链到工作区外等：拒绝而不是删到外面去
        print(f"[重建拒绝] {e}", file=sys.stderr)
        return 2
    print(f"重建完成：{st['sessions']} 个会话记录，重放 {st['replayed']} 次 remember → "
          f"正式 {st['memory']} 条、草稿 {st['draft']} 条，跳过 {st['skipped']} 处（坏行/非法条目）；"
          f"写入闸门: {'开' if cfg.memory_gate else '关'}")
    print(list_memory(ws))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="harness", description="mini-harness 教学实验")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p):
        p.add_argument("--model", default="real", choices=["fake", "real"],
                       help="fake=脚本假模型（离线确定性），real=OpenAI 兼容真模型")
        p.add_argument("--rules", help="JSON 规则文件路径（S2），如 rules.example.json")
        p.add_argument("--interactive", action="store_true", help="ask 裁决改为交互确认")

    p_chat = sub.add_parser("chat", help="交互对话")
    p_chat.add_argument("--workspace", help="工作区目录，默认当前目录")
    add_common(p_chat)
    p_chat.set_defaults(func=cmd_chat)

    p_evals = sub.add_parser("evals", help="跑 5 个本地任务的迷你 eval（S6）")
    add_common(p_evals)
    p_evals.set_defaults(func=cmd_evals)

    p_mem = sub.add_parser("memory", help="S7 记忆层：从会话记录重建 / 查看索引与草稿数")
    p_mem.add_argument("action", choices=["rebuild", "list"],
                       help="rebuild=删掉记忆目录（草稿区除外）后从 .harness/sessions/ 重放；list=打印索引")
    p_mem.add_argument("--workspace", help="工作区目录，默认当前目录")
    p_mem.set_defaults(func=cmd_memory)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except RuntimeError as e:  # 真模型连接/HTTP 错误，给出可读信息
        print(f"[运行失败] {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
