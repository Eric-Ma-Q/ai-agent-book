// Collects every highlight and note under personal/notes/ for the
// "all highlights" page, labelled with the chapter and section it sits in.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNotes } from './notes-store.mjs';
import { PersonalError } from './paths.mjs';
import { findSection, parseOutline } from './sections.mjs';

const CHAPTER_FILE = /^chapter(10|[1-9])\.json$/;
const EDITIONS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/lib/editions.json', import.meta.url)), 'utf8'),
);

const subdirs = (dir) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];

function chapterFiles(root) {
  return subdirs(join(root, 'notes')).flatMap((dir) =>
    readdirSync(join(root, 'notes', dir.name))
      .map((name) => CHAPTER_FILE.exec(name))
      .filter(Boolean)
      .map((match) => ({ locale: dir.name, number: Number(match[1]) })),
  );
}

function readOutline(bookRoot, edition, number) {
  if (!bookRoot || !edition) return null;
  const file = join(bookRoot, edition.directory, `chapter${number}${edition.suffix}.md`);
  return existsSync(file) ? parseOutline(readFileSync(file, 'utf8')) : null;
}

/**
 * `bookRoot` is the repo root holding the book*\/ directories; without it
 * highlights come back without section labels.
 */
export function listAllHighlights(root, bookRoot) {
  const chapters = [];
  const highlights = [];
  const problems = [];
  for (const { locale, number } of chapterFiles(root)) {
    const key = `ai-agents-in-depth:${locale}:chapter${number}`;
    let records;
    try {
      records = readNotes(root, key);
    } catch (error) {
      // One unreadable file must not hide every other chapter's highlights.
      if (!(error instanceof PersonalError)) throw error;
      problems.push({ chapter: key, message: error.message });
      continue;
    }
    if (!records.length) continue;
    const edition = EDITIONS[locale];
    const outline = readOutline(bookRoot, edition, number);
    chapters.push({
      key,
      locale,
      number,
      title: outline?.title || '',
      path: edition ? `/${edition.directory}/chapter${number}${edition.suffix}/` : null,
      count: records.length,
    });
    for (const record of records) {
      const section = outline ? findSection(outline, record) : null;
      highlights.push({
        ...record,
        locale,
        chapterNumber: number,
        section: section?.title ?? null,
        parentSection: section?.parent ?? null,
      });
    }
  }
  chapters.sort((a, b) => a.locale.localeCompare(b.locale) || a.number - b.number);
  return { chapters, highlights, problems };
}
