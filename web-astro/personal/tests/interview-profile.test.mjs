// Requirement 013: pure profile and plan helpers. These tests do not start
// Astro; they build the same structures the page and the API use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  MODES,
  PHASES,
  ROLES,
  ROUNDS,
  TOPICS,
  buildCandidateProfile,
  buildInterviewPlan,
  normalizeResumeSignals,
  normalizeSettings,
  reportConfidence,
  resourceFor,
  reviewOptions,
} from '../harness/interview-profile.mjs';

const QUESTIONS = [
  { id: 'A1', exam: 'ai-pm', topic: 'prdstate', topicLabel: 'PRD · 状态与恢复' },
  { id: 'A2', exam: 'ai-pm', topic: 'prdstate', topicLabel: 'PRD · 状态与恢复' },
  { id: 'B1', exam: 'ai-pm', topic: 'bizmodel', topicLabel: '商业模式与定价' },
  { id: 'C1', exam: 'ai-pm', topic: 'framework', topicLabel: '产品解构框架' },
  { id: 'D1', exam: 'ai-pm', topic: 'prdaccept', topicLabel: 'PRD · 验收与上线' },
  { id: 'E1', exam: 'ai-pm', topic: 'prdscope', topicLabel: 'PRD · 范围与权限' },
];

const attempt = (id, submittedAt, scores, extra = {}) => {
  const qids = Object.keys(scores);
  const max = qids.reduce((sum, qid) => sum + scores[qid].max, 0);
  const total = qids.reduce((sum, qid) => sum + scores[qid].got, 0);
  return {
    id,
    qids,
    submittedAt,
    answers: {},
    self: {},
    scores,
    total,
    max,
    ...extra,
  };
};

const PROGRESS = {
  exists: true,
  store: {
    schema: 1,
    draft: null,
    attempts: [
      attempt('a1', Date.now() - 86_400_000, {
        A1: { got: 2, max: 2, status: 'ok' },
        B1: { got: 0, max: 2, status: 'wrong' },
        C1: { got: 2, max: 2, status: 'ok' },
      }),
      attempt('a2', Date.now(), {
        A1: { got: 0, max: 2, status: 'wrong' },
        A2: { got: 0, max: 2, status: 'wrong' },
        B1: { got: 1, max: 2, status: 'partial' },
        C1: { got: 2, max: 2, status: 'ok' },
        D1: { got: 2, max: 2, status: 'ok' },
        E1: { got: 0, max: 5, status: 'pending' },
      }),
    ],
    mistakes: {
      A1: { wrong: 1, lastWrong: Date.now(), streak: 0 },
      B1: { wrong: 2, lastWrong: Date.now(), streak: 1 },
      E1: { wrong: 1, lastWrong: Date.now(), streak: 2 },
    },
  },
};

test('the topic table covers the 17 AI PM exam topics', () => {
  assert.equal(TOPICS.length, 17);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, 17);
  for (const topic of TOPICS) {
    assert.ok(topic.label.length > 1, topic.id);
    assert.ok(topic.href.includes('.html'), topic.id);
    assert.equal(topic.href.startsWith('/'), false);
  }
  assert.equal(resourceFor('prdstate').label, 'PRD · 状态与恢复');
  assert.match(resourceFor('prdstate').href, /ai-expense-review-prd\.html#section-10/);
  assert.equal(reviewOptions().length, 17);
  assert.deepEqual(
    reviewOptions().find((item) => item.id === 'bizmodel'),
    { id: 'bizmodel', label: '商业模式与定价' },
  );
});

test('the enum tables expose labels for the setup form', () => {
  assert.deepEqual(Object.keys(ROLES), ['ai-pm', 'agent-pm', 'app-pm']);
  assert.deepEqual(Object.keys(ROUNDS), ['resume', 'product', 'case', 'ai', 'final']);
  assert.deepEqual(Object.keys(LEVELS), ['starter', 'basic', 'advanced', 'stress']);
  assert.deepEqual(Object.keys(MODES), ['simulation', 'practice']);
  for (const phase of PHASES) assert.ok(phase.label, phase.id);
});

test('settings normalize to the stored shape and fill focus topics', () => {
  const profile = buildCandidateProfile({ questions: QUESTIONS });
  const settings = normalizeSettings(
    { role: 'agent-pm', round: 'product', mode: 'simulation', questionCount: 8 },
    profile,
  );
  assert.equal(settings.role, 'agent-pm');
  assert.equal(settings.round, 'product');
  assert.equal(settings.mode, 'simulation');
  assert.equal(settings.questionCount, 8);
  assert.equal(settings.level, 'basic');
  assert.ok(settings.focusTopics.length >= 2);
  assert.ok(settings.focusTopics.length <= 4);
  assert.equal(settings.resumeHighlights, '');
  assert.equal(settings.modelProfile, '');
  for (const topic of settings.focusTopics) assert.ok(TOPICS.some((item) => item.id === topic));
});

test('settings reject unknown values, bad counts and long text', () => {
  const base = { role: 'ai-pm', round: 'resume', level: 'advanced', mode: 'practice', questionCount: 6 };
  assert.throws(() => normalizeSettings({ ...base, role: 'nope' }), /role/);
  assert.throws(() => normalizeSettings({ ...base, round: 'nope' }), /round/);
  assert.throws(() => normalizeSettings({ ...base, level: 'nope' }), /level/);
  assert.throws(() => normalizeSettings({ ...base, mode: 'nope' }), /mode/);
  assert.throws(() => normalizeSettings({ ...base, questionCount: 3 }), /questionCount/);
  assert.throws(() => normalizeSettings({ ...base, questionCount: 11 }), /questionCount/);
  assert.throws(() => normalizeSettings({ ...base, focusTopics: ['nope'] }), /focusTopics/);
  assert.throws(
    () => normalizeSettings({ ...base, focusTopics: ['prdstate', 'bizmodel', 'framework', 'landscape', 'trends'] }),
    /focusTopics/,
  );
  assert.throws(() => normalizeSettings({ ...base, resumeHighlights: 'x'.repeat(2001) }), /resumeHighlights/);
  assert.throws(() => normalizeSettings({ ...base, modelProfile: 'Bad ID' }), /modelProfile/);
});

test('a profile without exam data stays baseline and still plans a session', () => {
  const profile = buildCandidateProfile({ questions: QUESTIONS });
  assert.equal(profile.source, 'baseline');
  assert.equal(profile.exam, null);
  assert.equal(profile.resume, null);
  assert.equal(profile.levelSuggestion, 'basic');
  assert.match(profile.summary, /还没有 AI PM 考试记录/);
  assert.equal(profile.past.count, 0);
});

test('exam stats use the last three attempts, exclude pending items and find weak topics', () => {
  const profile = buildCandidateProfile({ examProgress: PROGRESS, questions: QUESTIONS });
  assert.equal(profile.source, 'exam');
  assert.equal(profile.exam.attempts, 2);
  assert.equal(profile.exam.lastPct, 50);
  assert.equal(profile.exam.bestPct, 67);
  assert.deepEqual(profile.exam.weakTopics.map((topic) => topic.id), ['bizmodel', 'prdstate']);
  assert.equal(profile.exam.weakTopics[0].pct, 25);
  assert.ok(profile.exam.strongTopics.some((topic) => topic.id === 'framework'));
  assert.equal(profile.exam.mistakeCount, 2);
  assert.match(profile.summary, /50%/);
  assert.match(profile.summary, /67%/);
  assert.doesNotMatch(profile.brief, /50%|67%/);
  assert.match(profile.brief, /优先验证/);
});

test('pending open questions do not lower the latest percentage', () => {
  const single = {
    exists: true,
    store: {
      ...PROGRESS.store,
      attempts: [
        attempt('pending', Date.now(), {
          A1: { got: 2, max: 2, status: 'ok' },
          E1: { got: 0, max: 5, status: 'pending' },
        }),
      ],
    },
  };
  const profile = buildCandidateProfile({ examProgress: single, questions: QUESTIONS });
  assert.equal(profile.exam.lastPct, 100);
  assert.equal(profile.exam.bestPct, 100);
});

test('resume signals are optional and validated', () => {
  const profile = buildCandidateProfile({
    examProgress: PROGRESS,
    questions: QUESTIONS,
    resumeSignals: { selfCheck: 7, planDone: 12, planTotal: 30 },
  });
  assert.deepEqual(profile.resume, { selfCheck: 7, planDone: 12, planTotal: 30 });
  assert.match(profile.summary, /简历自检 7\/10/);
  assert.match(profile.brief, /简历/);
  assert.deepEqual(normalizeResumeSignals({ selfCheck: 7, planDone: 12 }), { selfCheck: 7, planDone: 12, planTotal: 30 });
  assert.equal(normalizeResumeSignals({ selfCheck: 11, planDone: 12 }), null);
  assert.equal(normalizeResumeSignals({ selfCheck: 7, planDone: 31 }), null);
  assert.equal(normalizeResumeSignals({ selfCheck: null, planDone: 12 }), null);
  assert.equal(normalizeResumeSignals(null), null);
});

test('past interviews pick the last score and weak dimensions', () => {
  const sessions = [
    {
      status: 'finished',
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:20:00.000Z',
      plan: [{ topic: 'framework', status: 'done' }],
      report: {
        overall: 58,
        dimensions: [
          { id: 'data', score: 2, label: '数据与验证' },
          { id: 'product', score: 3, label: '产品判断' },
        ],
      },
    },
    {
      status: 'finished',
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-10-15T10:20:00.000Z',
      plan: [{ topic: 'prdstate', status: 'done' }],
      report: {
        overall: 82,
        dimensions: [
          { id: 'data', score: 3.5, label: '数据与验证' },
          { id: 'structure', score: 4, label: '结构化表达' },
        ],
      },
    },
  ];
  const profile = buildCandidateProfile({ examProgress: PROGRESS, questions: QUESTIONS, pastSessions: sessions });
  assert.equal(profile.past.count, 2);
  assert.equal(profile.past.lastOverall, 82);
  assert.deepEqual(profile.past.weakDimensions.map((item) => item.id), ['data']);
  assert.equal(profile.levelSuggestion, 'advanced');
  assert.match(profile.brief, /数据与验证/);
  assert.match(profile.brief, /prdstate|PRD/);
});

test('text reports with no score do not count as zero in past stats', () => {
  const profile = buildCandidateProfile({
    examProgress: PROGRESS,
    questions: QUESTIONS,
    pastSessions: [
      {
        status: 'finished',
        updatedAt: '2026-10-18T10:00:00.000Z',
        report: { parse: 'text', overall: null, dimensions: [{ id: 'data', score: null }] },
        plan: [],
      },
    ],
  });
  assert.equal(profile.past.count, 0);
  assert.equal(profile.past.lastOverall, null);
  assert.equal(profile.levelSuggestion, 'starter');
});

test('the plan has the requested length, starts with warmup and ends with closing', () => {
  const profile = buildCandidateProfile({ examProgress: PROGRESS, questions: QUESTIONS });
  for (const questionCount of [4, 6, 10]) {
    const settings = normalizeSettings(
      { role: 'ai-pm', round: 'product', level: 'advanced', mode: 'simulation', questionCount, focusTopics: ['prdstate', 'bizmodel'] },
      profile,
    );
    const plan = buildInterviewPlan(settings, profile);
    assert.equal(plan.length, questionCount);
    assert.equal(plan[0].phase, 'warmup');
    assert.equal(plan.at(-1).phase, 'closing');
    assert.deepEqual(plan.map((slot) => slot.id), plan.map((_, index) => `s${index + 1}`));
    for (const slot of plan) {
      assert.ok(PHASES.some((phase) => phase.id === slot.phase), slot.id);
      assert.ok(TOPICS.some((topic) => topic.id === slot.topic), slot.id);
      assert.equal(slot.status, 'pending');
      assert.ok(slot.goal.includes('重点观察'));
    }
    const middle = plan.slice(1, -1);
    assert.ok(middle.every((slot) => ['prdstate', 'bizmodel'].includes(slot.topic)));
  }
});

test('focus topics follow the round priority rather than checkbox order', () => {
  const profile = buildCandidateProfile({ questions: QUESTIONS });
  const settings = normalizeSettings(
    { role: 'ai-pm', round: 'resume', level: 'basic', mode: 'practice', questionCount: 6, focusTopics: ['interview', 'evidence'] },
    profile,
  );
  const plan = buildInterviewPlan(settings, profile);
  assert.equal(plan[1].topic, 'evidence');
  assert.equal(plan[2].topic, 'interview');
});

test('the plan cycles one focus topic when only one is selected', () => {
  const profile = buildCandidateProfile({ questions: QUESTIONS });
  const settings = normalizeSettings(
    { role: 'app-pm', round: 'case', level: 'starter', mode: 'practice', questionCount: 8, focusTopics: ['bizmodel'] },
    profile,
  );
  const plan = buildInterviewPlan(settings, profile);
  assert.equal(plan.length, 8);
  assert.ok(plan.slice(1, -1).every((slot) => slot.topic === 'bizmodel'));
});

test('confidence is based on answered slots, not the model score', () => {
  assert.equal(reportConfidence(6, 6), 'high');
  assert.equal(reportConfidence(5, 6), 'high');
  assert.equal(reportConfidence(3, 6), 'medium');
  assert.equal(reportConfidence(2, 6), 'low');
  assert.equal(reportConfidence(2, 4), 'low');
  assert.equal(reportConfidence(1, 4), 'low');
  assert.equal(reportConfidence(0, 4), 'low');
});
