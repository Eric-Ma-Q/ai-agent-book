#!/usr/bin/env python3
"""启动 SelfLoop 本地服务。

    python3 run.py                # http://127.0.0.1:8791
    python3 run.py --port 9000
    SELFLOOP_API_KEY=sk-... python3 run.py    # 启用真实模型提议者
"""
from __future__ import annotations

import argparse
from pathlib import Path

from selfloop.archive import RunStore
from selfloop.server import serve

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="SelfLoop：一个可观测的自举改进循环")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8791)
    ap.add_argument("--runs-dir", default=str(Path.cwd() / ".selfloop" / "runs"))
    args = ap.parse_args()
    serve(host=args.host, port=args.port, store=RunStore(args.runs_dir))
