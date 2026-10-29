// Content and wiring checks for the A/B book exam. The HTML and Markdown are
// generated from personal/exams/data; this test keeps the generated artifacts
// in sync with the source bank without rebuilding or writing anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVELS,
  PAPERS,
  PARTS,
  QUESTIONS,
  STATS,
  TOPICS,
  maxOf,
  paperQuestions,
} from '../exams/data/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMS = path.resolve(HERE, '../exams');

const bankFromHtml = (html) => {
  const start = html.indexOf('var Q=');
  const end = html.indexOf(';\nvar CHAPTER_URL', start);
  assert.ok(start >= 0 && end > start, 'question bank placeholder');
  return JSON.parse(html.slice(start + 'var Q='.length, end));
};

test('book exam is split into two parallel papers', () => {
  assert.equal(STATS.total, 131);
  assert.equal(STATS.points, 407);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(PAPERS).map((paper) => [
        paper,
        [STATS.byPaper[paper].total, STATS.byPaper[paper].points],
      ]),
    ),
    { A: [67, 204], B: [64, 203] },
  );
  for (const paper of Object.keys(PAPERS)) {
    const list = paperQuestions(paper);
    assert.equal(list.length, PAPERS[paper].total);
    assert.equal(list.reduce((sum, q) => sum + maxOf(q), 0), PAPERS[paper].points);
    for (const part of PARTS) assert.ok(list.some((q) => q.part === part.id), `${paper}: part ${part.id}`);
    for (let chapter = 1; chapter <= 10; chapter += 1)
      assert.ok(list.some((q) => q.topic === `ch${chapter}`), `${paper}: chapter ${chapter}`);
    const d = list.filter((q) => q.part === 'D');
    assert.ok(d.filter((q) => q.type === 'order').length >= 2, `${paper}: order`);
    assert.ok(d.filter((q) => q.type === 'match').length >= 2, `${paper}: match`);
  }
});

test('question ids, topics, levels and answers are valid', () => {
  const ids = new Set();
  for (const question of QUESTIONS) {
    assert.ok(!ids.has(question.id), `duplicate id ${question.id}`);
    ids.add(question.id);
    assert.ok(PAPERS[question.paper], `${question.id}: paper`);
    assert.ok(TOPICS[question.topic], `${question.id}: topic`);
    assert.ok(LEVELS[question.level], `${question.id}: level`);
    assert.ok(Array.isArray(question.src) && question.src.length > 0, `${question.id}: src`);
    for (const [label, href] of question.src) {
      assert.ok(label && href, `${question.id}: src entry`);
      assert.match(href, /^(https?:\/\/|\/)/, `${question.id}: src href`);
    }
    if (question.type === 'fill') {
      const markers = [...question.stem.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
      assert.deepEqual(markers, question.blanks.map((_, index) => index), `${question.id}: blanks`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'judge') {
      assert.equal(typeof question.answer, 'boolean', `${question.id}: judge`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'single') {
      assert.ok(Number.isInteger(question.answer), `${question.id}: answer`);
      assert.ok(question.answer >= 0 && question.answer < question.options.length, `${question.id}: answer range`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'multi' || question.type === 'code') {
      assert.ok(Array.isArray(question.answer) && question.answer.length >= 2, `${question.id}: answer`);
      assert.ok(question.answer.every((index) => index >= 0 && index < question.options.length), `${question.id}: answer range`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'order') {
      assert.ok(question.items.length >= 3, `${question.id}: items`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'match') {
      assert.equal(question.left.length, question.right.length, `${question.id}: match`);
      assert.ok(question.explain, `${question.id}: explain`);
    } else if (question.type === 'open') {
      assert.ok(question.rubric.length >= 3, `${question.id}: rubric`);
      assert.ok(question.reference, `${question.id}: reference`);
    } else {
      assert.fail(`${question.id}: unknown type ${question.type}`);
    }
  }
});

test('generated HTML pages contain the matching paper bank', async () => {
  for (const paper of Object.values(PAPERS)) {
    const html = await readFile(path.join(EXAMS, paper.file), 'utf8');
    assert.match(html, new RegExp(paper.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(html.includes(paper.storeKey), `${paper.id}: store key`);
    const bank = bankFromHtml(html);
    assert.deepEqual(
      bank.map((question) => question.id),
      paperQuestions(paper.id).map((question) => question.id),
      `${paper.id}: bank`,
    );
  }
});

test('generated Markdown pages have questions and an answer key', async () => {
  for (const paper of Object.values(PAPERS)) {
    const md = await readFile(path.join(EXAMS, paper.markdown), 'utf8');
    assert.ok(md.startsWith(`# ${paper.title}`), `${paper.id}: title`);
    assert.match(md, /^## 参考答案与解析$/m);
    for (const question of paperQuestions(paper.id)) {
      assert.ok(md.includes(`### ${question.id}`), `${paper.id}: ${question.id} missing`);
    }
    for (const question of paperQuestions(paper.id)) {
      assert.ok(!md.includes(`### ${question.id}（0 分`), `${paper.id}: ${question.id} points`);
    }
  }
});

test('question content cites the book, not the Harness archive', () => {
  for (const question of QUESTIONS) {
    for (const [, href] of question.src) {
      assert.ok(
        /^https:\/\/bojieli\.github\.io\/ai-agent-book\//.test(href),
        `${question.id}: unexpected source ${href}`,
      );
      assert.ok(!href.includes('/harness'), `${question.id}: harness source ${href}`);
    }
  }
});
