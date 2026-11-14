// Entrance to the Harness archive: a header button on every reader page,
// selected while the reader is anywhere under /harness/.
import { withBase } from '../../src/lib/site-path.mjs';
import { HARNESS_PATH } from '../routes.mjs';
import { el } from './dom';
import './harness/harness-entry.css';

const href = withBase(HARNESS_PATH);
const LABEL = 'Harness 学习';

function headerButton() {
  const tools = document.querySelector('.header-tools');
  if (!tools) return;
  const link = el('a', 'icon-button harness-entry');
  link.href = href;
  link.title = LABEL;
  link.setAttribute('aria-label', LABEL);
  if (location.pathname === href || location.pathname.startsWith(href)) {
    link.setAttribute('aria-current', 'page');
  }
  link.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 16 9 5 9-5"></path></svg>';
  tools.prepend(link);
}

headerButton();
