// Harness directory: filter the server-rendered cards by text, group and kind.
// All cards render on the server, so the page stays usable if this script fails.
import './harness.css';

const search = document.querySelector<HTMLInputElement>('[data-harness-search]');
const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-harness-card]'));
const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-harness-group]'));
const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-harness-filter]'));
const count = document.querySelector<HTMLElement>('[data-harness-count]');
const empty = document.querySelector<HTMLElement>('[data-harness-empty]');

if (cards.length) {
  const active: Record<string, string> = { group: 'all', kind: 'all' };

  const matches = (card: HTMLElement, query: string) => {
    if (active.group !== 'all' && card.dataset.group !== active.group) return false;
    if (active.kind !== 'all' && card.dataset.kind !== active.kind) return false;
    return !query || (card.dataset.search ?? '').includes(query);
  };

  const apply = () => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const visible = matches(card, query);
      card.closest('li')?.toggleAttribute('hidden', !visible);
      if (visible) shown += 1;
    }
    for (const group of groups) {
      const visible = group.querySelectorAll('li:not([hidden])').length > 0;
      group.toggleAttribute('hidden', !visible);
    }
    if (count) count.textContent = `显示 ${shown} / ${cards.length}`;
    if (empty) empty.hidden = shown > 0;
  };

  const syncUrl = () => {
    const url = new URL(location.href);
    const query = search?.value.trim() ?? '';
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  };

  for (const button of filters) {
    button.addEventListener('click', () => {
      const dimension = button.dataset.dim ?? 'group';
      active[dimension] = button.dataset.value ?? 'all';
      for (const other of filters) {
        if (other.dataset.dim !== dimension) continue;
        other.setAttribute('aria-pressed', String(other === button));
      }
      apply();
    });
  }

  let timer: number | undefined;
  search?.addEventListener('input', () => {
    apply();
    window.clearTimeout(timer);
    timer = window.setTimeout(syncUrl, 200);
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
      syncUrl();
    }
  });

  const initial = new URL(location.href).searchParams.get('q');
  if (initial && search) search.value = initial;
  apply();
}
