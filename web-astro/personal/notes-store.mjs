// File-backed highlights and notes. The tracked file uses the reader's own
// backup format, so it can also be imported into or exported from the reader.
// Every operation is synchronous, so concurrent requests cannot interleave.
import { draftsFile, notesFile, PersonalError } from './paths.mjs';
import { readJson, removeFile, writeJson } from './fs-utils.mjs';

const FORMAT = 'ai-agent-book-highlights';
const MAX_TEXT = 10000;

function loadNotes(root, key) {
  const data = readJson(notesFile(root, key), { highlights: [] });
  if (!Array.isArray(data.highlights))
    throw new PersonalError(500, `Malformed notes file for ${key}`);
  return data.highlights;
}

function saveNotes(root, key, records) {
  const file = notesFile(root, key);
  if (!records.length) return removeFile(file);
  const highlights = [...records].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  writeJson(file, { format: FORMAT, version: 2, highlights });
}

function loadDrafts(root, key) {
  return readJson(draftsFile(root, key), {});
}

function saveDrafts(root, key, drafts) {
  const file = draftsFile(root, key);
  if (!Object.keys(drafts).length) return removeFile(file);
  writeJson(file, drafts);
}

const isText = (value, max = MAX_TEXT) =>
  typeof value === 'string' && value.length <= max;

export function validateAnnotation(item, key) {
  const valid =
    item &&
    typeof item === 'object' &&
    isText(item.id, 100) &&
    item.id.length > 0 &&
    item.chapter === key &&
    isText(item.quote) &&
    item.quote.trim().length > 0 &&
    isText(item.prefix, 64) &&
    isText(item.suffix, 64) &&
    Number.isSafeInteger(item.start) &&
    Number.isSafeInteger(item.end) &&
    item.end - item.start === item.quote.length &&
    isText(item.createdAt, 64) &&
    (item.note === undefined || isText(item.note)) &&
    (item.noteDraft === undefined || isText(item.noteDraft));
  if (!valid) throw new PersonalError(400, 'Invalid highlight record');
  const { noteDraft, ...stored } = item;
  return { stored: pick(stored), noteDraft };
}

// Keep only known fields so arbitrary request data never lands in the file.
function pick({ id, chapter, quote, prefix, suffix, start, end, createdAt, note }) {
  return {
    id,
    chapter,
    quote,
    prefix,
    suffix,
    start,
    end,
    createdAt,
    ...(note !== undefined ? { note } : {}),
  };
}

const withDraft = (record, drafts) =>
  drafts[record.id] !== undefined
    ? { ...record, noteDraft: drafts[record.id] }
    : record;

export function readNotes(root, key) {
  const drafts = loadDrafts(root, key);
  return loadNotes(root, key).map((record) => withDraft(record, drafts));
}

export function putNotes(root, key, items = [], remove) {
  if (!Array.isArray(items)) throw new PersonalError(400, 'items must be an array');
  const incoming = items.map((item) => validateAnnotation(item, key));
  const ids = new Set(incoming.map(({ stored }) => stored.id));
  const records = loadNotes(root, key).filter(
    (record) => !ids.has(record.id) && record.id !== remove,
  );
  const drafts = { ...loadDrafts(root, key) };
  if (remove !== undefined) delete drafts[remove];
  for (const { stored, noteDraft } of incoming) {
    records.push(stored);
    if (noteDraft !== undefined) drafts[stored.id] = noteDraft;
    else delete drafts[stored.id];
  }
  saveNotes(root, key, records);
  saveDrafts(root, key, drafts);
}

// `null` in the patch clears a field; absent keys are left untouched.
export function patchNote(root, key, id, patch) {
  const records = loadNotes(root, key);
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new PersonalError(404, 'This highlight no longer exists.');
  if (!patch || typeof patch !== 'object') throw new PersonalError(400, 'Invalid patch');
  for (const field of ['note', 'noteDraft']) {
    const value = patch[field];
    if (value !== undefined && value !== null && !isText(value))
      throw new PersonalError(400, `Invalid ${field}`);
  }
  if ('note' in patch) {
    const { note: _old, ...rest } = records[index];
    const next = patch.note === null ? rest : { ...rest, note: patch.note };
    saveNotes(root, key, records.with(index, next));
  }
  if ('noteDraft' in patch) {
    const drafts = { ...loadDrafts(root, key) };
    if (patch.noteDraft === null) delete drafts[id];
    else drafts[id] = patch.noteDraft;
    saveDrafts(root, key, drafts);
  }
}

export function removeNote(root, key, id) {
  const drafts = loadDrafts(root, key);
  const records = loadNotes(root, key);
  const target = records.find((record) => record.id === id);
  if (!target) return undefined;
  saveNotes(root, key, records.filter((record) => record.id !== id));
  const { [id]: _draft, ...remaining } = drafts;
  saveDrafts(root, key, remaining);
  return withDraft(target, drafts);
}
