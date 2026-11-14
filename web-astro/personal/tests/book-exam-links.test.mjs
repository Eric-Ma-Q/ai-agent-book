// 出处链接：生成的 A/B 卷是可双击打开的单文件，保留作者线上书地址；
// 阅读器提供同一份 HTML 时，出处必须换成本站章节路由。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHOR_BOOK_BASE,
  readerBookHref,
  rewriteAuthorBookLinks,
} from '../exams/reader-links.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMS = path.resolve(HERE, '../exams');

test('readerBookHref maps the author site onto local book routes', () => {
  assert.equal(readerBookHref(`${AUTHOR_BOOK_BASE}/book/chapter2/`), '/book/chapter2/');
  assert.equal(
    readerBookHref(`${AUTHOR_BOOK_BASE}/book/chapter10/?quote=x#kv`, '/base'),
    '/base/book/chapter10/?quote=x#kv',
  );
  assert.equal(readerBookHref(`${AUTHOR_BOOK_BASE}/`, '/base/'), '/base/');
  assert.equal(readerBookHref('/site/index.html', '/base'), '/site/index.html');
  assert.equal(readerBookHref('https://example.com/a', '/base'), 'https://example.com/a');
});

test('rewriteAuthorBookLinks covers hrefs and the inline CHAPTER_URL', () => {
  const html = [
    `<a href="${AUTHOR_BOOK_BASE}/book/chapter3/">出处</a>`,
    `var CHAPTER_URL={"ch3":"${AUTHOR_BOOK_BASE}/book/chapter3/","cross":"${AUTHOR_BOOK_BASE}/"};`,
  ].join('\n');
  const rewritten = rewriteAuthorBookLinks(html, '/base');
  assert.ok(!rewritten.includes('bojieli.github.io'));
  assert.ok(rewritten.includes('href="/base/book/chapter3/"'));
  assert.ok(rewritten.includes('"ch3":"/base/book/chapter3/"'));
  assert.ok(rewritten.includes('"cross":"/base/"'));
});

test('generated papers keep full URLs on disk and become local links in the reader', async () => {
  for (const file of ['ai-agent-book-exam-a.html', 'ai-agent-book-exam-b.html']) {
    const html = await readFile(path.join(EXAMS, file), 'utf8');
    assert.ok(html.includes(`${AUTHOR_BOOK_BASE}/book/chapter1/`), `${file}: standalone keeps author URL`);
    const local = rewriteAuthorBookLinks(html);
    assert.ok(!local.includes('bojieli.github.io'), `${file}: reader output has no author origin`);
    for (let chapter = 1; chapter <= 10; chapter += 1) {
      assert.ok(local.includes(`"/book/chapter${chapter}/"`), `${file}: chapter${chapter} local link`);
    }
    assert.ok(local.includes('"cross":"/"'), `${file}: cross link goes to the reader home`);
  }
});
