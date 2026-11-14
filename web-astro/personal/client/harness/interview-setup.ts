// Requirement 013: setup form, history list and local resume signals.
import { el } from '../dom';
import { LEVELS, MODES, ROUNDS } from '../../harness/interview-profile.mjs';
import type {
  InterviewSettings,
  InterviewSummary,
  ResumeSignals,
} from './interview-api';
import { resumeSignalsFromStorage, type ModelChoice } from './interview-model';
import { formatDate } from './interview-report';

const ROUND_LABELS = ROUNDS as Record<string, { label: string }>;
const MODE_LABELS = MODES as Record<string, { label: string }>;
const LEVEL_LABELS = LEVELS as Record<string, { label: string }>;

export function readResumeSignalsFromStorage(storage: Storage): ResumeSignals | null {
  try {
    const check = JSON.parse(storage.getItem('aipm-resume-check') ?? 'null');
    const plan = JSON.parse(storage.getItem('aipm-resume-plan') ?? 'null');
    return resumeSignalsFromStorage(check, plan);
  } catch {
    return null;
  }
}

export function fillModelSelect(select: HTMLSelectElement, choices: ModelChoice[], value: string) {
  select.replaceChildren();
  for (const choice of choices) {
    const option = new Option(
      choice.value === '' ? `默认模型（${choice.profile?.name ?? '.env'}）` : `${choice.label} · ${choice.meta}`,
      choice.value,
    );
    option.title = choice.meta;
    option.selected = choice.value === value;
    select.append(option);
  }
}

export function readFocusTopics(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('[data-iv-topic]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

export function updateTopicCount(container: HTMLElement, counter: HTMLElement) {
  const count = readFocusTopics(container).length;
  counter.textContent = count ? `已选 ${count} / 4` : '最多 4 个，不选则按画像推荐';
  counter.classList.toggle('is-full', count >= 4);
}

export function readSetupSettings(form: HTMLFormElement): InterviewSettings {
  const value = (field: string) => {
    const node = form.querySelector<HTMLSelectElement | HTMLTextAreaElement>(`[data-iv-field="${field}"]`);
    if (!node) throw new Error(`设置项 ${field} 不存在`);
    return node.value;
  };
  const topics = readFocusTopics(form);
  if (topics.length > 4) throw new Error('重点专题最多选 4 个');
  const questionCount = Number(value('questionCount'));
  if (!Number.isInteger(questionCount) || questionCount < 4 || questionCount > 10) {
    throw new Error('题量必须是 4–10 个环节');
  }
  return {
    role: value('role') as InterviewSettings['role'],
    round: value('round') as InterviewSettings['round'],
    level: value('level') as InterviewSettings['level'],
    mode: value('mode') as InterviewSettings['mode'],
    questionCount,
    focusTopics: topics,
    resumeHighlights: value('resumeHighlights').trim(),
    modelProfile: value('modelProfile'),
  };
}

export function setSetupStatus(node: HTMLElement, message: string, error = false) {
  node.textContent = message;
  node.classList.toggle('is-error', error);
}

export function renderHistory(
  section: HTMLElement,
  sessions: InterviewSummary[],
  onDelete: (id: string) => void,
) {
  section.querySelector('[data-iv-history]')?.remove();
  section.querySelector('[data-iv-history-empty]')?.remove();
  if (!sessions.length) {
    section.append(el('p', 'iv-empty', '还没有面试记录。选好岗位和轮次，开始第一场。'));
    section.querySelector('p.iv-empty')?.setAttribute('data-iv-history-empty', '');
    return;
  }
  const list = el('ul', 'iv-history-list');
  list.dataset.ivHistory = '';
  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-iv-delete]');
    if (!button) return;
    const id = button.dataset.id;
    if (id) onDelete(id);
  });
  for (const summary of sessions) {
    const item = el('li', 'iv-history-item');
    item.dataset.id = summary.id;
    const link = el('a', 'iv-history-main');
    link.href = `?session=${encodeURIComponent(summary.id)}`;
    link.append(
      el(
        'span',
        'iv-history-title',
        `${ROUND_LABELS[summary.round]?.label ?? summary.round} · ${MODE_LABELS[summary.mode]?.label ?? summary.mode}${summary.status === 'active' ? ' · 未完成' : ''}`,
      ),
      el(
        'span',
        'iv-history-meta',
        [
          formatDate(summary.updatedAt),
          `已答 ${summary.answered} / 计划 ${summary.planned}`,
          summary.overall !== null ? `${summary.overall} 分` : '',
          summary.model,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    );
    const remove = el('button', 'iv-text-button', '删除');
    remove.type = 'button';
    remove.dataset.ivDelete = '';
    remove.dataset.id = summary.id;
    item.append(link, remove);
    list.append(item);
  }
  section.append(list);
}

export function levelLabel(level: string) {
  return LEVEL_LABELS[level]?.label ?? level;
}
