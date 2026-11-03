// Arriving from the agent lab (?quote=<原文>): find the quoted passage in the
// chapter, ignoring whitespace and width, scroll to it and flash it. Waits for
// the reader to finish drawing highlights and annotations, which rewrap text.
import { locateInSegments } from './lab/quote.ts';
import './quote-jump.css';

const SETTLE_MS = 400;
const WAIT_MS = 6000;
const FLASH_MS = 4000;
const SKIP = 'sup, .footnote-ref, figure.personal-insert, .katex-mathml, script, style, button, .anno-popover';

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** Resolves once the article has stopped changing for a moment (or after WAIT_MS). */
function settled(root: HTMLElement) {
  return new Promise<void>((resolve) => {
    let timer = window.setTimeout(done, SETTLE_MS);
    const cap = window.setTimeout(done, WAIT_MS);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(done, SETTLE_MS);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    function done() {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      resolve();
    }
  });
}

function toast(message: string) {
  const node = document.createElement('p');
  node.className = 'quote-jump-toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 6000);
}

function flash(range: Range) {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (window as unknown as { Highlight?: new (r: Range) => unknown }).Highlight;
  if (registry && HighlightCtor) {
    registry.set('lab-quote', new HighlightCtor(range));
    window.setTimeout(() => registry.delete('lab-quote'), FLASH_MS);
    return;
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

async function jump() {
  const url = new URL(location.href);
  const quote = url.searchParams.get('quote');
  const article = document.querySelector<HTMLElement>('#chapter-content');
  if (!quote || !article) return;
  url.searchParams.delete('quote');
  history.replaceState(history.state, '', url);

  await settled(article);
  await document.fonts?.ready;
  const nodes = textNodes(article);
  const found = locateInSegments(
    nodes.map((node) => node.data),
    quote,
  );
  if (!found) {
    toast('在本章正文里没有找到这段引用（原文可能已经修改）。');
    return;
  }
  const range = document.createRange();
  range.setStart(nodes[found.start.segment], found.start.offset);
  range.setEnd(nodes[found.end.segment], found.end.offset);
  const rect = range.getBoundingClientRect();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: reduced ? 'instant' : 'smooth' });
  flash(range);
}

void jump();
