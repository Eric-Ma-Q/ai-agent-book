// Header entry grouping: the three book-backed entries share one overbrace,
// the personally collected Harness archive gets its own, and global settings
// is the third group. These checks read the source files so they stay fast;
// the visual result is verified in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('the grouping script is injected after the four entries', async () => {
  const integration = await read('../integration.mjs');
  assert.match(
    integration,
    /const CLIENT_HEADER_GROUPS = here\('\.\/client\/header-entry-groups\.ts'\)/,
  );
  const book = integration.indexOf('CLIENT_BOOK_EXAM_ENTRY');
  const groups = integration.indexOf('CLIENT_HEADER_GROUPS');
  assert.ok(book >= 0 && groups > book, 'grouping must load after the entries');
  assert.match(
    integration,
    /injectScript\('page', `import \$\{JSON\.stringify\(CLIENT_HEADER_GROUPS\)\};`\)/,
  );
});

test('book entries, Harness and settings each get their own overbrace', async () => {
  const source = await read('../client/header-entry-groups.ts');
  for (const marker of [
    'header-entry-groups',
    'header-entry-group',
    'header-entry-group-brace',
    'header-entry-group-label',
    'AI Agent Book',
    '个人收集网页',
    '设置',
    'aria-label',
    'role',
    'preserveAspectRatio',
  ])
    assert.ok(source.includes(marker), marker);

  // The lab button also carries .hl-entry; it must not be collected twice.
  const order = [
    "'.book-exam-entry'",
    "'.lab-entry'",
    "'.hl-entry:not(.lab-entry)'",
    "'.harness-entry'",
    "'.settings-entry'",
  ].map((selector) => source.indexOf(selector));
  assert.ok(
    order.every((index) => index >= 0),
    'all five entry selectors',
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'entries stay in category order',
  );

  const labels = ['AI Agent Book', '个人收集网页', '设置'].map((label) =>
    source.indexOf(`label: '${label}'`),
  );
  assert.ok(
    labels.every((index) => index >= 0),
    'all three group labels',
  );
  assert.deepEqual(
    [...labels].sort((a, b) => a - b),
    labels,
    'groups stay in header order',
  );

  // Re-running the module (dev HMR) must not produce a second set of groups.
  assert.match(source, /querySelector\('\.header-entry-groups'\)/);
  assert.match(source, /tools\.prepend\(groups\)/);
});

test('the overbrace label is bold and the layout is responsive', async () => {
  const css = await read('../client/header-entry-groups.css');
  assert.match(
    css,
    /\.header-entry-group-label\s*\{[^}]*font-weight:\s*(?:700|800|900)/s,
  );
  assert.match(
    css,
    /\.header-entry-group-brace\s*\{[^}]*position:\s*absolute/s,
  );
  assert.match(
    css,
    /\.header-entry-group-brace\s*\{[^}]*bottom:\s*calc\(100%/s,
  );
  assert.match(css, /\.header-entry-group-line\s*\{[^}]*height:/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 400px\)/);
});

test('entry styles no longer fight over the header-tools gap', async () => {
  for (const file of [
    '../client/book-exam-entry.css',
    '../client/harness/harness-entry.css',
  ]) {
    const css = await read(file);
    assert.doesNotMatch(css, /\.header-tools\s*\{[^}]*gap/s, file);
  }
});
