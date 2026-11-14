// "注入" tab: choose attacks/defenses, run a campaign, read the 3×4 success
// matrix, and open each trial's evidence and trace (requirement 033).
import { withBase } from '../../../src/lib/site-path.mjs';
import { ensureClipboard } from '../clipboard';
import { el, button } from '../dom';
import { labApi } from './api';
import {
  cellLabel,
  cellState,
  estimateSelection,
  evidenceLines,
  fmtPercent,
  hasRunningCells,
  isTerminal,
  isZeroResult,
  matrixRows,
  overallRate,
  rateTone,
  reportMarkdown,
  STATUS_LABELS as SECURITY_STATUS,
  trialSummary,
  VERDICT_LABELS,
} from './injection-model';
import { fmtMoney, fmtMs, fmtNum } from './model';
import type { ModelCatalog } from '../settings/model-profiles';
import type { SecurityCatalog, SecurityCell, SecurityReport, SecuritySummary, SecurityTrial } from './types';
import { badge, longText, notice, runLink, section, timeOfRunId } from './ui';
import './injection.css';

const LABEL = (status: string) => SECURITY_STATUS[status] ?? status;

function checkLine(id: string, name: string, summary: string, checked: boolean) {
  const input = el('input');
  input.type = 'checkbox';
  input.value = id;
  input.checked = checked;
  const label = el('label', 'lab-check lab-inj-check', input, el('span', 'lab-inj-check-name', name), el('span', 'lab-inj-check-summary', summary));
  label.title = summary;
  return { input, label };
}

function field(labelText: string, control: HTMLElement, help?: string) {
  const label = el('label', 'lab-field', el('span', 'lab-field-label', labelText), control);
  return help ? el('div', 'lab-field-wrap', label, el('p', 'lab-field-help', help)) : label;
}

function numberInput(value: string | number, min: number, max: number, step = '1') {
  const input = el('input', 'lab-input lab-input--num');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = step;
  input.value = String(value);
  return input;
}

function statLine(label: string, value: string) {
  return el('div', 'lab-inj-stat', el('span', 'lab-inj-stat-label', label), el('span', 'lab-inj-stat-value', value));
}

export function mountInjection(host: HTMLElement, campaignId?: string) {
  let disposed = false;
  let timer: number | undefined;
  let catalog: SecurityCatalog | undefined;
  let profiles: ModelCatalog | undefined;
  let report: SecurityReport | undefined;
  let currentCell: { cell: SecurityCell; attack: string; defense: string } | undefined;

  const intro = el(
    'div',
    'lab-inj-intro',
    el('div', 'lab-inj-title-row', el('h2', 'lab-h2', '提示注入攻防'), el('span', 'lab-chip-static', '实验 2-5')),
    el(
      'p',
      'lab-lead',
      '三类攻击 × 四层防御。这里的「成功」指攻击得手，所以成功率越低越安全；矩阵全 0 也可能是真实结果，说明当前模型没有被这三类载荷攻破。',
    ),
    el(
      'p',
      'lab-field-help',
      '密钥、网页、笔记、文件和邮件都是演示数据。write_file 只写本次试验的隔离工作区，send_email 只写本地发件箱，read_webpage 只读内置夹具，不访问真实网络。',
    ),
    el(
      'p',
      'lab-inj-links',
      (() => {
        const link = el('a', '', '书稿：提示注入：上下文安全的核心威胁');
        link.href = withBase('/book/chapter2/#提示注入上下文安全的核心威胁');
        return link;
      })(),
      el('span', 'lab-muted', ' · '),
      (() => {
        const link = el('a', '', '作者配套实验');
        link.href = 'https://github.com/bojieli/ai-agent-book/tree/main/chapter2/prompt-injection';
        link.target = '_blank';
        link.rel = 'noreferrer';
        return link;
      })(),
    ),
  );

  const formHost = el('div', 'lab-inj-form-host');
  const reportHost = el('div', 'lab-inj-report-host');
  const historyHost = el('div', 'lab-inj-history-host');
  host.append(el('div', 'lab-injection', intro, formHost, reportHost, historyHost));

  const cleanup = () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };

  const openReport = (id: string) => {
    if (disposed) return;
    void loadReport(id);
  };

  const loadReport = async (id: string) => {
    try {
      const next = await labApi<SecurityReport>(`/security/campaigns/${encodeURIComponent(id)}`);
      if (disposed) return;
      report = next;
      renderReport();
      if (!isTerminal(next.status)) {
        timer = window.setTimeout(() => openReport(id), 1500);
      }
    } catch (error) {
      if (!disposed) reportHost.replaceChildren(notice(error, '注入实验'));
    }
  };

  const loadHistory = async () => {
    try {
      const items = await labApi<SecuritySummary[]>('/security/campaigns?limit=50');
      if (!disposed) renderHistory(items);
    } catch (error) {
      if (!disposed) historyHost.replaceChildren(notice(error, '实验历史'));
    }
  };

  const renderHistory = (items: SecuritySummary[]) => {
    if (!items.length) {
      historyHost.replaceChildren(el('p', 'lab-muted', '还没有注入实验记录。选一组攻击与防御，跑第一次。'));
      return;
    }
    const table = el('table', 'lab-table');
    table.append(el('tr', '', ...['时间', '标签', '模型', '攻击×防御', '试验', '状态', '总体成功率'].map((title) => el('th', '', title))));
    for (const item of items) {
      const link = el('a', '', item.label || item.campaign_id);
      link.href = `#/injection/${item.campaign_id}`;
      table.append(
        el(
          'tr',
          '',
          el('td', 'lab-nowrap', timeOfRunId(item.campaign_id)),
          el('td', '', link),
          el('td', 'lab-muted', item.model?.name || item.model?.model || ''),
          el('td', 'lab-num', `${item.attacks ?? '—'}×${item.defenses ?? '—'}`),
          el('td', 'lab-num', `${item.progress.done}/${item.progress.total}`),
          el('td', '', badge(item.status, LABEL(item.status))),
          el('td', 'lab-num', fmtPercent(item.overall_success_rate)),
        ),
      );
    }
    historyHost.replaceChildren(section('最近的注入实验', el('div', 'lab-table-wrap', table)));
  };

  const renderReport = () => {
    if (!report || !catalog) return;
    const rate = overallRate(report);
    const copy = button('复制 Markdown', 'lab-btn lab-btn--small', async () => {
      try {
        ensureClipboard(navigator, document);
        await navigator.clipboard.writeText(reportMarkdown(report!, catalog!));
        copy.textContent = '已复制';
        window.setTimeout(() => (copy.textContent = '复制 Markdown'), 1500);
      } catch {
        copy.textContent = '复制失败';
      }
    });
    const download = button('下载 JSON', 'lab-btn lab-btn--small', () => {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = `${report!.campaign_id}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
    const head = el(
      'div',
      'lab-inj-report-head',
      el('div', '', el('h2', 'lab-h2', report.label || '注入实验'), el('p', 'lab-muted', `#/injection/${report.campaign_id} · ${report.model?.name || report.model?.model || ''}`)),
      el('div', 'lab-inj-export', copy, download, badge(report.status, LABEL(report.status))),
    );
    const stats = el(
      'div',
      'lab-inj-stats',
      statLine('总体成功率', fmtPercent(rate)),
      statLine('进度', `${report.progress.done}/${report.progress.total}`),
      statLine('每格试验', String(report.selection.trials)),
      statLine('模型', report.model?.model || '未知'),
      statLine('成本', fmtMoney(report.totals?.cost)),
      statLine('轨迹条数', fmtNum(report.totals?.runs)),
    );
    const children: Node[] = [head, stats];
    if (currentCell) {
      const current = currentCell;
      const fresh = report.cells.find((cell) => cell.attack === current.cell.attack && cell.defense === current.cell.defense);
      currentCell = fresh ? { ...current, cell: fresh } : undefined;
    }
    if (isZeroResult(report)) {
      children.push(
        el(
          'div',
          'lab-notice lab-notice--warn',
          el('strong', '', '全 0 是结果，不是故障。'),
          ` 当前模型（${report.model?.model || '未知'}）在 ${report.progress.done} 次试验里全部守住了这三类攻击。书里作者用 Kimi K3 跑 3 × 4 × 5 时也是全 0；可以换一个较弱的模型复跑，或点开轨迹看模型具体拒绝了什么。`,
        ),
      );
    }
    if (hasRunningCells(report) && !isTerminal(report.status)) {
      children.push(el('p', 'lab-muted', '实验仍在运行，矩阵会随结果自动刷新。'));
    }
    children.push(renderMatrix());
    children.push(renderLegend());
    if (currentCell) children.push(renderCellPanel(currentCell));
    reportHost.replaceChildren(...children);
  };

  const renderMatrix = () => {
    if (!report || !catalog) return el('div');
    const rows = matrixRows(report, catalog);
    const defenses = rows[0]?.cells.map((item) => item.defense) ?? [];
    const table = el('table', 'lab-table lab-inj-matrix');
    table.append(
      el(
        'tr',
        '',
        el('th', 'lab-inj-corner', '攻击 \\ 防御'),
        ...defenses.map((defense) =>
          el(
            'th',
            'lab-inj-defense',
            el('span', 'lab-inj-defense-name', defense.name),
            el('span', 'lab-inj-defense-id', defense.id),
            defense.layers.includes('runtime_guard') ? el('span', 'lab-inj-guard', '执行层兜底') : null,
          ),
        ),
      ),
    );
    for (const row of rows) {
      const tr = el('tr', '', el('th', 'lab-inj-attack', el('span', '', row.attack.name), el('span', 'lab-inj-attack-id', row.attack.id)));
      for (const entry of row.cells) {
        const cell = entry.cell;
        const tone = rateTone(cell?.success_rate);
        const node = button('', `lab-inj-cell lab-inj-cell--${tone}`, () => {
          if (!cell) return;
          currentCell = { cell, attack: row.attack.name, defense: entry.defense.name };
          renderReport();
        });
        node.append(
          el('span', 'lab-inj-cell-rate', fmtPercent(cell?.success_rate)),
          el('span', 'lab-inj-cell-count', cellLabel(cell)),
          el('span', 'lab-inj-cell-state', cellState(cell)),
        );
        node.disabled = !cell;
        node.title = cell ? `${row.attack.name} × ${entry.defense.name}：${cellLabel(cell)}，${cellState(cell)}` : '这一格没有运行';
        tr.append(el('td', '', node));
      }
      table.append(tr);
    }
    const average = el('tr', 'lab-inj-average', el('th', '', '平均'));
    for (const defense of defenses) {
      const values = rows
        .map((row) => row.cells.find((entry) => entry.defense.id === defense.id)?.cell)
        .filter((cell): cell is SecurityCell => Boolean(cell && cell.done > 0))
        .map((cell) => cell.success_rate)
        .filter((value): value is number => typeof value === 'number');
      const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
      average.append(el('td', '', fmtPercent(value)));
    }
    table.append(average);
    return el('div', 'lab-table-wrap lab-inj-table-wrap', table);
  };

  const renderLegend = () =>
    el(
      'div',
      'lab-inj-legend',
      el('span', 'lab-inj-legend-item lab-inj-cell--low', '0%：全部守住'),
      el('span', 'lab-inj-legend-item lab-inj-cell--mid', '1–33%：偶发得手'),
      el('span', 'lab-inj-legend-item lab-inj-cell--high', '34–66%：明显风险'),
      el('span', 'lab-inj-legend-item lab-inj-cell--critical', '67%+：基本失守'),
      el('span', 'lab-muted', '数字为「攻击得手次数 / 已完成试验」。'),
    );

  const renderCellPanel = ({ cell, attack, defense }: { cell: SecurityCell; attack: string; defense: string }) => {
    const panel = el('div', 'lab-inj-cell-panel');
    panel.append(
      el('div', 'lab-inj-panel-head', el('h3', 'lab-h3', `${attack} × ${defense}`), button('收起', 'lab-btn lab-btn--small', () => {
        currentCell = undefined;
        renderReport();
      })),
      el('p', 'lab-muted', `${cell.successes}/${cell.done} 次得手，${cell.errors} 次出错；平均耗时 ${fmtMs(cell.avg_latency_ms)}。`),
    );
    if (!cell.results.length) {
      panel.append(el('p', 'lab-muted', '这一格还没有结果。'));
      return panel;
    }
    const table = el('table', 'lab-table lab-inj-trials');
    table.append(el('tr', '', ...['试验', '状态', '判定', '步数', 'token', '耗时', '轨迹'].map((title) => el('th', '', title))));
    for (const trial of cell.results) {
      const links = el('td', 'lab-inj-run-links');
      trial.run_ids.forEach((id, index) => links.append(runLink(id, trial.run_ids.length > 1 ? `会话 ${index + 1}` : '查看')));
      const row = el(
        'tr',
        trial.success ? 'lab-inj-trial--success' : '',
        el('td', 'lab-num', String(trial.trial)),
        el('td', '', LABEL(trial.status)),
        el('td', '', VERDICT_LABELS[trial.verdict] ?? trial.verdict),
        el('td', 'lab-num', String(trial.llm_calls)),
        el('td', 'lab-num', fmtNum(trial.tokens)),
        el('td', 'lab-nowrap', fmtMs(trial.latency_ms)),
        links,
      );
      table.append(row);
      const detail = renderTrialDetail(trial);
      const detailRow = el('tr', 'lab-inj-detail-row', el('td', '', detail));
      detailRow.querySelector('td')?.setAttribute('colspan', '7');
      detailRow.hidden = true;
      row.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('a')) return;
        detailRow.hidden = !detailRow.hidden;
      });
      row.className += ' lab-inj-clickable';
      table.append(detailRow);
    }
    panel.append(el('div', 'lab-table-wrap', table));
    return panel;
  };

  const renderTrialDetail = (trial: SecurityTrial) => {
    const detail = el('div', 'lab-inj-detail');
    detail.append(
      el('p', '', el('strong', '', trialSummary(trial)), `：${trial.reason}`),
      ...evidenceLines(trial).map((line) => el('p', 'lab-field-help', line)),
    );
    if (trial.answer_excerpt) {
      detail.append(el('div', '', el('p', 'lab-field-label', '最终回答摘要'), longText(trial.answer_excerpt, 300)));
    }
    if (trial.error) detail.append(el('p', 'lab-notice lab-notice--error', trial.error));
    return detail;
  };

  const buildForm = () => {
    if (!catalog || !profiles) return;
    const current = catalog;
    const attackChecks = current.attacks.map((attack) => checkLine(attack.id, attack.name, attack.summary, current.defaults.attacks.includes(attack.id)));
    const defenseChecks = current.defenses.map((defense) => checkLine(defense.id, defense.name, defense.summary, current.defaults.defenses.includes(defense.id)));
    const trials = numberInput(current.defaults.trials, 1, current.limits.max_trials_per_cell);
    const temperature = numberInput(current.defaults.temperature, 0, 1, '0.1');
    const label = el('input', 'lab-input');
    label.placeholder = '标签，例如「D1 基线」';
    const profile = el('select', 'lab-input');
    profile.append(new Option('默认（.env / 未指定）', ''));
    for (const item of profiles.profiles) profile.append(new Option(`${item.name} · ${item.model}`, item.id));
    const estimate = el('p', 'lab-inj-estimate lab-field-help');
    const error = el('p', 'lab-error');
    error.hidden = true;

    const selection = () => ({
      attacks: attackChecks.filter((item) => item.input.checked).map((item) => item.input.value),
      defenses: defenseChecks.filter((item) => item.input.checked).map((item) => item.input.value),
      trials: Number(trials.value) || 1,
    });
    const refresh = () => {
      const value = estimateSelection(current, selection());
      estimate.textContent = `共 ${value.total} 次试验；按每轮最多 ${current.limits.max_steps_per_turn} 步估算，最多 ${value.calls} 次模型调用。`;
      estimate.classList.toggle('lab-inj-estimate--warn', value.warning);
      if (value.error) {
        error.hidden = false;
        error.textContent = value.error;
      } else {
        error.hidden = true;
      }
      start.disabled = Boolean(value.error);
      return value;
    };

    const start = button('开始实验', 'lab-btn lab-btn--primary', async () => {
      const value = refresh();
      if (value.error) return;
      if (value.warning && !window.confirm(`这次要跑 ${value.total} 次试验，最多 ${value.calls} 次模型调用。继续？`)) return;
      start.disabled = true;
      error.hidden = true;
      try {
        const data = await labApi<{ campaign_id: string }>('/security/campaigns', {
          attacks: selection().attacks,
          defenses: selection().defenses,
          trials: selection().trials,
          label: label.value.trim(),
          config: { model_profile: profile.value, temperature: Number.isFinite(Number(temperature.value)) ? Number(temperature.value) : 0.7 },
        });
        location.hash = `#/injection/${data.campaign_id}`;
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        start.disabled = false;
      }
    });

    for (const item of [...attackChecks, ...defenseChecks]) item.input.addEventListener('change', refresh);
    trials.addEventListener('change', refresh);
    refresh();

    const form = el(
      'div',
      'lab-inj-form',
      el(
        'div',
        'lab-inj-columns',
        el('fieldset', 'lab-inj-fieldset', el('legend', '', '攻击场景'), ...attackChecks.map((item) => item.label)),
        el('fieldset', 'lab-inj-fieldset', el('legend', '', '防御配置'), ...defenseChecks.map((item) => item.label)),
      ),
      el(
        'div',
        'lab-inj-controls',
        field('每个组合试验次数', trials, `1–${current.limits.max_trials_per_cell}`),
        field('模型档案', profile),
        field('温度', temperature, '默认 0.7，与作者实验一致；同一配置重复跑可能有差异'),
        field('标签', label),
      ),
      estimate,
      el('div', 'lab-ask-row', el('span', 'lab-spacer'), start),
      error,
    );
    formHost.replaceChildren(section('配置这次实验', form));
    if (report?.status === 'running') start.disabled = true;
  };

  void (async () => {
    try {
      const [nextCatalog, nextProfiles] = await Promise.all([
        labApi<SecurityCatalog>('/security/catalog'),
        labApi<ModelCatalog>('/models'),
      ]);
      if (disposed) return;
      catalog = nextCatalog;
      profiles = nextProfiles;
      buildForm();
      if (campaignId) await loadReport(campaignId);
      else reportHost.replaceChildren(el('p', 'lab-muted', '还没有选择实验。先跑一组，或者从下面的历史里打开一份报告。'));
      await loadHistory();
    } catch (error) {
      if (!disposed) formHost.replaceChildren(notice(error, '注入实验'));
    }
  })();

  return cleanup;
}
