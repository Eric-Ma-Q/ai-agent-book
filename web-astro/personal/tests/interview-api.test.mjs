// Requirement 013: reader API. Sessions stay under personal/harness/interview;
// the lab proxy and model calls are not involved here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalApi } from '../api.mjs';
import { saveExamProgress } from '../harness/exam-progress-store.mjs';
import { interviewSessionFile } from '../paths.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'personal-interview-api-'));
let server;
let base;
const errors = [];

const attempt = (id, submittedAt, scores) => {
  const qids = Object.keys(scores);
  const max = qids.reduce((sum, qid) => sum + scores[qid].max, 0);
  const total = qids.reduce((sum, qid) => sum + scores[qid].got, 0);
  return { id, qids, submittedAt, answers: {}, self: {}, scores, total, max };
};

before(async () => {
  saveExamProgress(ROOT, 'ai-pm', {
    schema: 1,
    draft: null,
    attempts: [
      attempt('a1', Date.now(), {
        A1: { got: 0, max: 2, status: 'wrong' },
        A2: { got: 2, max: 2, status: 'ok' },
        B1: { got: 1, max: 2, status: 'partial' },
      }),
    ],
    mistakes: {
      A1: { wrong: 1, lastWrong: Date.now(), streak: 0 },
    },
  });
  const api = createPersonalApi({
    root: ROOT,
    render: async (markdown) => `<p>${markdown}</p>`,
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

const createBody = (overrides = {}) => ({
  settings: {
    role: 'ai-pm',
    round: 'resume',
    level: 'advanced',
    mode: 'practice',
    questionCount: 4,
    focusTopics: ['prdstate', 'bizmodel'],
    resumeHighlights: '负责过报销流程改造。',
    modelProfile: 'glm-flash',
  },
  resumeSignals: { selfCheck: 7, planDone: 12 },
  ...overrides,
});

test('requires the custom header and JSON for writes', async () => {
  const denied = await fetch(`${base}/__personal/interview/sessions`);
  assert.equal(denied.status, 403);
  const response = await fetch(`${base}/__personal/interview/sessions`, {
    method: 'POST',
    headers: { 'x-personal-api': '1', 'content-type': 'text/plain' },
    body: '{}',
  });
  assert.equal(response.status, 415);
});

test('creates a session with an exam profile and a four-slot plan', async () => {
  const response = await call('/interview/sessions', createBody());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  const session = payload.data;
  assert.equal(session.format, 'harness-interview');
  assert.equal(session.status, 'active');
  assert.equal(session.settings.focusTopics.length, 2);
  assert.equal(session.profile.source, 'exam');
  assert.equal(session.profile.exam.attempts, 1);
  assert.equal(session.profile.exam.lastPct, 50);
  assert.deepEqual(session.profile.resume, { selfCheck: 7, planDone: 12, planTotal: 30 });
  assert.equal(session.plan.length, 4);
  assert.equal(session.plan[0].phase, 'warmup');
  assert.equal(session.plan.at(-1).phase, 'closing');
  assert.deepEqual(session.turns, []);
  assert.equal(JSON.stringify(session).includes('api_key'), false);

  const listed = await (await call('/interview/sessions')).json();
  assert.equal(listed.data.sessions.length, 1);
  assert.equal(listed.data.sessions[0].id, session.id);
  assert.equal(listed.data.sessions[0].planned, 4);

  const read = await (await call(`/interview/session?id=${encodeURIComponent(session.id)}`)).json();
  assert.deepEqual(read.data, session);
});

test('saves turns and plan statuses, then reads the finished report', async () => {
  const created = (await (await call('/interview/sessions', createBody())).json()).data;
  const at = new Date().toISOString();
  const turns = [
    { id: 't1', role: 'interviewer', text: '先做个自我介绍。', at, slot: 's1', focus: '转岗定位', model: 'GLM', modelProfile: 'glm-flash' },
    { id: 't2', role: 'candidate', text: '我是一名产品经理。', at },
  ];
  const saved = await (await call('/interview/session/save', {
    id: created.id,
    turns,
    plan: [{ id: 's1', status: 'done' }, { id: 's2', status: 'active' }],
    status: 'active',
  })).json();
  assert.equal(saved.data.answered, 1);
  assert.equal(saved.data.status, 'active');

  const report = {
    parse: 'structured',
    overall: 70,
    grade: '基本合格',
    confidence: 'medium',
    answered: 1,
    planned: 4,
    dimensions: [{ id: 'structure', score: 3.5, comment: '清楚。' }],
    strengths: ['能先给结论。'],
    gaps: ['缺失败状态。'],
    evidence: [{ quote: '我是一名产品经理。', issue: '要补证据。' }],
    review: [{ id: 'prdstate', href: '/harness/site/ai-expense-review-prd.html#section-10', reason: '补失败状态。' }],
    next: ['重读 PRD 第 10 节。'],
  };
  const finished = await (await call('/interview/session/save', {
    id: created.id,
    status: 'finished',
    report,
  })).json();
  assert.equal(finished.data.status, 'finished');
  assert.equal(finished.data.overall, 70);
  const read = await (await call(`/interview/session?id=${encodeURIComponent(created.id)}`)).json();
  assert.equal(read.data.report.overall, 70);
  assert.equal(read.data.report.dimensions.length, 5);
  assert.equal(read.data.report.review[0].href, '/harness/site/ai-expense-review-prd.html#section-10');

  const deleted = await (await call('/interview/session/delete', { id: created.id })).json();
  assert.deepEqual(deleted.data, { deleted: created.id });
  const gone = await call(`/interview/session?id=${encodeURIComponent(created.id)}`);
  assert.equal(gone.status, 404);
});

test('rejects invalid ids, settings and oversized bodies', async () => {
  assert.equal((await call('/interview/session?id=bad')).status, 400);
  assert.equal((await call('/interview/session/delete', { id: '../x' })).status, 400);
  assert.equal(
    (await call('/interview/sessions', createBody({ settings: { ...createBody().settings, role: 'nope' } }))).status,
    400,
  );
  assert.equal(
    (await call('/interview/sessions', createBody({ settings: { ...createBody().settings, questionCount: 3 } }))).status,
    400,
  );
  const oversized = await call('/interview/sessions', { ...createBody(), padding: 'x'.repeat(1024 * 1024 + 10) });
  assert.equal(oversized.status, 413);
});

test('a corrupt session is skipped in the list and fails the single read', async () => {
  const created = (await (await call('/interview/sessions', createBody())).json()).data;
  writeFileSync(interviewSessionFile(ROOT, created.id), '{broken', 'utf8');
  const listed = await (await call('/interview/sessions')).json();
  assert.ok(listed.data.warnings.some((warning) => warning.includes(created.id)));
  assert.equal(listed.data.sessions.some((session) => session.id === created.id), false);
  const read = await call(`/interview/session?id=${encodeURIComponent(created.id)}`);
  assert.equal(read.status, 500);
  assert.match((await read.json()).error, /Malformed interview session/);
  assert.ok(errors.length >= 1);
});

test('a session without exam progress uses the baseline profile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'personal-interview-baseline-'));
  const api = createPersonalApi({ root, render: async () => '', log: { error: () => {} } });
  const local = createServer((req, res) => api(req, res, () => res.end()));
  await new Promise((resolve) => local.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${local.address().port}/__personal/interview/sessions`, {
      method: 'POST',
      headers: { 'x-personal-api': '1', 'content-type': 'application/json' },
      body: JSON.stringify(createBody()),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.profile.source, 'baseline');
    assert.equal(payload.data.profile.exam, null);
  } finally {
    local.close();
  }
});
