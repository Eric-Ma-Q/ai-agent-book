// Entrances to the "all highlights" page: a button in the site header (also on
// phones, where the text navigation is hidden) and a link inside each
// chapter's own highlights dialog.
import { withBase } from '../../src/lib/site-path.mjs';
import { HIGHLIGHTS_PATH } from '../routes.mjs';
import { el } from './dom';
import './highlights-entry.css';

const href = withBase(HIGHLIGHTS_PATH);
const LABEL = '全部划线';

function headerButton() {
  const tools = document.querySelector('.header-tools');
  if (!tools) return;
  const link = el('a', 'icon-button hl-entry');
  link.href = href;
  link.title = LABEL;
  link.setAttribute('aria-label', LABEL);
  if (location.pathname === href) link.setAttribute('aria-current', 'page');
  link.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 3 7 7-9 9-7-7ZM5 12l-2 7 2 2 7-2M3 22h18"></path></svg>';
  tools.prepend(link);
}

function dialogLink() {
  const intro = document.querySelector('#highlights-dialog .highlights-intro');
  if (!intro) return;
  const link = el('a', 'hl-dialog-link', `查看所有章节的划线 →`);
  link.href = href;
  intro.after(link);
}

headerButton();
dialogLink();
