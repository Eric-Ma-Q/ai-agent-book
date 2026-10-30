// Requirement 013: report enrichment and Markdown export are pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceLabel,
  enrichReport,
  reportMarkdown,
} from '../client/harness/interview-report.ts';

const resources = [
  { id: 'prdstate', label: 'PRD · 状态与恢复', href: '/harness/site/ai-prd.html#s10' },
  { id: 'bizmodel', label: '商业模式与定价', href: '/harness/site/ai-land.html#vertical' },
];

const report = {
  parse: 'structured',
  overall: 72,
  grade: '有竞争力',
  confidence: 'medium',
  answered: 2,
  planned: 4,
  dimensions: [{ id: 'structure', label: '结构化表达', score: 3.5, comment: '清楚。' }],
  strengths: ['先给结论。'],
  gaps: ['失败状态没讲。'],
  evidence: [{ quote: '我们加了重试。', issue: '缺人工接管。' }],
  review: [
    { id: 'prdstate', reason: '补失败恢复。' },
    { id: 'nope', reason: '不存在。' },
  ],
  next: ['重读 PRD。'],
};

const session = {
  id: 'iv-1',
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:20:00.000Z',
  settings: { role: 'ai-pm', round: 'resume', level: 'advanced', mode: 'practice', modelProfile: 'glm-flash' },
  plan: [],
  turns: [
    { id: 't1', role: 'interviewer', text: '先做个自我介绍。', at: '2026-10-18T10:00:00.000Z' },
    { id: 't2', role: 'candidate', text: '我负责过报销流程。', at: '2026-10-18T10:01:00.000Z' },
  ],
  report,
};

test('enrichReport attaches reader links and drops unknown ids', () => {
  const enriched = enrichReport(report, resources);
  assert.equal(enriched.review.length, 1);
  assert.equal(enriched.review[0].id, 'prdstate');
  assert.equal(enriched.review[0].href, '/harness/site/ai-prd.html#s10');
  assert.equal(enriched.review[0].label, 'PRD · 状态与恢复');
  assert.equal(enriched.review[0].reason, '补失败恢复。');
  assert.equal(enrichReport({ ...report, review: undefined }, resources).review, undefined);
});

test('confidence labels distinguish evidence strength', () => {
  assert.match(confidenceLabel('high'), /充分/);
  assert.match(confidenceLabel('medium'), /一般/);
  assert.match(confidenceLabel('low'), /不足/);
  assert.match(confidenceLabel(undefined), /不足/);
});

test('reportMarkdown includes scores, review links and the transcript', () => {
  const enriched = enrichReport(report, resources);
  const markdown = reportMarkdown({ ...session, report: enriched });
  assert.match(markdown, /72 \/ 100/);
  assert.match(markdown, /结构化表达：3\.5 \/ 5/);
  assert.match(markdown, /\[PRD · 状态与恢复\]\(\/harness\/site\/ai-prd\.html#s10\)/);
  assert.match(markdown, /先做个自我介绍/);
  assert.match(markdown, /我负责过报销流程/);
  assert.doesNotMatch(markdown, /nope/);
});

test('a text report is exported verbatim with a warning heading', () => {
  const markdown = reportMarkdown({
    ...session,
    report: { parse: 'text', text: '只能给一段文字复盘。', overall: null, confidence: 'low' },
  });
  assert.match(markdown, /只能给一段文字复盘/);
});
