// Follow-up to requirement 034: every standalone page must offer a way back.
// The Harness archive gets its pill from harness/nav.js; Astro pages use the
// shared component. Read-only: no browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('the return nav sits bottom-left and hides when printed', async () => {
  const nav = await read('../components/return-nav.astro');
  for (const marker of [
    'position: fixed',
    'left: 20px',
    'bottom: 22px',
    'z-index: 75',
    'aria-label="页面导航"',
    'prefers-reduced-motion',
    '@media print',
    'max-width: 400px',
    'withBase',
  ]) {
    assert.ok(nav.includes(marker), marker);
  }
  assert.match(nav, /href=\{withBase\(homeHref\)\}/);
  assert.match(nav, /href=\{withBase\('\/'\)\}/);
});

test('the interview guide renders the shared return nav', async () => {
  const page = await read('../pages/interview-guide.astro');
  assert.match(page, /import ReturnNav from '\.\.\/components\/return-nav\.astro';/);
  assert.match(page, /<\/main>\s*<ReturnNav \/>/);
});

test('the rule is written down and linked from the indexes', async () => {
  const rule = await read('../../../docs/dev/开发规范/页面与返回导航.md');
  for (const marker of [
    '独立页面必须有返回入口',
    'nav.js',
    'return-nav.astro',
    'position: fixed; left: 20px; bottom: 22px; z-index: 75',
    '打印',
    '390px',
  ]) {
    assert.ok(rule.includes(marker), marker);
  }

  const index = await read('../../../docs/dev/README.md');
  assert.match(index, /页面与返回导航\.md/);

  const workflow = await read('../../../docs/dev/开发规范/开发流程.md');
  assert.match(workflow, /页面与返回导航\.md/);

  const harness = await read('../harness/README.md');
  assert.match(harness, /return-nav\.astro/);
});
