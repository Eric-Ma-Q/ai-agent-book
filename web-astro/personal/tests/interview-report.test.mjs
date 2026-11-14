// Requirement 013: report enrichment and Markdown export are pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceLabel,
  enrichReport,
  renderReport,
  reportMarkdown,
  reportNotices,
} from '../client/harness/interview-report.ts';

// Minimal DOM stand-in: renderReport only builds elements and appends text, so a
// tiny fake keeps the banner/next checks runnable without a browser.
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.style = {};
    this.textContent = '';
    this.classList = { add() {} };
  }
  append(...children) {
    for (const child of children) {
      if (child === undefined || child === null || child === false) continue;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.children = children;
  }
  addEventListener() {}
  set innerHTML(value) {
    this.textContent = value;
  }
  get innerHTML() {
    return this.textContent;
  }
  get text() {
    return this.children
      .map((child) => (typeof child === 'string' ? child : child.text))
      .filter(Boolean)
      .join(' ');
  }
}

globalThis.document = { createElement: (tag) => new FakeNode(tag) };
const makeHost = () => new FakeNode('div');

const findButton = (node, label) => {
  if (node.tag === 'button' && node.text.includes(label)) return node;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    const hit = findButton(child, label);
    if (hit) return hit;
  }
  return null;
};

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

test('reportNotices warns when the reply was cut off or had no markers', () => {
  assert.equal(reportNotices(report).length, 0);
  assert.match(reportNotices({ ...report, truncated: true })[0].text, /不完整/);
  assert.match(
    reportNotices({ parse: 'text', text: '一段文字', overall: null })[0].text,
    /没有按标记输出/,
  );
});

test('marks a truncated report in the Markdown export', () => {
  const markdown = reportMarkdown({
    ...session,
    report: enrichReport({ ...report, truncated: true }, resources),
  });
  assert.match(markdown, /不完整/);
  assert.match(markdown, /## 接下来/);
  assert.match(markdown, /重读 PRD/);
});

test('the report page shows the truncation banner and the next steps', () => {
  const host = makeHost();
  const enriched = enrichReport({ ...report, truncated: true }, resources);
  renderReport(host, { ...session, report: enriched }, { onRetry() {}, onNew() {} });
  assert.match(host.text, /不完整/);
  assert.match(host.text, /接下来/);
  assert.match(host.text, /重读 PRD/);
});

test('a complete report renders without the truncation banner', () => {
  const host = makeHost();
  renderReport(
    host,
    { ...session, report: enrichReport(report, resources) },
    { onRetry() {}, onNew() {} },
  );
  assert.doesNotMatch(host.text, /不完整/);
  assert.match(host.text, /接下来/);
});

test('the regenerate button is disabled while a request is running', () => {
  const host = makeHost();
  renderReport(
    host,
    { ...session, report: enrichReport(report, resources) },
    { onRetry() {}, onNew() {}, busy: true },
  );
  const button = findButton(host, '正在重新生成');
  assert.ok(button, 'busy label');
  assert.equal(button.disabled, true);
  assert.equal(findButton(host, '重新生成复盘'), null);

  const idle = makeHost();
  renderReport(idle, { ...session, report: enrichReport(report, resources) }, { onRetry() {}, onNew() {} });
  assert.equal(findButton(idle, '重新生成复盘').disabled, false);
});
