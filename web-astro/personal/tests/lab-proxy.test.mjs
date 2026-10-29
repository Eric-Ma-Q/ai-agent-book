import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createLabProxy } from '../lab-proxy.mjs';

let upstream;
let proxy;
let base;
let upstreamClosed;
const seen = [];

before(async () => {
  upstream = createServer((req, res) => {
    seen.push({ url: req.url, method: req.method, host: req.headers.host });
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { ok: 1 } }));
    } else if (req.url.startsWith('/runs') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ echo: JSON.parse(body) }));
      });
    } else if (req.url.startsWith('/stream')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('id: 0\nevent: run_start\ndata: {}\n\n');
      upstreamClosed = new Promise((resolve) => req.on('close', resolve));
      // Keep the stream open; the test checks the first event arrives at once.
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"detail":"Not Found"}');
    }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const middleware = createLabProxy({ target, log: { error() {} } });
  proxy = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418;
      res.end('next');
    }),
  );
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${proxy.address().port}`;
});

after(() => {
  proxy.close();
  upstream.close();
});

test('strips the prefix and forwards GET', async () => {
  const response = await fetch(`${base}/__lab/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { ok: 1 } });
  assert.equal(seen.at(-1).url, '/health');
  assert.match(seen.at(-1).host, /^127\.0\.0\.1:\d+$/);
});

test('forwards POST bodies', async () => {
  const response = await fetch(`${base}/__lab/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: '为什么？' }),
  });
  assert.deepEqual(await response.json(), { echo: { question: '为什么？' } });
});

test('passes upstream status codes through', async () => {
  const response = await fetch(`${base}/__lab/nope`);
  assert.equal(response.status, 404);
});

test('other paths go to next()', async () => {
  const response = await fetch(`${base}/__labx`);
  assert.equal(await response.text(), 'next');
  assert.equal((await fetch(`${base}/book/chapter1/`)).status, 418);
});

test('streams SSE without buffering and aborts upstream on disconnect', async () => {
  const controller = new AbortController();
  const response = await fetch(`${base}/__lab/stream`, { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const reader = response.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event: run_start/);
  controller.abort();
  await upstreamClosed;
});

test('reports an unreachable service as 502 JSON', async () => {
  const middleware = createLabProxy({ target: 'http://127.0.0.1:1', log: { error() {} } });
  const server = createServer((req, res) => middleware(req, res, () => res.end('next')));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/__lab/health`);
  server.close();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /实验台服务未启动/);
});
