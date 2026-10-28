import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateLabel,
  buildIndexEntries,
  detectFileNames,
  findFileNames,
  formatBytes,
  formatJson,
  formatJsonl,
  formatLabel,
  formatOf,
  formatTime,
  isTextFormat,
  parseDelimited,
  scrollTopForHit,
  sliceLines,
} from '../client/file-preview/model.ts';

test('detects filenames and paths, but not domains, versions or unknown extensions', () => {
  assert.deepEqual(detectFileNames('从 t3a_failed.md 中抽取'), ['t3a_failed.md']);
  assert.deepEqual(detectFileNames('见 chapter7/android-world/t3a_failed.md。'), [
    'chapter7/android-world/t3a_failed.md',
  ]);
  assert.deepEqual(detectFileNames('修改 foo.test.mjs 与 报告.md'), ['foo.test.mjs', '报告.md']);
  assert.deepEqual(detectFileNames('./docs/a.md'), ['docs/a.md']);
  assert.deepEqual(detectFileNames('访问 example.com、v1.2、foo.unknownext 和 README'), []);
  assert.deepEqual(detectFileNames('`t3a.md` 重复 t3a.md'), ['t3a.md']);
});

test('returns offsets for every detected name', () => {
  const text = '从 t3a_failed.md 到 chapter7/README.md。';
  const matches = findFileNames(text);
  assert.deepEqual(
    matches.map((match) => [match.name, text.slice(match.start, match.end)]),
    [
      ['t3a_failed.md', 't3a_failed.md'],
      ['chapter7/README.md', 'chapter7/README.md'],
    ],
  );
});

test('maps extensions to formats and labels', () => {
  assert.equal(formatOf('md'), 'markdown');
  assert.equal(formatOf('markdown'), 'markdown');
  assert.equal(formatOf('json'), 'json');
  assert.equal(formatOf('jsonl'), 'jsonl');
  assert.equal(formatOf('csv'), 'csv');
  assert.equal(formatOf('tsv'), 'tsv');
  assert.equal(formatOf('py'), 'code');
  assert.equal(formatOf('tsx'), 'code');
  assert.equal(formatOf('png'), 'image');
  assert.equal(formatOf('jpg'), 'image');
  assert.equal(formatOf('pdf'), 'pdf');
  assert.equal(formatOf('docx'), 'binary');
  assert.equal(formatOf('zip'), 'binary');
  assert.equal(formatOf('txt'), 'text');
  assert.equal(formatOf('html'), 'html');
  assert.equal(isTextFormat('markdown'), true);
  assert.equal(isTextFormat('image'), false);
  assert.equal(isTextFormat('binary'), false);
  assert.equal(formatLabel('jsonl'), 'JSONL');
});

test('slices text at line boundaries', () => {
  const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
  const first = sliceLines(text, 5);
  assert.equal(first.end, 5);
  assert.equal(first.total, 10);
  assert.equal(first.done, false);
  assert.equal(first.text.split('\n').length, 5);
  const all = sliceLines(text, 99);
  assert.equal(all.end, 10);
  assert.equal(all.done, true);
});

test('moves the slice boundary past a table instead of cutting a row', () => {
  const lines = [
    'intro',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '| 3 | 4 |',
    '| 5 | 6 |',
    '',
    'after',
  ];
  const slice = sliceLines(lines.join('\n'), 5);
  assert.equal(slice.end, 7);
  assert.equal(slice.text.includes('| 5 | 6 |'), true);
});

test('caps a fence that never closes inside the extension window', () => {
  const fence = '```shell\n' + Array.from({ length: 900 }, (_, i) => `log ${i}`).join('\n');
  const capped = sliceLines(fence, 200);
  assert.equal(capped.end, 400);
  assert.equal(capped.done, false);
  const raw = sliceLines(fence, 200, 200, { blockAware: false });
  assert.equal(raw.end, 200);
});

test('moves the slice boundary past a closed code fence', () => {
  const lines = ['intro', '', '```py', 'print(1)', 'print(2)', '```', '', 'after'];
  const slice = sliceLines(lines.join('\n'), 4);
  assert.equal(slice.end, 6);
  assert.equal(slice.text.trim().endsWith('```'), true);
});

test('parses quoted CSV, escaped quotes and CRLF', () => {
  const parsed = parseDelimited('name,note\r\n"a,b","say ""hi"""\r\nc,plain\r\n');
  assert.deepEqual(parsed.header, ['name', 'note']);
  assert.deepEqual(parsed.rows, [
    ['a,b', 'say "hi"'],
    ['c', 'plain'],
  ]);
  assert.equal(parsed.truncatedRows, false);
});

test('truncates CSV rows and columns', () => {
  const text = 'a,b,c\n1,2,3\n4,5,6\n7,8,9';
  const limited = parseDelimited(text, { maxCols: 2 });
  assert.deepEqual(limited.header, ['a', 'b']);
  assert.equal(limited.truncatedCols, true);
  const rows = parseDelimited(text, { maxRows: 1 });
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.truncatedRows, true);
});

test('supports TSV and quoted tabs', () => {
  const parsed = parseDelimited('a\tb\n"x\ty"\tz', { delimiter: '\t' });
  assert.deepEqual(parsed.rows, [['x\ty', 'z']]);
});

test('formats JSON and falls back to the raw text', () => {
  assert.deepEqual(formatJson('{"a":1}'), { ok: true, text: '{\n  "a": 1\n}' });
  const bad = formatJson('{oops');
  assert.equal(bad.ok, false);
  assert.equal(bad.text, '{oops');
});

test('formats JSONL line by line and reports the first broken line', () => {
  const good = formatJsonl('{"a":1}\n{"b":2}\n');
  assert.equal(good.ok, true);
  assert.equal(good.lines, 2);
  assert.match(good.text, /"a": 1/);
  const bad = formatJsonl('{"a":1}\nnope\n');
  assert.equal(bad.ok, false);
  assert.equal(bad.failed, true);
  assert.match(bad.text, /nope/);
  const limited = formatJsonl('{"a":1}\n{"b":2}\n{"c":3}\n', 2);
  assert.equal(limited.truncated, true);
  assert.equal(limited.lines, 3);
});

test('formats bytes and times', () => {
  assert.equal(formatBytes(12), '12 B');
  assert.equal(formatBytes(3120), '3.0 KB');
  assert.equal(formatBytes(593_000), '579 KB');
  assert.equal(formatBytes(20 * 1024 * 1024), '20.0 MB');
  assert.equal(formatTime('2026-10-04T08:27:00+08:00'), '2026-10-04 08:27');
  assert.equal(formatTime('not-a-date'), 'not-a-date');
});

test('labels candidates with path and size', () => {
  const entry = {
    path: 'chapter7/android-world/README.md',
    name: 'README.md',
    dir: 'chapter7/android-world',
    ext: 'md',
    format: 'markdown',
    bytes: 3120,
    mtime: '2026-10-04T08:27:00+08:00',
  };
  assert.equal(candidateLabel(entry), 'chapter7/android-world/README.md · 3.0 KB');
});


test('builds page index entries in first-seen order and drops unconfirmed names', () => {
  const entry = (path, bytes) => ({
    path,
    name: path.split('/').pop(),
    dir: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    ext: 'md',
    format: 'markdown',
    bytes,
    mtime: '2026-10-04T08:27:00+08:00',
  });
  const candidates = new Map([
    ['a.md', [entry('chapter7/a.md', 1024)]],
    ['b.md', []],
    ['c.md', [entry('docs/c.md', 2048)]],
  ]);
  const totals = new Map([
    ['a.md', 3],
    ['c.md', 1],
  ]);
  const entries = buildIndexEntries(['a.md', 'b.md', 'c.md'], new Map([['a.md', 2]]), candidates, totals);
  assert.deepEqual(
    entries.map((item) => [item.name, item.total, item.occurrences]),
    [
      ['a.md', 3, 2],
      ['c.md', 1, 1],
    ],
  );
});

test('scrolls find hits by their own rect and never by the enclosing block', () => {
  const view = { scrollTop: 0, clientHeight: 300, scrollHeight: 2000, top: 100, bottom: 400 };
  // already inside the padded band
  assert.equal(scrollTopForHit(view, { top: 150, bottom: 164 }), null);
  // below the fold: centre it
  assert.equal(scrollTopForHit(view, { top: 500, bottom: 514 }), 257);
  // above the fold after scrolling: centre it upward
  assert.equal(scrollTopForHit({ ...view, scrollTop: 500 }, { top: 120, bottom: 134 }), 377);
  // clamp at the bottom and the top
  assert.equal(scrollTopForHit({ ...view, scrollTop: 1900 }, { top: 3000, bottom: 3014 }), 1700);
  assert.equal(scrollTopForHit({ ...view, scrollTop: 10 }, { top: 90, bottom: 104 }), 0);
  // a hit taller than the visible band aligns its top instead of centring
  assert.equal(scrollTopForHit(view, { top: 160, bottom: 540 }), 20);
});
