// Dev-only proxy: /__lab/* → the agent-lab service (Python, default
// http://127.0.0.1:4330). The prefix is stripped; SSE responses stream through
// unbuffered, and a client that goes away aborts the upstream request.
import http from 'node:http';

export const LAB_PREFIX = '/__lab';
const DEFAULT_TARGET = 'http://127.0.0.1:4330';
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'host']);

function forwardHeaders(headers, host) {
  const out = { host };
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) out[name] = value;
  }
  return out;
}

function unavailable(res, target, error) {
  const message = `实验台服务未启动或无法连接（${target}）：${error.code ?? error.message}。在 agent-lab 目录运行 uv run python -m agent_lab serve 后刷新。`;
  res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ success: false, data: null, error: message }));
}

/** Connect-style middleware; `target` defaults to $LAB_URL. */
export function createLabProxy({ target = process.env.LAB_URL ?? DEFAULT_TARGET, log = console } = {}) {
  const base = new URL(target);
  const basePath = base.pathname.replace(/\/$/, '');
  return (req, res, next) => {
    const url = req.url ?? '';
    if (url !== LAB_PREFIX && !url.startsWith(`${LAB_PREFIX}/`) && !url.startsWith(`${LAB_PREFIX}?`)) return next();
    const path = url.slice(LAB_PREFIX.length) || '/';
    const upstream = http.request(
      {
        hostname: base.hostname,
        port: base.port || 80,
        path: `${basePath}${path.startsWith('/') ? path : `/${path}`}`,
        method: req.method,
        headers: forwardHeaders(req.headers, base.host),
      },
      (response) => {
        const headers = { ...response.headers };
        if (String(headers['content-type'] ?? '').startsWith('text/event-stream')) {
          headers['cache-control'] = 'no-cache';
          headers['x-accel-buffering'] = 'no';
        }
        res.writeHead(response.statusCode ?? 502, headers);
        res.flushHeaders?.();
        response.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error.code !== 'ECONNRESET') log.error?.(`lab proxy: ${error.message}`);
      unavailable(res, target, error);
    });
    // The browser closed the tab or the EventSource: stop the upstream stream.
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  };
}
