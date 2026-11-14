// Requirement 033 wiring: the matrix tab, route, client and history filter are
// easy to disconnect. Keep the book and the author's experiment untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the injection tab and hash route', async () => {
  const main = await read('../client/lab/main.ts');
  assert.match(main, /id: 'injection', label: '注入'/);
  assert.match(main, /mountInjection/);
  assert.match(main, /tab === 'injection'/);
  assert.match(main, /#\/injection/);
});

test('client uses the lab API and escapes model text', async () => {
  const client = await read('../client/lab/injection.ts');
  assert.match(client, /labApi<SecurityCatalog>\('\/security\/catalog'\)/);
  assert.match(client, /labApi<\{ campaign_id: string \}>\('\/security\/campaigns'/);
  assert.match(client, /location\.hash = `#\/injection\//);
  assert.match(client, /textContent/);
  assert.doesNotMatch(client, /innerHTML/);
  assert.doesNotMatch(client, /\bfetch\s*\(/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
});

test('history hides security runs but keeps a source label', async () => {
  const history = await read('../client/lab/history.ts');
  assert.match(history, /security: '注入'/);
  assert.match(history, /run\.meta\?\.source !== 'security'/);
});

test('styles cover the matrix, detail panel and mobile layout', async () => {
  const css = await read('../client/lab/injection.css');
  for (const marker of ['lab-inj-matrix', 'lab-inj-cell', 'lab-inj-cell-panel', 'lab-inj-detail', '@media (max-width: 640px)', 'prefers-reduced-motion']) {
    assert.ok(css.includes(marker), marker);
  }
});

test('types describe the campaign report and trial', async () => {
  const types = await read('../client/lab/types.ts');
  for (const marker of ['SecurityCatalog', 'SecurityReport', 'SecurityTrial', 'answer_excerpt']) {
    assert.ok(types.includes(marker), marker);
  }
});

test('the book section and the author experiment are linked, not copied', async () => {
  const client = await read('../client/lab/injection.ts');
  assert.match(client, /提示注入：上下文安全的核心威胁/);
  assert.match(client, /chapter2\/prompt-injection/);
});
