// Shows the user's inserted passages inside the chapter and lets them add,
// edit and delete passages while reading. Inserts are rendered as <figure>
// elements, which the reader's highlight code already skips, so highlights
// in the book text keep anchoring exactly as before.
import { machineLanguage } from '../../src/lib/machine-language';
import { anchorFor, locate, normalizeText, type Block, type InsertAnchor } from './anchor';
import { personalApi } from './api';
import { createInsertEditor } from './insert-editor';
import { relabelStorageMessages } from './relabel';
import { strings } from './strings';
import './inserts.css';

interface Insert extends InsertAnchor {
  id: string;
  markdown: string;
  html: string;
  created: string;
}

const INSERT_CLASS = 'personal-insert';

function bookBlocks(article: HTMLElement) {
  const elements = [...article.children].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && !element.closest(`.${INSERT_CLASS}, .personal-unplaced`),
  );
  const blocks: Block[] = elements.map((element) => ({
    text: normalizeText(element.textContent ?? ''),
    heading: /^H[23]$/.test(element.tagName) && element.id ? element.id : undefined,
  }));
  return { elements, blocks };
}

function initInserts() {
  if (machineLanguage(new URL(location.href))) return;
  const article = document.querySelector<HTMLElement>('#chapter-content');
  const chapter = article?.dataset.chapterKey;
  if (!article || !chapter) return;
  const content = article;
  const s = strings();
  const editor = createInsertEditor();
  let inserts: Insert[] = [];

  const save = (insert: Record<string, unknown>) =>
    personalApi<Insert>('/inserts/save', { chapter, insert });

  function card(insert: Insert, exact: boolean) {
    const figure = document.createElement('figure');
    figure.className = INSERT_CLASS;
    figure.dataset.insertId = insert.id;
    const bar = document.createElement('figcaption');
    bar.className = 'personal-insert-bar';
    const label = document.createElement('span');
    label.textContent = s.eyebrow;
    bar.append(label);
    if (!exact) {
      const moved = document.createElement('span');
      moved.className = 'personal-insert-moved';
      moved.textContent = s.moved;
      bar.append(moved);
    }
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = s.edit;
    edit.addEventListener('click', () => openEdit(insert));
    bar.append(edit);
    const body = document.createElement('div');
    body.className = 'personal-insert-body';
    // Markup rendered by the local dev server from the user's own Markdown.
    body.innerHTML = insert.html;
    figure.append(bar, body);
    return figure;
  }

  function render() {
    content.querySelectorAll(`.${INSERT_CLASS}, .personal-unplaced`).forEach((node) => node.remove());
    const { elements, blocks } = bookBlocks(content);
    const unplaced: Insert[] = [];
    const placedAfter = new Map<number, HTMLElement>();
    for (const insert of inserts) {
      const placement = locate(blocks, insert);
      if (!placement) {
        unplaced.push(insert);
        continue;
      }
      const node = card(insert, placement.exact);
      // Several inserts after one block stay in creation order.
      (placedAfter.get(placement.index) ?? elements[placement.index]).after(node);
      placedAfter.set(placement.index, node);
    }
    if (unplaced.length) content.append(unplacedGroup(unplaced));
  }

  function unplacedGroup(items: Insert[]) {
    const group = document.createElement('figure');
    group.className = 'personal-unplaced';
    const title = document.createElement('h4');
    title.textContent = s.unplacedTitle;
    const help = document.createElement('p');
    help.textContent = s.unplacedHelp;
    group.append(title, help, ...items.map((insert) => card(insert, true)));
    return group;
  }

  async function reload() {
    inserts = await personalApi<Insert[]>(`/inserts?chapter=${encodeURIComponent(chapter!)}`);
    render();
  }

  function openNew(index: number) {
    const { blocks } = bookBlocks(content);
    const anchor = anchorFor(blocks, index);
    editor.open({
      title: s.addTitle,
      context: `${s.insertAfter}${anchor.after.slice(0, 80)}${anchor.after.length > 80 ? '…' : ''}`,
      markdown: '',
      canDelete: false,
      onSave: async (markdown) => {
        await save({ ...anchor, markdown });
        await reload();
      },
      onDelete: async () => {},
    });
  }

  function openEdit(insert: Insert) {
    editor.open({
      title: s.editTitle,
      context: insert.after ? `${s.insertAfter}${insert.after.slice(0, 80)}` : '',
      markdown: insert.markdown,
      canDelete: true,
      onSave: async (markdown) => {
        await save({ id: insert.id, markdown });
        await reload();
      },
      onDelete: async () => {
        await personalApi('/inserts/remove', { chapter, id: insert.id });
        await reload();
      },
    });
  }

  const blockIndexOf = (start: Node | null) => {
    let node = start;
    while (node && node.parentNode !== content) node = node.parentNode;
    return node ? bookBlocks(content).elements.indexOf(node as HTMLElement) : -1;
  };

  // The last book block the selection covers. A triple-click selection ends at
  // offset 0 of the following block, which holds none of the selected text.
  function selectedBlockIndex() {
    const selection = getSelection();
    if (!selection?.rangeCount) return -1;
    const range = selection.getRangeAt(0);
    const first = blockIndexOf(range.startContainer);
    const last = blockIndexOf(range.endContainer);
    return range.endOffset === 0 && last > first ? last - 1 : last;
  }

  const toolbar = document.getElementById('highlight-selection');
  if (toolbar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = s.toolbarButton;
    button.addEventListener('click', () => {
      const index = selectedBlockIndex();
      toolbar.hidden = true;
      getSelection()?.removeAllRanges();
      if (index >= 0) openNew(index);
    });
    toolbar.append(button);
  }

  const atEnd = document.createElement('button');
  atEnd.type = 'button';
  atEnd.className = 'personal-insert-end';
  atEnd.textContent = s.endButton;
  atEnd.addEventListener('click', () => openNew(bookBlocks(content).elements.length - 1));
  content.after(atEnd);

  relabelStorageMessages(s.storage);
  reload().catch((error) => {
    const message = document.createElement('p');
    message.className = 'personal-insert-error';
    message.textContent = `${s.loadFailed} ${error instanceof Error ? error.message : error}`;
    content.before(message);
  });
}

initInserts();
