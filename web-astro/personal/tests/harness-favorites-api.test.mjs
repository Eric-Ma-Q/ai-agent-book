// Requirement 007: the favorites API lives on the existing /__personal
// middleware and keeps the same auth header and JSON envelope.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPersonalApi } from '../api.mjs';
import { examFavoritesFile } from '../paths.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'favorites-api-'));
let api;
let server;
let base;
const errors = [];

before(async () => {
  api = createPersonalApi({
    root: ROOT,
    render: async () => '',
    bookRoot: ROOT,
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
after(() => {
  server.close();
  rmSync(ROOT, { recursive: true, force: true });
});

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

test('starts empty and round-trips add, repeat and remove', async () => {
  const empty = await (await call('/exam-favorites')).json();
  assert.equal(empty.ok, true);
  assert.equal(empty.data.format, 'harness-exam-favorites');
  assert.equal(empty.data.updatedAt, null);
  assert.deepEqual(empty.data.items, []);

  const added = await (
    await call('/exam-favorites/set', {
      exam: 'harness',
      id: 'C14',
      favorite: true,
    })
  ).json();
  assert.equal(added.ok, true);
  assert.equal(added.data.favorite, true);
  assert.equal(added.data.items.length, 1);
  assert.equal(added.data.items[0].exam, 'harness');
  assert.equal(added.data.items[0].id, 'C14');

  const repeated = await (
    await call('/exam-favorites/set', {
      exam: 'harness',
      id: 'C14',
      favorite: true,
    })
  ).json();
  assert.equal(repeated.data.items.length, 1);

  const stored = JSON.parse(readFileSync(examFavoritesFile(ROOT), 'utf8'));
  assert.equal(stored.items.length, 1);

  const removed = await (
    await call('/exam-favorites/set', {
      exam: 'harness',
      id: 'C14',
      favorite: false,
    })
  ).json();
  assert.equal(removed.data.favorite, false);
  assert.deepEqual(removed.data.items, []);
});

test('requires the custom header for reads and writes', async () => {
  for (const [path, body] of [
    ['/exam-favorites', null],
    ['/exam-favorites/set', { exam: 'harness', id: 'A1', favorite: true }],
  ]) {
    const response = await call(path, body, { 'x-personal-api': '0' });
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).ok, false);
  }
});

test('requires JSON for writes', async () => {
  const response = await fetch(`${base}/__personal/exam-favorites/set`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(response.status, 415);
});

test('reports validation errors as 400 and keeps the file intact', async () => {
  for (const body of [
    { exam: 'nope', id: 'A1', favorite: true },
    { exam: 'harness', id: 'a1', favorite: true },
    { exam: 'harness', id: 'A1', favorite: 'true' },
  ]) {
    const response = await call('/exam-favorites/set', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).ok, false);
  }
});

test('unknown routes stay 404', async () => {
  assert.equal((await call('/exam-favorites/nope')).status, 404);
});

test('a corrupt file is reported as 500 and logged', async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(examFavoritesFile(ROOT)), { recursive: true });
  writeFileSync(examFavoritesFile(ROOT), '{');
  try {
    const response = await call('/exam-favorites');
    assert.equal(response.status, 500);
    assert.ok(errors.some((message) => message.includes('exam-favorites')));
  } finally {
    rmSync(examFavoritesFile(ROOT), { force: true });
  }
});
