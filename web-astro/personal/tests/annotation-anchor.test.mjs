import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotationSpans, collapse, locateAnnotation } from '../client/annotation-anchor.ts';

test('collapses whitespace runs and maps back to raw offsets', () => {
  const { text, offsets } = collapse('a \n\t b  c');
  assert.equal(text, 'a b c');
  assert.deepEqual(offsets, [0, 1, 5, 6, 8, 9]);
});

test('a unique quote anchors by itself', () => {
  assert.deepEqual(locateAnnotation('使用 KV Cache 加速', { id: 'a', quote: 'KV Cache' }), { start: 3, end: 11 });
});

test('a repeated quote needs a unique context, and never guesses', () => {
  const text = 'ReAct 循环。后来 ReAct 被广泛采用。';
  assert.equal(locateAnnotation(text, { id: 'a', quote: 'ReAct' }), null);
  assert.deepEqual(locateAnnotation(text, { id: 'a', quote: 'ReAct', context: '后来 ReAct 被' }), {
    start: 12,
    end: 17,
  });
  assert.equal(locateAnnotation(text, { id: 'a', quote: 'ReAct', context: '不存在 ReAct' }), null);
  assert.equal(locateAnnotation(text, { id: 'a', quote: 'GRPO', context: '后来 ReAct 被' }), null);
});

test('spans use raw offsets even when the DOM text has extra whitespace', () => {
  const raw = '模型\n  调用 Chat\n Template 渲染';
  const [span] = annotationSpans(raw, [{ id: 'a', quote: 'Chat Template' }]);
  assert.equal(raw.slice(span.start, span.end), 'Chat\n Template');
});

test('overlapping annotations keep the one that starts first', () => {
  const spans = annotationSpans('上下文工程与提示工程', [
    { id: 'late', quote: '工程与提示' },
    { id: 'early', quote: '上下文工程' },
    { id: 'apart', quote: '提示工程', context: '与提示工程' },
  ]);
  assert.deepEqual(spans.map((span) => span.id), ['early', 'apart']);
});

test('unmatched annotations are dropped', () => {
  assert.deepEqual(annotationSpans('abc', [{ id: 'x', quote: 'zzz' }]), []);
});
