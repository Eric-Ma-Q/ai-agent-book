// Requirement 013: DSH-style model picker for the interview composer.
// A button opens a searchable listbox; the same component is also usable from
// the setup form if it is moved there later.
import { el } from '../dom';
import {
  filterModelChoices,
  modelButtonLabel,
  type ModelChoice,
} from './interview-model';

export type ModelMenu = {
  setChoices: (choices: ModelChoice[]) => void;
  setValue: (value: string) => void;
  setDisabled: (disabled: boolean) => void;
  close: () => void;
  destroy: () => void;
  readonly element: HTMLElement;
};

type Options = {
  host: HTMLElement;
  choices: ModelChoice[];
  value: string;
  onChange: (value: string) => void;
  settingsHref?: string;
  warnings?: string[];
};

export function mountModelMenu({
  host,
  choices,
  value,
  onChange,
  settingsHref,
  warnings = [],
}: Options): ModelMenu {
  host.replaceChildren();
  let currentChoices = choices;
  let currentValue = value;
  let filtered = choices;
  let active = 0;
  let open = false;
  let disabled = false;

  const button = el('button', 'iv-model-button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = el('span', 'iv-model-button-label');
  const caret = el('span', 'iv-model-caret', '▾');
  button.append(label, caret);

  const pop = el('div', 'iv-model-pop');
  pop.hidden = true;
  const searchWrap = el('label', 'iv-model-search');
  const searchLabel = el('span', 'iv-sr-only', '搜索模型');
  const search = el('input', 'iv-model-search-input');
  search.type = 'search';
  search.placeholder = '搜索名称或模型 ID';
  search.autocomplete = 'off';
  search.setAttribute('aria-controls', 'iv-model-list');
  searchWrap.append(searchLabel, search);
  const list = el('div', 'iv-model-list');
  list.id = 'iv-model-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '模型档案');
  const note = el('div', 'iv-model-footer');
  pop.append(searchWrap, list, note);
  host.append(button, pop);

  function currentChoice() {
    return currentChoices.find((choice) => choice.value === currentValue) ?? currentChoices[0];
  }

  function updateButton() {
    label.textContent = modelButtonLabel(currentChoice());
    button.title = currentChoice()?.meta ?? '';
  }

  function renderNote() {
    note.replaceChildren();
    for (const warning of warnings) note.append(el('p', 'iv-model-warning', warning));
    if (currentChoices.length <= 1) {
      note.append(el('p', 'iv-model-hint', '还没有模型档案；当前使用 .env 默认模型。'));
    } else {
      note.append(el('p', 'iv-model-hint', '模型与密钥在设置页维护；这里只选择档案。'));
    }
    if (settingsHref) {
      const link = el('a', 'iv-model-link', '打开设置 · 模型档案 →');
      link.href = settingsHref;
      note.append(link);
    }
  }

  function setActive(index: number) {
    if (!filtered.length) {
      active = 0;
      search.removeAttribute('aria-activedescendant');
      return;
    }
    active = Math.max(0, Math.min(index, filtered.length - 1));
    const options = Array.from(list.querySelectorAll<HTMLElement>('[data-model-option]'));
    options.forEach((option, optionIndex) => {
      option.classList.toggle('is-active', optionIndex === active);
    });
    const id = options[active]?.id;
    if (id) search.setAttribute('aria-activedescendant', id);
    options[active]?.scrollIntoView({ block: 'nearest' });
  }

  function select(value: string) {
    currentValue = value;
    updateButton();
    render();
    close();
    button.focus();
    onChange(value);
  }

  function render() {
    list.replaceChildren();
    filtered = filterModelChoices(currentChoices, search.value);
    if (!filtered.length) {
      list.append(el('p', 'iv-model-empty', '没有匹配的模型'));
      search.removeAttribute('aria-activedescendant');
      return;
    }
    filtered.forEach((choice, index) => {
      const option = el('button', 'iv-model-option');
      option.type = 'button';
      option.id = `iv-model-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(choice.value === currentValue));
      option.dataset.modelOption = '1';
      option.classList.toggle('is-active', index === active);
      const head = el('span', 'iv-model-option-head');
      head.append(el('span', 'iv-model-name', choice.label));
      const flags = el('span', 'iv-model-flags');
      if (choice.isDefault) flags.append(el('span', 'iv-badge', '默认'));
      if (!choice.hasKey) flags.append(el('span', 'iv-badge iv-badge--muted', '无密钥'));
      if (choice.value === currentValue) flags.append(el('span', 'iv-badge iv-badge--on', '当前'));
      head.append(flags);
      option.append(head, el('span', 'iv-model-meta', choice.meta));
      option.addEventListener('click', () => select(choice.value));
      option.addEventListener('mouseenter', () => setActive(index));
      list.append(option);
    });
    setActive(active);
  }

  function openMenu() {
    if (disabled || open) return;
    open = true;
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    host.classList.add('is-open');
    search.value = '';
    active = Math.max(0, currentChoices.findIndex((choice) => choice.value === currentValue));
    render();
    search.focus();
    search.select();
  }

  function close() {
    if (!open) return;
    open = false;
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    host.classList.remove('is-open');
  }

  function move(delta: number) {
    if (!filtered.length) return;
    setActive((active + delta + filtered.length) % filtered.length);
  }

  button.addEventListener('click', () => (open ? close() : openMenu()));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  });

  search.addEventListener('input', () => {
    active = 0;
    render();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(filtered.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = filtered[active];
      if (choice) select(choice.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      button.focus();
    } else if (event.key === 'Tab') {
      close();
    }
  });

  const onDocumentPointer = (event: PointerEvent) => {
    if (!open) return;
    const target = event.target as Node | null;
    if (target && host.contains(target)) return;
    close();
  };
  document.addEventListener('pointerdown', onDocumentPointer);

  updateButton();
  renderNote();

  return {
    element: host,
    setChoices(next: ModelChoice[]) {
      currentChoices = next;
      if (!next.some((choice) => choice.value === currentValue)) currentValue = '';
      updateButton();
      renderNote();
      if (open) render();
    },
    setValue(next: string) {
      currentValue = next;
      updateButton();
      if (open) render();
    },
    setDisabled(next: boolean) {
      disabled = next;
      button.disabled = next;
      if (next) close();
    },
    close,
    destroy() {
      document.removeEventListener('pointerdown', onDocumentPointer);
      host.replaceChildren();
    },
  };
}
