// Reading annotations: underlines curated phrases in the chapter with a
// dotted, colour-coded line and explains them in a popover. The underline is
// a <span> around existing text nodes, so the text the highlight code anchors
// to is unchanged and both features can mark the same words.
import { machineLanguage } from '../../src/lib/machine-language';
import { annotationSpans, type Span } from './annotation-anchor';
import { createAnnotationPopover, KIND_LABELS, type Annotation } from './annotation-popover';
import { personalApi } from './api';
import { el } from './dom';
import './annotations.css';

const EXCLUDED = 'pre, figure, button, script, style, svg, h1, h2, h3, h4, h5, h6, a, sup, .footnotes, .katex';
const ANNO_CLASS = 'personal-anno';
const OFF_CLASS = 'personal-anno-off';
const VISIBLE_KEY = 'personal-annotations-visible';
const HOVER_DELAY_MS = 280;

interface TextEntry {
  node: Text;
  start: number;
  end: number;
}

function textMap(content: HTMLElement) {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(EXCLUDED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let text = '';
  const nodes: TextEntry[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    nodes.push({ node: textNode, start: text.length, end: text.length + textNode.length });
    text += textNode.data;
  }
  return { text, nodes };
}

function underline(text: string, annotation: Annotation, first: boolean) {
  const span = el('span', `${ANNO_CLASS} kind-${annotation.kind}`, text);
  span.dataset.annoId = annotation.id;
  if (first) {
    span.tabIndex = 0;
    span.setAttribute('role', 'button');
    span.setAttribute('aria-haspopup', 'dialog');
    span.setAttribute('aria-label', `${KIND_LABELS[annotation.kind]}批注：${annotation.title}`);
  }
  return span;
}

// Split each text node a span touches; a quote crossing <strong> or <code>
// becomes several spans sharing one id.
function wrapSpans(entries: TextEntry[], spans: Span[], byId: Map<string, Annotation>) {
  for (const entry of entries) {
    const hits = spans.filter((span) => span.start < entry.end && span.end > entry.start);
    if (!hits.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const span of hits) {
      const from = Math.max(0, span.start - entry.start);
      const to = Math.min(entry.node.length, span.end - entry.start);
      if (from > cursor) fragment.append(entry.node.data.slice(cursor, from));
      const text = entry.node.data.slice(from, to);
      fragment.append(underline(text, byId.get(span.id)!, span.start >= entry.start));
      cursor = to;
    }
    if (cursor < entry.node.length) fragment.append(entry.node.data.slice(cursor));
    entry.node.replaceWith(fragment);
  }
}

function readVisible() {
  try {
    return localStorage.getItem(VISIBLE_KEY) !== '0';
  } catch {
    return true;
  }
}

function toggleButton(count: number) {
  const button = el('button', 'personal-anno-toggle', `批注 ${count}`);
  button.type = 'button';
  const apply = (visible: boolean) => {
    document.documentElement.classList.toggle(OFF_CLASS, !visible);
    button.setAttribute('aria-pressed', String(visible));
    button.title = visible ? '隐藏阅读批注的下划线' : '显示阅读批注的下划线';
  };
  apply(readVisible());
  button.addEventListener('click', () => {
    const visible = document.documentElement.classList.contains(OFF_CLASS);
    apply(visible);
    try {
      localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0');
    } catch {
      // Private browsing: the choice just isn't remembered.
    }
  });
  document.body.append(button);
}

function wireEvents(content: HTMLElement, byId: Map<string, Annotation>) {
  const pieces = (id: string) =>
    content.querySelectorAll<HTMLElement>(`.${ANNO_CLASS}[data-anno-id="${CSS.escape(id)}"]`);
  const setActive = (id: string | null, active: boolean) =>
    id && pieces(id).forEach((piece) => piece.classList.toggle('is-active', active));
  const popover = createAnnotationPopover((target) => {
    content.querySelectorAll(`.${ANNO_CLASS}.is-active`).forEach((piece) => piece.classList.remove('is-active'));
    target?.focus({ preventScroll: true });
  });
  const disabled = () => document.documentElement.classList.contains(OFF_CLASS);
  const annotated = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>(`.${ANNO_CLASS}`) : null;

  function open(piece: HTMLElement, pinned: boolean) {
    const annotation = byId.get(piece.dataset.annoId ?? '');
    if (!annotation) return;
    setActive(popover.activeId, false);
    popover.show(annotation, piece, pinned);
    setActive(annotation.id, true);
  }

  content.addEventListener('click', (event) => {
    const piece = annotated(event.target);
    if (!piece || disabled()) return;
    // Clicking a highlight opens its note; dragging out a selection is not a click on the gloss.
    if ((event.target as Element).closest('mark.reader-highlight')) return;
    if (!getSelection()?.isCollapsed) return;
    open(piece, true);
  });
  content.addEventListener('keydown', (event) => {
    const piece = annotated(event.target);
    if (!piece || disabled() || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    open(piece, true);
  });

  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let hoverTimer = 0;
  content.addEventListener('mouseover', (event) => {
    const piece = annotated(event.target);
    if (!piece || disabled() || popover.pinned) return;
    popover.cancelHide();
    clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => open(piece, false), HOVER_DELAY_MS);
  });
  content.addEventListener('mouseout', (event) => {
    if (!annotated(event.target) || annotated(event.relatedTarget)) return;
    clearTimeout(hoverTimer);
    popover.scheduleHide();
  });
}

async function initAnnotations() {
  if (machineLanguage(new URL(location.href))) return;
  const content = document.querySelector<HTMLElement>('#chapter-content');
  const chapter = content?.dataset.chapterKey;
  if (!content || !chapter) return;
  let annotations: Annotation[];
  try {
    annotations = await personalApi<Annotation[]>(`/annotations?chapter=${encodeURIComponent(chapter)}`);
  } catch (error) {
    console.warn('Reading annotations could not load:', error);
    return;
  }
  if (!annotations.length) return;
  const byId = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  const { text, nodes } = textMap(content);
  const spans = annotationSpans(text, annotations);
  if (spans.length < annotations.length)
    console.warn(`${annotations.length - spans.length} reading annotations no longer match the chapter text.`);
  wrapSpans(nodes, spans, byId);
  wireEvents(content, byId);
  toggleButton(spans.length);
}

void initAnnotations();
