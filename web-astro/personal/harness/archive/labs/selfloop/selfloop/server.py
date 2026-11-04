"""本地 HTTP 服务：REST + SSE，外加一个零构建的前端。

只绑 127.0.0.1。没有鉴权——这是给本机实验用的，不要暴露到公网。
"""
from __future__ import annotations

import difflib
import json
import mimetypes
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty
from urllib.parse import urlparse

from .archive import RunStore
from .loop import Controller, RunConfig
from .providers import DEFAULT_BASE_URL, DEFAULT_MODEL, OpenAIProposer
from .tasks import TASKS, get_task

WEB_DIR = Path(__file__).parent / "web"


class App:
    def __init__(self, store: RunStore):
        self.store = store
        self.controller = Controller(store)


def _json(handler: BaseHTTPRequestHandler, obj, status: int = 200) -> None:
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _text(handler: BaseHTTPRequestHandler, text: str, status: int = 200, ctype: str = "text/plain; charset=utf-8") -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = "SelfLoop/0.1"

        def log_message(self, fmt, *args):  # 安静一点
            pass

        # ---------------- GET ----------------
        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/" or path == "/index.html":
                return self._static("index.html")
            if path.startswith("/static/"):
                return self._static(path[len("/static/"):])
            if path == "/api/state":
                return _json(self, app.controller.snapshot())
            if path == "/api/events":
                return self._sse()
            if path == "/api/runs":
                return _json(self, app.store.list_runs())
            if path == "/api/tasks":
                return _json(self, [{"id": t.id, "title": t.title, "summary": t.summary} for t in TASKS.values()])
            if path == "/api/config":
                return _json(self, {
                    "default_provider": "mock",
                    "has_key": OpenAIProposer().available(),
                    "base_url": DEFAULT_BASE_URL,
                    "model": DEFAULT_MODEL,
                })
            if path.startswith("/api/run/"):
                return self._load_run(path[len("/api/run/"):])
            if path.startswith("/api/candidate/"):
                parts = path[len("/api/candidate/"):].split("/")
                if len(parts) == 2:
                    return self._candidate(*parts)
            if path == "/api/health":
                return _json(self, {"ok": True, "ts": time.time()})
            return _json(self, {"error": "not found", "path": path}, 404)

        def do_HEAD(self):
            path = urlparse(self.path).path
            if path == "/" or path == "/index.html":
                p = WEB_DIR / "index.html"
            elif path.startswith("/static/"):
                p = WEB_DIR / path[len("/static/"):]
            else:
                self.send_response(404)
                self.end_headers()
                return
            if not p.is_file():
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(str(p))[0] or "application/octet-stream")
            self.send_header("Content-Length", str(p.stat().st_size))
            self.end_headers()

        # ---------------- POST ----------------
        def do_POST(self):
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                return _json(self, {"error": "invalid json"}, 400)

            if path == "/api/start":
                try:
                    cfg = RunConfig(
                        task_id=payload.get("task_id") or "intervalkit",
                        provider=payload.get("provider") or "mock",
                        model=payload.get("model") or None,
                        temperature=float(payload.get("temperature") or 0.2),
                        max_rounds=max(1, min(int(payload.get("max_rounds") or 10), 200)),
                        budget_usd=max(0.0, float(payload.get("budget_usd") or 2.0)),
                        plateau_k=max(1, min(int(payload.get("plateau_k") or 3), 50)),
                        stop_on_verified=bool(payload.get("stop_on_verified", True)),
                        api_key=payload.get("api_key") or None,
                    )
                    get_task(cfg.task_id)
                except Exception as e:  # noqa: BLE001
                    return _json(self, {"error": f"{type(e).__name__}: {e}"}, 400)
                try:
                    run_id = app.controller.start(cfg)
                except Exception as e:  # noqa: BLE001
                    return _json(self, {"error": str(e)}, 409)
                return _json(self, {"run_id": run_id, "config": cfg.to_dict()})

            if path == "/api/pause":
                app.controller.pause()
                return _json(self, app.controller.snapshot())
            if path == "/api/resume":
                app.controller.resume()
                return _json(self, app.controller.snapshot())
            if path == "/api/stop":
                app.controller.stop()
                return _json(self, {"ok": True})
            return _json(self, {"error": "not found"}, 404)

        # ---------------- 内部 ----------------
        def _static(self, rel: str):
            p = (WEB_DIR / rel).resolve()
            if not str(p).startswith(str(WEB_DIR.resolve())) or not p.is_file():
                return _json(self, {"error": "not found"}, 404)
            ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            if p.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            if p.suffix in (".html", ".css", ".js"):
                ctype += "; charset=utf-8" if "charset" not in ctype else ""
            body = p.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _sse(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            q = app.controller.subscribe()
            try:
                # 先补发最近事件，保证刷新页面后能重建现场
                for ev in app.controller.recent_events(60):
                    self._send_sse(ev)
                last_ping = time.time()
                while True:
                    try:
                        ev = q.get(timeout=1.0)
                        self._send_sse(ev)
                    except Empty:
                        if time.time() - last_ping > 10:
                            self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                            last_ping = time.time()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                app.controller.unsubscribe(q)

        def _send_sse(self, ev: dict):
            self.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()

        def _load_run(self, run_id: str):
            meta = app.store.read_meta(run_id)
            if not meta:
                return _json(self, {"error": "run not found"}, 404)
            cands = app.store.candidates(run_id)
            src = app.store.read_best(run_id)
            task = get_task((meta.get("config") or {}).get("task_id") or "intervalkit")
            return _json(self, {
                "meta": meta,
                "candidates": cands,
                "best_source": src,
                "baseline": task.initial_source,
                "readonly": True,
            })

        def _candidate(self, run_id: str, cid: str):
            meta = app.store.read_meta(run_id)
            if not meta:
                return _json(self, {"error": "run not found"}, 404)
            src = app.store.read_source(run_id, cid)
            if not src:
                return _json(self, {"error": "candidate not found"}, 404)
            task = get_task((meta.get("config") or {}).get("task_id") or "intervalkit")
            base = task.initial_source
            diff = "".join(difflib.unified_diff(
                base.splitlines(keepends=True), src.splitlines(keepends=True),
                fromfile="baseline.py", tofile=f"{cid}.py", n=3,
            ))
            cand = next((c for c in app.store.candidates(run_id) if c.get("id") == cid), None)
            return _json(self, {"id": cid, "source": src, "diff": diff, "candidate": cand})

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8791, store: RunStore | None = None) -> None:
    app = App(store or RunStore())
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    httpd.daemon_threads = True
    print(f"SelfLoop 运行在 http://{host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
    finally:
        httpd.server_close()
