// The file preview dialog. One <dialog> instance is reused for every file so
// focus, Escape and the top layer stay with the browser. All file text reaches
// the DOM through textContent; only the safe lab Markdown renderer may return
// HTML, which it builds after escaping the source.
import { personalApi, personalBlob } from '../api';
import { ensureClipboard } from '../clipboard';
import { el } from '../dom';
import { renderMarkdown } from '../lab/markdown';
import '../file-preview.css';
import {
  candidateLabel,
  formatBytes,
  formatJson,
  formatJsonl,
  formatTime,
  isTextFormat,
  parseDelimited,
  scrollTopForHit,
  sliceLines,
  type FileFormat,
} from './model';

export type Candidate = {
  path: string;
  name: string;
  dir: string;
  ext: string;
  format: FileFormat;
  bytes: number;
  mtime: string;
};

type ReadPayload = Candidate & {
  mime: string;
  binary: boolean;
  text?: string;
  truncated: boolean;
};

type Tab = 'preview' | 'source';

const CHUNK = 200;
const CSV_STEP = 100;
const CSV_LIMIT = 500;
const CSV_COLS = 40;

const highlightStore = (globalThis as any).CSS?.highlights as
  | { set(name: string, value: unknown): void; delete(name: string): void }
  | undefined;
const HighlightCtor = (globalThis as any).Highlight as
  | (new (...ranges: Range[]) => unknown)
  | undefined;
const hasHighlightApi = Boolean(highlightStore && HighlightCtor);

function icon(name: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `pf-icon pf-icon-${name}`);
  svg.innerHTML = `<use href="#pf-sprite-${name}"></use>`;
  return svg;
}

function sprite() {
  const wrap = el('div', 'pf-sprite');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <symbol id="pf-sprite-file" viewBox="0 0 16 16"><path d="M4 1.5h5.2L13 5.3V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3a1.5 1.5 0 0 1 1-1.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 1.8V5.4h3.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></symbol>
      <symbol id="pf-sprite-close" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
      <symbol id="pf-sprite-copy" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 3.6A1.6 1.6 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.6 1.6 0 0 0 3.6 10.5" fill="none" stroke="currentColor" stroke-width="1.2"/></symbol>
      <symbol id="pf-sprite-download" viewBox="0 0 16 16"><path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="pf-sprite-search" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.2 10.2 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
      <symbol id="pf-sprite-expand" viewBox="0 0 16 16"><path d="M6.5 2.5H2.5v4M9.5 13.5h4v-4M2.5 9.5v4h4M13.5 6.5v-4h-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="pf-sprite-collapse" viewBox="0 0 16 16"><path d="M6.5 2.5v4h-4M9.5 13.5v-4h4M2.5 6.5h4v-4M13.5 9.5h-4v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="pf-sprite-alert" viewBox="0 0 16 16"><path d="M8 2.6 14.4 13.4H1.6L8 2.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.4v3.2M8 11.6v.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
      <symbol id="pf-sprite-lock" viewBox="0 0 16 16"><rect x="3.2" y="7" width="9.6" height="6.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" stroke-width="1.2"/></symbol>
      <symbol id="pf-sprite-external" viewBox="0 0 16 16"><path d="M9 2.5h4.5V7M13.2 2.8 7.4 8.6M12 9.8V13a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 13V5.2A1.2 1.2 0 0 1 3.2 4H6.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    </svg>`;
  return wrap;
}

export type OpenOptions = { onClose?: () => void };

export type PreviewPanel = {
  open(
    name: string,
    candidates: Candidate[],
    total: number,
    trigger: HTMLElement | null,
    options?: OpenOptions,
  ): void;
  close(): void;
  isOpen(): boolean;
};

export function createPreviewPanel(): PreviewPanel {
  const state = {
    name: null as string | null,
    candidates: [] as Candidate[],
    total: 0,
    index: 0,
    tab: 'preview' as Tab,
    loaded: CHUNK,
    csvRows: CSV_STEP,
    wide: false,
    trigger: null as HTMLElement | null,
    requestId: 0,
    file: null as ReadPayload | null,
    urls: [] as string[],
    findOpen: false,
    query: '',
    hits: [] as Range[],
    hitIndex: 0,
    error: null as string | null,
    onClose: null as (() => void) | null,
  };

  const shell = sprite();
  const dialog = el('dialog', 'pf-root');
  dialog.setAttribute('aria-labelledby', 'pf-title');
  dialog.setAttribute('aria-describedby', 'pf-status');

  const header = el('header', 'pf-head');
  const titleRow = el('div', 'pf-title-row');
  const glyph = el('span', 'pf-glyph');
  glyph.append(icon('file'));
  const title = el('h2', 'pf-title', '文件名');
  title.id = 'pf-title';
  title.tabIndex = -1;
  const badge = el('span', 'pf-badge', '—');
  const size = el('span', 'pf-size', '');
  const closeButton = el('button', 'pf-close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '关闭文件预览');
  closeButton.append(icon('close'));
  titleRow.append(glyph, title, badge, size, closeButton);

  const sub = el('div', 'pf-sub');
  const pathButton = el('button', 'pf-path');
  pathButton.type = 'button';
  pathButton.setAttribute('aria-expanded', 'false');
  pathButton.title = '展开文件详情';
  const pathText = el('span', 'pf-path-text', '—');
  const pathMore = el('span', 'pf-path-more', '详情');
  pathButton.append(pathText, pathMore);
  const status = el('p', 'pf-status', '只读预览');
  status.id = 'pf-status';
  sub.append(pathButton, status);

  const details = el('dl', 'pf-details');
  details.hidden = true;
  const detail = (label: string) => {
    const wrap = el('div');
    const dt = el('dt', '', label);
    const dd = el('dd', '', '—');
    wrap.append(dt, dd);
    details.append(wrap);
    return dd;
  };
  const detailPath = detail('完整路径');
  const detailMime = detail('类型');
  const detailSize = detail('大小');
  const detailTime = detail('修改时间');

  header.append(titleRow, sub, details);

  const cands = el('div', 'pf-cands');
  cands.hidden = true;
  const candsLabel = el('span', 'pf-cands-label', '同名文件');
  const candsSelect = el('select', 'pf-cands-select');
  candsSelect.setAttribute('aria-label', '切换同名文件');
  const candsNote = el('span', 'pf-cands-note', '');
  cands.append(candsLabel, candsSelect, candsNote);

  const toolbar = el('div', 'pf-toolbar');
  const tabs = el('div', 'pf-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '查看方式');
  const previewTab = el('button', 'pf-tab', '预览');
  previewTab.type = 'button';
  previewTab.id = 'pf-tab-preview';
  previewTab.setAttribute('role', 'tab');
  const sourceTab = el('button', 'pf-tab', '源文件');
  sourceTab.type = 'button';
  sourceTab.id = 'pf-tab-source';
  sourceTab.setAttribute('role', 'tab');
  tabs.append(previewTab, sourceTab);
  const tools = el('div', 'pf-tools');
  const findButton = el('button', 'pf-tool');
  findButton.type = 'button';
  findButton.append(icon('search'), '查找');
  const wideButton = el('button', 'pf-tool');
  wideButton.type = 'button';
  wideButton.id = 'pf-wide';
  wideButton.setAttribute('aria-pressed', 'false');
  wideButton.append(icon('expand'), el('span', '', '宽屏'));
  tools.append(findButton, wideButton);
  toolbar.append(tabs, tools);

  const findBar = el('div', 'pf-find');
  findBar.hidden = true;
  const findInput = el('input', 'pf-find-input');
  findInput.type = 'search';
  findInput.placeholder = '在当前已加载内容里查找';
  findInput.setAttribute('aria-label', '查找文件内容');
  findInput.autocomplete = 'off';
  const findCount = el('span', 'pf-find-count', '0/0');
  findCount.setAttribute('role', 'status');
  const findPrev = el('button', 'pf-find-step', '↑');
  findPrev.type = 'button';
  findPrev.setAttribute('aria-label', '上一个结果');
  const findNext = el('button', 'pf-find-step', '↓');
  findNext.type = 'button';
  findNext.setAttribute('aria-label', '下一个结果');
  const findClose = el('button', 'pf-find-step', '×');
  findClose.type = 'button';
  findClose.setAttribute('aria-label', '关闭查找');
  findBar.append(icon('search'), findInput, findCount, findPrev, findNext, findClose);

  const body = el('div', 'pf-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'tabpanel');
  const banner = el('div', 'pf-banner');
  banner.hidden = true;
  const view = el('div', 'pf-view');
  const more = el('div', 'pf-more');
  more.hidden = true;
  const moreLabel = el('span', 'pf-more-label');
  const moreButton = el('button', 'pf-more-btn', '加载下一段');
  moreButton.type = 'button';
  more.append(moreLabel, moreButton);
  body.append(banner, view, more);

  const footer = el('footer', 'pf-foot');
  const readOnly = el('p', 'pf-readonly');
  readOnly.append(icon('lock'), '只读');
  const actions = el('div', 'pf-actions');
  const copyPath = el('button', 'pf-btn');
  copyPath.type = 'button';
  copyPath.append(icon('copy'), '复制路径');
  const copyContent = el('button', 'pf-btn');
  copyContent.type = 'button';
  copyContent.append(icon('copy'), '复制内容');
  const download = el('button', 'pf-btn pf-btn-primary');
  download.type = 'button';
  download.append(icon('download'), '下载原文件');
  actions.append(copyPath, copyContent, download);
  footer.append(readOnly, actions);

  const toast = el('div', 'pf-toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const panel = el('div', 'pf-shell');
  panel.append(header, cands, toolbar, findBar, body, footer);
  dialog.append(panel, toast);
  document.body.append(shell, dialog);

  /* ---------------- helpers ---------------- */

  let toastTimer = 0;
  function say(message: string) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  const current = () => state.candidates[state.index] ?? null;

  function releaseUrls() {
    for (const url of state.urls) URL.revokeObjectURL(url);
    state.urls = [];
  }

  function clearView() {
    view.replaceChildren();
    view.className = 'pf-view';
    more.hidden = true;
    banner.hidden = true;
  }

  function setBanner(message: string) {
    banner.replaceChildren(icon('alert'), el('span', '', message));
    banner.hidden = false;
  }

  function lockScroll(lock: boolean) {
    const root = document.documentElement;
    if (lock) {
      const gap = window.innerWidth - root.clientWidth;
      root.style.setProperty('--pf-scrollbar', `${gap}px`);
      root.classList.add('pf-open');
    } else {
      root.classList.remove('pf-open');
      root.style.removeProperty('--pf-scrollbar');
    }
  }

  /* ---------------- header ---------------- */

  function renderHeader(candidate: Candidate) {
    title.textContent = candidate.name;
    badge.textContent = (candidate.ext || '').toUpperCase();
    size.textContent = formatBytes(candidate.bytes);
    pathText.textContent = candidate.path;
    status.textContent = `只读预览 · 修改于 ${formatTime(candidate.mtime)}`;
    detailPath.textContent = candidate.path;
    detailMime.textContent = '';
    detailSize.textContent = `${formatBytes(candidate.bytes)}（${candidate.bytes.toLocaleString()} 字节）`;
    detailTime.textContent = formatTime(candidate.mtime);
    details.hidden = true;
    pathButton.setAttribute('aria-expanded', 'false');
  }

  function renderCandidates() {
    if (state.total <= 1) {
      cands.hidden = true;
      return;
    }
    cands.hidden = false;
    candsLabel.textContent = `同名文件 ${state.total} 份`;
    candsSelect.replaceChildren(
      ...state.candidates.map((candidate, index) => {
        const option = el('option', '', candidateLabel(candidate));
        option.value = String(index);
        option.selected = index === state.index;
        return option;
      }),
    );
    const shown = Math.min(state.total, state.candidates.length);
    candsNote.textContent = `第 ${state.index + 1}/${shown} 个${
      state.total > state.candidates.length ? ' · 仅列出前 8 个' : ''
    }`;
  }

  function renderTabs(textLike: boolean) {
    toolbar.hidden = !textLike;
    if (!textLike) return;
    const active = state.tab === 'source' ? sourceTab : previewTab;
    for (const tab of [previewTab, sourceTab]) {
      const on = tab === active;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle('is-active', on);
    }
    body.setAttribute('aria-labelledby', active.id);
    findButton.hidden = !hasHighlightApi;
    wideButton.hidden = false;
  }

  /* ---------------- states ---------------- */

  function stateCard(kind: 'loading' | 'empty' | 'notfound' | 'denied' | 'network' | 'failed', message?: string) {
    const wrap = el('div', `pf-state pf-state-${kind}`);
    if (kind === 'loading') {
      wrap.setAttribute('aria-busy', 'true');
      const skeleton = el('div', 'pf-skeleton');
      skeleton.append(
        el('div', 'pf-skeleton-bar pf-skeleton-title'),
        el('div', 'pf-skeleton-bar'),
        el('div', 'pf-skeleton-bar pf-skeleton-short'),
      );
      wrap.append(skeleton, el('p', 'pf-state-note', '正在读取文件…'));
      return wrap;
    }
    const titles = {
      empty: '文件为空',
      notfound: '文件已不存在',
      denied: '没有权限预览此文件',
      network: '无法连接本地文件服务',
      failed: '文件读取失败',
    };
    const texts = {
      empty: '没有可显示的内容，仍可复制路径或下载。',
      notfound: '可能被移动或删除。',
      denied: '该路径不在可预览范围内。',
      network: '请确认阅读器正在 dev 模式运行，然后重试。',
      failed: message ?? '请稍后重试，或查看源文件。',
    };
    const head = el('div', 'pf-state-icon');
    head.append(icon(kind === 'denied' ? 'lock' : 'alert'));
    const text = el('p', 'pf-state-text', texts[kind]);
    const actions = el('div', 'pf-state-actions');
    if (kind === 'network' || kind === 'failed') {
      const retry = el('button', 'pf-btn pf-btn-primary', '重试');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        const candidate = current();
        if (candidate) void load(candidate);
      });
      actions.append(retry);
    }
    if (kind === 'notfound' && state.total > 1) {
      const other = el('button', 'pf-btn', '选择其他同名文件');
      other.type = 'button';
      other.addEventListener('click', () => candsSelect.focus());
      actions.append(other);
    }
    const close = el('button', 'pf-btn', '关闭');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    actions.append(close);
    wrap.append(head, el('h3', 'pf-state-title', titles[kind]), text, actions);
    return wrap;
  }

  function showState(kind: Parameters<typeof stateCard>[0], message?: string) {
    clearView();
    state.error = kind;
    view.classList.add('is-centered');
    view.append(stateCard(kind, message));
    setFooterForFile(null);
  }

  function setFooterForFile(file: ReadPayload | null) {
    const textLike = Boolean(file && isTextFormat(file.format));
    copyContent.hidden = !textLike;
    download.hidden = !file || state.error !== null;
  }

  /* ---------------- body ---------------- */

  function updateMore(end: number, total: number, label = '加载下一段') {
    if (end >= total) {
      more.hidden = true;
      return;
    }
    more.hidden = false;
    moreLabel.textContent = `已显示 ${end} / ${total} 行`;
    moreButton.textContent = label;
  }

  function renderMarkdownPreview(file: ReadPayload) {
    const slice = sliceLines(file.text ?? '', state.loaded);
    state.loaded = slice.end;
    const md = el('div', 'pf-md');
    md.innerHTML = renderMarkdown(slice.text);
    view.append(md);
    updateMore(slice.end, slice.total);
  }

  function renderSource(file: ReadPayload) {
    const slice = sliceLines(file.text ?? '', state.loaded, CHUNK, { blockAware: false });
    state.loaded = slice.end;
    const wrap = el('div', 'pf-src');
    const fragment = document.createDocumentFragment();
    slice.text.split('\n').forEach((line, index) => {
      const row = el('div', 'pf-src-row');
      const number = el('span', 'pf-src-no', String(index + 1));
      number.setAttribute('aria-hidden', 'true');
      const code = el('span', 'pf-src-line', line || ' ');
      row.append(number, code);
      fragment.append(row);
    });
    wrap.append(fragment);
    view.append(wrap);
    updateMore(slice.end, slice.total);
  }

  function renderCode(text: string) {
    const pre = el('pre', 'pf-pre');
    pre.textContent = text;
    const wrap = el('div', 'pf-code');
    wrap.append(pre);
    view.append(wrap);
  }

  function renderPlainText(file: ReadPayload) {
    const slice = sliceLines(file.text ?? '', state.loaded, CHUNK, { blockAware: false });
    state.loaded = slice.end;
    renderCode(slice.text);
    updateMore(slice.end, slice.total);
  }

  function renderEmpty(file: ReadPayload) {
    view.classList.add('is-centered');
    const card = el('div', 'pf-state pf-state-empty');
    const head = el('div', 'pf-state-icon');
    head.append(icon('file'));
    card.append(
      head,
      el('h3', 'pf-state-title', '文件为空'),
      el('p', 'pf-state-text', '没有可显示的内容，仍可复制路径或下载。'),
    );
    view.append(card);
    setFooterForFile(file);
  }

  function renderJson(file: ReadPayload) {
    const result = formatJson(file.text ?? '');
    if (!result.ok) setBanner('内容无法按 JSON 解析，已显示原文。');
    renderCode(result.text);
  }

  function renderJsonl(file: ReadPayload) {
    const result = formatJsonl(file.text ?? '');
    if (result.failed) setBanner('部分行无法解析为 JSON，已按原文显示。');
    else if (result.truncated) setBanner('仅显示前 500 行；完整内容请查看源文件或下载。');
    renderCode(result.text);
  }

  function renderCsv(file: ReadPayload) {
    const delimiter = file.format === 'tsv' ? '\t' : ',';
    const parsed = parseDelimited(file.text ?? '', { delimiter, maxRows: CSV_LIMIT, maxCols: CSV_COLS });
    const wrap = el('div', 'pf-csv');
    const switcher = el('div', 'pf-csv-switch');
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', '表格显示方式');
    const cardButton = el('button', 'pf-csv-mode is-active', '卡片');
    const tableButton = el('button', 'pf-csv-mode', '表格');
    for (const button of [cardButton, tableButton]) button.type = 'button';
    cardButton.setAttribute('aria-pressed', 'true');
    tableButton.setAttribute('aria-pressed', 'false');
    switcher.append(cardButton, tableButton);
    wrap.append(switcher);

    const shown = parsed.rows.slice(0, state.csvRows);
    const scroller = el('div', 'pf-csv-scroll');
    scroller.tabIndex = 0;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', '表格预览');
    const table = el('table', 'pf-csv-table');
    const thead = el('thead');
    const headRow = el('tr', '', el('th', 'pf-csv-no', '#'));
    for (const heading of parsed.header) headRow.append(el('th', '', heading));
    thead.append(headRow);
    const tbody = el('tbody');
    shown.forEach((row, index) => {
      const tr = el('tr');
      const no = el('th', 'pf-csv-no', String(index + 1));
      no.scope = 'row';
      tr.append(no);
      parsed.header.forEach((_, column) => tr.append(el('td', '', row[column] ?? '')));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    scroller.append(table);

    const cards = el('div', 'pf-csv-cards');
    shown.forEach((row, index) => {
      const card = el('article', 'pf-csv-card');
      const cardHead = el('div', 'pf-csv-card-head', el('span', '', String(index + 1)), el('span', '', row[0] ?? ''));
      const list = el('dl');
      parsed.header.slice(1).forEach((heading, column) => {
        list.append(el('dt', '', heading), el('dd', '', row[column + 1] ?? ''));
      });
      card.append(cardHead, list);
      cards.append(card);
    });

    wrap.append(scroller, cards);
    if (shown.length < parsed.rows.length) {
      const moreRows = el('button', 'pf-csv-more', `显示更多行（已显示 ${shown.length} / ${parsed.rows.length}）`);
      moreRows.type = 'button';
      moreRows.addEventListener('click', () => {
        state.csvRows = Math.min(CSV_LIMIT, state.csvRows + CSV_STEP);
        renderBody();
      });
      wrap.append(moreRows);
    }
    const note = el('p', 'pf-csv-note');
    const totalNote = parsed.truncatedRows ? `表格仅显示前 ${CSV_LIMIT} 行` : `共 ${parsed.rows.length} 行`;
    const colNote = parsed.truncatedCols ? `、每行前 ${CSV_COLS} 列` : `、${parsed.header.length} 列`;
    note.textContent = parsed.truncatedRows || parsed.truncatedCols
      ? `${totalNote}${colNote}；完整内容请查看源文件或下载。`
      : `${totalNote}${colNote}。`;
    wrap.append(note);

    const setMode = (mode: 'cards' | 'table') => {
      const isTable = mode === 'table';
      wrap.classList.toggle('is-table', isTable);
      cardButton.classList.toggle('is-active', !isTable);
      tableButton.classList.toggle('is-active', isTable);
      cardButton.setAttribute('aria-pressed', String(!isTable));
      tableButton.setAttribute('aria-pressed', String(isTable));
    };
    cardButton.addEventListener('click', () => setMode('cards'));
    tableButton.addEventListener('click', () => setMode('table'));
    view.append(wrap);
  }

  async function blobUrl(file: Candidate) {
    const url = URL.createObjectURL(await personalBlob(`/files/blob?path=${encodeURIComponent(file.path)}`));
    state.urls.push(url);
    return url;
  }

  async function renderImage(file: ReadPayload) {
    const stage = el('div', 'pf-media');
    const figure = el('figure', 'pf-media-frame');
    const img = el('img');
    img.alt = file.name;
    try {
      img.src = await blobUrl(file);
    } catch (error) {
      const card = el('div', 'pf-state pf-state-failed');
      card.append(
        el('h3', 'pf-state-title', '预览加载失败'),
        el('p', 'pf-state-text', `可下载原文件。${(error as Error).message}`),
      );
      view.replaceChildren(card);
      setFooterForFile(file);
      return;
    }
    if (file.path !== current()?.path) return;
    const caption = el('figcaption', '', el('span', '', file.mime), el('span', '', formatBytes(file.bytes)));
    figure.append(img, caption);
    stage.append(figure);
    view.append(stage);
  }

  async function renderPdf(file: ReadPayload) {
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    let url = '';
    try {
      url = await blobUrl(file);
    } catch (error) {
      view.append(pdfCard(file, `预览加载失败，可下载原文件。${(error as Error).message}`));
      return;
    }
    if (file.path !== current()?.path) return;
    if (narrow) {
      view.append(pdfCard(file, null, url));
      return;
    }
    const frame = el('iframe', 'pf-pdf-frame');
    frame.src = url;
    frame.title = file.name;
    const open = el('button', 'pf-btn', '在新标签打开');
    open.type = 'button';
    open.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    const info = el('div', 'pf-pdf-bar', el('span', '', `${file.mime} · ${formatBytes(file.bytes)}`), open);
    const stage = el('div', 'pf-pdf');
    stage.append(frame, info);
    view.append(stage);
  }

  function pdfCard(file: ReadPayload, error?: string | null, url?: string) {
    const card = el('div', 'pf-unknown');
    const head = el('span', 'pf-unknown-icon');
    head.append(icon('file'));
    const actions = el('div', 'pf-state-actions');
    if (url) {
      const open = el('button', 'pf-btn pf-btn-primary', '在新标签打开');
      open.type = 'button';
      open.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      actions.append(open);
    }
    card.append(
      head,
      el('h3', '', file.name),
      el('p', '', error ?? '此宽度不内嵌 PDF，可在新标签或下载后查看。'),
      el(
        'dl',
        '',
        el('dt', '', '格式'),
        el('dd', '', 'PDF'),
        el('dt', '', '大小'),
        el('dd', '', formatBytes(file.bytes)),
      ),
      actions,
    );
    return card;
  }

  function renderBinary(file: ReadPayload) {
    const card = el('div', 'pf-unknown');
    const head = el('span', 'pf-unknown-icon');
    head.append(icon('file'));
    card.append(
      head,
      el('h3', '', file.name),
      el('p', '', '此格式暂不支持预览，可下载后查看。'),
      el(
        'dl',
        '',
        el('dt', '', '格式'),
        el('dd', '', file.ext.toUpperCase()),
        el('dt', '', '大小'),
        el('dd', '', formatBytes(file.bytes)),
        el('dt', '', '修改时间'),
        el('dd', '', formatTime(file.mtime)),
      ),
    );
    view.append(card);
  }

  function renderBody() {
    const file = state.file;
    if (!file) return;
    clearView();
    setFooterForFile(file);
    if (!isTextFormat(file.format)) {
      view.classList.add('is-centered');
      if (file.format === 'image') void renderImage(file);
      else if (file.format === 'pdf') void renderPdf(file);
      else renderBinary(file);
      return;
    }
    if (!file.text) {
      renderEmpty(file);
      return;
    }
    if (state.tab === 'source') renderSource(file);
    else if (file.format === 'markdown') renderMarkdownPreview(file);
    else if (file.format === 'json') renderJson(file);
    else if (file.format === 'jsonl') renderJsonl(file);
    else if (file.format === 'csv' || file.format === 'tsv') renderCsv(file);
    else if (file.format === 'html') {
      setBanner('HTML 文件不在阅读器内执行，以下为源文件。');
      renderCode(file.text);
    } else renderPlainText(file);
    if (state.findOpen) void runFind();
  }

  /* ---------------- load ---------------- */

  async function load(candidate: Candidate) {
    const id = ++state.requestId;
    state.file = null;
    state.loaded = CHUNK;
    state.csvRows = CSV_STEP;
    state.error = null;
    releaseUrls();
    renderHeader(candidate);
    renderCandidates();
    renderTabs(isTextFormat(candidate.format));
    showState('loading');
    try {
      const file = await personalApi<ReadPayload>(`/files/read?path=${encodeURIComponent(candidate.path)}`);
      if (id !== state.requestId) return;
      state.file = file;
      state.error = null;
      detailMime.textContent = file.mime;
      renderBody();
    } catch (error) {
      if (id !== state.requestId) return;
      const message = (error as Error).message ?? '';
      if (/not found|404/i.test(message)) showState('notfound');
      else if (/not previewable|escapes|symbolic|403/i.test(message)) showState('denied');
      else if (/Failed to fetch|NetworkError|load failed|不可用/i.test(message)) showState('network');
      else showState('failed', message);
    }
  }

  /* ---------------- find ---------------- */

  function findTextNodes() {
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.pf-src-no, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    return nodes;
  }

  function paintFind() {
    if (!highlightStore || !HighlightCtor) return;
    highlightStore.delete('pf-hit');
    highlightStore.delete('pf-hit-current');
    if (!state.hits.length) return;
    const currentHit = state.hits[state.hitIndex];
    const others = state.hits.filter((hit) => hit !== currentHit);
    if (others.length) highlightStore.set('pf-hit', new HighlightCtor(...others));
    highlightStore.set('pf-hit-current', new HighlightCtor(currentHit));
  }

  async function runFind() {
    const query = state.query.trim();
    state.hits = [];
    state.hitIndex = 0;
    if (!query) {
      findCount.textContent = '0/0';
      paintFind();
      return;
    }
    const lower = query.toLowerCase();
    for (const node of findTextNodes()) {
      const haystack = node.nodeValue?.toLowerCase() ?? '';
      let from = 0;
      while (from <= haystack.length) {
        const index = haystack.indexOf(lower, from);
        if (index < 0) break;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + query.length);
        state.hits.push(range);
        from = index + Math.max(1, query.length);
      }
    }
    findCount.textContent = state.hits.length ? `1/${state.hits.length}` : '0/0';
    if (state.hits.length) scrollToHit();
    paintFind();
  }

  function scrollToHit() {
    const hit = state.hits[state.hitIndex];
    if (!hit) return;
    // Scroll by the match's own rect, not its parent element: a hit inside a
    // long <pre> or <p> would otherwise centre the whole block and appear to
    // stay put on every arrow press.
    const rect = hit.getClientRects()[0] ?? hit.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const box = body.getBoundingClientRect();
    const target = scrollTopForHit(
      {
        scrollTop: body.scrollTop,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        top: box.top,
        bottom: box.bottom,
      },
      { top: rect.top, bottom: rect.bottom },
    );
    if (target !== null) body.scrollTop = target;
  }

  function stepFind(delta: number) {
    if (!state.hits.length) return;
    state.hitIndex = (state.hitIndex + delta + state.hits.length) % state.hits.length;
    findCount.textContent = `${state.hitIndex + 1}/${state.hits.length}`;
    scrollToHit();
    paintFind();
  }

  function openFind() {
    if (!hasHighlightApi) return;
    state.findOpen = true;
    findBar.hidden = false;
    findButton.classList.add('is-active');
    findButton.setAttribute('aria-pressed', 'true');
    findInput.value = state.query;
    findInput.focus();
  }

  function closeFind(focus = true) {
    if (!state.findOpen) return;
    state.findOpen = false;
    findBar.hidden = true;
    findButton.classList.remove('is-active');
    findButton.setAttribute('aria-pressed', 'false');
    highlightStore?.delete('pf-hit');
    highlightStore?.delete('pf-hit-current');
    if (focus && hasHighlightApi) findButton.focus({ preventScroll: true });
  }

  /* ---------------- copy / download ---------------- */

  async function copy(text: string, message: string) {
    try {
      ensureClipboard(navigator, document);
      await navigator.clipboard.writeText(text);
      say(message);
    } catch {
      say('自动复制失败，请手动复制。');
    }
  }

  async function downloadFile(file: Candidate) {
    try {
      const blob = await personalBlob(`/files/blob?path=${encodeURIComponent(file.path)}`);
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = file.name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      say(`下载失败：${(error as Error).message}`);
    }
  }

  /* ---------------- open / close ---------------- */

  function open(
    name: string,
    candidates: Candidate[],
    total: number,
    trigger: HTMLElement | null,
    options: OpenOptions = {},
  ) {
    if (!candidates.length) return;
    state.onClose = options.onClose ?? null;
    state.name = name;
    state.candidates = candidates;
    state.total = Math.max(total, candidates.length);
    state.index = 0;
    state.tab = candidates[0].format === 'html' ? 'source' : 'preview';
    state.trigger = trigger;
    state.query = '';
    closeFind(false);

    if (!dialog.open) {
      lockScroll(true);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    void load(candidates[0]);
    body.scrollTop = 0;
    const target = state.total > 1 ? candsSelect : title;
    window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function afterClose() {
    state.requestId += 1;
    releaseUrls();
    clearView();
    lockScroll(false);
    closeFind(false);
    const trigger = state.trigger;
    state.trigger = null;
    const onClose = state.onClose;
    state.onClose = null;
    onClose?.();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  /* ---------------- events ---------------- */

  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', afterClose);
  dialog.addEventListener('cancel', (event) => {
    if (state.findOpen) {
      event.preventDefault();
      closeFind();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) close();
  });

  pathButton.addEventListener('click', () => {
    const expanded = pathButton.getAttribute('aria-expanded') === 'true';
    pathButton.setAttribute('aria-expanded', String(!expanded));
    details.hidden = expanded;
  });

  candsSelect.addEventListener('change', () => {
    state.index = Number(candsSelect.value) || 0;
    const candidate = current();
    if (candidate) void load(candidate);
    body.scrollTop = 0;
  });

  previewTab.addEventListener('click', () => setTab('preview'));
  sourceTab.addEventListener('click', () => setTab('source'));
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setTab(state.tab === 'source' ? 'preview' : 'source');
    (state.tab === 'source' ? sourceTab : previewTab).focus();
  });

  function setTab(tab: Tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    state.loaded = CHUNK;
    renderTabs(true);
    renderBody();
    body.scrollTop = 0;
  }

  findButton.addEventListener('click', () => {
    if (state.findOpen) closeFind();
    else openFind();
  });
  findClose.addEventListener('click', () => closeFind());
  findInput.addEventListener('input', () => {
    state.query = findInput.value;
    void runFind();
  });
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepFind(event.shiftKey ? -1 : 1);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });
  findPrev.addEventListener('click', () => stepFind(-1));
  findNext.addEventListener('click', () => stepFind(1));

  wideButton.addEventListener('click', () => {
    state.wide = !state.wide;
    dialog.classList.toggle('is-wide', state.wide);
    wideButton.setAttribute('aria-pressed', String(state.wide));
    wideButton.replaceChildren(icon(state.wide ? 'collapse' : 'expand'), el('span', '', state.wide ? '还原' : '宽屏'));
  });

  moreButton.addEventListener('click', () => {
    state.loaded += CHUNK;
    renderBody();
  });

  copyPath.addEventListener('click', () => {
    const candidate = current();
    if (candidate) void copy(candidate.path, '已复制相对路径');
  });
  copyContent.addEventListener('click', () => {
    const file = state.file;
    if (!file) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && dialog.contains(selection.anchorNode)) {
      void copy(selection.toString(), '已复制所选内容');
      return;
    }
    void copy(file.text ?? '', '已复制当前已加载内容');
  });
  download.addEventListener('click', () => {
    const candidate = current();
    if (candidate) void downloadFile(candidate);
  });

  return {
    open,
    close,
    isOpen: () => dialog.open,
  };
}
