// Requirement 006, step 6: every static relative href/src in the archived
// root pages must still resolve inside the archive after the move. Site-root
// links (such as the book's /book/chapter6/) are reader routes, not archive
// files, and are checked by the reader's own route tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE = path.resolve(HERE, '../harness/archive');
const MANIFEST = JSON.parse(await readFile(path.resolve(HERE, '../harness/manifest.json'), 'utf8'));
const PAGES_HTML = MANIFEST.files.filter((file) => file.category === 'page');
const EXTERNAL = /^(#|https?:|\/\/|mailto:|tel:|javascript:|data:)/i;
const SITE_ROOT = /^\/book\//;

const attributeLinks = (html) =>
  [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].trim());

const resolveTarget = (from, href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  return path.resolve(ARCHIVE, path.dirname(from), clean);
};

test('the 21 archived root pages have no broken relative links', async () => {
  let checked = 0;
  const missing = [];
  for (const page of PAGES_HTML) {
    const html = await readFile(path.join(ARCHIVE, page.source), 'utf8');
    for (const href of attributeLinks(html)) {
      if (!href || EXTERNAL.test(href) || SITE_ROOT.test(href)) continue;
      if (href.includes('${') || href.includes("' +")) continue; // built by script
      const target = resolveTarget(page.source, href);
      if (!target) continue;
      checked += 1;
      assert.ok(
        target === ARCHIVE || target.startsWith(`${ARCHIVE}${path.sep}`),
        `${page.source}: ${href} escapes the archive`,
      );
      const info = await stat(target).catch(() => null);
      if (!info?.isFile()) missing.push(`${page.source} -> ${href}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(checked >= 50, `expected at least 50 relative references, checked ${checked}`);
});

test('index.html links to every catalog page', async () => {
  const html = await readFile(path.join(ARCHIVE, 'index.html'), 'utf8');
  const hrefs = new Set(attributeLinks(html));
  for (const page of PAGES) {
    assert.ok(hrefs.has(page.sitePath), `index.html links to ${page.sitePath}`);
  }
});

test('the archived HTML is never rewritten on disk', async () => {
  for (const page of PAGES_HTML) {
    const html = await readFile(path.join(ARCHIVE, page.source), 'utf8');
    assert.ok(!html.includes('data-harness-nav'), `${page.source}: nav must be injected at runtime`);
  }
});

test('research volumes and both lab READMEs exist where the pages point', async () => {
  const research = MANIFEST.files.filter((file) => file.category === 'research');
  assert.equal(research.length, 19);
  for (const file of research) {
    assert.ok((await stat(path.join(ARCHIVE, file.source))).isFile(), file.source);
  }
  for (const readme of ['labs/mini-harness/README.md', 'labs/selfloop/README.md']) {
    assert.ok((await stat(path.join(ARCHIVE, readme))).isFile(), readme);
  }
});
