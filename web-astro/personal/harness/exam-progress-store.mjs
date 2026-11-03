// Server-side exam store for requirement 008: draft, attempts and the wrong
// book live in one JSON file per bank. The browser keeps a localStorage cache;
// this module is the durable source of truth. Reads and writes are
// synchronous, so concurrent requests cannot interleave.
import { readJson, writeJson } from '../fs-utils.mjs';
import { examProgressFile, PersonalError } from '../paths.mjs';
import { EXAM_IDS } from './exams.mjs';

const FORMAT = 'harness-exam-progress';
const VERSION = 1;
export const MAX_PROGRESS_BYTES = 2 * 1024 * 1024;
export const MAX_ATTEMPTS = 30;

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max = 100) =>
  typeof value === 'string' && value.length <= max;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isStringArray = (value, max = 500) =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every((item) => typeof item === 'string');

function malformedFile(file, reason = 'Malformed progress file') {
  return new PersonalError(500, `${reason}: ${file}; fix, clear or remove it.`);
}

function invalidStore(reason) {
  return new PersonalError(400, `Invalid progress store: ${reason}`);
}

function assertExam(exam) {
  if (!EXAM_IDS.has(exam))
    throw new PersonalError(400, `Unknown exam: ${exam}`);
}

function validateDraft(draft) {
  if (draft === null || draft === undefined) return;
  if (!isObject(draft)) throw invalidStore('draft must be an object or null');
  if (!isText(draft.mode, 20)) throw invalidStore('draft.mode');
  if (!isStringArray(draft.qids)) throw invalidStore('draft.qids');
  if (!isObject(draft.answers)) throw invalidStore('draft.answers');
  if (!isObject(draft.checked)) throw invalidStore('draft.checked');
  if (!isObject(draft.self)) throw invalidStore('draft.self');
  if (!isStringArray(draft.flags)) throw invalidStore('draft.flags');
  if (!isNumber(draft.startedAt)) throw invalidStore('draft.startedAt');
  if (!isNumber(draft.elapsedMs)) throw invalidStore('draft.elapsedMs');
}

function validateAttempt(attempt, index) {
  if (!isObject(attempt)) throw invalidStore(`attempts[${index}]`);
  if (!isText(attempt.id, 100)) throw invalidStore(`attempts[${index}].id`);
  if (!isStringArray(attempt.qids))
    throw invalidStore(`attempts[${index}].qids`);
  if (!isNumber(attempt.submittedAt))
    throw invalidStore(`attempts[${index}].submittedAt`);
  for (const field of ['answers', 'self', 'scores'])
    if (!isObject(attempt[field]))
      throw invalidStore(`attempts[${index}].${field}`);
}

function validateMistakes(mistakes) {
  if (!isObject(mistakes)) throw invalidStore('mistakes must be an object');
  for (const [id, record] of Object.entries(mistakes)) {
    if (!isObject(record)) throw invalidStore(`mistakes[${id}]`);
    for (const field of ['wrong', 'streak', 'lastWrong'])
      if (!isNumber(record[field]))
        throw invalidStore(`mistakes[${id}].${field}`);
  }
}

export function validateProgressStore(store) {
  if (!isObject(store)) throw invalidStore('store must be an object');
  if (store.schema !== 1) throw invalidStore('schema must be 1');
  if (!Array.isArray(store.attempts) || store.attempts.length > MAX_ATTEMPTS)
    throw invalidStore(`attempts must be an array of at most ${MAX_ATTEMPTS}`);
  store.attempts.forEach(validateAttempt);
  validateMistakes(store.mistakes);
  validateDraft(store.draft);
  const bytes = Buffer.byteLength(JSON.stringify(store), 'utf8');
  if (bytes > MAX_PROGRESS_BYTES)
    throw new PersonalError(
      413,
      `Progress store is ${bytes} bytes; the limit is ${MAX_PROGRESS_BYTES}. Export and trim old attempts.`,
    );
  return store;
}

function validateFile(data, file) {
  if (!isObject(data) || data.format !== FORMAT || data.version !== VERSION)
    throw malformedFile(file);
  if (!EXAM_IDS.has(data.exam))
    throw malformedFile(file, 'Unknown exam in progress file');
  if (
    typeof data.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(data.updatedAt))
  )
    throw malformedFile(file, 'Invalid updatedAt');
  if (
    data.clearedAt !== undefined &&
    data.clearedAt !== null &&
    typeof data.clearedAt !== 'string'
  )
    throw malformedFile(file, 'Invalid clearedAt');
  try {
    validateProgressStore(data.store);
  } catch (error) {
    if (error instanceof PersonalError)
      throw malformedFile(file, error.message);
    throw error;
  }
  return {
    format: FORMAT,
    version: VERSION,
    exam: data.exam,
    updatedAt: data.updatedAt,
    clearedAt: data.clearedAt ?? null,
    store: data.store,
  };
}

export function readExamProgress(root, exam) {
  assertExam(exam);
  const file = examProgressFile(root, exam);
  const data = readJson(file, undefined);
  if (data === undefined) return { exists: false, exam };
  const validated = validateFile(data, file);
  if (validated.exam !== exam)
    throw malformedFile(file, `Exam ${validated.exam} does not match ${exam}`);
  return { exists: true, ...validated };
}

export function saveExamProgress(root, exam, store, { cleared = false } = {}) {
  assertExam(exam);
  if (typeof cleared !== 'boolean')
    throw new PersonalError(400, 'cleared must be a boolean');
  validateProgressStore(store);
  const file = examProgressFile(root, exam);
  const now = new Date().toISOString();
  let clearedAt = null;
  if (cleared) {
    clearedAt = now;
  } else {
    const current = readExamProgress(root, exam);
    clearedAt = current.exists ? current.clearedAt : null;
  }
  const record = {
    format: FORMAT,
    version: VERSION,
    exam,
    updatedAt: now,
    clearedAt,
    store,
  };
  writeJson(file, record);
  return { exam, updatedAt: now, clearedAt, store };
}
