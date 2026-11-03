"""命令行入口：python -m agent_lab <子命令>。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable

from .config import AgentConfig, Settings, apply_overrides, load_config_file
from .render import render_event, render_run

Command = Callable[[argparse.Namespace], int]


def build_config(args: argparse.Namespace, settings: Settings) -> AgentConfig:
    cfg = (
        load_config_file(Path(args.config))
        if getattr(args, "config", None)
        else AgentConfig(model=settings.model, max_output_tokens=settings.max_output_tokens)
    )
    cfg = apply_overrides(cfg, args.set or [])
    profile = getattr(args, "profile", None)
    return cfg.model_copy(update={"model_profile": profile}) if profile else cfg


def _lab(settings: Settings, args: argparse.Namespace | None = None):
    from .runtime import Lab, default_client

    client = None
    if args is not None and (getattr(args, "record", None) or getattr(args, "replay", None)):
        from .llm.cassette import CassetteClient

        if args.record:
            client = CassetteClient(Path(args.record), mode="record", inner=default_client(settings))
        else:
            client = CassetteClient(Path(args.replay), mode="replay")
    return Lab.create(settings, client=client)


def cmd_ask(args: argparse.Namespace) -> int:
    settings = Settings.load()
    cfg = build_config(args, settings)
    lab = _lab(settings, args)

    def live(event) -> None:
        for line in render_event(event):
            print(line, flush=True)

    outcome = lab.run(args.question, cfg, session_id=args.session, on_event=None if args.quiet else live)
    if args.quiet:
        print(outcome.answer or "")
    print(f"\nrun_id: {outcome.run_id}", file=sys.stderr)
    return 0 if outcome.status == "ok" else 1


def cmd_show(args: argparse.Namespace) -> int:
    from .trace.store import RunStore

    store = RunStore(Settings.load().data_dir)
    events = store.read(args.run_id)
    if args.json:
        print(json.dumps([e.model_dump(mode="json") for e in events], ensure_ascii=False, indent=1))
    else:
        print(render_run(events))
    return 0


def cmd_runs(args: argparse.Namespace) -> int:
    from .trace.store import RunStore

    for run in RunStore(Settings.load().data_dir).list_runs(limit=args.limit):
        print(f"{run['run_id']}  {run['status']:<16} {run['model'] or '':<24} {(run['question'] or '')[:50]}")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .server import create_app

    uvicorn.run(create_app(Settings.load()), host=args.host, port=args.port, log_level="info")
    return 0


def _add_config_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="YAML 配置文件")
    parser.add_argument("--set", action="append", metavar="KEY=VALUE", help="覆盖配置项，可重复")
    parser.add_argument("--profile", help="模型档案 id（默认用实验台里设的默认档案）")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="agent_lab", description="书本助教 Agent 实验台")
    sub = root.add_subparsers(dest="command", required=True)

    ask = sub.add_parser("ask", help="提问并实时打印轨迹")
    ask.add_argument("question")
    ask.add_argument("--session", help="会话 id：同一会话会带上以前的问答")
    ask.add_argument("--quiet", action="store_true", help="只打印最终回答")
    ask.add_argument("--record", metavar="CASSETTE", help="调用真实模型并把响应录制到文件")
    ask.add_argument("--replay", metavar="CASSETTE", help="用录制的响应回放，不访问模型接口")
    _add_config_args(ask)
    ask.set_defaults(func=cmd_ask)

    show = sub.add_parser("show", help="按轮次打印一次运行")
    show.add_argument("run_id")
    show.add_argument("--json", action="store_true")
    show.set_defaults(func=cmd_show)

    runs = sub.add_parser("runs", help="列出最近的运行")
    runs.add_argument("--limit", type=int, default=20)
    runs.set_defaults(func=cmd_runs)

    serve = sub.add_parser("serve", help="启动 HTTP 服务")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=4330)
    serve.set_defaults(func=cmd_serve)

    from .security.cli import register as register_security

    register_security(sub)
    from .cli_extra import register

    register(sub, _add_config_args, build_config)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, FileNotFoundError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 2
