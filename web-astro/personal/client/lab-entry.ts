// Entrance to the agent lab: a button in the site header (also on phones,
// where the text navigation is hidden), next to the all-highlights button.
import { withBase } from '../../src/lib/site-path.mjs';
import { LAB_PATH } from '../routes.mjs';
import { el } from './dom';

const href = withBase(LAB_PATH);
const LABEL = 'Agent 实验台';

function headerButton() {
  const tools = document.querySelector('.header-tools');
  if (!tools) return;
  const link = el('a', 'icon-button hl-entry lab-entry');
  link.href = href;
  link.title = LABEL;
  link.setAttribute('aria-label', LABEL);
  if (location.pathname === href) link.setAttribute('aria-current', 'page');
  link.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3"></path><path d="M7 15h10"></path></svg>';
  tools.prepend(link);
}

headerButton();
