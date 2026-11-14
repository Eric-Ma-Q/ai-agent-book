// Generate library.json from manifest.json + catalog.mjs. Titles prefer the
// catalog page titles, then the HTML <title>, then the first Markdown heading,
// then the file name. Re-run after changing the archive or the catalog.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_CATEGORIES, PAGES } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(HERE, 'manifest.json');
const LIBRARY_PATH = path.join(HERE, 'library.json');

const TITLES = new Map();
for (const page of PAGES) TITLES.set(`archive/${page.sitePath}`, page.title);

function decode(buffer) {
  return buffer.toString('utf8');
}

function htmlTitle(text) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function markdownTitle(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1].replace(/`/g, '').trim();
  }
  return '';
}

async function titleFor(file, buffer) {
  const known = TITLES.get(file.target);
  if (known) return known;
  const extension = path.extname(file.source).toLowerCase();
  if (extension === '.html') {
    const title = htmlTitle(decode(buffer));
    if (title) return title;
  }
  if (extension === '.md') {
    const title = markdownTitle(decode(buffer));
    if (title) return title;
  }
  return path.basename(file.target);
}

export async function buildLibrary({ log = console.log } = {}) {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const byCategory = new Map();
  for (const file of manifest.files) {
    if (file.category === 'meta') continue;
    if (!byCategory.has(file.category)) byCategory.set(file.category, []);
    byCategory.get(file.category).push(file);
  }

  const categories = [];
  for (const definition of LIBRARY_CATEGORIES) {
    const files = (byCategory.get(definition.category) ?? [])
      .slice()
      .sort((a, b) => a.target.localeCompare(b.target, 'en'));
    if (files.length === 0) throw new Error(`category ${definition.id} is empty`);
    const entries = [];
    for (const file of files) {
      const buffer = await readFile(path.join(HERE, file.target));
      entries.push({
        path: file.target,
        source: file.source,
        title: await titleFor(file, buffer),
        url: file.url,
        bytes: file.bytes,
      });
    }
    categories.push({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      count: entries.length,
      files: entries,
    });
  }

  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const library = {
    format: 'harness-library',
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: manifest.sourceCommit,
    total,
    metaCount: manifest.counts.meta ?? 0,
    categories,
  };
  await writeFile(LIBRARY_PATH, `${JSON.stringify(library, null, 2)}\n`);
  const summary = categories.map((category) => `${category.id}=${category.count}`).join(' ');
  log(`library: ${total} files + ${library.metaCount} meta (${summary})`);
  return library;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildLibrary();
  } catch (error) {
    console.error(`build-library failed: ${error.message}`);
    process.exitCode = 1;
  }
}
