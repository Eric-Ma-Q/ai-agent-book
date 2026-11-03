// Small shared UI pieces for the lab page.
import { button, el } from '../dom';
import { LabError, labApi } from './api';
import { STATUS_LABELS } from './model';
import type { ModelCatalog } from '../settings/model-profiles';
import type { KnobCatalog } from './types';

export { button, el };

export function badge(status: string, label = STATUS_LABELS[status] ?? status) {
  return el('span', `lab-badge lab-badge--${status.replace(/[^a-z_]/g, '')}`, label);
}

/** HTML produced by renderMarkdown (already escaped) inside a wrapper. */
export function rich(html: string, className = 'lab-rich') {
  const node = el('div', className);
  node.innerHTML = html;
  return node;
}

export function notice(error: unknown, what = '该功能') {
  if (error instanceof LabError && error.notReady) {
    return el('p', 'lab-notice lab-notice--pending', `${what}的服务尚未就绪（后端接口还没有实现）。`);
  }
  const message = error instanceof Error ? error.message : String(error);
  return el('p', 'lab-notice lab-notice--error', message);
}

export function section(title: string, ...children: (Node | string | null | false | undefined)[]) {
  return el('section', 'lab-section', el('h2', 'lab-h2', title), ...children);
}

export function stat(label: string, value: string, hint?: string) {
  const node = el('div', 'lab-stat', el('span', 'lab-stat-label', label), el('span', 'lab-stat-value', value));
  if (hint) node.title = hint;
  return node;
}

export function pre(text: string, className = 'lab-pre') {
  const node = el('pre', className);
  node.textContent = text;
  return node;
}

/** Long text collapsed behind a preview; short text shown as is. */
export function longText(text: string, limit = 600, className = 'lab-pre') {
  if (text.length <= limit) return pre(text, className);
  const details = el('details', 'lab-long');
  const summary = el('summary', '', `${text.slice(0, limit)}…`, el('span', 'lab-long-more', `展开全部（${text.length} 字）`));
  details.append(summary, pre(text, className));
  return details;
}

export function runLink(runId: string, label = runId) {
  const link = el('a', 'lab-runlink', label);
  link.href = `#/run/${runId}`;
  return link;
}

export function timeOfRunId(id: string) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  return match ? `${match[2]}-${match[3]} ${match[4]}:${match[5]}` : id;
}

let catalog: Promise<KnobCatalog> | undefined;
export function knobCatalog() {
  catalog ??= labApi<KnobCatalog>('/knobs').catch((error) => {
    catalog = undefined;
    throw error;
  });
  return catalog;
}

let profiles: Promise<ModelCatalog> | undefined;
export function modelProfiles() {
  profiles ??= labApi<ModelCatalog>('/models').catch((error) => {
    profiles = undefined;
    throw error;
  });
  return profiles;
}

/** Call after saving or deleting a profile so the next form reloads it. */
export function invalidateProfiles() {
  profiles = undefined;
}

export function newSessionId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
