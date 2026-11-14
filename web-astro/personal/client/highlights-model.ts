// Pure logic behind the "all highlights" page: filtering, ordering, grouping,
// the URL state and the Markdown export. No DOM access, so it is unit tested.
export interface Highlight {
  id: string;
  chapter: string; // chapter key, e.g. ai-agents-in-depth:zh-CN:chapter1
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  createdAt: string;
  note?: string;
  noteDraft?: string;
  locale: string;
  chapterNumber: number;
  section: string | null;
  parentSection: string | null;
}

export interface ChapterInfo {
  key: string;
  locale: string;
  number: number;
  title: string;
  path: string | null;
  count: number;
}

export type Kind = 'all' | 'notes' | 'plain';
export type Sort = 'book' | 'recent';

export interface View {
  q: string;
  kind: Kind;
  chapter: string | null;
  sort: Sort;
}

export const DEFAULT_VIEW: View = { q: '', kind: 'all', chapter: null, sort: 'book' };

const KINDS: Kind[] = ['all', 'notes', 'plain'];

export function parseView(search: string): View {
  const params = new URLSearchParams(search);
  const kind = params.get('f') as Kind;
  return {
    q: params.get('q') ?? '',
    kind: KINDS.includes(kind) ? kind : 'all',
    chapter: params.get('c') || null,
    sort: params.get('s') === 'recent' ? 'recent' : 'book',
  };
}

// Defaults are left out so an unfiltered page keeps a clean URL.
export function serializeView(view: View): string {
  const params = new URLSearchParams();
  if (view.q) params.set('q', view.q);
  if (view.kind !== 'all') params.set('f', view.kind);
  if (view.chapter) params.set('c', view.chapter);
  if (view.sort !== 'book') params.set('s', view.sort);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const searchTerms = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

export const hasNote = (item: Highlight) => Boolean(item.note?.trim());

function haystack(item: Highlight, chapters: Map<string, ChapterInfo>) {
  return [
    item.quote,
    item.note,
    item.noteDraft,
    item.section,
    item.parentSection,
    chapters.get(item.chapter)?.title,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

const matchesKind = (item: Highlight, kind: Kind) =>
  kind === 'all' || (kind === 'notes') === hasNote(item);

export function bookOrder(a: Highlight, b: Highlight) {
  return (
    a.locale.localeCompare(b.locale) ||
    a.chapterNumber - b.chapterNumber ||
    a.start - b.start ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

export const recentOrder = (a: Highlight, b: Highlight) =>
  b.createdAt.localeCompare(a.createdAt) || bookOrder(a, b);

/** Items matching the search and kind, ignoring the chapter (used for chapter counts). */
export function searchItems(
  items: Highlight[],
  view: Pick<View, 'q' | 'kind'>,
  chapters: ChapterInfo[],
): Highlight[] {
  const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
  const terms = searchTerms(view.q);
  return items.filter((item) => {
    if (!matchesKind(item, view.kind)) return false;
    const text = terms.length ? haystack(item, byKey) : '';
    return terms.every((term) => text.includes(term));
  });
}

export function applyView(items: Highlight[], view: View, chapters: ChapterInfo[]): Highlight[] {
  return searchItems(items, view, chapters)
    .filter((item) => !view.chapter || item.chapter === view.chapter)
    .sort(view.sort === 'recent' ? recentOrder : bookOrder);
}

export interface Group {
  chapter: string;
  items: Highlight[];
}

/** Splits book-ordered items into runs per chapter. */
export function groupByChapter(items: Highlight[]): Group[] {
  return items.reduce<Group[]>((groups, item) => {
    const last = groups.at(-1);
    if (last?.chapter === item.chapter) return [...groups.slice(0, -1), { ...last, items: [...last.items, item] }];
    return [...groups, { chapter: item.chapter, items: [item] }];
  }, []);
}

export const sectionLabel = (item: Pick<Highlight, 'section' | 'parentSection'>) =>
  [item.parentSection, item.section].filter(Boolean).join(' › ');

export function chapterLabel(chapter: ChapterInfo | undefined, number: number) {
  return `第 ${chapter?.number ?? number} 章${chapter?.title ? ` ${chapter.title}` : ''}`;
}

const quoteBlock = (text: string) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');

/** Book-ordered Markdown: chapter, section, the quoted passage and the note. */
export function toMarkdown(items: Highlight[], chapters: ChapterInfo[]): string {
  const byKey = new Map(chapters.map((chapter) => [chapter.key, chapter]));
  const lines: string[] = ['# 我的划线与笔记'];
  let chapter = '';
  let section = '';
  for (const item of [...items].sort(bookOrder)) {
    if (item.chapter !== chapter) {
      chapter = item.chapter;
      section = '';
      lines.push('', `## ${chapterLabel(byKey.get(chapter), item.chapterNumber)}`);
    }
    const label = sectionLabel(item);
    if (label !== section) {
      section = label;
      if (label) lines.push('', `### ${label}`);
    }
    lines.push('', quoteBlock(item.quote.trim()));
    if (hasNote(item)) lines.push('', `**笔记：** ${item.note!.trim()}`);
  }
  return `${lines.join('\n')}\n`;
}

// Fields the notes API stores; the listing adds display-only extras.
export function toAnnotation(item: Highlight) {
  const { id, chapter, quote, prefix, suffix, start, end, createdAt, note, noteDraft } = item;
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
    ...(noteDraft !== undefined ? { noteDraft } : {}),
  };
}

const DAY = 86_400_000;

export function formatDate(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((startOfDay(now) - startOfDay(date)) / DAY);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
