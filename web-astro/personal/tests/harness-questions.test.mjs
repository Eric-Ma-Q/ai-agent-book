// Requirement 007 / 010: the favorites page reads question text from the two
// archived exam pages and the book A/B pages. These tests lock the extracted
// shape and keep the derived answer/explanation text consistent with the bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readExamQuestions } from '../harness/questions.mjs';
import { EXAMS } from '../harness/exams.mjs';

const ARCHIVE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../harness/archive',
);
const QUESTIONS = readExamQuestions(ARCHIVE);
const forExam = (exam) =>
  QUESTIONS.filter((question) => question.exam === exam);

test('reads the archived and book question banks with their points', () => {
  assert.equal(QUESTIONS.length, 343);
  const harness = forExam('harness');
  const pm = forExam('ai-pm');
  const bookA = forExam('book-a');
  const bookB = forExam('book-b');
  assert.equal(harness.length, 97);
  assert.equal(pm.length, 115);
  assert.equal(bookA.length, 67);
  assert.equal(bookB.length, 64);
  assert.equal(
    harness.reduce((sum, question) => sum + question.pts, 0),
    294,
  );
  assert.equal(
    pm.reduce((sum, question) => sum + question.pts, 0),
    324,
  );
  assert.equal(
    bookA.reduce((sum, question) => sum + question.pts, 0),
    204,
  );
  assert.equal(
    bookB.reduce((sum, question) => sum + question.pts, 0),
    203,
  );
});

test('the AI PM bank follows the 2026-10 page refresh', () => {
  const pm = forExam('ai-pm');
  const byId = new Map(pm.map((question) => [question.id, question]));
  // D11 keeps the dimension name used by ai-pm-resume.html since requirement 025.
  assert.ok(byId.get('D11').search.includes('上下文工程'));
  assert.ok(!byId.get('D11').search.includes('上下文与 prompt 工程'));
  // Requirement 028 adds one question per refreshed mechanism.
  for (const id of [
    'A29',
    'A30',
    'A31',
    'B29',
    'B30',
    'B31',
    'C19',
    'C20',
    'C21',
    'F11',
  ])
    assert.ok(byId.has(id), `${id} missing`);
  assert.ok(byId.get('B31').search.includes('红冲'), 'B31 红冲');
  assert.ok(byId.get('C20').search.includes('durable execution'), 'C20');
  assert.ok(byId.get('B30').search.includes('拉勾'), 'B30 拉勾');
  assert.ok(byId.get('F11').search.includes('fde'), 'F11 FDE');
});

test('question ids are unique inside each exam and every part A-G appears', () => {
  for (const exam of EXAMS) {
    const list = forExam(exam.id);
    const ids = new Set(list.map((question) => question.id));
    assert.equal(ids.size, list.length, exam.id);
    for (const part of ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
      assert.ok(
        list.some((question) => question.part === part),
        `${exam.id}: part ${part}`,
      );
  }
});

test('display fields are filled and placeholders are resolved', () => {
  for (const question of QUESTIONS) {
    for (const field of [
      'partName',
      'typeLabel',
      'topicLabel',
      'levelLabel',
      'stemHtml',
      'search',
    ])
      assert.ok(question[field], `${question.exam}:${question.id}: ${field}`);
    assert.ok(
      !question.stemHtml.includes('{{'),
      `${question.exam}:${question.id}: stem`,
    );
    assert.ok(
      !question.explainHtml.includes('[['),
      `${question.exam}:${question.id}: explain`,
    );
    assert.ok(question.search.includes(question.id.toLowerCase()), question.id);
    assert.ok(
      question.search.includes(question.topicLabel.toLowerCase()),
      question.id,
    );
    assert.ok(question.pts > 0, `${question.id}: points`);
    assert.ok(
      question.answerHtml.length > 0 || question.type === 'open',
      question.id,
    );
    assert.ok(
      question.explainHtml.length > 0 || question.type === 'open',
      question.id,
    );
  }
});

test('choice options match the stored answer', () => {
  for (const question of QUESTIONS) {
    const correct = question.options.filter((option) => option.correct);
    if (question.type === 'single' || question.type === 'judge') {
      assert.equal(correct.length, 1, `${question.exam}:${question.id}`);
      if (question.type === 'single')
        assert.ok(
          question.answerHtml.startsWith(`${correct[0].key}.`),
          question.id,
        );
      else assert.equal(question.answerHtml, correct[0].textHtml, question.id);
    } else if (question.type === 'multi' || question.type === 'code') {
      assert.ok(correct.length >= 1, `${question.exam}:${question.id}`);
      assert.deepEqual(
        question.answerHtml.split('、').sort(),
        correct.map((option) => option.key).sort(),
        `${question.exam}:${question.id}`,
      );
    } else {
      assert.equal(
        question.options.length,
        0,
        `${question.exam}:${question.id}`,
      );
    }
  }
});

test('type-specific content is present', () => {
  for (const question of QUESTIONS) {
    if (question.type === 'fill') {
      assert.ok(question.stemHtml.includes('fav-blank'), question.id);
      assert.match(question.answerHtml, /^第1空：/);
    }
    if (question.type === 'order')
      assert.ok(question.answerHtml.includes(' → '), question.id);
    if (question.type === 'match')
      assert.ok(question.answerHtml.includes(' ↔ '), question.id);
    if (question.type === 'code')
      assert.ok(question.code.length > 0, question.id);
    if (question.type === 'open') {
      assert.equal(question.answerHtml, '');
      assert.ok(question.rubric.length > 0, question.id);
      assert.ok(question.referenceHtml.length > 0, question.id);
      assert.equal(
        question.pts,
        question.rubric.reduce((sum, item) => sum + item.points, 0),
        question.id,
      );
    }
  }
  const pmCode = forExam('ai-pm').find((question) => question.type === 'code');
  const harnessCode = forExam('harness').find(
    (question) => question.type === 'code',
  );
  const bookCode = forExam('book-a').find(
    (question) => question.type === 'code',
  );
  assert.equal(pmCode.typeLabel, '材料诊断');
  assert.equal(harnessCode.typeLabel, '代码诊断');
  assert.equal(bookCode.typeLabel, '代码与实验诊断');
  assert.ok(QUESTIONS.some((question) => question.scenario.length > 0));
});

test('source links point inside the archive or to the book', async () => {
  for (const question of QUESTIONS) {
    for (const source of question.sources) {
      if (question.exam === 'book-a' || question.exam === 'book-b') {
        assert.match(
          source.href,
          /^https:\/\/bojieli\.github\.io\/ai-agent-book\//,
          `${question.id}: book source`,
        );
        continue;
      }
      assert.ok(
        !/^https?:/i.test(source.href),
        `${question.id}: external source`,
      );
      const file = source.href.split('#')[0];
      if (!file) continue;
      assert.ok(
        (await stat(path.join(ARCHIVE, file))).isFile(),
        `${question.id}: ${source.href}`,
      );
    }
  }
});
