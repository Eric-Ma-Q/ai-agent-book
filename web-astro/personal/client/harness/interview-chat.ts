// Requirement 013: interview transcript, plan rail and composer. The lab is
// not called here; the orchestrator owns requests and persistence.
import { el } from '../dom';
import { renderMarkdown } from '../lab/markdown';
import { LEVELS, MODES, ROUNDS } from '../../harness/interview-profile.mjs';
import type { InterviewSession, InterviewTurn } from './interview-api';
import { formatCost, formatLatency, formatUsage } from './interview-model';

type Callbacks = {
  onSend: (text: string) => void;
  onStop: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onExit: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onSaveRetry: () => void;
};

type ErrorOptions = { retry?: boolean; undo?: boolean };

const ROUND_LABELS = ROUNDS as Record<string, { label: string }>;
const LEVEL_LABELS = LEVELS as Record<string, { label: string }>;
const MODE_LABELS = MODES as Record<string, { label: string }>;

function duration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

export class InterviewChat {
  private session: InterviewSession | null = null;
  private loading = false;
  private error: string | null = null;
  private errorOptions: ErrorOptions = {};
  private interval: number | undefined;
  private startedAt = 0;
  private composing = false;
  private readonly callbacks: Callbacks;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly end: HTMLButtonElement;
  private readonly endMobile: HTMLButtonElement;
  private readonly exit: HTMLButtonElement;
  private readonly transcript: HTMLElement;
  private readonly status: HTMLElement;
  private readonly saveWarning: HTMLElement;
  private readonly saveText: HTMLElement;
  private readonly saveRetry: HTMLButtonElement;
  private readonly plan: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly focus: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly cost: HTMLElement;
  private readonly sideModel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly mode: HTMLElement;

  constructor(root: HTMLElement, callbacks: Callbacks) {
    const pick = <T extends HTMLElement>(selector: string): T => {
      const node = root.querySelector<T>(selector);
      if (!node) throw new Error(`interview chat is missing ${selector}`);
      return node;
    };
    this.callbacks = callbacks;
    this.form = pick<HTMLFormElement>('[data-iv-composer]');
    this.input = pick<HTMLTextAreaElement>('[data-iv-input]');
    this.send = pick<HTMLButtonElement>('[data-iv-send]');
    this.skip = pick<HTMLButtonElement>('[data-iv-skip]');
    this.end = pick<HTMLButtonElement>('[data-iv-end]');
    this.endMobile = pick<HTMLButtonElement>('[data-iv-end-mobile]');
    this.exit = pick<HTMLButtonElement>('[data-iv-exit]');
    this.transcript = pick<HTMLElement>('[data-iv-transcript]');
    this.status = pick<HTMLElement>('[data-iv-status]');
    this.saveWarning = pick<HTMLElement>('[data-iv-save-warning]');
    this.saveText = pick<HTMLElement>('[data-iv-save-text]');
    this.saveRetry = pick<HTMLButtonElement>('[data-iv-save-retry]');
    this.plan = pick<HTMLElement>('[data-iv-plan]');
    this.progress = pick<HTMLElement>('[data-iv-progress]');
    this.focus = pick<HTMLElement>('[data-iv-focus]');
    this.timer = pick<HTMLElement>('[data-iv-timer]');
    this.cost = pick<HTMLElement>('[data-iv-cost]');
    this.sideModel = pick<HTMLElement>('[data-iv-side-model]');
    this.title = pick<HTMLElement>('[data-iv-session-title]');
    this.meta = pick<HTMLElement>('[data-iv-session-meta]');
    this.mode = pick<HTMLElement>('[data-iv-chat-mode]');

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.loading) {
        this.callbacks.onStop();
        return;
      }
      this.submit();
    });
    this.input.addEventListener('input', () => {
      this.resize();
      this.updateComposer();
    });
    this.input.addEventListener('compositionstart', () => {
      this.composing = true;
    });
    this.input.addEventListener('compositionend', () => {
      this.composing = false;
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || this.composing) return;
      event.preventDefault();
      if (this.loading) {
        this.callbacks.onStop();
        return;
      }
      this.submit();
    });
    this.skip.addEventListener('click', () => {
      if (this.loading) return;
      this.callbacks.onSkip();
    });
    this.end.addEventListener('click', () => this.callbacks.onEnd());
    this.endMobile.addEventListener('click', () => this.callbacks.onEnd());
    this.exit.addEventListener('click', () => this.callbacks.onExit());
    this.saveRetry.addEventListener('click', () => this.callbacks.onSaveRetry());
    this.resize();
  }

  setSession(session: InterviewSession) {
    this.session = session;
    this.error = null;
    this.errorOptions = {};
    this.loading = false;
    this.startedAt = Date.parse(session.createdAt) || Date.now();
    if (this.interval) window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.updateTimer(), 1000);
    this.updateTimer();
    this.render(true);
  }

  setLoading(loading: boolean) {
    this.loading = loading;
    this.updateComposer();
    if (loading) this.setStatus('面试官正在思考……');
    this.render(false);
  }

  showError(message: string, options: ErrorOptions = {}) {
    this.error = message;
    this.errorOptions = { retry: options.retry !== false, undo: options.undo !== false };
    this.setLoading(false);
    this.setStatus(message);
    this.render(false);
  }

  clearError() {
    this.error = null;
    this.errorOptions = {};
    this.render(false);
  }

  showSaveWarning(message: string) {
    this.saveText.textContent = message;
    this.saveWarning.hidden = false;
  }

  clearSaveWarning() {
    this.saveWarning.hidden = true;
  }

  setStatus(message: string) {
    this.status.textContent = message;
  }

  focusInput() {
    this.input.focus();
  }

  takeInput(): string {
    const text = this.input.value.trim();
    this.input.value = '';
    this.resize();
    return text;
  }

  clearInput() {
    this.input.value = '';
    this.resize();
  }

  setSelectedModel(label: string) {
    if (this.session && this.session.turns.some((turn) => turn.role === 'interviewer')) return;
    this.sideModel.textContent = label;
  }

  restoreInput(text: string) {
    this.input.value = text;
    this.resize();
    this.input.focus();
  }

  hasInput(): boolean {
    return this.input.value.trim().length > 0;
  }

  render(forceScroll = false) {
    if (!this.session) return;
    const session = this.session;
    const round = ROUND_LABELS[session.settings.round]?.label ?? session.settings.round;
    const level = LEVEL_LABELS[session.settings.level]?.label ?? session.settings.level;
    const mode = MODE_LABELS[session.settings.mode]?.label ?? session.settings.mode;
    this.title.textContent = round;
    this.meta.textContent = `${level} · ${mode}`;
    this.mode.textContent = session.settings.mode === 'practice'
      ? '练习模式 · 每题先点评'
      : '模拟模式 · 结束统一复盘';
    this.renderPlan();
    this.renderTranscript();
    this.updateComposer();
    this.updateSide();
    if (forceScroll) this.scrollToBottom(true);
  }

  private renderPlan() {
    if (!this.session) return;
    this.plan.replaceChildren();
    const answered = this.session.turns.filter((turn) => turn.role === 'candidate').length;
    const activeIndex = Math.max(
      0,
      this.session.plan.findIndex((slot) => slot.status === 'active'),
    );
    this.progress.textContent = `第 ${Math.min(activeIndex + 1, this.session.plan.length)} / ${this.session.plan.length} 个环节 · 已答 ${answered}`;
    for (const slot of this.session.plan) {
      const item = el('li', `iv-plan-item is-${slot.status}`);
      item.dataset.slot = slot.id;
      item.append(
        el('span', 'iv-plan-index', slot.id.replace('s', '')),
        el('span', 'iv-plan-title', slot.title),
        el('span', 'iv-plan-topic', slot.topicLabel),
      );
      this.plan.append(item);
    }
    const active = this.session.plan.find((slot) => slot.status === 'active')
      ?? this.session.plan.find((slot) => slot.status === 'pending')
      ?? null;
    this.focus.textContent = active ? active.topicLabel : '进入复盘';
  }

  private renderTranscript() {
    if (!this.session) return;
    const nearBottom = this.isNearBottom();
    this.transcript.replaceChildren();
    if (!this.session.turns.length && !this.loading && !this.error) {
      this.transcript.append(
        el(
          'p',
          'iv-transcript-empty',
          '面试官马上开始。第一题会从自我介绍或你选的轮次开始。',
        ),
      );
    }
    for (const turn of this.session.turns) {
      this.transcript.append(this.turnNode(turn));
    }
    if (this.loading) {
      const typing = el('div', 'iv-msg iv-msg--interviewer iv-typing');
      typing.append(
        el('span', 'iv-avatar', '面'),
        el('div', 'iv-msg-body', el('span', 'iv-typing-text', '面试官正在思考……')),
      );
      this.transcript.append(typing);
    }
    if (this.error) {
      const card = el('div', 'iv-error', el('strong', '', '这一轮没有完成'), el('p', '', this.error));
      const actions = el('div', 'iv-error-actions');
      if (this.errorOptions.retry !== false) {
        const retry = el('button', 'iv-text-button', '重试本轮');
        retry.type = 'button';
        retry.addEventListener('click', () => {
          this.clearError();
          this.callbacks.onRetry();
        });
        actions.append(retry);
      }
      if (this.errorOptions.undo !== false) {
        const undo = el('button', 'iv-text-button', '撤销这条回答');
        undo.type = 'button';
        undo.addEventListener('click', () => {
          this.clearError();
          this.callbacks.onUndo();
        });
        actions.append(undo);
      }
      card.append(actions);
      this.transcript.append(card);
    }
    if (nearBottom || this.session.turns.length <= 1) this.scrollToBottom(true);
  }

  private turnNode(turn: InterviewTurn): HTMLElement {
    if (turn.role === 'system') {
      return el('p', 'iv-msg iv-msg--system', turn.text);
    }
    const interviewer = turn.role === 'interviewer';
    const node = el('article', `iv-msg ${interviewer ? 'iv-msg--interviewer' : 'iv-msg--candidate'}`);
    const avatar = el('span', 'iv-avatar', interviewer ? '面' : '我');
    const body = el('div', 'iv-msg-body');
    const head = el('div', 'iv-msg-head');
    head.append(el('strong', 'iv-msg-role', interviewer ? '面试官' : '我'));
    if (interviewer && turn.model) {
      head.append(el('span', 'iv-msg-model', turn.model));
    }
    if (turn.skipped) head.append(el('span', 'iv-badge iv-badge--muted', '跳过'));
    body.append(head);
    if (interviewer) {
      const rich = el('div', 'iv-rich');
      rich.innerHTML = renderMarkdown(turn.text);
      body.append(rich);
      if (turn.focus && this.session?.settings.mode === 'practice') {
        body.append(el('span', 'iv-focus-chip', `考察：${turn.focus}`));
      }
      if (turn.feedback) {
        const feedback = el('div', 'iv-feedback');
        feedback.append(el('strong', '', '点评'));
        const richFeedback = el('div', 'iv-rich');
        richFeedback.innerHTML = renderMarkdown(turn.feedback);
        feedback.append(richFeedback);
        body.append(feedback);
      }
      const meta = this.turnMeta(turn);
      if (meta) body.append(el('p', 'iv-msg-meta', meta));
    } else {
      const text = el('p', 'iv-candidate-text', turn.text || '（没有回答）');
      body.append(text);
    }
    node.append(avatar, body);
    return node;
  }

  private turnMeta(turn: InterviewTurn): string {
    const parts = [];
    if (turn.latency_ms) parts.push(formatLatency(turn.latency_ms));
    if (turn.usage) {
      const usage = formatUsage(turn.usage);
      if (usage) parts.push(usage);
    }
    if (turn.cost !== undefined) parts.push(formatCost(turn.cost));
    return parts.filter(Boolean).join(' · ');
  }

  private updateComposer() {
    this.send.textContent = this.loading ? '停止等待' : '发送';
    this.send.disabled = !this.loading && !this.hasInput();
    this.skip.disabled = this.loading;
    this.input.setAttribute('aria-busy', String(this.loading));
    if (!this.loading && !this.error) this.setStatus('');
  }

  private updateSide() {
    if (!this.session) return;
    const interviewer = [...this.session.turns].reverse().find((turn) => turn.role === 'interviewer' && turn.model);
    this.sideModel.textContent = interviewer?.model
      ?? (this.session.settings.modelProfile || '默认模型');
    const costs = this.session.turns
      .map((turn) => turn.cost)
      .filter((value): value is number => typeof value === 'number');
    const prompt = this.session.turns.reduce((sum, turn) => sum + (turn.usage?.prompt_tokens ?? 0), 0);
    const completion = this.session.turns.reduce((sum, turn) => sum + (turn.usage?.completion_tokens ?? 0), 0);
    if (!this.session.turns.length) {
      this.cost.textContent = '还没有调用。';
      return;
    }
    const tokens = prompt || completion ? `${prompt.toLocaleString('en-US')} in · ${completion.toLocaleString('en-US')} out` : '';
    const money = costs.length
      ? `$${costs.reduce((sum, value) => sum + value, 0).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
      : '';
    this.cost.textContent = [money, tokens].filter(Boolean).join(' · ') || '本轮没有用量信息。';
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text) return;
    this.callbacks.onSend(text);
  }

  private resize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 180)}px`;
  }

  private isNearBottom() {
    const element = this.transcript;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  private scrollToBottom(force = false) {
    if (!force && !this.isNearBottom()) return;
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  private updateTimer() {
    if (!this.session) return;
    const elapsed = this.session.status === 'finished'
      ? (Date.parse(this.session.updatedAt) || this.startedAt) - this.startedAt
      : Date.now() - this.startedAt;
    this.timer.textContent = duration(elapsed);
  }

  stopTimer() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = undefined;
  }

  destroy() {
    this.stopTimer();
  }
}
