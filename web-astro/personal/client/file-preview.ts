// Requirement 023: turn repository filenames in the prose into preview links.
// The server decides which names exist; this module only wraps names that came
// back with at least one candidate, then keeps the page in sync with mutations
// from the lab, highlights and reading annotations.
import { personalApi } from './api';
import { el } from './dom';
import {
  buildIndexEntries,
  findFileNames,
  formatBytes,
  type IndexEntry,
  type NameMatch,
} from './file-preview/model';
import { createPreviewPanel, type Candidate } from './file-preview/panel';
import './file-preview.css';

const SKIP = [
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'button',
  'textarea',
  'input',
  'select',
  'option',
  'script',
  'style',
  'svg',
  '.katex',
  '.personal-anno',
  '.pa-root',
  '.pf-root',
  '.pf-index',
  '.reader-controls',
  '.chapter-rail',
  'header',
  'footer',
  'nav',
  '[data-pf-link]',
].join(',');

const MAX_LINKS = 200;
const MAX_NAMES = 200;
const BATCH = 50;
const OBSERVE_DELAY = 300;

type ResolveResponse = {
  files: Record<string, Candidate[]>;
  totals: Record<string, number>;
};

const candidatesByName = new Map<string, Candidate[]>();
const totalsByName = new Map<string, number>();
const panel = createPreviewPanel();

const pageIndex = (() => {
  const scrim = el('div', 'pf-index-scrim');
  scrim.hidden = true;
  const aside = el('aside', 'pf-index');
  aside.hidden = true;
  aside.setAttribute('role', 'dialog');
  aside.setAttribute('aria-modal', 'false');
  aside.setAttribute('aria-labelledby', 'pf-index-title');

  const head = el('header', 'pf-index-head');
  const heading = el('h2', 'pf-index-title', '本页文件 ');
  heading.id = 'pf-index-title';
  const count = el('span', 'pf-index-count', '0');
  heading.append(count);
  const note = el('p', 'pf-index-note', '仅收录正文里提到的文件');
  const close = el('button', 'pf-index-close');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭本页文件');
  close.textContent = '×';
  const headingWrap = el('div', 'pf-index-heading');
  headingWrap.append(heading, note);
  head.append(headingWrap, close);

  const list = el('ul', 'pf-index-list');
  const footer = el('footer', 'pf-index-foot', '同名文件按当前章节优先排序，点击进入预览');
  aside.append(head, list, footer);

  let trigger: HTMLButtonElement | null = null;
  let returnFocus: HTMLElement | null = null;
  let open = false;
  let entries: IndexEntry[] = [];
  let renderedSignature = '';
  const published = new Map<string, IndexEntry>();
  const publishedOrder: string[] = [];

  const mountTrigger = () => {
    if (trigger) return trigger;
    trigger = el('button', 'pf-index-trigger');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(el('span', 'pf-index-trigger-icon', '▤'), el('span', '', '本页文件'));
    trigger.append(el('span', 'pf-index-trigger-count', '0'));
    const controls = document.querySelector('.reader-controls');
    if (controls) {
      trigger.classList.add('is-toolbar');
      controls.prepend(trigger);
    } else {
      trigger.classList.add('is-floating');
      document.body.append(trigger);
    }
    trigger.addEventListener('click', () => (open ? closePanel() : openPanel()));
    return trigger;
  };

  const buildItem = (entry: IndexEntry) => {
    const item = el('li');
    const button = el('button', 'pf-index-item');
    button.type = 'button';
    const icon = el('span', 'pf-index-icon', '▤');
    const main = el('span', 'pf-index-main');
    const name = el('span', 'pf-index-name', entry.candidate.name);
    const meta = [
      entry.candidate.dir,
      formatBytes(entry.candidate.bytes),
      entry.total > 1 ? `同名 ${entry.total} 份` : '',
      `出现 ${entry.occurrences} 次`,
    ]
      .filter(Boolean)
      .join(' · ');
    const metaLine = el('span', 'pf-index-meta', meta);
    main.append(name, metaLine);
    const chevron = el('span', 'pf-index-chevron', '›');
    button.append(icon, main, chevron);
    button.addEventListener('click', () => {
      // The index and the dialog never show at once; the index comes back with
      // focus on this row when the dialog closes.
      suspend();
      panel.open(entry.name, candidatesByName.get(entry.name) ?? [], entry.total, button, {
        onClose: () => resume(button),
      });
    });
    item.append(button);
    return item;
  };

  function suspend() {
    if (!open) return;
    aside.classList.add('is-suspended');
  }

  function resume(target?: HTMLElement) {
    if (!open) return;
    aside.classList.remove('is-suspended');
    (target ?? list.querySelector<HTMLElement>('.pf-index-item'))?.focus({ preventScroll: true });
  }

  function openPanel() {
    if (open) return;
    open = true;
    returnFocus = returnFocus ?? (document.activeElement as HTMLElement | null);
    aside.hidden = false;
    scrim.hidden = false;
    trigger?.setAttribute('aria-expanded', 'true');
    list.querySelector<HTMLElement>('.pf-index-item')?.focus({ preventScroll: true });
  }

  function closePanel(options: { restore?: boolean } = {}) {
    if (!open) return;
    open = false;
    aside.hidden = true;
    aside.classList.remove('is-suspended');
    scrim.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (options.restore !== false) {
      const target = returnFocus?.isConnected ? returnFocus : trigger;
      target?.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  close.addEventListener('click', () => closePanel());
  scrim.addEventListener('click', () => closePanel());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open || panel.isOpen()) return;
    event.preventDefault();
    closePanel();
  });

  document.body.append(scrim, aside);

  return {
    render(next: IndexEntry[]) {
      // Later scans can be partial (only newly inserted text is visible), so
      // merge instead of replacing and keep the first-seen order stable.
      for (const entry of next) {
        const key = entry.candidate.path;
        if (!published.has(key)) publishedOrder.push(key);
        published.set(key, entry);
      }
      entries = publishedOrder
        .map((key) => published.get(key))
        .filter((entry): entry is IndexEntry => Boolean(entry));
      if (!entries.length) {
        if (trigger && published.size === 0) trigger.hidden = true;
        return;
      }
      mountTrigger();
      if (!trigger) return;
      trigger.hidden = false;
      const signature = entries
        .map((entry) => `${entry.candidate.path}:${entry.total}:${entry.occurrences}`)
        .join('|');
      if (signature === renderedSignature) return;
      renderedSignature = signature;
      count.textContent = String(entries.length);
      const badge = trigger.querySelector('.pf-index-trigger-count');
      if (badge) badge.textContent = String(entries.length);
      list.replaceChildren(...entries.map(buildItem));
    },
    close: closePanel,
    isOpen: () => open,
    count: () => entries.length,
  };
})();

/* ---------------- scanning ---------------- */

function collectTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

type Pending = { node: Text; match: NameMatch };

function collectMatches(root: Node) {
  const pending: Pending[] = [];
  const order: string[] = [];
  const occurrences = new Map<string, number>();
  const names = new Set<string>();
  for (const node of collectTextNodes(root)) {
    for (const match of findFileNames(node.data)) {
      if (names.size >= MAX_NAMES && !names.has(match.name)) continue;
      pending.push({ node, match });
      if (!names.has(match.name)) {
        names.add(match.name);
        order.push(match.name);
      }
      occurrences.set(match.name, (occurrences.get(match.name) ?? 0) + 1);
    }
  }
  return { pending, order, occurrences, names: [...names] };
}

async function resolveNames(names: string[]) {
  const root = document.querySelector<HTMLElement>('#chapter-content');
  const chapter = root?.dataset.chapterKey;
  // Names are cached for the life of the page, including confirmed misses.
  const pending = names.filter((name) => !candidatesByName.has(name));
  for (let index = 0; index < pending.length; index += BATCH) {
    const batch = pending.slice(index, index + BATCH);
    const response = await personalApi<ResolveResponse>('/files/resolve', {
      names: batch,
      page: location.pathname,
      chapter,
    });
    for (const [name, candidates] of Object.entries(response.files ?? {})) {
      candidatesByName.set(name, candidates);
      totalsByName.set(name, response.totals?.[name] ?? candidates.length);
    }
  }
}

function wrapMatches(pending: Pending[]) {
  const byNode = new Map<Text, NameMatch[]>();
  for (const item of pending) {
    const candidates = candidatesByName.get(item.match.name);
    if (!candidates?.length) continue;
    const list = byNode.get(item.node) ?? [];
    list.push(item.match);
    byNode.set(item.node, list);
  }

  let links = 0;
  for (const [node, matches] of byNode) {
    if (links >= MAX_LINKS) break;
    const source = node.data;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches.sort((a, b) => a.start - b.start)) {
      if (links >= MAX_LINKS) break;
      if (match.start < cursor) continue;
      if (match.start > cursor) fragment.append(source.slice(cursor, match.start));
      const candidate = candidatesByName.get(match.name)?.[0];
      if (!candidate) {
        fragment.append(source.slice(match.start, match.end));
        cursor = match.end;
        continue;
      }
      const link = el('a', 'pf-link', source.slice(match.start, match.end));
      link.href = '#';
      link.dataset.pfLink = match.name;
      link.setAttribute('aria-haspopup', 'dialog');
      link.setAttribute('aria-label', `预览文件 ${match.name}`);
      link.title = candidate.path;
      fragment.append(link);
      cursor = match.end;
      links += 1;
    }
    if (cursor < source.length) fragment.append(source.slice(cursor));
    node.replaceWith(fragment);
  }
  return links;
}

/* ---------------- lifecycle ---------------- */

let observer: MutationObserver | null = null;
let scheduled = 0;
let running = false;

function schedule(delay = 0) {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => void run(), delay);
}

async function run() {
  if (running) {
    schedule(OBSERVE_DELAY);
    return;
  }
  running = true;
  observer?.disconnect();
  try {
    const root =
      document.querySelector('#chapter-content') ??
      document.querySelector('main') ??
      document.body;
    const { pending, order, occurrences, names } = collectMatches(root);
    if (!names.length) return;
    await resolveNames(names);
    const links = wrapMatches(pending);
    pageIndex.render(buildIndexEntries(order, occurrences, candidatesByName, totalsByName));
    if (links) console.info(`[file-preview] linked ${links} filenames`);
  } catch (error) {
    console.warn('[file-preview] could not link filenames:', error);
  } finally {
    observer?.takeRecords();
    observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
    running = false;
  }
}

function startObserver() {
  observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !target?.closest('.pf-root, .pf-index, .pf-index-scrim, .pf-index-trigger');
    });
    if (relevant) schedule(OBSERVE_DELAY);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest<HTMLAnchorElement>('a.pf-link');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  const name = link.dataset.pfLink;
  if (!name) return;
  pageIndex.close();
  panel.open(name, candidatesByName.get(name) ?? [], totalsByName.get(name) ?? 0, link);
}

function boot() {
  document.addEventListener('click', onDocumentClick, true);
  startObserver();
  const idle = (window as any).requestIdleCallback as
    | ((callback: () => void, options?: { timeout: number }) => number)
    | undefined;
  if (idle) idle(() => void run(), { timeout: 1500 });
  else window.setTimeout(() => void run(), 0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Test seam: the wiring test only checks the module is injected and the CSS
// ships; nothing else imports this object.
export const filePreviewWiring = { SKIP, MAX_LINKS, MAX_NAMES, BATCH };
