// A live view of one run: loads stored events, follows new ones over SSE and
// re-renders (batched per frame) while keeping open panels open.
import { el } from '../dom';
import { actionCard, fromGate } from './actions';
import { LabError, labApi, streamRun } from './api';
import { STATUS_LABELS, configDiff, fmtValue, groupRun } from './model';
import { resultBlock } from './run-result';
import { infoChip, turnCard, type TurnUi } from './run-turn';
import type { LabEvent } from './types';
import { badge, knobCatalog, notice, runLink } from './ui';

export type RunViewHandle = {
  element: HTMLElement;
  load(runId: string): Promise<void>;
  destroy(): void;
  onEnd(listener: (events: LabEvent[]) => void): void;
};

export function createRunView(options: { compact?: boolean; empty?: string } = {}): RunViewHandle {
  const element = el('div', `lab-run${options.compact ? ' lab-run--compact' : ''}`);
  element.append(el('p', 'lab-muted lab-run-empty', options.empty ?? '提问后，这里会实时显示 Agent 的每一轮：它看到了什么、调用了什么工具、花了多少 token。'));
  let loaded = false;
  const ui: TurnUi = { open: new Set(), diffMode: new Set() };
  let events: LabEvent[] = [];
  let stop: (() => void) | undefined;
  let frame = 0;
  let defaults: Record<string, unknown> | undefined;
  let streamError = '';
  const endListeners: ((events: LabEvent[]) => void)[] = [];

  knobCatalog()
    .then((catalog) => {
      defaults = catalog.defaults;
      schedule();
    })
    .catch(() => undefined);

  function header() {
    const view = groupRun(events);
    const start = view.start;
    if (!start) return el('p', 'lab-muted', '正在启动……');
    const status = view.end?.status ?? 'running';
    const head = el('header', 'lab-run-head');
    head.append(el('p', 'lab-run-question', start.question));
    const meta = el(
      'div',
      'lab-run-meta',
      badge(status, STATUS_LABELS[status] ?? status),
      el('span', '', `模型 ${String(start.config.model ?? '')}`),
      el('span', '', `配置 ${start.config_hash}`),
      runLink(start.run_id),
    );
    if (start.session_id) meta.append(el('span', 'lab-muted', `会话 ${start.session_id}`));
    head.append(meta);
    if (defaults) {
      const changed = configDiff(defaults, start.config).filter((d) => d.key !== 'model');
      head.append(
        el(
          'p',
          'lab-run-knobs',
          changed.length ? `改动的开关：${changed.map((d) => `${d.key} = ${fmtValue(d.b)}`).join('；')}` : '全部开关为默认值',
        ),
      );
    }
    return head;
  }

  function render() {
    frame = 0;
    if (!loaded) return;
    const openNow = element.querySelectorAll<HTMLDetailsElement>('details[data-key]');
    openNow.forEach((d) => (d.open ? ui.open.add(d.dataset.key!) : ui.open.delete(d.dataset.key!)));
    const view = groupRun(events);
    const children: Node[] = [header()];
    view.preInfos.forEach((info) => children.push(infoChip(info)));
    view.turns.forEach((turn, index) => children.push(turnCard(view, turn, index, ui)));
    if (view.gates.length) children.push(el('div', 'lab-gates', ...view.gates.map((gate) => actionCard(fromGate(gate)))));
    if (view.end) children.push(resultBlock(view.end));
    else if (view.start) children.push(el('p', 'lab-muted lab-pending', '运行中……'));
    if (streamError) children.push(el('p', 'lab-error', streamError));
    element.replaceChildren(...children);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function push(event: LabEvent) {
    if (events.some((e) => e.seq === event.seq && e.seq !== undefined && e.seq !== null)) return;
    events = [...events, event];
    schedule();
    if (event.type === 'run_end') endListeners.forEach((listener) => listener(events));
  }

  return {
    element,
    async load(runId: string) {
      stop?.();
      loaded = true;
      events = [];
      streamError = '';
      element.replaceChildren(el('p', 'lab-muted', '正在加载……'));
      try {
        const data = await labApi<{ events: LabEvent[] }>(`/runs/${encodeURIComponent(runId)}`);
        events = data.events;
      } catch (error) {
        if (!(error instanceof LabError && error.status === 404)) {
          element.replaceChildren(notice(error, '运行记录'));
          return;
        }
      }
      render();
      const ended = events.some((e) => e.type === 'run_end');
      if (ended) {
        endListeners.forEach((listener) => listener(events));
        return;
      }
      stop = streamRun(
        runId,
        push,
        (message) => {
          streamError = message;
          schedule();
        },
        events.length,
      );
    },
    destroy() {
      stop?.();
      if (frame) cancelAnimationFrame(frame);
    },
    onEnd(listener) {
      endListeners.push(listener);
    },
  };
}
