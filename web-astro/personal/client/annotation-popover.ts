// The card that explains an annotated phrase. Hover previews it on devices
// with a mouse; a click or tap (or Enter) pins it until dismissed.
import { el } from './dom';

export type AnnotationKind = 'term' | 'ref' | 'entity' | 'update' | 'extend';

export interface Annotation {
  id: string;
  quote: string;
  context?: string;
  kind: AnnotationKind;
  title: string;
  html: string;
  sources: { title: string; url: string }[];
}

export const KIND_LABELS: Record<AnnotationKind, string> = {
  term: '术语',
  ref: '出处',
  entity: '人物 / 机构 / 产品',
  update: '时效 / 勘误',
  extend: '延伸',
};

const GAP = 8;
const MARGIN = 12;
const HIDE_DELAY_MS = 220;
const DISCLAIMER = '阅读批注由 AI 检索整理，可能有疏漏，以来源为准。';

function cardContent(annotation: Annotation) {
  const head = el(
    'header',
    'personal-anno-pop-head',
    el('span', `personal-anno-badge kind-${annotation.kind}`, KIND_LABELS[annotation.kind]),
    el('strong', 'personal-anno-pop-title', annotation.title),
  );
  const body = el('div', 'personal-anno-pop-body');
  // Markdown from the repo's curated annotation files, rendered by the local dev server.
  body.innerHTML = annotation.html;
  const sources = annotation.sources.length
    ? el(
        'ul',
        'personal-anno-pop-sources',
        ...annotation.sources.map((source) => {
          const link = el('a', '', source.title);
          link.href = source.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          return el('li', '', link);
        }),
      )
    : null;
  return [head, body, sources, el('p', 'personal-anno-pop-note', DISCLAIMER)];
}

export function createAnnotationPopover(onClose: (target: HTMLElement | null) => void) {
  const root = el('div', 'personal-anno-pop');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  const close = el('button', 'personal-anno-pop-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭批注');
  document.body.append(root);

  let current: { id: string; target: HTMLElement; pinned: boolean } | null = null;
  let hideTimer = 0;

  function position(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const below = innerHeight - rect.bottom >= height + GAP + MARGIN || rect.top < height + GAP + MARGIN;
    const top = below ? rect.bottom + GAP : rect.top - height - GAP;
    const left = Math.max(MARGIN, Math.min(innerWidth - width - MARGIN, rect.left));
    root.style.top = `${top + scrollY}px`;
    root.style.left = `${left + scrollX}px`;
  }

  function show(annotation: Annotation, target: HTMLElement, pinned: boolean) {
    clearTimeout(hideTimer);
    if (current?.id === annotation.id && current.target === target) {
      current.pinned ||= pinned;
      if (pinned) close.focus({ preventScroll: true });
      return;
    }
    current = { id: annotation.id, target, pinned };
    root.replaceChildren(close, ...cardContent(annotation).filter((node): node is HTMLElement => Boolean(node)));
    root.dataset.kind = annotation.kind;
    root.setAttribute('aria-label', annotation.title);
    root.hidden = false;
    position(target);
    if (pinned) close.focus({ preventScroll: true });
  }

  function hide() {
    clearTimeout(hideTimer);
    if (!current) return;
    const { target, pinned } = current;
    current = null;
    root.hidden = true;
    onClose(pinned ? target : null);
  }

  const scheduleHide = () => {
    if (!current || current.pinned) return;
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS);
  };
  const cancelHide = () => clearTimeout(hideTimer);

  close.addEventListener('click', hide);
  root.addEventListener('mouseenter', cancelHide);
  root.addEventListener('mouseleave', scheduleHide);
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    if (current && !root.contains(target) && !target?.closest?.('.personal-anno')) hide();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) hide();
  });
  window.addEventListener('resize', () => current && position(current.target));

  return {
    show,
    hide,
    scheduleHide,
    cancelHide,
    get activeId() {
      return current?.id ?? null;
    },
    get pinned() {
      return current?.pinned ?? false;
    },
  };
}
