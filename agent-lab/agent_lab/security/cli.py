"""命令行：跑一次提示注入矩阵。"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from ..config import Settings
from ..runtime import Lab
from .campaign import CampaignRequest, SecurityConfig, SecurityService
from .catalog import ATTACKS, DEFENSES


def _selection(raw: str, items: tuple) -> list[str]:
    if not raw or raw.strip().lower() in ("all", "全部"):
        return [item.id for item in items]
    chosen: list[str] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        lowered = token.lower()
        found = [item for item in items if item.id.lower() == lowered or lowered in item.name.lower()]
        if len(found) != 1:
            raise SystemExit(f"无法唯一识别「{token}」，可选：{', '.join(item.id for item in items)}")
        if found[0].id not in chosen:
            chosen.append(found[0].id)
    return chosen


def cmd_injection(args: argparse.Namespace) -> int:
    if args.list:
        for item in ATTACKS:
            print(f"{item.id:<10} {item.name}：{item.summary}")
        print()
        for item in DEFENSES:
            print(f"{item.id:<4} {item.name}：{item.summary}")
        return 0
    settings = Settings.load()
    lab = Lab.create(settings)
    service = SecurityService(lab, workers=args.workers)
    request = CampaignRequest(
        attacks=_selection(args.attacks, ATTACKS),
        defenses=_selection(args.defenses, DEFENSES),
        trials=args.trials,
        label=args.label,
        config=SecurityConfig(model_profile=args.profile or "", temperature=args.temperature),
    )
    campaign_id = service.start(request)
    print(f"campaign {campaign_id} 已启动，等待完成……", flush=True)
    while True:
        report = service.get(campaign_id)
        if report.status in ("done", "cancelled", "failed", "interrupted"):
            break
        time.sleep(0.5)
    print("攻击 \\ 防御".ljust(14) + "".join(f"{item.name:>16}" for item in DEFENSES if item.id in report.selection["defenses"]))
    for attack in ATTACKS:
        if attack.id not in report.selection["attacks"]:
            continue
        row = attack.name.ljust(12)
        for defense in DEFENSES:
            if defense.id not in report.selection["defenses"]:
                continue
            cell = next((item for item in report.cells if item.attack == attack.id and item.defense == defense.id), None)
            row += f"{(f'{cell.successes}/{cell.done}' if cell and cell.done else '—'):>16}"
        print(row)
    print(f"\n状态：{report.status}；轨迹条数：{report.totals.get('runs', 0)}；成本：{report.totals.get('cost', 0)}")
    if args.output:
        Path(args.output).write_text(report.model_dump_json(indent=2) + "\n", encoding="utf8")
        print(f"报告已写入 {args.output}")
    return 0 if report.status == "done" else 1


def register(sub: argparse._SubParsersAction) -> None:
    parser = sub.add_parser("injection", help="跑提示注入攻防矩阵（3 攻击 × 4 防御）")
    parser.add_argument("--attacks", default="all", help="攻击 id 或名称子串，逗号分隔；默认 all")
    parser.add_argument("--defenses", default="all", help="防御 id，逗号分隔；默认 all")
    parser.add_argument("--trials", type=int, default=1, choices=range(1, 6), metavar="N")
    parser.add_argument("--profile", help="模型档案 id")
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--label", default="")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--output", help="额外保存报告 JSON")
    parser.add_argument("--list", action="store_true", help="离线列出攻击与防御")
    parser.set_defaults(func=cmd_injection)
