// The personal header entries come from three sources: the book itself
// (exam, lab, highlights), the reader's collected Harness web archive, and the
// global settings page. Group them under overbrace labels so the difference is
// visible without touching the upstream header. Each entry script still owns its
// link, state and aria-label; this module only moves the links into category
// wrappers.
import { el } from './dom';
import './header-entry-groups.css';

type EntryGroup = {
  id: string;
  label: string;
  ariaLabel: string;
  selectors: string[];
};

const GROUPS: EntryGroup[] = [
  {
    id: 'book',
    label: 'AI Agent Book',
    ariaLabel: 'AI Agent Book 功能',
    // The lab button also carries .hl-entry, so exclude it from the highlights
    // selector or the same link would be collected twice.
    selectors: ['.book-exam-entry', '.lab-entry', '.hl-entry:not(.lab-entry)'],
  },
  {
    id: 'harness',
    label: '个人收集网页',
    ariaLabel: '个人收集网页',
    selectors: ['.harness-entry'],
  },
  {
    id: 'settings',
    label: '设置',
    ariaLabel: '设置',
    selectors: ['.settings-entry'],
  },
];

// An overbrace pointing up: both ends curl down and the centre rises. The viewBox
// is stretched horizontally to the group width; preserveAspectRatio="none" plus
// vector-effect keeps the stroke even at one-icon width.
const BRACE = [
  '<svg class="header-entry-group-line" viewBox="0 0 100 8"',
  ' preserveAspectRatio="none" focusable="false" aria-hidden="true">',
  '<path d="M0.8 7.2C0.8 5.3 1.7 3.8 4.4 3.8H45.6C48.1 3.8 48.6 3.8 50 1',
  'C51.4 3.8 51.9 3.8 54.4 3.8H95.6C98.3 3.8 99.2 5.3 99.2 7.2"',
  ' vector-effect="non-scaling-stroke"></path></svg>',
].join('');

function buildGroup(group: EntryGroup, tools: Element) {
  const items = group.selectors
    .map((selector) => tools.querySelector<HTMLAnchorElement>(selector))
    .filter((item): item is HTMLAnchorElement => Boolean(item));
  if (!items.length) return null;

  const wrapper = el('div', 'header-entry-group');
  wrapper.dataset.entryGroup = group.id;
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', group.ariaLabel);

  const brace = el('span', 'header-entry-group-brace');
  brace.setAttribute('aria-hidden', 'true');
  brace.append(el('span', 'header-entry-group-label', group.label));
  brace.insertAdjacentHTML('beforeend', BRACE);
  wrapper.append(brace, ...items);
  return wrapper;
}

function mountHeaderGroups() {
  const tools = document.querySelector('.header-tools');
  // Guard against a second run after HMR: the groups already own the links.
  if (!tools || tools.querySelector('.header-entry-groups')) return;

  const groups = el('div', 'header-entry-groups');
  for (const group of GROUPS) {
    const wrapper = buildGroup(group, tools);
    if (wrapper) groups.append(wrapper);
  }
  if (!groups.childElementCount) return;
  tools.prepend(groups);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountHeaderGroups, {
    once: true,
  });
} else {
  mountHeaderGroups();
}
