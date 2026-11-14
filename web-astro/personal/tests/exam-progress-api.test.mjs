// Requirement 008: the exam progress API stores one snapshot per bank.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPersonalApi } from '../api.mjs';
import { examProgressFile } from '../paths.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'exam-progress-api-'));
let api;
let server;
let base;
const errors = [];

const store = () => ({
  schema: 1,
  draft: {
    mode: 'practice',
    qids: ['A1'],
    answers: { A1: ['循环'] },
    flags: [],
    checked: {},
    self: {},
    startedAt: 1,
    elapsedMs: 2,
  },
  attempts: [
    {
      id: 'a1',
      mode: 'exam',
      qids: ['A1'],
      startedAt: 1,
      submittedAt: 2,
      durationMs: 1,
      answers: {},
      self: {},
      scores: { A1: { got: 2, max: 2, status: 'ok' } },
      total: 2,
      max: 2,
      autoGot: 2,
      autoMax: 2,
      selfGot: 0,
      selfMax: 0,
    },
  ],
  mistakes: { A1: { wrong: 1, lastWrong: 2, streak: 0 } },
});

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

test('starts empty and round-trips a store snapshot', async () => {
  const empty = await (await call('/exam-progress?exam=harness')).json();
  assert.equal(empty.ok, true);
  assert.equal(empty.data.exists, false);
  assert.equal(empty.data.exam, 'harness');

  const saved = await (
    await call('/exam-progress/save', { exam: 'harness', store: store() })
  ).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.data.exam, 'harness');
  assert.equal(saved.data.clearedAt, null);
  assert.ok(saved.data.updatedAt);

  const read = await (await call('/exam-progress?exam=harness')).json();
  assert.equal(read.data.exists, true);
  assert.deepEqual(read.data.store, store());
  const file = JSON.parse(
    readFileSync(examProgressFile(ROOT, 'harness'), 'utf8'),
  );
  assert.equal(file.store.attempts.length, 1);
  assert.equal(file.exam, 'harness');
});

test('clearing writes the empty store and keeps the tombstone', async () => {
  const cleared = await (
    await call('/exam-progress/save', {
      exam: 'harness',
      store: { schema: 1, draft: null, attempts: [], mistakes: {} },
      cleared: true,
    })
  ).json();
  assert.ok(cleared.data.clearedAt);
  const read = await (await call('/exam-progress?exam=harness')).json();
  assert.equal(read.data.clearedAt, cleared.data.clearedAt);
  assert.deepEqual(read.data.store, {
    schema: 1,
    draft: null,
    attempts: [],
    mistakes: {},
  });
});

test('requires the custom header and JSON for writes', async () => {
  for (const [path, body] of [
    ['/exam-progress?exam=harness', null],
    ['/exam-progress/save', { exam: 'harness', store: store() }],
  ]) {
    const response = await call(path, body, { 'x-personal-api': '0' });
    assert.equal(response.status, 403, path);
  }
  const response = await fetch(`${base}/__personal/exam-progress/save`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(response.status, 415);
});

test('rejects unknown exams and malformed stores', async () => {
  const invalid = [
    { exam: 'nope', store: store() },
    {
      exam: 'harness',
      store: { schema: 2, draft: null, attempts: [], mistakes: {} },
    },
    {
      exam: 'harness',
      store: { schema: 1, draft: null, attempts: [], mistakes: {} },
      cleared: 'yes',
    },
  ];
  for (const body of invalid) {
    const response = await call('/exam-progress/save', body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
  }
  const missing = await call('/exam-progress');
  assert.equal(missing.status, 400);
});

test('unknown routes stay 404 and corrupt files report 500', async () => {
  assert.equal((await call('/exam-progress/nope')).status, 404);
  const file = examProgressFile(ROOT, 'ai-pm');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '{');
  try {
    const response = await call('/exam-progress?exam=ai-pm');
    assert.equal(response.status, 500);
    assert.ok(errors.some((message) => message.includes('exam-progress')));
  } finally {
    rmSync(file, { force: true });
  }
});
