// The "all highlights" page: every highlight and note from every chapter in
// one searchable, filterable list, with jump-to-passage and in-place note edits.
import { withBase } from '../../src/lib/site-path.mjs';
import { personalApi } from './api';
import { button, el } from './dom';
import { buildCard, revealOverflowToggles, type CardActions } from './highlights-card';
import {
  applyView,
  chapterLabel,
  groupByChapter,
  hasNote,
  parseView,
  searchItems,
  searchTerms,
  sectionLabel,
  serializeView,
  toAnnotation,
  toMarkdown,
  type ChapterInfo,
  type Highlight,
  type Kind,
  type View,
} from './highlights-model';
import { createToast } from './toast';

interface Listing {
  chapters: ChapterInfo[];
  highlights: Highlight[];
  problems: { chapter: string; message: string }[];
}

const KIND_LABELS: [Kind, string][] = [
  ['all', '全部'],
  ['notes', '有笔记'],
  ['plain', '仅划线'],
];

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function initPage() {
  const list = byId('hl-list');
  const summary = byId('hl-summary');
  const count = byId('hl-count');
  const chapterNav = byId('hl-chapters');
  const search = byId<HTMLInputElement>('hl-search');
  const kindGroup = byId('hl-kinds');
  const sortSelect = byId<HTMLSelectElement>('hl-sort');
  const exportMenu = byId<HTMLDetailsElement>('hl-export');
  const problems = byId('hl-problems');
  const toast = createToast(byId('hl-toast'));

  let data: Listing = { chapters: [], highlights: [], problems: [] };
  let view: View = parseView(location.search);
  let editing: { id: string; text: string } | null = null;
  let busy = false;
  let loaded = false;
  let lastLoad = 0;

  const chapterOf = (key: string) => data.chapters.find((chapter) => chapter.key === key);
  const visible = () => applyView(data.highlights, view, data.chapters);

  function setView(patch: Partial<View>) {
    view = { ...view, ...patch };
    history.replaceState(history.state, '', `${location.pathname}${serializeView(view)}`);
    render();
  }

  async function load() {
    try {
      data = await personalApi<Listing>('/highlights');
      loaded = true;
      lastLoad = Date.now();
      // A chapter that lost its last highlight must not leave an empty filter behind.
      if (view.chapter && !chapterOf(view.chapter)) view = { ...view, chapter: null };
      render();
    } catch (error) {
      renderLoadError(error);
    }
  }

  function renderLoadError(error: unknown) {
    summary.textContent = '';
    list.replaceChildren(
      el(
        'div',
        'hl-empty',
        el('p', 'hl-empty-title', '划线加载失败'),
        el('p', '', error instanceof Error ? error.message : String(error)),
        button('重试', 'hl-btn hl-btn-primary', () => void load()),
      ),
    );
  }

  // --- mutations ---------------------------------------------------------

  async function run(action: () => Promise<void>, failure: string) {
    if (busy) return false;
    busy = true;
    try {
      await action();
      return true;
    } catch (error) {
      toast.show(`${failure}${error instanceof Error ? error.message : error}`);
      return false;
    } finally {
      busy = false;
    }
  }

  const replaceItem = (id: string, next: Highlight | null) => {
    data = {
      ...data,
      highlights: data.highlights.flatMap((item) =>
        item.id !== id ? [item] : next ? [next] : [],
      ),
    };
    data = {
      ...data,
      chapters: data.chapters
        .map((chapter) => ({
          ...chapter,
          count: data.highlights.filter((item) => item.chapter === chapter.key).length,
        }))
        .filter((chapter) => chapter.count > 0),
    };
  };

  async function saveNote(item: Highlight, text: string) {
    const note = text.trim();
    const saved = await run(async () => {
      await personalApi('/notes/patch', {
        chapter: item.chapter,
        id: item.id,
        patch: { note: note || null, noteDraft: null },
      });
      const { noteDraft: _draft, note: _old, ...rest } = item;
      replaceItem(item.id, note ? { ...rest, note } : rest);
    }, '保存失败：');
    if (!saved) return;
    editing = null;
    toast.show(note ? '笔记已保存' : '笔记已清除');
    render();
  }

  async function remove(item: Highlight) {
    const removedRecord: { item: Highlight | null } = { item: null };
    const neighbour = nextCardId(item.id);
    const removed = await run(async () => {
      const record = await personalApi<unknown>('/notes/remove', {
        chapter: item.chapter,
        id: item.id,
      });
      removedRecord.item = record ? item : null;
      replaceItem(item.id, null);
    }, '删除失败：');
    if (!removed) return;
    if (editing?.id === item.id) editing = null;
    render();
    focusCard(neighbour);
    toast.show('已删除这条划线', {
      label: '撤销',
      onClick: async () => {
        const restore = removedRecord.item;
        if (!restore) return;
        const ok = await run(async () => {
          await personalApi('/notes/put', { chapter: restore.chapter, items: [toAnnotation(restore)] });
          await load();
        }, '撤销失败：');
        if (ok) toast.show('已恢复');
      },
    });
  }

  async function copy(item: Highlight) {
    const text = hasNote(item) ? `${item.quote.trim()}\n\n笔记：${item.note!.trim()}` : item.quote.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.show('已复制');
    } catch {
      toast.show('复制失败，请手动选中文字复制');
    }
  }

  // --- rendering ---------------------------------------------------------

  function nextCardId(id: string) {
    const ids = visible().map((item) => item.id);
    const at = ids.indexOf(id);
    return ids[at + 1] ?? ids[at - 1] ?? null;
  }

  function focusCard(id: string | null) {
    const card = id ? list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) : null;
    (card?.querySelector<HTMLElement>('a, button') ?? search).focus({ preventScroll: false });
  }

  const actions: CardActions = {
    edit(item) {
      editing = { id: item.id, text: item.noteDraft ?? item.note ?? '' };
      render();
    },
    saveNote: (item, text) => void saveNote(item, text),
    cancelEdit() {
      const id = editing?.id ?? null;
      editing = null;
      render();
      focusCard(id);
    },
    copy: (item) => void copy(item),
    remove: (item) => void remove(item),
    draftChanged(text) {
      if (editing) editing = { ...editing, text };
    },
  };

  function renderChapters() {
    const counts = new Map<string, number>();
    for (const item of searchItems(data.highlights, view, data.chapters))
      counts.set(item.chapter, (counts.get(item.chapter) ?? 0) + 1);
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    // One chapter needs no navigation.
    chapterNav.hidden = data.chapters.length < 2;
    document.querySelector('.hl-body')?.classList.toggle('hl-single', chapterNav.hidden);
    const entry = (key: string | null, label: string, value: number) => {
      const active = view.chapter === key;
      const item = button('', `hl-chapter${active ? ' is-active' : ''}`, () =>
        setView({ chapter: key }),
      );
      item.append(el('span', 'hl-chapter-name', label), el('span', 'hl-chapter-count', String(value)));
      item.setAttribute('aria-pressed', String(active));
      item.disabled = value === 0 && !active;
      return item;
    };
    chapterNav.replaceChildren(
      entry(null, '全部章节', total),
      ...data.chapters.map((chapter) =>
        entry(chapter.key, chapterLabel(chapter, chapter.number), counts.get(chapter.key) ?? 0),
      ),
    );
  }

  function renderKinds() {
    const scoped = searchItems(data.highlights, { q: view.q, kind: 'all' }, data.chapters).filter(
      (item) => !view.chapter || item.chapter === view.chapter,
    );
    const counts: Record<Kind, number> = {
      all: scoped.length,
      notes: scoped.filter(hasNote).length,
      plain: scoped.filter((item) => !hasNote(item)).length,
    };
    kindGroup.replaceChildren(
      ...KIND_LABELS.map(([kind, label]) => {
        const node = button('', `hl-kind${view.kind === kind ? ' is-active' : ''}`, () =>
          setView({ kind }),
        );
        node.append(label, el('span', 'hl-kind-count', String(counts[kind])));
        node.setAttribute('aria-pressed', String(view.kind === kind));
        return node;
      }),
    );
  }

  function renderSummary() {
    const notes = data.highlights.filter(hasNote).length;
    summary.textContent = data.highlights.length
      ? `共 ${data.highlights.length} 条划线，其中 ${notes} 条带笔记，分布在 ${data.chapters.length} 章`
      : '';
  }

  function emptyState(filtered: boolean) {
    if (filtered)
      return el(
        'div',
        'hl-empty',
        el('p', 'hl-empty-title', '没有匹配的划线'),
        el('p', '', '换个关键词，或者清除筛选条件。'),
        button('清除筛选', 'hl-btn hl-btn-primary', () => {
          search.value = '';
          setView({ q: '', kind: 'all', chapter: null });
        }),
      );
    const start = el('a', 'hl-btn hl-btn-primary', '去读第一章');
    start.href = withBase('/book/chapter1/');
    return el(
      'div',
      'hl-empty',
      el('p', 'hl-empty-title', '还没有划线'),
      el('p', '', '在任意一章里选中文字，点「划线」或「添加笔记」，它们都会汇总到这里。'),
      start,
    );
  }

  function renderList() {
    const items = visible();
    const terms = searchTerms(view.q);
    const filtered = Boolean(view.q || view.kind !== 'all' || view.chapter);
    count.textContent = data.highlights.length
      ? filtered
        ? `显示 ${items.length} / ${data.highlights.length} 条`
        : `${items.length} 条`
      : '';
    if (!items.length) return list.replaceChildren(emptyState(filtered));

    const card = (item: Highlight, showContext: boolean) =>
      buildCard(
        item,
        {
          chapter: chapterOf(item.chapter),
          terms,
          showContext,
          editingText: editing?.id === item.id ? editing.text : null,
        },
        actions,
      );

    if (view.sort === 'recent') return list.replaceChildren(...items.map((item) => card(item, true)));

    list.replaceChildren(
      ...groupByChapter(items).map((group) => {
        const chapter = chapterOf(group.chapter);
        let section: string | null = null;
        const body = group.items.flatMap((item) => {
          const label = sectionLabel(item) || '章首';
          const heading = label !== section ? [el('h3', 'hl-section-title', label)] : [];
          section = label;
          return [...heading, card(item, false)];
        });
        return el(
          'section',
          'hl-group',
          el(
            'h2',
            'hl-group-title',
            chapterLabel(chapter, group.items[0].chapterNumber),
            el('span', 'hl-group-count', `${group.items.length} 条`),
          ),
          ...body,
        );
      }),
    );
  }

  function renderProblems() {
    problems.hidden = !data.problems.length;
    problems.replaceChildren(
      ...data.problems.map((problem) =>
        el('p', '', `有一个笔记文件读取失败（${problem.chapter}）：${problem.message}`),
      ),
    );
  }

  function render() {
    renderSummary();
    renderProblems();
    renderChapters();
    renderKinds();
    sortSelect.value = view.sort;
    renderList();
    revealOverflowToggles(list);
  }

  // --- toolbar -----------------------------------------------------------

  search.value = view.q;
  search.addEventListener('input', () => setView({ q: search.value.trim() }));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && search.value) {
      event.preventDefault();
      search.value = '';
      setView({ q: '' });
    }
  });
  sortSelect.addEventListener('change', () =>
    setView({ sort: sortSelect.value === 'recent' ? 'recent' : 'book' }),
  );
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    search.focus();
    search.select();
  });

  function exportCurrent(mode: 'copy' | 'download') {
    exportMenu.open = false;
    const items = visible();
    if (!items.length) return toast.show('没有可导出的划线');
    const markdown = toMarkdown(items, data.chapters);
    if (mode === 'copy')
      return void navigator.clipboard
        .writeText(markdown)
        .then(() => toast.show(`已复制 ${items.length} 条为 Markdown`))
        .catch(() => toast.show('复制失败'));
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = el('a');
    link.href = url;
    link.download = `ai-agent-book-highlights-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.show(`已导出 ${items.length} 条`);
  }
  byId('hl-export-copy').addEventListener('click', () => exportCurrent('copy'));
  byId('hl-export-download').addEventListener('click', () => exportCurrent('download'));
  document.addEventListener('click', (event) => {
    if (!exportMenu.contains(event.target as Node)) exportMenu.open = false;
  });
  exportMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') exportMenu.open = false;
  });

  // Pick up highlights made in other tabs, or in a chapter we navigated back from.
  const refresh = () => {
    if (loaded && !editing && !busy && Date.now() - lastLoad > 1000) void load();
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', (event) => event.persisted && refresh());
  window.addEventListener('popstate', () => {
    view = parseView(location.search);
    search.value = view.q;
    render();
  });

  void load();
}

initPage();
