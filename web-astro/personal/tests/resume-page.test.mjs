// Requirement 015: the AI PM resume page is revised in place. These assertions
// pin the content that makes the page a complete resume-to-application
// playbook, plus the storage contract that keeps existing local progress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../harness/archive/ai-pm-resume.html');
const html = await readFile(PAGE, 'utf8');
const count = (pattern) => (html.match(pattern) ?? []).length;

test('seven steps keep the old anchors and add #s7', () => {
  for (let index = 1; index <= 7; index += 1) {
    assert.match(html, new RegExp(`id="s${index}"`), `section s${index}`);
    assert.ok(html.includes(`href="#s${index}"`), `nav href s${index}`);
  }
  assert.match(html, /七步/);
  assert.match(html, /STEP 07/);
});

test('the page ships the concrete artifacts, not only advice', () => {
  assert.match(html, /id="resume-example"/);
  assert.equal(count(/data-template="[^"]+"/g), 5);
  assert.equal(count(/data-role="[^"]+"/g), 5);
  assert.equal(count(/data-bg="[^"]+"/g), 6);
  assert.equal(count(/data-diag="[^"]+"/g), 6);
  assert.equal(count(/class="answer-card"/g), 4);
  assert.ok(count(/class="anno"/g) >= 8, 'eight resume annotations');
});

test('the plan and checklist keep the 13/10 localStorage contract', () => {
  assert.equal(count(/data-plan-item="[^"]+"/g), 13);
  assert.equal(count(/data-check-item="[^"]+"/g), 10);
  assert.equal(count(/data-gate="hard"/g), 5);
  assert.equal(count(/data-gate="bonus"/g), 5);
  assert.ok(html.includes('aipm-resume-plan'));
  assert.ok(html.includes('aipm-resume-check'));
});

test('station links stay inside the offline archive', () => {
  for (const href of ['ai-pm-exam.html', 'ai-agent-pm-career.html', 'ai-expense-review-prd.html']) {
    assert.ok(html.includes(`href="${href}`), href);
  }
  assert.doesNotMatch(html, /href="\/harness\//);
  assert.doesNotMatch(html, /harness\/interview\//);
});

test('print, reset and accessibility hooks are present', () => {
  assert.match(html, /@media print/);
  assert.match(html, /id="printPage"/);
  assert.match(html, /id="resetPlan"/);
  assert.match(html, /id="resetCheck"/);
  assert.match(html, /id="dimsToggle"/);
  assert.match(html, /aria-controls="dim-1"/);
  assert.match(html, /aria-selected/);
  assert.match(html, /prefers-reduced-motion/);
});

test('context engineering and ATS format are current', () => {
  assert.match(html, /上下文工程/);
  assert.match(html, /PDF \+ DOCX/);
  assert.match(html, /姓名-岗位方向-YYYY\.MM\.pdf/);
});

test('the 2026-10 recheck keeps the HR survey numbers precise', () => {
  // Requirement 027: the Jobseeker survey says 11.5 minutes, not "about 10".
  assert.ok(html.includes('约 11.5 分钟深读'));
  assert.ok(!html.includes('约 10 分钟深读'));
  // Greenhouse's resume upload list includes PDF (page updated 2026-08); dual format stays.
  assert.ok(html.includes('Greenhouse 简历口 2026-08 更新后也列 PDF'));
  // ProductMap 2026-09 puts the one-page line at about eight years, not ten.
  assert.ok(html.includes('约 8 年以内写 1 页'));
  assert.ok(!html.includes('≤10 年经验写 1 页'));
  // The exam card must follow the 115-question bank (requirement 028).
  assert.ok(html.includes('去考试：115 题测 17 个专题'));
});

test('2026 interview artifacts are present', () => {
  for (const text of ['3 分钟决策链', '评测表', '失败分类', '事故归属', '模型路由', 'MCP']) {
    assert.ok(html.includes(text), text);
  }
});

test('the dead channel is not recommended', () => {
  assert.ok(html.includes('拉勾 2026 年 5 月已破产重整'));
  assert.doesNotMatch(html, /BOSS \/ 猎聘 \/ 拉勾/);
});

test('the page stays a single, reasonably sized HTML file', async () => {
  const info = await stat(PAGE);
  assert.ok(info.size <= 140 * 1024, `page size ${info.size}`);
});
