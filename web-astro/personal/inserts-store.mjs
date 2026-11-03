// User-written passages inserted into a chapter. Each insert is one Markdown
// file whose frontmatter records where it belongs, so it can be read, edited
// and reviewed in git like any other prose.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { assertEntryId, insertsDir, PersonalError } from './paths.mjs';
import { removeFile, writeAtomic } from './fs-utils.mjs';

const MAX_MARKDOWN = 100000;
const MAX_ANCHOR = 200;

const asString = (value) =>
  value instanceof Date ? value.toISOString() : value == null ? '' : String(value);

export function parseInsert(id, source) {
  const { frontmatter, content } = parseFrontmatter(source);
  const offset = Number(frontmatter.offset);
  return {
    id,
    after: asString(frontmatter.after),
    section: asString(frontmatter.section),
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    created: asString(frontmatter.created),
    updated: asString(frontmatter.updated),
    markdown: content.replace(/^\n+/, ''),
  };
}

// JSON strings are valid YAML double-quoted scalars, so no YAML library is needed to write.
export function serializeInsert(insert) {
  const fields = ['after', 'section', 'offset', 'created', 'updated'];
  const header = fields
    .map((field) => `${field}: ${JSON.stringify(insert[field])}`)
    .join('\n');
  const body = insert.markdown.endsWith('\n') ? insert.markdown : `${insert.markdown}\n`;
  return `---\n${header}\n---\n\n${body}`;
}

export function listInserts(root, key) {
  const dir = insertsDir(root, key);
  let files;
  try {
    files = readdirSync(dir).filter((name) => /^[A-Za-z0-9_-]{1,100}\.md$/.test(name));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return files
    .map((name) =>
      parseInsert(name.slice(0, -3), readFileSync(join(dir, name), 'utf8')),
    )
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

export function newInsertId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new PersonalError(400, 'Invalid insert');
  const { markdown, after = '', section = '', offset = 0 } = draft;
  if (typeof markdown !== 'string' || !markdown.trim() || markdown.length > MAX_MARKDOWN)
    throw new PersonalError(400, 'Insert text is empty or too long');
  if (typeof after !== 'string' || after.length > MAX_ANCHOR)
    throw new PersonalError(400, 'Invalid anchor text');
  if (typeof section !== 'string' || section.length > MAX_ANCHOR)
    throw new PersonalError(400, 'Invalid section');
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new PersonalError(400, 'Invalid offset');
  return { markdown, after, section, offset };
}

// A new insert takes its anchor from the request; an edit keeps its original anchor.
export function saveInsert(root, key, draft, now = new Date()) {
  const fields = validateDraft(draft);
  const timestamp = now.toISOString();
  const id = draft.id === undefined ? undefined : assertEntryId(draft.id);
  const existing = id && listInserts(root, key).find((item) => item.id === id);
  if (draft.id !== undefined && !existing)
    throw new PersonalError(404, 'This insert no longer exists.');
  const insert = existing
    ? { ...existing, markdown: fields.markdown, updated: timestamp }
    : { id: newInsertId(now), ...fields, created: timestamp, updated: timestamp };
  writeAtomic(join(insertsDir(root, key), `${insert.id}.md`), serializeInsert(insert));
  return insert;
}

export function removeInsert(root, key, id) {
  removeFile(join(insertsDir(root, key), `${assertEntryId(id)}.md`));
}
