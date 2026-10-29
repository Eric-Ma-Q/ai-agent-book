// 回答里的「第 N 块」与同章书稿引用：读者点击后回到页面原文。
// 只读 DOM；不修改书稿，也不替 AI 滚动页面。

import { findBlockElement } from './capture.ts';

const BLOCK_REF = /第\s*(\d{1,4})(?:\s*(?:[–—~-]|至)\s*(\d{1,4}))?\s*块/g;
const SKIP = 'pre, code, a, .lab-cite, .pa-block-ref, .pa-cite, script, style, textarea';
const MAX_REFS = 20;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function flash(element: Element) {
  element.classList.remove('pa-block-flash');
  // Force a reflow so a repeated click on the same block restarts the cue.
  void (element as HTMLElement).offsetWidth;
  element.classList.add('pa-block-flash');
  window.setTimeout(() => element.classList.remove('pa-block-flash'), 1400);
}

/** Put the target in the upper fifth of the viewport so the fixed panel does not cover it. */
function scrollToElement(element: Element) {
  const rect = element.getBoundingClientRect();
  const offset = Math.min(window.innerHeight * 0.22, 180);
  const top = Math.max(0, window.scrollY + rect.top - offset);
  window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  flash(element);
}

export type BlockRefSpan = {
  first: number;
  last: number;
  start: number;
  end: number;
  label: string;
};

/**
 * A model often writes "第 212–213 块" for a heading plus its paragraph. Keep
 * the whole range as one label; the button jumps to the last block, which is
 * usually the sentence being cited.
 */
export function blockRefSpans(value: string): BlockRefSpan[] {
  const spans: BlockRefSpan[] = [];
  BLOCK_REF.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_REF.exec(value))) {
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    if (!Number.isFinite(first) || first < 1 || !Number.isFinite(last) || last < 1) continue;
    spans.push({
      first: Math.min(first, last),
      last: Math.max(first, last),
      start: match.index,
      end: match.index + match[0].length,
      label: match[0],
    });
    if (spans.length >= MAX_REFS) break;
  }
  return spans;
}

/**
 * Turn the first N "第 12 块" text runs in an answer into buttons. Code,
 * links and citation badges are skipped so examples stay examples.
 */
export function linkPageBlocks(root: ParentNode, onJump: (index: number) => void): number {
  if (typeof document === 'undefined' || typeof NodeFilter === 'undefined') return 0;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue ?? '';
    if (!value.includes('块')) continue;
    if (!node.parentElement || node.parentElement.closest(SKIP)) continue;
    if (blockRefSpans(value).length) targets.push(node);
    if (targets.length >= MAX_REFS) break;
  }

  let count = 0;
  for (const node of targets) {
    if (!node.isConnected || count >= MAX_REFS) break;
    const value = node.nodeValue ?? '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const span of blockRefSpans(value)) {
      if (count >= MAX_REFS) break;
      if (span.start > cursor) fragment.append(document.createTextNode(value.slice(cursor, span.start)));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pa-block-ref';
      button.dataset.block = String(span.last);
      if (span.last !== span.first) button.dataset.blockFirst = String(span.first);
      button.textContent = span.label;
      button.setAttribute(
        'aria-label',
        span.last !== span.first ? `跳到第 ${span.first} 到 ${span.last} 块` : `跳到第 ${span.first} 块`,
      );
      button.title = span.last !== span.first ? `第 ${span.first}–${span.last} 块` : `第 ${span.first} 块`;
      button.addEventListener('click', () => onJump(span.last));
      fragment.append(button);
      cursor = span.end;
      count += 1;
    }
    if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
    node.replaceWith(fragment);
  }
  return count;
}

/**
 * Bind the [[#N|quote]] buttons that renderMarkdown already turned into page
 * citation pills. The badge and tooltip were decided at render time from the
 * block text; here we only add the jump.
 */
export function bindPageCitations(root: ParentNode, onJump: (index: number) => void): number {
  if (typeof document === 'undefined') return 0;
  let count = 0;
  for (const button of root.querySelectorAll<HTMLButtonElement>('button.pa-cite[data-block]')) {
    if (button.dataset.paCiteBound === '1') continue;
    button.dataset.paCiteBound = '1';
    const index = Number(button.dataset.block);
    if (!Number.isInteger(index) || index < 1) continue;
    button.addEventListener('click', () => onJump(index));
    count += 1;
  }
  return count;
}

function normalizePath(path: string): string {
  const trimmed = (path || '/').replace(/\/+$/, '');
  return trimmed || '/';
}

/**
 * Same-chapter citations scroll in place. Cross-chapter citations keep the
 * reader link and its quote highlight, which only works on a fresh page.
 */
export function interceptCitations(
  root: ParentNode,
  currentPath: string,
  onJump: (sectionId: string) => void,
): number {
  if (typeof document === 'undefined') return 0;
  const here = normalizePath(currentPath);
  let count = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a.lab-cite')) {
    if (link.dataset.paCite === 'bound') continue;
    link.dataset.paCite = 'bound';
    link.addEventListener('click', (event) => {
      let url: URL;
      try {
        url = new URL(link.href, location.href);
      } catch {
        return;
      }
      if (normalizePath(url.pathname) !== here) return;
      let id = '';
      try {
        id = decodeURIComponent(url.hash.slice(1));
      } catch {
        return;
      }
      if (!id || !document.getElementById(id)) return;
      event.preventDefault();
      onJump(id);
    });
    count += 1;
  }
  return count;
}

export function jumpToBlock(index: number, onMissing?: () => void): boolean {
  const element = findBlockElement(index);
  if (!element) {
    onMissing?.();
    return false;
  }
  scrollToElement(element);
  return true;
}

export function jumpToSection(sectionId: string, onMissing?: () => void): boolean {
  const id = (sectionId || '').trim();
  if (!id) {
    onMissing?.();
    return false;
  }
  const element = document.getElementById(id);
  if (!element) {
    onMissing?.();
    return false;
  }
  scrollToElement(element);
  return true;
}
