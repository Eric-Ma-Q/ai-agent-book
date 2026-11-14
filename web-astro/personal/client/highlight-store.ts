// Drop-in replacement for src/lib/highlight-store.ts (swapped in by the dev
// integration). Same exports and signatures, but records live in
// personal/notes/ on disk. The "db" handle only carries the page's chapter key.
import { mergeBackup, type Annotation } from '../../src/lib/annotations';
import { personalApi } from './api';

interface FileStore {
  chapter: string;
}

const handle = (db: IDBDatabase) => db as unknown as FileStore;

// Present the file store to the reader UI under the IndexedDB type it expects.
export async function openHighlights(): Promise<IDBDatabase> {
  const chapter = document.querySelector<HTMLElement>('#chapter-content')
    ?.dataset.chapterKey;
  if (!chapter) throw new Error('No chapter on this page.');
  await personalApi(`/notes?chapter=${encodeURIComponent(chapter)}`);
  return { chapter } satisfies FileStore as unknown as IDBDatabase;
}

export function readHighlights(
  db: IDBDatabase,
  chapter = handle(db).chapter,
): Promise<Annotation[]> {
  return personalApi(`/notes?chapter=${encodeURIComponent(chapter)}`);
}

export async function writeHighlights(
  db: IDBDatabase,
  items: Annotation[],
  remove?: string,
): Promise<void> {
  await personalApi('/notes/put', { chapter: handle(db).chapter, items, remove });
}

// JSON drops `undefined`, so a cleared field is sent as an explicit null.
export async function updateNote(
  db: IDBDatabase,
  id: string,
  patch: Pick<Annotation, 'note' | 'noteDraft'>,
): Promise<void> {
  const body = Object.fromEntries(
    Object.entries(patch).map(([field, value]) => [field, value ?? null]),
  );
  await personalApi('/notes/patch', { chapter: handle(db).chapter, id, patch: body });
}

export async function importHighlights(
  db: IDBDatabase,
  imported: Annotation[],
  chapter = handle(db).chapter,
): Promise<void> {
  const existing = await readHighlights(db, chapter);
  const changes = mergeBackup(existing, imported, () => crypto.randomUUID());
  if (changes.length) await writeHighlights(db, changes);
}

export async function removeHighlight(
  db: IDBDatabase,
  id: string,
): Promise<Annotation | undefined> {
  const removed = await personalApi<Annotation | null>('/notes/remove', {
    chapter: handle(db).chapter,
    id,
  });
  return removed ?? undefined;
}
