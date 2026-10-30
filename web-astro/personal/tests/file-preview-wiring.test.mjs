import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const integration = read('../integration.mjs');
const api = read('../api.mjs');
const clientApi = read('../client/api.ts');
const scanner = read('../client/file-preview.ts');
const panel = read('../client/file-preview/panel.ts');
const css = read('../client/file-preview.css');

test('injects the file preview client on every dev page', () => {
  assert.match(integration, /CLIENT_FILE_PREVIEW/);
  assert.match(integration, /injectScript\('page', `import \$\{JSON\.stringify\(CLIENT_FILE_PREVIEW\)\};`\)/);
});

test('registers the three read-only file routes', () => {
  assert.match(api, /'POST \/files\/resolve'/);
  assert.match(api, /'GET \/files\/read'/);
  assert.match(api, /'GET \/files\/blob'/);
  assert.match(api, /__blob/);
  assert.match(clientApi, /export async function personalBlob/);
});

test('skips code, headings, links, annotations and the assistant panel', () => {
  for (const selector of ['pre', 'h1', 'a', 'button', '.personal-anno', '.pa-root', '.reader-controls', '[data-pf-link]']) {
    assert.ok(scanner.includes(`'${selector}'`), selector);
  }
});

test('only links names the server confirmed', () => {
  assert.match(scanner, /candidates\?\.length/);
  assert.match(scanner, /dataset\.pfLink = match\.name/);
  assert.match(scanner, /aria-haspopup/);
  assert.match(scanner, /aria-label', `预览文件/);
  assert.doesNotMatch(scanner, /\.pf-link[^\n]*href="\/[^#]/);
});

test('uses a native dialog with a top layer and focus return', () => {
  assert.match(panel, /el\('dialog', 'pf-root'\)/);
  assert.match(panel, /showModal\(\)/);
  assert.match(panel, /aria-labelledby', 'pf-title/);
  assert.match(panel, /dialog\.close\(\)/);
  assert.match(panel, /trigger\?\.isConnected/);
  assert.match(panel, /lockScroll\(false\)/);
});

test('renders file text through textContent and escapes via the lab renderer', () => {
  assert.match(panel, /pre\.textContent = text/);
  assert.match(panel, /el\('span', 'pf-src-line', line/);
  assert.match(panel, /md\.innerHTML = renderMarkdown\(slice\.text\)/);
  assert.doesNotMatch(panel, /innerHTML = (file|data|payload)\.text/);
  assert.doesNotMatch(panel, /innerHTML = text/);
  assert.doesNotMatch(panel, /insertAdjacentHTML/);
});

test('segments large text and caps table rows', () => {
  assert.match(panel, /const CHUNK = 200/);
  assert.match(panel, /const CSV_STEP = 100/);
  assert.match(panel, /const CSV_LIMIT = 500/);
  assert.match(panel, /sliceLines\(/);
  assert.match(panel, /加载下一段/);
});

test('builds the page file index from confirmed names only', () => {
  assert.match(scanner, /buildIndexEntries\(order, occurrences, candidatesByName, totalsByName\)/);
  assert.match(scanner, /querySelector\('\.reader-controls'\)/);
  assert.match(scanner, /is-floating/);
  assert.match(scanner, /本页文件/);
  assert.match(css, /\.pf-index-item/);
  assert.match(css, /\.pf-index-trigger/);
});

test('find only runs where the highlight API exists', () => {
  assert.match(panel, /CSS\?\.highlights/);
  assert.match(panel, /hasHighlightApi/);
  assert.match(css, /::highlight\(pf-hit\)/);
});

test('scrolls find hits by the matched range, not the enclosing block', () => {
  assert.match(panel, /hit\.getClientRects\(\)\[0\]/);
  assert.match(panel, /scrollTopForHit\(/);
  assert.doesNotMatch(panel, /scrollIntoView/);
});

test('ships the link, dialog, mobile and print styles', () => {
  for (const selector of ['.pf-link', '.pf-root', '.pf-root[open]', '.pf-readonly', '.pf-src-row', '.pf-csv-table']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media print/);
  assert.match(css, /\.pf-root::backdrop/);
  assert.match(css, /html\.pf-open/);
});

test('does not join paths or write files from the browser', () => {
  assert.doesNotMatch(scanner, /fetch\(`\/__personal\/files\/read\?path=\$\{/);
  assert.match(panel, /encodeURIComponent\(candidate\.path\)/);
  assert.doesNotMatch(panel, /writeFile|readFileSync/);
  assert.doesNotMatch(scanner, /writeFile|readFileSync/);
});
