// Maps a reader chapter key to the files that hold the user's own additions.
// Every path is derived from validated parts only, so request input can never
// escape the personal directory.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAM_IDS } from './harness/exams.mjs';

const CHAPTER_KEY = /^ai-agents-in-depth:([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?):chapter(10|[1-9])$/;
const ENTRY_ID = /^[A-Za-z0-9_-]{1,100}$/;
const INTERVIEW_ID = /^iv-[a-z0-9-]{6,60}$/;

// The reader's writable data directory. `PERSONAL_DIR` lets tests and local
// debugging point the dev integration somewhere else.
export function personalRoot() {
  return process.env.PERSONAL_DIR ?? fileURLToPath(new URL('../../personal/', import.meta.url));
}

export function parseChapterKey(key) {
  const match = typeof key === 'string' ? CHAPTER_KEY.exec(key) : null;
  if (!match) throw new PersonalError(400, `Invalid chapter key: ${key}`);
  return { locale: match[1], chapter: `chapter${match[2]}` };
}

export function assertEntryId(id) {
  if (typeof id !== 'string' || !ENTRY_ID.test(id))
    throw new PersonalError(400, `Invalid id: ${id}`);
  return id;
}

export function notesFile(root, key) {
  const { locale, chapter } = parseChapterKey(key);
  return join(root, 'notes', locale, `${chapter}.json`);
}

// Drafts change on every keystroke; they live beside the notes but are git-ignored.
export function draftsFile(root, key) {
  const { locale, chapter } = parseChapterKey(key);
  return join(root, 'notes', locale, `${chapter}.drafts.json`);
}

export function insertsDir(root, key) {
  const { locale, chapter } = parseChapterKey(key);
  return join(root, 'inserts', locale, chapter);
}

// Read-only reading annotations (glosses) for a chapter, curated outside the reader.
export function annotationsFile(root, key) {
  const { locale, chapter } = parseChapterKey(key);
  return join(root, 'annotations', locale, `${chapter}.json`);
}

// Persistent favorites for the question banks (requirements 007 / 010).
// Only exam + question id are stored; the question text stays in the archive.
export function examFavoritesFile(root) {
  return join(root, 'harness', 'favorites.json');
}

// Server-side exam store per bank (requirement 008): draft, attempts and the
// wrong-book. The exam id is validated here so request input never names a path.
export function examProgressFile(root, exam) {
  if (!EXAM_IDS.has(exam)) throw new PersonalError(400, `Unknown exam: ${exam}`);
  return join(root, 'harness', 'progress', `${exam}.json`);
}

// Interview sessions (requirement 013). The id is validated before it is
// turned into a path, so request input can never escape the interview folder.
export function assertInterviewId(id) {
  if (typeof id !== 'string' || !INTERVIEW_ID.test(id))
    throw new PersonalError(400, `Invalid interview id: ${id}`);
  return id;
}

export function interviewSessionsDir(root) {
  return join(root, 'harness', 'interview', 'sessions');
}

export function interviewSessionFile(root, id) {
  assertInterviewId(id);
  return join(interviewSessionsDir(root), `${id}.json`);
}

// Update center (requirement 031). `root` is the repository root; the mutable
// state stays under personal/update, and the path is only ever built here.
export function updateDir(root) {
  return join(root, 'personal', 'update');
}

export function updateCacheFile(root) {
  return join(updateDir(root), 'cache.json');
}

export function updateStatusFile(root) {
  return join(updateDir(root), 'status.json');
}

export function updateTokenFile(root) {
  return join(updateDir(root), 'token');
}

export function updateLockDir(root) {
  return join(updateDir(root), 'lock');
}

export function versionFile(root) {
  return join(root, 'VERSION');
}

export function updateScriptFile(root) {
  return join(root, 'scripts', 'update.sh');
}

export function updateLogFile(root) {
  return join(root, 'run-logs', 'update.log');
}

export class PersonalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
