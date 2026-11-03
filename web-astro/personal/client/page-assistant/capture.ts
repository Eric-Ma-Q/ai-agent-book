// 页面采集：把读者当前看到的 DOM 变成服务端能切片的结构化快照。
// 不依赖安全上下文 API；只读 DOM，不修改页面（截图除外，见 screenshot.ts）。
import { chooseCurrentBlock, detectPageType, MAX_BLOCKS, type PageBlock, type PageHeading, type PageLink, type PageRole, type PageSnapshot } from './model.ts';

const MAX_BLOCK_CHARS = 4000;
const MAX_SELECTION_CHARS = 20_000;
// Prefer the whole main column so the snapshot includes the chapter title and
// the flow diagram that is actually on screen at the top of a page. The
// chapter body is one part of main, not the only thing the reader sees.
const ROOT_SELECTORS = ['main#main-content', 'main', '#chapter-content', '[data-iv-root]', '.harness-page', 'article', '#content', '#main', 'body'];
const CANDIDATES = 'h1,h2,h3,h4,p,li,pre,blockquote,table,figure,figcaption,dt,dd,button,textarea,label.opt,div.scenario,div.q-top,div.match-grid,div.rubric,p.part-desc,p.hint-multi,[class*="flow-node"],[class*="flow-heading"],[class*="flow-label"]';
const SKIP_ANCESTOR = 'script,style,noscript,template,.site-header,nav,footer,.pa-root,#palette,.palette,.q-palette,.submit-bar';
const SECTION_TAGS = new Set(['H1', 'H2', 'H3', 'H4']);

function clean(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// 表单控件的值存在 value / checked 属性里，不在 textContent 里。考试页的填空、
// 开放题和连线题都靠这些控件作答，只读 textContent 会把读者的答案读成空白。
// 用结构化访问代替 instanceof，便于在没有 DOM 的单测里直接传普通对象。
type TextSource = {
  nodeType: number;
  textContent?: string | null;
  tagName?: string;
  type?: string;
  value?: string;
  checked?: boolean;
  selectedText?: string;
  childNodes?: ArrayLike<TextSource>;
};

const IGNORED_INPUT_TYPES = new Set(['password', 'hidden', 'file', 'submit', 'button', 'reset', 'image']);

export function textWithFields(node: TextSource): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  const tag = (node.tagName ?? '').toUpperCase();
  if (!tag) return '';
  if (tag === 'SELECT') {
    // 保留全部选项，另用标记说明读者选了哪一个；连线题需要看到候选池。
    const options = Array.from(node.childNodes ?? []).map(textWithFields).join(' ');
    const picked = clean(node.selectedText ?? '');
    return picked ? (options ? `[已选: ${picked}] ${options}` : `[已选: ${picked}]`) : options;
  }
  if (tag === 'INPUT') {
    const type = (node.type ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return node.checked ? '[已选] ' : '';
    if (IGNORED_INPUT_TYPES.has(type)) return '';
    const text = clean(node.value ?? '');
    return text ? `[填写: ${text}]` : '[空]';
  }
  if (tag === 'TEXTAREA') {
    const text = clean(node.value ?? '');
    return text ? `[填写: ${text}]` : '[空]';
  }
  if (tag === 'BR') return '\n';
  return Array.from(node.childNodes ?? []).map(textWithFields).join('');
}

function readFields(node: ChildNode): TextSource {
  const element = node as Element;
  const source: TextSource = {
    nodeType: node.nodeType,
    textContent: node.textContent,
    tagName: node.nodeType === Node.ELEMENT_NODE ? element.tagName : '',
    childNodes: Array.from(node.childNodes).map(readFields),
  };
  if (element instanceof HTMLInputElement) {
    source.type = element.type;
    source.value = element.value;
    source.checked = element.checked;
  } else if (element instanceof HTMLTextAreaElement) {
    source.value = element.value;
  } else if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    source.selectedText = option && option.value ? (option.textContent ?? '') : '';
  }
  return source;
}

function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && element.getClientRects().length > 0;
}

function roleFor(element: Element): PageRole {
  const tag = element.tagName.toLowerCase();
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return 'heading';
  if (tag === 'pre' || tag === 'code') return 'code';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'table') return 'table';
  if (tag === 'figure' || tag === 'figcaption') return 'figure';
  if (tag === 'li' || tag === 'dt' || tag === 'dd') return 'list';
  if (tag === 'p') return 'paragraph';
  return 'other';
}

/** Plain text of one block, using the same rules as the snapshot. */
export function blockText(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (tag === 'table') {
    const rows = Array.from(element.querySelectorAll('tr')).slice(0, 40);
    if (rows.length) {
      return rows
        .map((row) =>
          Array.from(row.querySelectorAll('th,td'))
            .map((cell) => clean(cell.textContent ?? ''))
            .filter(Boolean)
            .join(' | '),
        )
        .filter(Boolean)
        .join('\n');
    }
  }
  if (tag === 'figure') {
    const caption = element.querySelector('figcaption')?.textContent ?? '';
    const images = Array.from(element.querySelectorAll('img'))
      .map((image) => image.getAttribute('alt') ?? '')
      .filter(Boolean)
      .join('；');
    return clean([caption, images].filter(Boolean).join('\n'));
  }
  return clean(textWithFields(readFields(element)));
}

export function findContentRoot(doc: Document = document): HTMLElement {
  for (const selector of ROOT_SELECTORS) {
    const node = doc.querySelector<HTMLElement>(selector);
    if (!node || node.closest('.pa-root')) continue;
    if (selector === 'body' || clean(node.textContent ?? '').length > 40) return node;
  }
  return doc.body;
}

function collectHeadings(root: HTMLElement, blockIndexByElement: Map<Element, number>): PageHeading[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4')).filter(isVisible).slice(0, 300);
  return nodes.map((node) => ({
    id: node.id || '',
    text: clean(node.textContent ?? '').slice(0, 300),
    level: Number(node.tagName.slice(1)) || 2,
    blockIndex: blockIndexByElement.get(node) ?? null,
  }));
}

function collectLinks(root: HTMLElement, blockIndexByElement: Map<Element, number>): PageLink[] {
  const out: PageLink[] = [];
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, 600);
  for (const anchor of anchors) {
    if (out.length >= 200) break;
    if (!isVisible(anchor) || anchor.closest('.pa-root') || anchor.closest(SKIP_ANCESTOR)) continue;
    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('javascript:')) continue;
    let host: Element | null = anchor;
    let blockIndex: number | null = null;
    while (host && host !== root) {
      if (blockIndexByElement.has(host)) {
        blockIndex = blockIndexByElement.get(host) ?? null;
        break;
      }
      host = host.parentElement;
    }
    out.push({ text: clean(anchor.textContent ?? '').slice(0, 300), href: href.slice(0, 2000), blockIndex });
  }
  return out;
}

function selectionInfo(doc: Document, blockIndexByElement: Map<Element, number>, blocks: PageBlock[]) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const anchor = selection.anchorNode;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor?.parentElement;
  if (!element || element.closest('.pa-root')) return null;
  let host: Element | null = element;
  let blockIndex: number | null = null;
  while (host) {
    if (blockIndexByElement.has(host)) {
      blockIndex = blockIndexByElement.get(host) ?? null;
      break;
    }
    host = host.parentElement;
  }
  const block = blocks.find((item) => item.index === blockIndex);
  return { text: text.slice(0, MAX_SELECTION_CHARS), blockIndex, sectionId: block?.sectionId ?? '' };
}

export type BlockCollection = {
  root: HTMLElement;
  elements: HTMLElement[];
  blocks: PageBlock[];
  blockIndexByElement: Map<Element, number>;
  truncated: boolean;
  scrolling: number;
  width: number;
  height: number;
  pageHeight: number;
};

/**
 * The single block walk used by both the snapshot and "jump to block N".
 * Keeping one walk means the index in an answer always points at the element
 * the snapshot counted, even after the reader has scrolled or expanded a
 * details node.
 */
export function collectBlocks(doc: Document = document, win: Window = window): BlockCollection {
  const root = findContentRoot(doc);
  const scrolling = win.scrollY || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
  const width = win.innerWidth || doc.documentElement.clientWidth || 1200;
  const height = win.innerHeight || doc.documentElement.clientHeight || 800;
  const pageHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, height);
  const direct = root.id === 'chapter-content';
  const elements = (direct ? Array.from(root.children) : Array.from(root.querySelectorAll(CANDIDATES))) as HTMLElement[];
  const selected: HTMLElement[] = [];
  const blockIndexByElement = new Map<Element, number>();
  const blocks: PageBlock[] = [];
  let truncated = false;

  for (const element of elements) {
    if (selected.length >= MAX_BLOCKS) {
      truncated = true;
      break;
    }
    if (!element || element.closest('.pa-root') || element.closest(SKIP_ANCESTOR)) continue;
    if (!isVisible(element)) continue;
    if (selected.some((parent) => parent !== element && parent.contains(element))) continue;
    const text = blockText(element).slice(0, MAX_BLOCK_CHARS);
    if (!text) continue;
    selected.push(element);
    const rect = element.getBoundingClientRect();
    const index = blocks.length + 1;
    blockIndexByElement.set(element, index);
    blocks.push({
      index,
      id: element.id || '',
      tag: element.tagName.toLowerCase(),
      role: roleFor(element),
      sectionId: '',
      sectionTitle: '',
      text,
      top: Math.max(0, rect.top + scrolling),
      height: Math.max(0, rect.height),
      inViewport: rect.bottom > 0 && rect.top < height,
    });
  }

  return { root, elements: selected, blocks, blockIndexByElement, truncated, scrolling, width, height, pageHeight };
}

/** Resolve a block index to the element the snapshot counted; null when the page changed. */
export function findBlockElement(index: number, doc: Document = document, win: Window = window): HTMLElement | null {
  if (!Number.isInteger(index) || index < 1) return null;
  const { elements } = collectBlocks(doc, win);
  return elements[index - 1] ?? null;
}

export function collectPageSnapshot(doc: Document = document, win: Window = window): PageSnapshot {
  const { root, elements, blocks, blockIndexByElement, truncated, scrolling, width, height, pageHeight } = collectBlocks(doc, win);
  let sectionId = '';
  let sectionTitle = '';
  for (const block of blocks) {
    const element = elements[block.index - 1];
    if (element && SECTION_TAGS.has(element.tagName)) {
      sectionId = element.id || sectionId;
      sectionTitle = clean(element.textContent ?? '').slice(0, 300);
    }
    block.sectionId = sectionId;
    block.sectionTitle = sectionTitle;
  }

  const chapterKey = doc.querySelector<HTMLElement>('#chapter-content')?.dataset.chapterKey ?? '';
  const chapterMatch = /chapter(\d+)/.exec(chapterKey) ?? /\/book\/chapter(\d+)/.exec(location.pathname);
  const title = clean(doc.title || '').slice(0, 500);
  const pageType = detectPageType(location.pathname);
  const selection = selectionInfo(doc, blockIndexByElement, blocks);
  const currentIndex = chooseCurrentBlock(blocks, scrolling, height);
  const currentBlock = blocks.find((block) => block.index === currentIndex);
  const headings = collectHeadings(root, blockIndexByElement);
  const links = collectLinks(root, blockIndexByElement);
  const scrollRatio = pageHeight > height ? Math.max(0, Math.min(1, scrolling / (pageHeight - height))) : 0;

  return {
    version: 1,
    url: location.href,
    title,
    path: location.pathname,
    lang: doc.documentElement.lang || 'zh-CN',
    pageType,
    capturedAt: new Date().toISOString(),
    viewport: { width, height, scrollY: scrolling, pageHeight, scrollRatio, devicePixelRatio: win.devicePixelRatio || 1 },
    chapter: {
      number: chapterMatch ? Number(chapterMatch[1]) : null,
      key: chapterKey,
      title: headings.find((heading) => heading.level === 1)?.text ?? title,
    },
    current: {
      blockIndex: currentIndex,
      blockId: currentBlock?.id ?? '',
      sectionId: currentBlock?.sectionId ?? '',
      sectionTitle: currentBlock?.sectionTitle ?? '',
      percent: scrollRatio,
    },
    selection,
    headings,
    blocks,
    links,
    truncated,
  };
}
