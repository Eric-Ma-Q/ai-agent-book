// Pending write actions (F6): the agent can only propose an insert; nothing is
// written until it is approved here.
import { el } from '../dom';
import { labApi } from './api';
import { renderMarkdown } from './markdown';
import type { Action, GateEvent } from './types';
import { badge, button, notice, rich, runLink, section } from './ui';

export const fromGate = (gate: GateEvent): Action => ({
  action_id: gate.action_id,
  kind: gate.kind,
  payload: gate.payload,
  status: gate.status,
  detail: gate.detail,
});

const KIND_LABELS: Record<string, string> = { insert: '写入阅读器补充' };

export function actionCard(action: Action, onChange?: (action: Action) => void): HTMLElement {
  const p = action.payload ?? {};
  const card = el('article', `lab-action lab-action--${action.status}`);
  const head = el('div', 'lab-action-head', el('strong', '', KIND_LABELS[action.kind] ?? action.kind), badge(action.status));
  if (action.run_id) head.append(runLink(action.run_id, '来自运行'));
  card.append(head);
  if (p.chapter !== undefined) card.append(el('p', 'lab-action-meta', `第 ${p.chapter} 章，放在这段之后：`, el('q', '', String(p.after ?? '（章末）'))));
  if (typeof p.markdown === 'string') card.append(rich(renderMarkdown(p.markdown), 'lab-rich lab-action-preview'));
  if (action.detail) card.append(el('p', 'lab-field-help', action.detail));
  if (action.expires_at && action.status === 'pending') card.append(el('p', 'lab-muted', `未处理将于 ${action.expires_at.replace('T', ' ').slice(0, 16)} 过期`));
  if (action.status === 'pending') {
    const error = el('p', 'lab-error');
    error.hidden = true;
    const act = (verb: 'approve' | 'reject') => async () => {
      card.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        const updated = await labApi<Action>(`/actions/${encodeURIComponent(action.action_id)}/${verb}`, {});
        const next = actionCard({ ...action, ...updated }, onChange);
        card.replaceWith(next);
        onChange?.(updated);
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        card.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    };
    card.append(
      el('div', 'lab-action-buttons', button('批准写入', 'lab-btn lab-btn--primary', act('approve')), button('拒绝', 'lab-btn', act('reject'))),
      error,
    );
  }
  return card;
}

export function mountActions(host: HTMLElement, onCount: (n: number) => void) {
  const list = el('div', 'lab-actions');
  host.append(section('待确认的动作', el('p', 'lab-field-help', 'Agent 只能提出写入请求；批准后才会通过阅读器的接口写入补充，拒绝则不留下任何文件。'), list));
  const load = async () => {
    list.replaceChildren(el('p', 'lab-muted', '正在加载……'));
    try {
      const actions = await labApi<Action[]>('/actions');
      const sorted = [...actions].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
      onCount(actions.filter((a) => a.status === 'pending').length);
      list.replaceChildren(...(sorted.length ? sorted.map((a) => actionCard(a, () => void load())) : [el('p', 'lab-muted', '没有待确认的动作。')]));
    } catch (error) {
      list.replaceChildren(notice(error, '确认门禁'));
    }
  };
  void load();
  return () => undefined;
}

export async function pendingCount(): Promise<number> {
  try {
    const actions = await labApi<Action[]>('/actions?status=pending');
    return actions.length;
  } catch {
    return 0;
  }
}
