// The config form, generated from GET /knobs: basic fields plus one collapsible
// group per chapter, each switch explained in plain Chinese. A sticky row of
// chapter buttons opens a group (and any collapsed wrapper around the form)
// and scrolls to it.
import { button, el } from '../dom';
import { CHAPTER_PAGES, chapterNav, overrides } from './model';
import type { ModelProfile } from '../settings/model-profiles';
import type { KnobCatalog, KnobField, SchemaProp } from './types';

export type KnobForm = {
  element: HTMLElement;
  /** Chapter jump bar; the caller places it outside any collapsed wrapper so it is always visible. */
  nav: HTMLElement;
  values(): Record<string, unknown>;
  overrides(): Record<string, unknown>;
  set(values: Record<string, unknown>): void;
  onChange(listener: () => void): void;
};

type Control = { get(): unknown; set(value: unknown): void };

let uid = 0;

function numberControl(prop: SchemaProp, value: unknown): [HTMLElement, Control] {
  const input = el('input', 'lab-input lab-input--num');
  input.type = 'number';
  if (prop.minimum !== undefined) input.min = String(prop.minimum);
  if (prop.maximum !== undefined) input.max = String(prop.maximum);
  input.step = prop.type === 'number' ? '0.1' : '1';
  input.value = String(value ?? '');
  const parse = () => (prop.type === 'number' ? parseFloat(input.value) : parseInt(input.value, 10));
  return [input, { get: () => (Number.isFinite(parse()) ? parse() : prop.default), set: (v) => (input.value = String(v)) }];
}

function control(
  name: string,
  prop: SchemaProp,
  value: unknown,
  catalog: KnobCatalog,
  profiles: ModelProfile[],
): [HTMLElement, Control] {
  if (name === 'model_profile') {
    const select = el('select', 'lab-input');
    select.dataset.knob = name;
    select.append(new Option('默认（.env / 未指定）', ''));
    profiles.forEach((profile) => select.append(new Option(`${profile.name} · ${profile.model}`, profile.id)));
    select.value = typeof value === 'string' ? value : '';
    return [select, { get: () => select.value, set: (v) => (select.value = String(v ?? '')) }];
  }
  if (name === 'tools') {
    const box = el('div', 'lab-tools');
    const inputs = catalog.tools.map((tool) => {
      const input = el('input');
      input.type = 'checkbox';
      input.value = tool;
      box.append(el('label', 'lab-check', input, el('code', '', tool)));
      return input;
    });
    const set = (v: unknown) => inputs.forEach((input) => (input.checked = Array.isArray(v) && v.includes(input.value)));
    set(value);
    return [box, { get: () => inputs.filter((i) => i.checked).map((i) => i.value), set }];
  }
  if (prop.type === 'boolean') {
    const input = el('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    return [input, { get: () => input.checked, set: (v) => (input.checked = Boolean(v)) }];
  }
  if (prop.enum) {
    const select = el('select', 'lab-input');
    prop.enum.forEach((option) => select.append(new Option(option, option)));
    select.value = String(value);
    return [select, { get: () => select.value, set: (v) => (select.value = String(v)) }];
  }
  if (prop.type === 'integer' || prop.type === 'number') return numberControl(prop, value);
  const input = el('input', 'lab-input');
  input.dataset.knob = name;
  input.value = String(value ?? '');
  if (name === 'model') {
    const ids = [...new Set(profiles.map((profile) => profile.model))];
    if (!ids.length) return [input, { get: () => input.value.trim(), set: (v) => (input.value = String(v)) }];
    const list = el('datalist');
    list.id = `lab-models-${++uid}`;
    ids.forEach((model) => list.append(new Option(model, model)));
    input.setAttribute('list', list.id);
    return [el('span', '', input, list), { get: () => input.value.trim(), set: (v) => (input.value = String(v)) }];
  }
  return [input, { get: () => input.value.trim(), set: (v) => (input.value = String(v)) }];
}

export function createKnobForm(catalog: KnobCatalog, profiles: ModelProfile[] = [], initial: Record<string, unknown> = {}): KnobForm {
  const values = { ...catalog.defaults, ...initial };
  const controls = new Map<string, Control>();
  const listeners: (() => void)[] = [];
  const element = el('div', 'lab-knobs');

  const field = (spec: KnobField) => {
    const prop = catalog.schema[spec.name] ?? {};
    const [input, ctl] = control(spec.name, prop, values[spec.name], catalog, profiles);
    controls.set(spec.name, ctl);
    const inline = prop.type === 'boolean';
    const label = el('label', inline ? 'lab-field lab-field--inline' : 'lab-field');
    const title = el('span', 'lab-field-label', spec.label);
    if (inline) label.append(input, title);
    else label.append(title, input);
    const wrap = el('div', 'lab-field-wrap', label);
    if (spec.help) wrap.append(el('p', 'lab-field-help', spec.help));
    return wrap;
  };

  const nav = el('nav', 'lab-knob-nav');
  nav.setAttribute('aria-label', '跳到某一章的开关');
  element.append(el('div', 'lab-knob-basic', ...catalog.basic.map(field)));
  const profileSelect = element.querySelector<HTMLSelectElement>('[data-knob="model_profile"]');
  const modelInput = element.querySelector<HTMLInputElement>('[data-knob="model"]');
  const syncProfile = () => {
    if (!profileSelect || !modelInput) return;
    const profile = profiles.find((item) => item.id === profileSelect.value);
    modelInput.disabled = Boolean(profile);
    if (profile) modelInput.value = profile.model;
    modelInput.title = profile ? '以档案里的模型 ID 为准' : '';
  };
  listeners.push(syncProfile);
  syncProfile();
  const groups = new Map<string, HTMLDetailsElement>();
  const pageLinks = new Map(chapterNav(catalog.groups, {}, CHAPTER_PAGES).map((item) => [item.key, item.page]));
  for (const group of catalog.groups) {
    const details = el('details', 'lab-knob-group');
    details.dataset.key = `group-${group.chapter}`;
    details.append(el('summary', '', group.title), el('p', 'lab-knob-summary', group.summary), ...group.fields.map(field));
    const page = pageLinks.get(details.dataset.key);
    if (page) {
      const link = el('a', 'lab-knob-page', `本章的完整实验在「${page.tab}」页 →`);
      link.href = page.href;
      details.append(link);
    }
    groups.set(details.dataset.key, details);
    element.append(details);
  }

  const read = () => {
    const out: Record<string, unknown> = { ...catalog.defaults };
    controls.forEach((ctl, name) => (out[name] = ctl.get()));
    return out;
  };

  const jump = (key: string) => {
    const target = groups.get(key);
    if (!target) return;
    for (let node: HTMLDetailsElement | null = target; node; node = node.parentElement?.closest('details') ?? null) node.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.querySelectorAll('button').forEach((chip) => {
      const active = chip.dataset.key === key;
      chip.toggleAttribute('aria-current', active);
      // On narrow screens the row scrolls sideways: keep the chosen chapter visible.
      if (active) nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
    });
  };
  const renderNav = () => {
    const current = nav.querySelector<HTMLButtonElement>('button[aria-current]')?.dataset.key;
    nav.replaceChildren(
      el('span', 'lab-knob-nav-label', '各章实验'),
      ...chapterNav(catalog.groups, overrides(catalog.defaults, read()), CHAPTER_PAGES).map((item) => {
        if (item.href) {
          const link = el('a', 'lab-chip lab-knob-jump', `${item.label} →`);
          link.href = item.href;
          link.title = item.title;
          return link;
        }
        const chip = button(item.label, 'lab-chip lab-knob-jump', () => jump(item.key));
        chip.dataset.key = item.key;
        chip.title = item.changed ? `${item.title}（已改 ${item.changed} 项）` : item.title;
        chip.toggleAttribute('aria-current', item.key === current);
        if (item.changed) chip.append(el('span', 'lab-knob-jump-count', String(item.changed)));
        return chip;
      }),
    );
  };
  renderNav();
  listeners.push(renderNav);
  element.addEventListener('change', () => listeners.forEach((listener) => listener()));
  return {
    element,
    nav,
    values: read,
    overrides: () => overrides(catalog.defaults, read()),
    set(next) {
      Object.entries({ ...catalog.defaults, ...next }).forEach(([name, value]) => controls.get(name)?.set(value));
      listeners.forEach((listener) => listener());
    },
    onChange: (listener) => listeners.push(listener),
  };
}
