// "历史" tab and the single-run page (#/run/<id>).
import { el } from '../dom';
import { labApi } from './api';
import { fmtNum, STATUS_LABELS } from './model';
import { createRunView } from './run-view';
import type { RunSummary } from './types';
import { badge, button, notice, section, timeOfRunId } from './ui';

const SOURCE_LABELS: Record<string, string> = { compare: '对比', eval: '评估', improve: '自我改进' };

export function mountHistory(host: HTMLElement) {
  const body = el('div', 'lab-history', el('p', 'lab-muted', '正在加载……'));
  host.append(section('历史运行', body));
  labApi<RunSummary[]>('/runs?limit=200')
    .then((runs) => {
      if (!runs.length) {
        body.replaceChildren(el('p', 'lab-muted', '还没有运行记录。去「提问」页问一个问题吧。'));
        return;
      }
      const table = el('table', 'lab-table');
      table.append(el('tr', '', ...['时间', '问题', '状态', '模型', 'token', '来源'].map((h) => el('th', '', h))));
      for (const run of runs) {
        const t = run.totals ?? {};
        const tokens = typeof t.prompt_tokens === 'number' ? (t.prompt_tokens as number) + ((t.completion_tokens as number) ?? 0) : null;
        const link = el('a', '', run.question ?? '（无问题）');
        link.href = `#/run/${run.run_id}`;
        const source = String(run.meta?.source ?? '');
        table.append(
          el(
            'tr',
            '',
            el('td', 'lab-nowrap', timeOfRunId(run.run_id)),
            el('td', 'lab-history-q', link),
            el('td', '', badge(run.status, STATUS_LABELS[run.status] ?? run.status)),
            el('td', 'lab-muted', run.model ?? ''),
            el('td', 'lab-num', fmtNum(tokens)),
            el('td', 'lab-muted', SOURCE_LABELS[source] ?? source),
          ),
        );
      }
      body.replaceChildren(el('div', 'lab-table-wrap', table));
    })
    .catch((error) => body.replaceChildren(notice(error, '历史运行')));
  return () => undefined;
}

export function mountRun(host: HTMLElement, runId: string) {
  const view = createRunView();
  const promoteResult = el('span', 'lab-muted');
  const promote = button('加入回归集', 'lab-btn lab-btn--small', async () => {
    promote.disabled = true;
    try {
      const data = await labApi<{ task_id: string; path?: string }>('/evals/promote', { run_id: runId });
      promoteResult.textContent = `已加入回归集：${data.task_id}`;
    } catch (error) {
      promoteResult.replaceChildren(notice(error, '回归集'));
      promote.disabled = false;
    }
  });
  const back = el('a', 'lab-back', '← 历史运行');
  back.href = '#/runs';
  host.append(el('div', 'lab-run-page', el('div', 'lab-ask-row', back, el('span', 'lab-spacer'), promoteResult, promote), view.element));
  void view.load(runId);
  return () => view.destroy();
}
