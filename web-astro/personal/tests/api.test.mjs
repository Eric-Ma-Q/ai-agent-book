import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalApi } from '../api.mjs';

const KEY = 'ai-agents-in-depth:en:chapter1';
const ROOT = mkdtempSync(join(tmpdir(), 'personal-api-'));
const BOOK = mkdtempSync(join(tmpdir(), 'personal-api-book-'));
let server;
let base;
const errors = [];

before(async () => {
  mkdirSync(join(BOOK, 'chapter7/android-world'), { recursive: true });
  mkdirSync(join(BOOK, 'personal/notes'), { recursive: true });
  writeFileSync(join(BOOK, 'chapter7/README.md'), '# 章节实验\n');
  writeFileSync(join(BOOK, 'chapter7/android-world/README.md'), '# 实验目录\n');
  writeFileSync(join(BOOK, 'chapter7/android-world/t3a_failed.md'), '# fail\n');
  writeFileSync(join(BOOK, 'personal/notes/secret.json'), '{"token":"nope"}');
  writeFileSync(join(BOOK, 'image.png'), Buffer.from([137, 80, 78, 71]));
  const api = createPersonalApi({
    root: ROOT,
    render: async (markdown) => `<p>${markdown.trim()}</p>`,
    bookRoot: BOOK,
    log: { error: (message) => errors.push(message) },
  });
  server = createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 418;
      res.end('next');
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (path, body, headers = {}) =>
  fetch(`${base}/__personal${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-personal-api': '1',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test('passes other paths to the next handler', async () => {
  const response = await fetch(`${base}/book/chapter1/`);
  assert.equal(response.status, 418);
});

test('requires the custom header so other sites cannot write', async () => {
  const response = await call('/notes/put', { chapter: KEY, items: [] }, { 'x-personal-api': '0' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).ok, false);
});

test('requires JSON for writes', async () => {
  const response = await fetch(`${base}/__personal/notes/put`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(response.status, 415);
});

test('round-trips a highlight through the HTTP API', async () => {
  const item = {
    id: 'h1',
    chapter: KEY,
    quote: 'loop',
    prefix: '',
    suffix: '',
    start: 0,
    end: 4,
    createdAt: '2026-10-04T00:00:00.000Z',
  };
  assert.equal((await call('/notes/put', { chapter: KEY, items: [item] })).status, 200);
  await call('/notes/patch', { chapter: KEY, id: 'h1', patch: { note: 'n' } });
  const listed = await (await call(`/notes?chapter=${encodeURIComponent(KEY)}`)).json();
  assert.deepEqual(listed, { ok: true, data: [{ ...item, note: 'n' }] });
  const removed = await (await call('/notes/remove', { chapter: KEY, id: 'h1' })).json();
  assert.equal(removed.data.id, 'h1');
});

test('saves inserts and returns rendered HTML', async () => {
  const saved = await (
    await call('/inserts/save', { chapter: KEY, insert: { markdown: 'mine', after: 'a', section: '', offset: 0 } })
  ).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.data.html, '<p>mine</p>');
  const listed = await (await call(`/inserts?chapter=${encodeURIComponent(KEY)}`)).json();
  assert.equal(listed.data.length, 1);
  await call('/inserts/remove', { chapter: KEY, id: saved.data.id });
  assert.equal((await (await call(`/inserts?chapter=${encodeURIComponent(KEY)}`)).json()).data.length, 0);
});

test('reports validation errors as 400 with a message', async () => {
  const response = await call('/notes?chapter=bad');
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid chapter key/);
});

test('rejects malformed JSON and unknown routes', async () => {
  const bad = await fetch(`${base}/__personal/notes/put`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(bad.status, 400);
  assert.equal((await call('/nope')).status, 404);
});

test('hides unexpected error details from the response but logs them', async () => {
  // A regular file as the root makes every write fail with ENOTDIR.
  const root = join(mkdtempSync(join(tmpdir(), 'personal-api-')), 'file');
  writeFileSync(root, '');
  const api = createPersonalApi({
    root,
    render: async () => '',
    log: { error: (message) => errors.push(message) },
  });
  const broken = createServer((req, res) => api(req, res, () => res.end()));
  await new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${broken.address().port}/__personal/inserts/save`,
      {
        method: 'POST',
        headers: { 'x-personal-api': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ chapter: KEY, insert: { markdown: 'x' } }),
      },
    );
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /dev server log/);
    assert.ok(errors.some((message) => message.includes('/inserts/save')));
  } finally {
    broken.close();
  }
});

test('lists highlights of all chapters and requires the header', async () => {
  const item = {
    id: 'h2',
    chapter: KEY,
    quote: 'tools',
    prefix: '',
    suffix: '',
    start: 0,
    end: 5,
    createdAt: '2026-10-04T00:00:00.000Z',
  };
  await call('/notes/put', { chapter: KEY, items: [item] });
  const listed = await (await call('/highlights')).json();
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.data.highlights.map(({ id, chapterNumber }) => [id, chapterNumber]), [['h2', 1]]);
  assert.equal(listed.data.chapters[0].key, KEY);
  const denied = await fetch(`${base}/__personal/highlights`);
  assert.equal(denied.status, 403);
  await call('/notes/remove', { chapter: KEY, id: 'h2' });
});

test('serves a chapter\'s reading annotations with rendered bodies', async () => {
  mkdirSync(join(ROOT, 'annotations/en'), { recursive: true });
  const annotation = { id: 'a1', quote: 'agent', kind: 'term', title: 'Agent', body: 'An LLM in a loop.', sources: [] };
  writeFileSync(
    join(ROOT, 'annotations/en/chapter1.json'),
    JSON.stringify({ format: 'ai-agent-book-annotations', version: 1, annotations: [annotation] }),
  );
  const listed = await (await call(`/annotations?chapter=${encodeURIComponent(KEY)}`)).json();
  assert.deepEqual(listed, { ok: true, data: [{ ...annotation, html: '<p>An LLM in a loop.</p>' }] });
  const other = await (await call(`/annotations?chapter=${encodeURIComponent('ai-agents-in-depth:en:chapter2')}`)).json();
  assert.deepEqual(other, { ok: true, data: [] });
});


test('resolves repository filenames with candidate totals', async () => {
  const response = await call('/files/resolve', {
    names: ['README.md', 't3a_failed.md', 'nope.md'],
    page: '/book/chapter7/',
    chapter: KEY,
  });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(
    data.files['README.md'].map((entry) => entry.path),
    ['chapter7/README.md', 'chapter7/android-world/README.md'],
  );
  assert.equal(data.totals['README.md'], 2);
  assert.deepEqual(data.files['nope.md'], []);
  assert.equal(data.totals['nope.md'], 0);
});

test('rejects a resolve payload that is not an array', async () => {
  const response = await call('/files/resolve', { names: 'README.md' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /array/);
});

test('file routes require the header and block traversal', async () => {
  const denied = await fetch(`${base}/__personal/files/read?path=chapter7/README.md`);
  assert.equal(denied.status, 403);
  const traversal = await call('/files/read?path=../personal/notes/secret.json');
  assert.equal(traversal.status, 403);
  const dotted = await call('/files/read?path=personal/notes/secret.json');
  assert.equal(dotted.status, 403);
  const missing = await call('/files/read?path=nope.md');
  assert.equal(missing.status, 404);
});

test('reads text and streams image bytes without the JSON envelope', async () => {
  const read = await (await call('/files/read?path=chapter7/android-world/t3a_failed.md')).json();
  assert.equal(read.ok, true);
  assert.equal(read.data.text.startsWith('# fail'), true);
  assert.equal(read.data.mime, 'text/markdown; charset=utf-8');
  assert.equal(read.data.binary, false);

  const blob = await call('/files/blob?path=image.png');
  assert.equal(blob.status, 200);
  assert.equal(blob.headers.get('content-type'), 'image/png');
  assert.match(blob.headers.get('content-disposition'), /^inline;/);
  assert.match(blob.headers.get('x-content-type-options'), /nosniff/);
  assert.equal((await blob.arrayBuffer()).byteLength, 4);
});

test('rejects non-JSON resolve requests and oversized blobs', async () => {
  const plain = await fetch(`${base}/__personal/files/resolve`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(plain.status, 415);

  writeFileSync(join(BOOK, 'huge.zip'), Buffer.alloc(20 * 1024 * 1024 + 1));
  const tooBig = await call('/files/blob?path=huge.zip');
  assert.equal(tooBig.status, 413);
});
