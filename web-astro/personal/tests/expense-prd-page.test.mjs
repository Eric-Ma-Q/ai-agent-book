// Requirement 026: the AI expense-review PRD page is revised in place. These
// assertions pin the structure that must survive future edits, the 2026 facts
// that replaced the old invoice assumptions, and the page size budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../harness/archive/ai-expense-review-prd.html');
const html = await readFile(PAGE, 'utf8');
const count = (pattern) => (html.match(pattern) ?? []).length;

test('twenty-one sections keep their anchors and nav entries', () => {
  for (let index = 1; index <= 21; index += 1) {
    const id = `section-${String(index).padStart(2, '0')}`;
    assert.match(html, new RegExp(`id="${id}"`), id);
    assert.ok(html.includes(`href="#${id}"`), `nav ${id}`);
  }
  assert.equal(count(/<section aria-labelledby="heading-\d{2}"/g), 21);
});

test('rule and scenario ids stay contiguous', () => {
  for (let index = 1; index <= 15; index += 1) {
    assert.equal(count(new RegExp(`<td>R${String(index).padStart(2, '0')}</td>`, 'g')), 1, `R${index}`);
  }
  for (let index = 1; index <= 28; index += 1) {
    assert.equal(count(new RegExp(`<td>T${String(index).padStart(2, '0')}</td>`, 'g')), 1, `T${index}`);
  }
  assert.ok(html.includes('15 类规则 · 28 个验收场景'));
});

test('the worked example keeps its amounts', () => {
  for (const text of ['2,680', '2,420', '2,340', '3天出差']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('1,000 + 860 + 300 + 180 = 2,340'));
});

test('structured e-vouchers replaced OCR as the default base', () => {
  for (const text of ['结构化电子凭证', '电子凭证会计数据标准', '红冲（含部分红冲）', '数电票不设作废', '20 位号码']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes('免费通道'));
});

test('state machine and submission gate are aligned', () => {
  assert.ok(html.includes('状态值以 §10.2 为准'));
  assert.ok(html.includes('人工替代记录按检查项生成'));
  assert.ok(html.includes('计划内每项检查都已给出结果'));
});

test('2026 metrics, evals and injection controls are present', () => {
  for (const text of ['建议采纳率', '推翻率与改判正确率', '盲从样本', 'pass^3', '能力集', '回归集',
    'durable execution', '注入可疑', '图片内嵌指令']) {
    assert.ok(html.includes(text), text);
  }
});

test('citations carry a review date and a scope note', () => {
  assert.ok(html.includes('均于 2026-10-26 复核'));
  assert.ok(html.includes('其余章节为设计建议'));
  assert.ok(html.includes('v1.1'));
});

test('print, theme and accessibility hooks survive the revision', () => {
  assert.match(html, /@media print/);
  assert.match(html, /id="printPage"/);
  assert.ok(html.includes("b.id='themeFab'"));
  assert.match(html, /role="region" tabindex="0"/);
  assert.match(html, /prefers-reduced-motion/);
});

test('the page stays a single, reasonably sized HTML file', async () => {
  const info = await stat(PAGE);
  assert.ok(info.size <= 90 * 1024, `page size ${info.size}`);
});
