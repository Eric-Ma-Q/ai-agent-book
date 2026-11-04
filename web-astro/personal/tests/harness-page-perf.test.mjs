// Requirement 006 performance pass: keep the collection pages' CSS in <head>,
// stop shipping every locale pack to client scripts, and load reader-only
// extensions only where a chapter article exists. These checks read source
// files; the measured result lives in 006 design.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('collection pages import the shared stylesheet in the server frontmatter', async () => {
  for (const page of ['../pages/harness.astro', '../pages/harness-library.astro']) {
    const source = await read(page);
    assert.match(source, /import '\.\.\/client\/harness\/harness\.css';/, page);
  }
  // The client modules must not re-import it: that deferred the whole layout
  // until JS ran and caused a large layout shift.
  // Removing the CSS import also removed the module marker; keep `export {}`
  // so these files do not leak names into the global script scope.
  for (const script of ['../client/harness/main.ts', '../client/harness/library.ts']) {
    const source = await read(script);
    assert.doesNotMatch(source, /import '\.\/harness\.css';/, script);
    assert.match(source, /export \{\};/, script);
  }
});

test('reader-only extensions load through one guarded entry', async () => {
  const integration = await read('../integration.mjs');
  for (const entry of ['CLIENT_INSERTS', 'CLIENT_ANNOTATIONS', 'CLIENT_JUMP', 'CLIENT_QUOTE_JUMP']) {
    const pattern = new RegExp("injectScript\\('page', `import \\$\\{JSON\\.stringify\\(" + entry + '\\)');
    assert.doesNotMatch(integration, pattern, entry);
  }
  assert.match(integration, /injectScript\('page', `import \$\{JSON\.stringify\(CLIENT_READER_EXTRAS\)\};`\)/);

  const extras = await read('../client/reader-extras.ts');
  assert.match(extras, /querySelector\('#chapter-content'\)/);
  assert.match(extras, /import\('\.\/annotations'\)/);
  assert.match(extras, /import\('\.\/inserts'\)/);
  assert.match(extras, /params\.has\('hl'\)[\s\S]*import\('\.\/highlights-jump'\)/);
  assert.match(extras, /params\.has\('quote'\)[\s\S]*import\('\.\/quote-jump'\)/);
});

test('client scripts read the embedded message table instead of every locale', async () => {
  const integration = await read('../integration.mjs');
  assert.match(integration, /clientI18n\(\)/);
  assert.match(integration, /endsWith\('\/src\/lib\/i18n\.ts'\)/);

  const shim = await read('../client/i18n-browser.ts');
  assert.match(shim, /book-ui-messages/);
  assert.doesNotMatch(shim, /import\.meta\.glob/);
  assert.doesNotMatch(shim, /locales\//);
});
