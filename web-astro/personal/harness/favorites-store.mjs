// Persistent favorites for the two archived question banks. The file stores
// only { exam, id, addedAt }; question text and explanations stay in the
// archive. Reads and writes are synchronous, so concurrent requests cannot
// interleave, and writes go through the shared atomic JSON helper.
import { readJson, writeJson } from '../fs-utils.mjs';
import { examFavoritesFile, PersonalError } from '../paths.mjs';
import { EXAM_IDS } from './exams.mjs';

const FORMAT = 'harness-exam-favorites';
const VERSION = 1;
const QUESTION_ID = /^[A-Z]\d{1,3}$/;
export const MAX_FAVORITES = 500;

const emptyFavorites = () => ({
  format: FORMAT,
  version: VERSION,
  updatedAt: null,
  items: [],
});

function malformed(file) {
  return new PersonalError(
    500,
    `Malformed favorites file: ${file}; fix or remove it.`,
  );
}

function validateItem(item, file) {
  if (
    !item ||
    typeof item !== 'object' ||
    !EXAM_IDS.has(item.exam) ||
    typeof item.id !== 'string' ||
    !QUESTION_ID.test(item.id) ||
    typeof item.addedAt !== 'string' ||
    Number.isNaN(Date.parse(item.addedAt))
  )
    throw malformed(file);
  return { exam: item.exam, id: item.id, addedAt: item.addedAt };
}

export function readExamFavorites(root) {
  const file = examFavoritesFile(root);
  const data = readJson(file, undefined);
  if (data === undefined) return emptyFavorites();
  if (
    !data ||
    typeof data !== 'object' ||
    data.format !== FORMAT ||
    data.version !== VERSION ||
    !Array.isArray(data.items) ||
    (data.updatedAt !== null && typeof data.updatedAt !== 'string')
  )
    throw malformed(file);
  const seen = new Set();
  const items = data.items.map((item) => {
    const stored = validateItem(item, file);
    const key = `${stored.exam}:${stored.id}`;
    if (seen.has(key)) throw malformed(file);
    seen.add(key);
    return stored;
  });
  return { format: FORMAT, version: VERSION, updatedAt: data.updatedAt, items };
}

export function setExamFavorite(root, body = {}) {
  if (!body || typeof body !== 'object')
    throw new PersonalError(400, 'Invalid request body');
  const { exam, id, favorite } = body;
  if (!EXAM_IDS.has(exam))
    throw new PersonalError(400, `Unknown exam: ${exam}`);
  if (typeof id !== 'string' || !QUESTION_ID.test(id))
    throw new PersonalError(400, `Invalid question id: ${id}`);
  if (typeof favorite !== 'boolean')
    throw new PersonalError(400, 'favorite must be a boolean');

  const current = readExamFavorites(root);
  const exists = current.items.some(
    (item) => item.exam === exam && item.id === id,
  );
  if (favorite === exists) return { items: current.items, favorite };

  if (favorite && current.items.length >= MAX_FAVORITES)
    throw new PersonalError(400, `Too many favorites (max ${MAX_FAVORITES})`);

  const now = new Date().toISOString();
  const items = favorite
    ? [...current.items, { exam, id, addedAt: now }]
    : current.items.filter((item) => !(item.exam === exam && item.id === id));
  items.sort(
    (a, b) =>
      a.addedAt.localeCompare(b.addedAt) ||
      a.exam.localeCompare(b.exam) ||
      a.id.localeCompare(b.id),
  );
  writeJson(examFavoritesFile(root), {
    format: FORMAT,
    version: VERSION,
    updatedAt: now,
    items,
  });
  return { items, favorite };
}
