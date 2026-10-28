// Header entrance to the book exam. Reuses the Harness entry's icon-button
// styling so the two personal entrances look consistent.
import { withBase } from '../../src/lib/site-path.mjs';
import { BOOK_EXAM_PATH } from '../routes.mjs';
import { el } from './dom';
import './book-exam-entry.css';

const href = withBase(BOOK_EXAM_PATH);
const LABEL = '结业考试';

function headerButton() {
  const tools = document.querySelector('.header-tools');
  if (!tools) return;
  const link = el('a', 'icon-button book-exam-entry');
  link.href = href;
  link.title = LABEL;
  link.setAttribute('aria-label', LABEL);
  if (location.pathname === href || location.pathname.startsWith(href)) {
    link.setAttribute('aria-current', 'page');
  }
  link.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z"></path><path d="M4 5.5v16"></path><path d="m9 10 2 2 4-4"></path></svg>';
  tools.prepend(link);
}

headerButton();
