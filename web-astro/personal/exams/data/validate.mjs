// Structural checks for the question bank. Run with:
//   node --experimental-strip-types personal/exams/data/validate.mjs
// It is intentionally dependency-free so it can run in CI or by hand.
import assert from 'node:assert/strict';
import { LEVELS, PAPERS, PARTS, QUESTIONS, STATS, TOPICS, maxOf, paperQuestions } from './index.mjs';

const PART_TYPES = {
  A: new Set(['fill', 'judge']),
  B: new Set(['single']),
  C: new Set(['multi']),
  D: new Set(['order', 'match']),
  E: new Set(['code']),
  F: new Set(['single', 'multi']),
  G: new Set(['open']),
};
const seen = new Set();
const stems = new Map();

for (const q of QUESTIONS) {
  assert.ok(q.id && typeof q.id === 'string', 'question id');
  assert.ok(!seen.has(q.id), `duplicate id: ${q.id}`);
  seen.add(q.id);

  const part = PARTS.find((p) => p.id === q.part);
  assert.ok(part, `${q.id}: unknown part ${q.part}`);
  assert.ok(PART_TYPES[q.part]?.has(q.type), `${q.id}: type ${q.type} not allowed in part ${q.part}`);
  assert.ok(TOPICS[q.topic], `${q.id}: unknown topic ${q.topic}`);
  assert.ok(LEVELS[q.level], `${q.id}: unknown level ${q.level}`);
  assert.ok(q.stem && q.stem.trim(), `${q.id}: empty stem`);
  if (q.type !== 'open') assert.ok(q.explain && q.explain.trim(), `${q.id}: empty explain`);

  if (stems.has(q.stem)) assert.fail(`duplicate stem: ${q.id} and ${stems.get(q.stem)}`);
  stems.set(q.stem, q.id);

  assert.ok(Array.isArray(q.src) && q.src.length > 0, `${q.id}: missing src`);
  for (const source of q.src) {
    assert.ok(Array.isArray(source) && source.length === 2, `${q.id}: bad src entry`);
    assert.ok(source[0] && source[1], `${q.id}: empty src entry`);
    assert.ok(/^(https?:\/\/|\/)/.test(source[1]), `${q.id}: src must be absolute: ${source[1]}`);
  }

  if (q.type === 'fill') {
    assert.ok(Array.isArray(q.blanks) && q.blanks.length >= 1, `${q.id}: blanks`);
    const markers = [...q.stem.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(markers, q.blanks.map((_, i) => i), `${q.id}: blank markers`);
    for (const [i, accepted] of q.blanks.entries()) {
      assert.ok(Array.isArray(accepted) && accepted.length >= 1, `${q.id}: blank ${i} answers`);
      assert.ok(accepted.every((v) => typeof v === 'string' && v.trim()), `${q.id}: blank ${i} empty answer`);
    }
    assert.ok(q.pts > 0, `${q.id}: pts`);
  } else if (q.type === 'judge') {
    assert.equal(typeof q.answer, 'boolean', `${q.id}: judge answer`);
    assert.equal(q.pts, 1, `${q.id}: judge pts`);
  } else if (q.type === 'single') {
    assert.ok(Array.isArray(q.options) && q.options.length >= 4, `${q.id}: options`);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id}: duplicate options`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${q.id}: single answer`);
    assert.ok(q.pts > 0, `${q.id}: pts`);
  } else if (q.type === 'multi' || q.type === 'code') {
    assert.ok(Array.isArray(q.options) && q.options.length >= 4, `${q.id}: options`);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id}: duplicate options`);
    assert.ok(Array.isArray(q.answer) && q.answer.length >= 2, `${q.id}: multi answer`);
    assert.equal(new Set(q.answer).size, q.answer.length, `${q.id}: duplicate answers`);
    for (const index of q.answer) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < q.options.length, `${q.id}: answer index ${index}`);
    }
    if (q.type === 'code') assert.ok(Array.isArray(q.code) && q.code.length >= 3, `${q.id}: code lines`);
    assert.ok(q.pts > 0, `${q.id}: pts`);
  } else if (q.type === 'order') {
    assert.ok(Array.isArray(q.items) && q.items.length >= 3, `${q.id}: order items`);
    assert.equal(new Set(q.items).size, q.items.length, `${q.id}: duplicate order item`);
    assert.ok(q.pts > 0, `${q.id}: pts`);
  } else if (q.type === 'match') {
    assert.ok(Array.isArray(q.left) && q.left.length >= 3, `${q.id}: match left`);
    assert.ok(Array.isArray(q.right) && q.right.length === q.left.length, `${q.id}: match right`);
    assert.equal(new Set(q.left).size, q.left.length, `${q.id}: duplicate left`);
    assert.equal(new Set(q.right).size, q.right.length, `${q.id}: duplicate right`);
    assert.ok(q.pts > 0, `${q.id}: pts`);
  } else if (q.type === 'open') {
    assert.ok(Array.isArray(q.rubric) && q.rubric.length >= 3, `${q.id}: rubric`);
    const sum = q.rubric.reduce((total, [text, points]) => {
      assert.ok(text && text.trim(), `${q.id}: empty rubric item`);
      assert.ok(Number.isFinite(points) && points > 0, `${q.id}: rubric points`);
      return total + points;
    }, 0);
    assert.equal(sum, maxOf(q), `${q.id}: rubric sum`);
    assert.ok(q.reference && q.reference.trim(), `${q.id}: reference`);
  } else {
    assert.fail(`${q.id}: unknown type ${q.type}`);
  }
}

assert.equal(STATS.total, QUESTIONS.length);
assert.ok(STATS.points > 0);

// Every chapter and the cross-cutting topic should appear.
for (const topic of Object.keys(TOPICS)) {
  assert.ok(QUESTIONS.some((q) => q.topic === topic), `topic not covered: ${topic}`);
}

// Each paper must be a complete parallel form: all parts, all ten chapters,
// both D sub-types, and a sane point count.
for (const paper of Object.keys(PAPERS)) {
  const list = paperQuestions(paper);
  assert.ok(list.length > 0, `${paper}: empty`);
  assert.deepEqual(
    list.map((q) => q.paper),
    list.map(() => paper),
    `${paper}: paper field`,
  );
  for (const part of PARTS) {
    assert.ok(list.some((q) => q.part === part.id), `${paper}: missing part ${part.id}`);
  }
  for (let chapter = 1; chapter <= 10; chapter += 1) {
    assert.ok(
      list.some((q) => q.topic === `ch${chapter}`),
      `${paper}: missing chapter ${chapter}`,
    );
  }
  const d = list.filter((q) => q.part === 'D');
  assert.ok(d.some((q) => q.type === 'order'), `${paper}: missing order`);
  assert.ok(d.some((q) => q.type === 'match'), `${paper}: missing match`);
  assert.ok(list.some((q) => q.type === 'open'), `${paper}: missing open`);
  assert.ok(list.some((q) => q.type === 'code'), `${paper}: missing code`);
  assert.equal(list.length, PAPERS[paper].total, `${paper}: total`);
  assert.equal(
    list.reduce((sum, q) => sum + maxOf(q), 0),
    PAPERS[paper].points,
    `${paper}: points`,
  );
}

console.log(
  `validated ${STATS.total} questions, ${STATS.points} points; ` +
    Object.entries(STATS.byPart)
      .map(([part, value]) => `${part}=${value.count}/${value.points}`)
      .join(' '),
);
console.log('types:', STATS.byType);
console.log(
  'papers:',
  Object.entries(STATS.byPaper)
    .map(([paper, value]) => `${paper}=${value.total}/${value.points}`)
    .join(' '),
);
