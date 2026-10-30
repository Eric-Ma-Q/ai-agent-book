// Requirement 013: interview sessions are ordinary JSON files under
// personal/harness/interview/sessions. The id is validated before it becomes a
// path, and every write is as small as the schema allows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_SESSIONS,
  createInterviewSession,
  deleteInterviewSession,
  listInterviewSessions,
  readInterviewSession,
  saveInterviewSession,
} from '../harness/interview-store.mjs';
import {
  buildCandidateProfile,
  buildInterviewPlan,
  normalizeSettings,
} from '../harness/interview-profile.mjs';
import { PersonalError, interviewSessionFile } from '../paths.mjs';

const QUESTIONS = [
  { id: 'A1', exam: 'ai-pm', topic: 'prdstate', topicLabel: 'PRD · 状态与恢复' },
  { id: 'B1', exam: 'ai-pm', topic: 'bizmodel', topicLabel: '商业模式与定价' },
];
const NOW = '2026-10-18T11:30:00.000Z';
const ID = 'iv-1760796600000-a1b2c3';

function makeInput(overrides = {}) {
  const profile = buildCandidateProfile({ questions: QUESTIONS });
  const settings = normalizeSettings(
    {
      role: 'ai-pm',
      round: 'resume',
      level: 'advanced',
      mode: 'practice',
      questionCount: 4,
      focusTopics: ['prdstate', 'bizmodel'],
      modelProfile: 'glm-flash',
      ...overrides,
    },
    profile,
  );
  return { settings, profile, plan: buildInterviewPlan(settings, profile) };
}

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'interview-store-'));
}

const turn = (id, role, text, extra = {}) => ({
  id,
  role,
  text,
  at: NOW,
  ...extra,
});

const report = () => ({
  parse: 'structured',
  overall: 72,
  grade: '有竞争力',
  confidence: 'medium',
  answered: 3,
  planned: 4,
  dimensions: [{ id: 'structure', label: '结构化表达', score: 3.5, comment: '结论清楚。' }],
  strengths: ['能先给结论。'],
  gaps: ['失败状态讲得不够。'],
  evidence: [{ quote: '我们当时加了重试。', issue: '缺少人工接管。' }],
  review: [
    {
      id: 'prdstate',
      label: 'PRD · 状态与恢复',
      href: '/harness/site/ai-expense-review-prd.html#section-10',
      reason: '补失败状态。',
    },
  ],
  next: ['重读报销 PRD 第 10–12 节。'],
});

test('creates, reads, lists, saves and deletes a session', () => {
  const root = makeRoot();
  const created = createInterviewSession(root, makeInput(), { id: ID, now: () => new Date(NOW) });
  assert.equal(created.id, ID);
  assert.equal(created.format, 'harness-interview');
  assert.equal(created.version, 1);
  assert.equal(created.status, 'active');
  assert.equal(created.createdAt, NOW);
  assert.equal(created.turns.length, 0);
  assert.equal(created.plan.length, 4);
  assert.equal(created.plan[0].status, 'pending');

  const read = readInterviewSession(root, ID);
  assert.deepEqual(read, created);

  const listed = listInterviewSessions(root);
  assert.equal(listed.warnings.length, 0);
  assert.equal(listed.sessions.length, 1);
  assert.equal(listed.sessions[0].planned, 4);
  assert.equal(listed.sessions[0].answered, 0);
  assert.equal(listed.sessions[0].model, 'glm-flash');

  const turns = [
    turn('t1', 'interviewer', '先做个自我介绍。', { slot: 's1', focus: '转岗定位', model: 'GLM-5.3-Flash', modelProfile: 'glm-flash' }),
    turn('t2', 'candidate', '我是一名产品经理。'),
  ];
  const summary = saveInterviewSession(root, ID, {
    turns,
    plan: [
      { id: 's1', status: 'done' },
      { id: 's2', status: 'active' },
    ],
    status: 'active',
  }, { now: () => new Date('2026-10-18T11:40:00.000Z') });
  assert.equal(summary.answered, 1);
  assert.equal(summary.updatedAt, '2026-10-18T11:40:00.000Z');
  const updated = readInterviewSession(root, ID);
  assert.deepEqual(updated.turns, turns);
  assert.equal(updated.plan[0].status, 'done');
  assert.equal(updated.plan[1].status, 'active');
  assert.equal(updated.plan[2].status, 'pending');

  const finished = saveInterviewSession(root, ID, { status: 'finished', report: report() });
  assert.equal(finished.status, 'finished');
  assert.equal(finished.overall, 72);
  assert.equal(readInterviewSession(root, ID).report.review[0].id, 'prdstate');
  assert.equal(readInterviewSession(root, ID).report.truncated, false);

  deleteInterviewSession(root, ID);
  assert.throws(() => readInterviewSession(root, ID), (error) => error instanceof PersonalError && error.status === 404);
  assert.throws(() => deleteInterviewSession(root, ID), (error) => error instanceof PersonalError && error.status === 404);
});

test('rejects bad ids, traversal and invalid settings before touching a file', () => {
  const root = makeRoot();
  for (const id of ['', 'iv-', '../escape', 'iv-../escape', 'xx-1760796600000-a1b2c3']) {
    assert.throws(
      () => readInterviewSession(root, id),
      (error) => error instanceof PersonalError && error.status === 400,
      id,
    );
    assert.throws(
      () => createInterviewSession(root, makeInput(), { id }),
      (error) => error instanceof PersonalError && error.status === 400,
      id,
    );
  }
  const badRole = makeInput();
  badRole.settings = { ...badRole.settings, role: 'nope' };
  assert.throws(
    () => createInterviewSession(root, badRole),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => createInterviewSession(root, { settings: {}, profile: {}, plan: [] }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
});

test('rejects malformed plan updates and unknown slots', () => {
  const root = makeRoot();
  createInterviewSession(root, makeInput(), { id: ID });
  assert.throws(
    () => saveInterviewSession(root, ID, { plan: [{ id: 's99', status: 'done' }] }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => saveInterviewSession(root, ID, { plan: [{ id: 's1', status: 'nope' }] }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => saveInterviewSession(root, ID, { status: 'nope' }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
});

test('rejects too many turns, long text and bad reports', () => {
  const root = makeRoot();
  createInterviewSession(root, makeInput(), { id: ID });
  const many = Array.from({ length: 41 }, (_, index) => turn(`t${index}`, 'candidate', '有点长。'));
  assert.throws(
    () => saveInterviewSession(root, ID, { turns: many }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  const long = [turn('t1', 'candidate', 'x'.repeat(4001))];
  assert.throws(
    () => saveInterviewSession(root, ID, { turns: long }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => saveInterviewSession(root, ID, { report: { ...report(), review: [{ id: 'nope', href: '/x', reason: 'x' }] } }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => saveInterviewSession(root, ID, { report: { ...report(), overall: 101 } }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
  assert.throws(
    () => saveInterviewSession(root, ID, { turns: [{ id: 't1', role: 'nope', text: 'x', at: NOW }] }),
    (error) => error instanceof PersonalError && error.status === 400,
  );
});

test('a corrupt file fails the single read but is skipped in the list', () => {
  const root = makeRoot();
  createInterviewSession(root, makeInput(), { id: ID });
  writeFileSync(interviewSessionFile(root, ID), '{not json', 'utf8');
  assert.throws(
    () => readInterviewSession(root, ID),
    (error) => error instanceof PersonalError && error.status === 500,
  );
  const listed = listInterviewSessions(root);
  assert.equal(listed.sessions.length, 0);
  assert.equal(listed.warnings.length, 1);
  assert.match(listed.warnings[0], /iv-1760796600000-a1b2c3/);
});

test('refuses to create more than the session cap', () => {
  const root = makeRoot();
  for (let index = 0; index < MAX_SESSIONS; index += 1) {
    createInterviewSession(root, makeInput(), {
      id: `iv-1760796600000-${String(index).padStart(6, '0')}`,
    });
  }
  assert.throws(
    () => createInterviewSession(root, makeInput(), { id: 'iv-1760796600000-ffffff' }),
    (error) => error instanceof PersonalError && error.status === 400 && /50/.test(error.message),
  );
});

test('keeps the truncated flag so an incomplete report stays marked', () => {
  const root = makeRoot();
  createInterviewSession(root, makeInput(), { id: ID, now: () => new Date(NOW) });
  saveInterviewSession(root, ID, { status: 'finished', report: { ...report(), truncated: true } });
  assert.equal(readInterviewSession(root, ID).report.truncated, true);
});
