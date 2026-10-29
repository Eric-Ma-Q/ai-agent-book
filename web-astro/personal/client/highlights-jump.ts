// Arriving from the all-highlights page (?hl=<id>): scroll to that highlight,
// flash it, and offer a way back to the list.
import { HIGHLIGHTS_PATH } from '../routes.mjs';
import { withBase } from '../../src/lib/site-path.mjs';
import { el } from './dom';
import './highlights-jump.css';

const FLASH_MS = 2600;
const WAIT_MS = 10_000;

function findMarks(article: HTMLElement, id: string) {
  return [...article.querySelectorAll<HTMLElement>('mark.reader-highlight')].filter((mark) =>
    mark.dataset.highlightIds?.split(' ').includes(id),
  );
}

// The reader draws highlights after it has loaded them, so wait for the marks.
function waitForMarks(article: HTMLElement, id: string) {
  return new Promise<HTMLElement[]>((resolve) => {
    const check = () => {
      const marks = findMarks(article, id);
      if (!marks.length) return false;
      observer.disconnect();
      clearTimeout(timer);
      resolve(marks);
      return true;
    };
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve([]);
    }, WAIT_MS);
    observer.observe(article, { childList: true, subtree: true });
    check();
  });
}

function backPill(listPath: string) {
  const pill = el('a', 'hl-back', '← 全部划线');
  pill.href = listPath;
  pill.addEventListener('click', (event) => {
    // Going back keeps the list's search and filters.
    const from = document.referrer && new URL(document.referrer);
    if (from && from.origin === location.origin && from.pathname === listPath && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  });
  document.body.append(pill);
}

function say(message: string) {
  const status = document.getElementById('highlight-status');
  if (!status) return;
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = '';
  }, 6000);
}

async function jump() {
  const url = new URL(location.href);
  const id = url.searchParams.get('hl');
  const article = document.querySelector<HTMLElement>('#chapter-content');
  if (!id || !article) return;
  url.searchParams.delete('hl');
  history.replaceState(history.state, '', url);
  backPill(withBase(HIGHLIGHTS_PATH));

  const marks = await waitForMarks(article, id);
  if (!marks.length) return say('原文这一段已变化，找不到这条划线的位置。');
  await document.fonts.ready;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  marks[0].scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
  marks.forEach((mark) => mark.classList.add('hl-flash'));
  setTimeout(() => marks.forEach((mark) => mark.classList.remove('hl-flash')), FLASH_MS);
}

void jump();
