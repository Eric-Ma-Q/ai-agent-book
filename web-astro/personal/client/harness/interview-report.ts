// Requirement 013: report rendering and manual export. All user/model text is
// inserted with textContent or through the safe markdown renderer.
import { el } from '../dom.ts';
import { renderMarkdown } from '../lab/markdown.ts';
import { LEVELS, MODES, ROLES, ROUNDS } from '../../harness/interview-profile.mjs';
import type { InterviewReport, InterviewReview, InterviewSession } from './interview-api.ts';

type Options = {
  onRetry: () => void;
  onNew: () => void;
};

type Resource = { id: string; label: string; href: string };

/** Attach the reader-side href to review ids returned by the stateless lab. */
export function enrichReport(report: InterviewReport, resources: Resource[]): InterviewReport {
  if (!report.review?.length) return report;
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const review: InterviewReview[] = [];
  for (const item of report.review) {
    const resource = byId.get(item.id);
    if (!resource) continue;
    review.push({ ...item, label: item.label || resource.label, href: resource.href });
  }
  return { ...report, review };
}

const ROUND_LABELS = ROUNDS as Record<string, { label: string }>;
const ROLE_LABELS = ROLES as Record<string, { label: string }>;
const LEVEL_LABELS = LEVELS as Record<string, { label: string }>;
const MODE_LABELS = MODES as Record<string, { label: string }>;

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function confidenceLabel(value: InterviewReport['confidence']): string {
  if (value === 'high') return '证据较充分';
  if (value === 'medium') return '证据一般';
  return '证据不足，分数仅供参考';
}

function action(label: string, className: string, onClick: () => void) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function listSection(title: string, items: string[], className: string, empty: string) {
  const section = el('section', `iv-report-section ${className}`);
  section.append(el('h2', '', title));
  if (!items.length) {
    section.append(el('p', 'iv-hint', empty));
    return section;
  }
  const list = el('ul', 'iv-report-list');
  for (const item of items) list.append(el('li', '', item));
  section.append(list);
  return section;
}

function transcriptDetails(session: InterviewSession) {
  const details = el('details', 'iv-report-transcript');
  details.append(el('summary', '', `完整对话（${session.turns.length} 轮）`));
  const list = el('ol', 'iv-report-turns');
  for (const turn of session.turns) {
    const item = el('li', `iv-report-turn is-${turn.role}`);
    const who = turn.role === 'interviewer' ? '面试官' : turn.role === 'candidate' ? '我' : '系统';
    const head = el('strong', '', who);
    if (turn.model) head.append(el('span', 'iv-msg-model', turn.model));
    item.append(head, el('p', '', turn.text));
    if (turn.feedback) item.append(el('p', 'iv-hint', `点评：${turn.feedback}`));
    list.append(item);
  }
  details.append(list);
  return details;
}

export function renderReport(host: HTMLElement, session: InterviewSession, options: Options) {
  host.replaceChildren();
  const report = session.report;
  if (!report) {
    host.append(
      el('p', 'iv-empty', '这场面试还没有复盘。点击下面按钮生成，或从面试记录继续。'),
      (() => {
        const button = action('生成复盘', 'harness-button', options.onRetry);
        return button;
      })(),
    );
    return;
  }
  const head = el('header', 'iv-report-head');
  const score = el('div', 'iv-report-score');
  score.append(
    el('strong', '', report.overall === null ? '—' : String(Math.round(report.overall))),
    el('span', '', '/ 100'),
  );
  const copy = el('div', 'iv-report-copy');
  copy.append(
    el('p', 'iv-kicker', '面试复盘'),
    el('h2', '', report.grade || '本轮复盘'),
    el(
      'p',
      'iv-report-meta',
      [
        `${report.answered ?? 0} / ${report.planned ?? session.plan.length} 个环节有回答`,
        confidenceLabel(report.confidence),
        formatDate(session.updatedAt),
        ROUND_LABELS[session.settings.round]?.label ?? session.settings.round,
        MODE_LABELS[session.settings.mode]?.label ?? session.settings.mode,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  );
  const actions = el('div', 'iv-report-actions');
  actions.append(
    action('导出 JSON', 'iv-text-button', () => downloadReportJson(session)),
    action('导出 Markdown', 'iv-text-button', () => downloadReportMarkdown(session)),
    action('重新生成复盘', 'iv-text-button', options.onRetry),
    action('再练一场', 'harness-button', options.onNew),
  );
  head.append(score, copy, actions);

  if (report.parse === 'text') {
    const warning = el(
      'p',
      'iv-banner iv-banner--warn',
      '模型没有按标记输出复盘，下面保留原文；可以点「重新生成复盘」再试一次。',
    );
    const rich = el('div', 'iv-rich iv-report-text');
    rich.innerHTML = renderMarkdown(report.text ?? '');
    host.append(head, warning, rich, transcriptDetails(session));
    return;
  }

  const grid = el('div', 'iv-report-grid');
  const dims = el('section', 'iv-report-section iv-report-dims');
  dims.append(el('h2', '', '能力维度'));
  for (const dim of report.dimensions ?? []) {
    const row = el('div', 'iv-dim');
    const label = el('span', 'iv-dim-label', dim.label);
    const bar = el('span', 'iv-bar');
    const fill = el('span', 'iv-bar-fill');
    const scoreValue = typeof dim.score === 'number' ? dim.score : null;
    fill.style.width = `${scoreValue === null ? 0 : Math.max(0, Math.min(100, scoreValue * 20))}%`;
    if (scoreValue === null) fill.classList.add('is-empty');
    bar.append(fill);
    const value = el('span', 'iv-dim-score', scoreValue === null ? '证据不足' : `${scoreValue.toFixed(1)} / 5`);
    row.append(label, bar, value);
    if (dim.comment) row.append(el('p', 'iv-dim-comment', dim.comment));
    dims.append(row);
  }

  const summary = el('div', 'iv-report-columns');
  summary.append(
    listSection('做得好的', report.strengths ?? [], 'iv-report-good', '还没有足够证据。'),
    listSection('需要补的', report.gaps ?? [], 'iv-report-gap', '还没有足够证据。'),
  );

  const evidence = el('section', 'iv-report-section');
  evidence.append(el('h2', '', '原话证据'));
  if (!(report.evidence ?? []).length) {
    evidence.append(el('p', 'iv-hint', '这次没有可引用的原话。'));
  } else {
    const list = el('ul', 'iv-evidence');
    for (const item of report.evidence ?? []) {
      const row = el('li', 'iv-evidence-item');
      row.append(el('blockquote', '', item.quote), el('p', '', item.issue));
      list.append(row);
    }
    evidence.append(list);
  }

  const review = el('section', 'iv-report-section');
  review.append(el('h2', '', '回到原文'));
  if (!(report.review ?? []).length) {
    review.append(el('p', 'iv-hint', '这次没有给出复习链接；可以从下方薄弱专题开始。'));
  } else {
    const list = el('ul', 'iv-review-list');
    for (const item of report.review ?? []) {
      const row = el('li', 'iv-review-item');
      const link = el('a', 'iv-review-link', item.label ?? item.id);
      link.href = item.href;
      link.target = '_blank';
      link.rel = 'noopener';
      row.append(link, el('p', '', item.reason));
      list.append(row);
    }
    review.append(list);
  }

  grid.append(dims, summary, evidence, review);
  host.append(head, grid, transcriptDetails(session));
}

export function reportMarkdown(session: InterviewSession): string {
  const report = session.report;
  const lines = [
    `# 模拟面试复盘 · ${ROUND_LABELS[session.settings.round]?.label ?? session.settings.round}`,
    '',
    `- 时间：${formatDate(session.createdAt)}`,
    `- 岗位：${ROLE_LABELS[session.settings.role]?.label ?? session.settings.role}`,
    `- 难度：${LEVEL_LABELS[session.settings.level]?.label ?? session.settings.level}`,
    `- 模式：${MODE_LABELS[session.settings.mode]?.label ?? session.settings.mode}`,
    `- 模型：${session.settings.modelProfile || '默认模型'}`,
    '',
  ];
  if (!report) {
    lines.push('这场面试还没有复盘。', '');
  } else if (report.parse === 'text') {
    lines.push('模型没有按标记输出，下面是原文：', '', report.text ?? '', '');
  } else {
    lines.push(
      `## ${report.overall ?? '—'} / 100 · ${report.grade || ''}`,
      '',
      `${report.answered ?? 0} / ${report.planned ?? session.plan.length} 个环节有回答；${confidenceLabel(report.confidence)}。`,
      '',
      '## 能力维度',
      '',
    );
    for (const dim of report.dimensions ?? []) {
      lines.push(`- ${dim.label}：${typeof dim.score === 'number' ? `${dim.score} / 5` : '证据不足'}。${dim.comment ?? ''}`);
    }
    lines.push('', '## 做得好的', '');
    for (const item of report.strengths ?? []) lines.push(`- ${item}`);
    lines.push('', '## 需要补的', '');
    for (const item of report.gaps ?? []) lines.push(`- ${item}`);
    lines.push('', '## 原话证据', '');
    for (const item of report.evidence ?? []) lines.push(`- 「${item.quote}」——${item.issue}`);
    lines.push('', '## 回到原文', '');
    for (const item of report.review ?? []) lines.push(`- [${item.label ?? item.id}](${item.href})：${item.reason}`);
    lines.push('', '## 接下来', '');
    for (const item of report.next ?? []) lines.push(`- ${item}`);
    lines.push('');
  }
  lines.push('## 完整对话', '');
  for (const turn of session.turns) {
    const who = turn.role === 'interviewer' ? '面试官' : turn.role === 'candidate' ? '我' : '系统';
    lines.push(`### ${who}`, '', turn.text, '');
    if (turn.feedback) lines.push(`点评：${turn.feedback}`, '');
  }
  return `${lines.join('\n')}\n`;
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadReportJson(session: InterviewSession) {
  downloadText(`interview-${session.id}.json`, `${JSON.stringify(session, null, 2)}\n`, 'application/json');
}

export function downloadReportMarkdown(session: InterviewSession) {
  downloadText(`interview-${session.id}.md`, reportMarkdown(session), 'text/markdown');
}
