// One highlight on the "all highlights" page: the quote, the note, and the
// actions. The page owns state; the card reports what the reader asked for.
import { withBase } from '../../src/lib/site-path.mjs';
import { button, el, markTerms } from './dom';
import {
  formatDate,
  hasNote,
  sectionLabel,
  type ChapterInfo,
  type Highlight,
} from './highlights-model';

export interface CardActions {
  edit(item: Highlight): void;
  saveNote(item: Highlight, text: string): void;
  cancelEdit(): void;
  copy(item: Highlight): void;
  remove(item: Highlight): void;
  draftChanged(text: string): void;
}

export interface CardOptions {
  chapter: ChapterInfo | undefined;
  terms: string[];
  showContext: boolean; // chapter and section on the card (flat lists only)
  editingText: string | null; // note editor content when this card is being edited
}

export function jumpHref(item: Highlight, chapter: ChapterInfo | undefined) {
  if (!chapter?.path) return null;
  return `${withBase(chapter.path)}?hl=${encodeURIComponent(item.id)}`;
}

function metaLine(item: Highlight, options: CardOptions) {
  const meta = el('p', 'hl-meta');
  if (options.showContext) {
    meta.append(el('span', 'hl-chip', `第 ${item.chapterNumber} 章`));
    const section = sectionLabel(item);
    if (section) meta.append(el('span', 'hl-section', ...markTerms(section, options.terms)));
  }
  const when = el('time', 'hl-date', formatDate(item.createdAt));
  when.dateTime = item.createdAt;
  meta.append(when);
  return meta;
}

function noteEditor(item: Highlight, text: string, actions: CardActions) {
  const area = el('textarea', 'hl-note-input');
  area.value = text;
  area.rows = 4;
  area.maxLength = 10000;
  area.setAttribute('aria-label', '笔记');
  area.placeholder = '写下你的想法……';
  area.addEventListener('input', () => actions.draftChanged(area.value));
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      actions.cancelEdit();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      actions.saveNote(item, area.value);
    }
  });
  const bar = el(
    'div',
    'hl-editor-bar',
    el('span', 'hl-hint', '⌘/Ctrl + Enter 保存 · Esc 取消'),
    button('取消', 'hl-btn', () => actions.cancelEdit()),
    button('保存笔记', 'hl-btn hl-btn-primary', () => actions.saveNote(item, area.value)),
  );
  // The editor opens in place; put the caret at the end of any existing text.
  queueMicrotask(() => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  return el('div', 'hl-note hl-note-editing', area, bar);
}

function noteView(item: Highlight, terms: string[]) {
  if (!hasNote(item) && item.noteDraft === undefined) return null;
  const note = el('div', 'hl-note');
  if (hasNote(item))
    note.append(el('p', 'hl-note-text', ...markTerms(item.note!.trim(), terms)));
  if (item.noteDraft !== undefined)
    note.append(el('p', 'hl-draft', '有一份未保存的笔记草稿'));
  return note;
}

function quoteBlock(item: Highlight, terms: string[]) {
  const quote = el('blockquote', 'hl-quote hl-clamped');
  quote.append(el('p', '', ...markTerms(item.quote.trim(), terms)));
  const toggle = button('展开全文', 'hl-more', () => {
    const open = quote.classList.toggle('hl-clamped');
    toggle.textContent = open ? '展开全文' : '收起';
    toggle.setAttribute('aria-expanded', String(!open));
  });
  toggle.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  return { quote, toggle };
}

export function buildCard(item: Highlight, options: CardOptions, actions: CardActions) {
  const editing = options.editingText !== null;
  const card = el('article', `hl-card${hasNote(item) ? ' has-note' : ''}`);
  card.dataset.id = item.id;
  const { quote, toggle } = quoteBlock(item, options.terms);
  card.append(metaLine(item, options), quote, toggle);

  if (editing) card.append(noteEditor(item, options.editingText!, actions));
  else card.append(noteView(item, options.terms) ?? '');

  if (!editing) {
    const bar = el('div', 'hl-actions');
    const href = jumpHref(item, options.chapter);
    if (href) {
      const jump = el('a', 'hl-btn hl-btn-link', '在原文中查看 →');
      jump.href = href;
      bar.append(jump);
    }
    const editLabel =
      item.noteDraft !== undefined ? '继续草稿' : hasNote(item) ? '编辑笔记' : '添加笔记';
    bar.append(
      button(editLabel, 'hl-btn', () => actions.edit(item)),
      button('复制', 'hl-btn', () => actions.copy(item)),
      button('删除', 'hl-btn hl-btn-danger', () => actions.remove(item)),
    );
    card.append(bar);
  }
  return card;
}

/** Offer "expand" only for quotes that the line clamp actually cuts off. */
export function revealOverflowToggles(root: HTMLElement) {
  for (const quote of root.querySelectorAll<HTMLElement>('.hl-quote.hl-clamped')) {
    const toggle = quote.nextElementSibling as HTMLButtonElement | null;
    if (toggle?.classList.contains('hl-more'))
      toggle.hidden = quote.scrollHeight <= quote.clientHeight + 1;
  }
}
