// Favorites page: the cards are server-rendered; this script only filters the
// DOM and removes a favorite through the personal API.
const cards = Array.from(
  document.querySelectorAll<HTMLElement>('[data-fav-card]'),
);
const search = document.querySelector<HTMLInputElement>('[data-fav-search]');
const examButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-exam-filter]'),
);
const topicSelect = document.querySelector<HTMLSelectElement>(
  '[data-topic-filter]',
);
const levelSelect = document.querySelector<HTMLSelectElement>(
  '[data-level-filter]',
);
const count = document.querySelector<HTMLElement>('[data-fav-count]');
const empty = document.querySelector<HTMLElement>('[data-fav-empty]');
const statusLine = document.querySelector<HTMLElement>('[data-fav-status]');
const list = document.querySelector<HTMLElement>('[data-fav-list]');
const examCounts = Array.from(
  document.querySelectorAll<HTMLElement>('[data-exam-count]'),
);
const active = { exam: 'all', topic: 'all', level: 'all' };
const loadFailed = document.querySelector('[data-fav-load-error]') !== null;

function updateExamCounts() {
  for (const element of examCounts) {
    const key = element.dataset.examCount ?? 'all';
    const count =
      key === 'all'
        ? cards.length
        : cards.filter((card) => card.dataset.exam === key).length;
    element.textContent = `（${count}）`;
  }
}

let statusTimer: number | undefined;
function showStatus(message: string) {
  if (!statusLine) return;
  statusLine.textContent = message;
  statusLine.hidden = false;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusLine.hidden = true;
  }, 3000);
}

function apply() {
  const query = (search?.value ?? '').trim().toLowerCase();
  let shown = 0;
  for (const card of cards) {
    const matches =
      (active.exam === 'all' || card.dataset.exam === active.exam) &&
      (active.topic === 'all' || card.dataset.topic === active.topic) &&
      (active.level === 'all' || card.dataset.level === active.level) &&
      (!query || (card.dataset.search ?? '').includes(query));
    card.hidden = !matches;
    if (matches) shown += 1;
  }
  if (count) count.textContent = `显示 ${shown} / ${cards.length}`;
  if (empty) {
    if (loadFailed) {
      empty.hidden = true;
    } else if (!cards.length) {
      empty.hidden = false;
      empty.textContent =
        '还没有收藏。打开两个题库，在任意题目上点「♡ 收藏」；做对、做错或还没做都可以收藏。';
    } else if (!shown) {
      empty.hidden = false;
      empty.textContent = '没有匹配的收藏，换个关键词或筛选试试。';
    } else {
      empty.hidden = true;
    }
  }
}

function syncUrl() {
  const url = new URL(location.href);
  const query = search?.value.trim() ?? '';
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

for (const button of examButtons) {
  button.addEventListener('click', () => {
    active.exam = button.dataset.examFilter ?? 'all';
    for (const other of examButtons)
      other.setAttribute('aria-pressed', String(other === button));
    apply();
  });
}
topicSelect?.addEventListener('change', () => {
  active.topic = topicSelect.value;
  apply();
});
levelSelect?.addEventListener('change', () => {
  active.level = levelSelect.value;
  apply();
});

let queryTimer: number | undefined;
search?.addEventListener('input', () => {
  apply();
  window.clearTimeout(queryTimer);
  queryTimer = window.setTimeout(syncUrl, 200);
});

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  const typing = target?.matches(
    'input, textarea, select, [contenteditable="true"]',
  );
  if (event.key === '/' && !typing && search) {
    event.preventDefault();
    search.focus();
    search.select();
  } else if (
    event.key === 'Escape' &&
    document.activeElement === search &&
    search
  ) {
    search.value = '';
    apply();
    syncUrl();
  }
});

async function removeCard(card: HTMLElement, button: HTMLButtonElement) {
  const key = button.dataset.favRemove ?? '';
  const separator = key.indexOf(':');
  if (separator < 0) return;
  const exam = key.slice(0, separator);
  const id = key.slice(separator + 1);
  button.disabled = true;
  try {
    const response = await fetch('/__personal/exam-favorites/set', {
      method: 'POST',
      headers: { 'x-personal-api': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ exam, id, favorite: false }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok)
      throw new Error(payload?.error || `HTTP ${response.status}`);
    card.remove();
    const index = cards.indexOf(card);
    if (index >= 0) cards.splice(index, 1);
    if (list) list.hidden = cards.length === 0;
    apply();
    updateExamCounts();
    showStatus('已取消收藏');
  } catch (error) {
    showStatus(`取消收藏失败：${(error as Error).message}`);
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-fav-remove]');
  if (!button) return;
  const card = button.closest<HTMLElement>('[data-fav-card]');
  if (card) void removeCard(card, button);
});

const initial = new URL(location.href).searchParams.get('q');
if (initial && search) search.value = initial;
apply();
