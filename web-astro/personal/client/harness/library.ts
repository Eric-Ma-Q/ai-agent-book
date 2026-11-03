// Harness library: filter the server-rendered index by title, path or category.
// Links and counts come from the server; this script only toggles visibility.
import './harness.css';

const search = document.querySelector<HTMLInputElement>('[data-library-search]');
const items = Array.from(document.querySelectorAll<HTMLElement>('[data-library-item]'));
const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-library-section]'));
const count = document.querySelector<HTMLElement>('[data-library-count]');
const empty = document.querySelector<HTMLElement>('[data-library-empty]');

if (items.length) {
  const apply = () => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const item of items) {
      const visible = !query || (item.dataset.search ?? '').includes(query);
      item.closest('li')?.toggleAttribute('hidden', !visible);
      if (visible) shown += 1;
    }
    for (const section of sections) {
      section.toggleAttribute('hidden', section.querySelectorAll('li:not([hidden])').length === 0);
    }
    if (count) count.textContent = `显示 ${shown} / ${items.length}`;
    if (empty) empty.hidden = shown > 0;
  };

  let timer: number | undefined;
  search?.addEventListener('input', () => {
    apply();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const url = new URL(location.href);
      const query = search.value.trim();
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }, 200);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && search) {
      event.preventDefault();
      search.focus();
      search.select();
    } else if (event.key === 'Escape' && document.activeElement === search && search) {
      search.value = '';
      apply();
    }
  });

  const initial = new URL(location.href).searchParams.get('q');
  if (initial && search) search.value = initial;
  apply();
}
