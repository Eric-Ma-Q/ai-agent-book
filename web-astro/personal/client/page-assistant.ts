// 全站随页问答入口：悬浮按钮 + 面板。只在浏览器运行，所有页面共用一份。
import { el, button as buttonEl } from './dom.ts';
import { LabError, labApi, streamRun } from './lab/api.ts';
import type { LabEvent } from './lab/types.ts';
import { needsModelSetup, type ModelCatalog, type ModelProfile } from './settings/model-profiles.ts';
import { modelSetupNotice } from './model-setup.ts';
import { modelChoices, resolveModelChoice } from './harness/interview-model.ts';
import { renderMarkdown } from './lab/markdown.ts';
import { ensureClipboard } from './clipboard.ts';
import { hydrateMermaid } from './page-assistant/diagram.ts';
import { collectPageSnapshot, findBlockElement, blockText as blockElementText } from './page-assistant/capture.ts';
import { bindPageCitations, interceptCitations, jumpToBlock, jumpToSection, linkPageBlocks } from './page-assistant/anchors.ts';
import { hydrateChecks } from './page-assistant/check.ts';
import { hydrateConcepts } from './page-assistant/concept.ts';
import { parseReplay, renderReplay, replayErrorText } from './page-assistant/replay.ts';
import { MODE_KEY, parseMode, resolveSendMode, type Mode } from './page-assistant/modes.ts';
import { escapeAction, scrollAnchor, scrollTopFor, type ScrollAnchor } from './page-assistant/panel.ts';
import { captureElement, captureScreenshot, type Screenshot } from './page-assistant/screenshot.ts';
import { focusCandidates, focusLabel, type FocusCandidate } from './page-assistant/focus.ts';
import {
  addRunHistory,
  answerCopyText,
  applyAssistantEvent,
  assistantStateFromMessage,
  buildChat,
  buildPageRequest,
  canResumeHistory,
  chatMessageWhen,
  chatMessageWhere,
  chatMessagesFromSession,
  chatSummaryLine,
  citationSummary,
  contextLine,
  emptyAssistantState,
  historyLabel,
  newSessionId,
  parseChat,
  parseRunHistory,
  parseSessionHistory,
  quickPrompts,
  reasoningChoices,
  resolveReasoningChoice,
  runTraceUrl,
  sessionResumePath,
  shortArgs,
  snapshotSummary,
  toolLabel,
  usageLine,
  type AssistantState,
  type ChatMessage,
  type FocusTarget,
  type PageSnapshot,
  type RunHistoryEntry,
} from './page-assistant/model.ts';
import './page-assistant.css';

const MODEL_KEY = 'page-assistant:model';
const REASONING_KEY = 'page-assistant:reasoning';
const SHOT_KEY = 'page-assistant:screenshot';
const HISTORY_KEY = 'page-assistant:history';
const CHAT_KEY = 'page-assistant:chat';
const OPEN_KEY = 'page-assistant:open';
const MAX_TOOL_RESULT = 4000;

type AssistantView = {
  node: HTMLElement;
  tools: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  state: AssistantState;
  runId?: string;
  /** 每条回答下方的复制按钮；没有正文时隐藏。 */
  copy?: HTMLButtonElement;
  /** 页面块文字缓存：同一条回答重渲染时不重复走 DOM。 */
  blockTexts: Map<number, string | null>;
  /** 对应的本机对话消息；结束或刷新时把状态写回持久化快照。 */
  message?: ChatMessage;
};

function icon() {
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8M8 13h5"></path></svg>';
}

function closeIcon() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>';
}

function expandIcon() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6"></path></svg>';
}

function collapseIcon() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"></path></svg>';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStore(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 隐私模式或存储被禁用时，偏好只在本次会话生效。
  }
}

function removeStore(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 存储被禁用时没有可清理的内容。
  }
}

/** 面板开合只在当前标签页内保持：切页、刷新后仍打开，关掉标签页就回到默认收起。 */
function readSession(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage 不可用时只是不恢复开合状态。
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof LabError) {
    if (error.status === 0 || error.status === 502 || error.notReady) {
      return '实验台服务没有启动或无法连接。在 agent-lab 目录运行 `uv run python -m agent_lab serve --port 4330` 后重试。';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function toolNode(tool: AssistantState['tools'][number]): HTMLElement {
  const box = el('div', `pa-tool${tool.error ? ' pa-tool--error' : ''}`);
  box.append(
    el('span', 'pa-tool-dot'),
    el('span', 'pa-tool-name', toolLabel(tool.name)),
    el('span', 'pa-tool-arg', shortArgs(tool.args)),
    el('span', 'pa-tool-time', tool.durationMs ? `${tool.durationMs} ms` : ''),
  );
  const details = el('details', 'pa-tool-details');
  details.append(el('summary', '', tool.error ? '查看错误' : '查看结果'));
  details.append(el('pre', 'pa-tool-result', (tool.error || tool.result || '（空）').slice(0, MAX_TOOL_RESULT)));
  box.append(details);
  return box;
}

function mount() {
  if (document.querySelector('.pa-root')) return;
  // 阅读器与 Harness 归档页都是纯 HTTP 地址，navigator.clipboard 在非安全
  // 上下文里不存在；先装上临时 textarea + execCommand 的回退实现。
  ensureClipboard(navigator, document);
  const root = el('div', 'pa-root');
  let open = false;
  let busy = false;
  let snapshot: PageSnapshot | null = null;
  let screenshot: Screenshot | null = null;
  let screenshotEnabled = readStore(SHOT_KEY) !== '0';
  let captureSeq = 0;
  let sessionId = newSessionId(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''));
  let runId: string | null = null;
  let closeStream: (() => void) | null = null;
  let catalog: ModelCatalog | null = null;
  let savedModel = readStore(MODEL_KEY);
  let selectedModel = savedModel;
  let savedReasoning = readStore(REASONING_KEY);
  let selectedReasoning = savedReasoning;
  let hasMessages = false;
  let chatMode = parseMode(readStore(MODE_KEY));
  let focus: FocusTarget | null = null;
  let figureListOpen = false;
  let replayOpen = false;
  let replayScroll = 0;
  let replayTrigger: HTMLElement | null = null;
  let history = parseRunHistory(readStore(HISTORY_KEY));
  let historyOpen = false;
  let historyError = '';
  let restoring = false;
  let restoreSeq = 0;
  let fullscreen = false;
  let morph: Animation | null = null;
  /** 当前这轮对话：全部提问与回答，刷新与切页后按它重建面板。 */
  let chat: ChatMessage[] = [];
  let chatUpdatedAt = 0;
  let restoringRuns = 0;

  const fab = buttonEl('', 'pa-fab', () => show());
  fab.innerHTML = `${icon()}<span>问 AI</span>`;
  fab.setAttribute('aria-label', '打开随页问答');
  fab.setAttribute('aria-expanded', 'false');

  // 归档页把 `section{padding:64px 0}` 写成裸元素规则，落在面板上就是顶部
  // 一条 64px 空带。面板与内部区块统一用 div，语义交给 role，避开这层命中。
  const panel = el('div', 'pa-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '随页问答');
  panel.hidden = true;

  const title = el('div', 'pa-title');
  const titleText = el('strong', '', '随页问答');
  const subtitle = el('span', 'pa-subtitle', ' AI 看到的是提问时的页面');
  title.append(titleText, subtitle);
  const historyButton = buttonEl('历史', 'pa-head-button', () => toggleHistory());
  historyButton.setAttribute('aria-expanded', 'false');
  const newButton = buttonEl('新对话', 'pa-head-button', () => reset());
  const fullButton = buttonEl('', 'pa-head-button pa-expand', () => setFullscreen(!fullscreen));
  const fullIcon = el('span', 'pa-expand-icon');
  fullIcon.innerHTML = expandIcon();
  const fullLabel = el('span', 'pa-expand-label', '全屏');
  fullButton.append(fullIcon, fullLabel);
  fullButton.setAttribute('aria-label', '全屏阅读');
  fullButton.setAttribute('aria-pressed', 'false');
  fullButton.title = '全屏阅读（Esc 退出）';
  const closeButton = buttonEl('', 'pa-head-button pa-close', () => close());
  closeButton.innerHTML = closeIcon();
  closeButton.setAttribute('aria-label', '关闭随页问答');
  const head = el('header', 'pa-head', title, el('div', 'pa-head-actions', historyButton, newButton, fullButton, closeButton));

  // 需求 041：完全没有模型时，在面板顶部指向设置页。点击后清掉目录缓存，
  // 从设置页返回时下一次 show() 会重新读取档案。
  const setup = modelSetupNotice('pa-setup', true);
  setup.hidden = true;
  setup.querySelector('a')?.addEventListener('click', () => {
    catalog = null;
  });

  const historyPanel = el('div', 'pa-history');
  historyPanel.setAttribute('role', 'region');
  historyPanel.setAttribute('aria-label', '最近提问');
  historyPanel.hidden = true;

  const contextLineEl = el('span', 'pa-context-line', '正在读取页面…');
  const shotButton = buttonEl('', 'pa-shot-toggle', () => toggleScreenshot());
  const figureButton = buttonEl('', 'pa-shot-toggle pa-figure-toggle', () => toggleFigureList());
  figureButton.hidden = true;
  figureButton.setAttribute('aria-expanded', 'false');
  figureButton.setAttribute('aria-label', '选择要提问的图或表');
  figureButton.title = '只截取选中的图或表';
  const context = el('div', 'pa-context', el('span', 'pa-context-label', '当前页面'), contextLineEl, figureButton, shotButton);
  const figureList = el('div', 'pa-figure-list');
  figureList.hidden = true;
  const focusText = el('span', 'pa-focus-text', '');
  const focusClear = buttonEl('取消', 'pa-focus-clear', () => clearFocus());
  const focusBar = el('div', 'pa-focus', focusText, focusClear);
  focusBar.hidden = true;
  const seenText = el('p', 'pa-seen-text', '正在读取页面……');
  const seenImage = el('img', 'pa-seen-image');
  seenImage.alt = '当前页面视口截图';
  seenImage.hidden = true;
  const seen = el('details', 'pa-seen');
  seen.append(el('summary', '', 'AI 看到'), el('div', 'pa-seen-body', seenImage, seenText));

  const messages = el('div', 'pa-messages');
  const replayPanel = el('div', 'pa-replay-panel');
  replayPanel.hidden = true;
  replayPanel.setAttribute('role', 'region');
  replayPanel.setAttribute('aria-label', '运行回放');
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-relevant', 'additions');

  const empty = el('div', 'pa-empty');
  empty.append(
    el('p', 'pa-empty-title', '不用复制、不用切页。'),
    el('p', 'pa-empty-text', '我会读取你当前看到的位置、选中的文字和视口截图，再决定查页面、查书还是联网。'),
  );
  messages.append(empty);

  const quick = el('div', 'pa-quick');
  const textarea = el('textarea', 'pa-input');
  textarea.rows = 1;
  textarea.placeholder = '问这一页，或让我去查…';
  textarea.setAttribute('aria-label', '随页问题');
  const modelSelect = el('select', 'pa-model');
  modelSelect.setAttribute('aria-label', '选择模型');
  const reasoningSelect = el('select', 'pa-model pa-reasoning');
  reasoningSelect.setAttribute('aria-label', '思考强度');
  const modelField = el('label', 'pa-field', el('span', 'pa-field-label', '模型'), modelSelect);
  const reasoningField = el('label', 'pa-field pa-reasoning-field', el('span', 'pa-field-label', '思考'), reasoningSelect);
  reasoningField.hidden = true;
  const hint = el('span', 'pa-model-hint', '');
  const modeButton = buttonEl('检验', 'pa-mode-toggle', () => toggleMode());
  modeButton.setAttribute('aria-pressed', String(chatMode === 'check'));
  modeButton.setAttribute('aria-label', '检验模式');
  modeButton.title = '回答后出一道检查题，作答后判卷';
  const settings = el('div', 'pa-settings', modelField, reasoningField, modeButton, hint);
  const stopButton = buttonEl('停止', 'pa-stop', () => stop());
  stopButton.hidden = true;
  const sendButton = buttonEl('发送', 'pa-send', () => void send());
  const actions = el('div', 'pa-actions', stopButton, sendButton);
  const compose = el('div', 'pa-compose', quick, textarea, actions, settings);
  const foot = el('p', 'pa-foot', '回答会标注页面块、书稿引用或网页链接；截图只用于本次提问。');
  foot.title = foot.textContent ?? '';

  panel.append(head, setup, historyPanel, context, figureList, focusBar, seen, messages, replayPanel, compose, foot);
  const scrim = el('div', 'pa-scrim');
  scrim.setAttribute('aria-hidden', 'true');
  scrim.addEventListener('click', () => {
    setFullscreen(false);
    fullButton.focus({ preventScroll: true });
  });
  root.append(scrim, panel, fab);
  document.body.append(root);

  function setOpen(value: boolean) {
    open = value;
    panel.hidden = !value;
    fab.hidden = value;
    fab.setAttribute('aria-expanded', String(value));
    root.classList.toggle('pa-root--open', value);
    if (value) {
      autoSizeInput();
      void refreshContext(true);
      setTimeout(() => {
        if (open) textarea.focus();
      }, 0);
    }
  }

  function autoSizeInput() {
    textarea.style.height = 'auto';
    const cssMax = Number.parseFloat(getComputedStyle(textarea).maxHeight);
    const limit = Number.isFinite(cssMax) ? cssMax : 132;
    textarea.style.height = `${Math.min(textarea.scrollHeight, limit)}px`;
  }

  function clearInput() {
    textarea.value = '';
    autoSizeInput();
  }

  function clearMorphStyles() {
    const style = panel.style;
    style.position = '';
    style.left = '';
    style.top = '';
    style.right = '';
    style.bottom = '';
    style.width = '';
    style.height = '';
    style.margin = '';
  }

  function stopMorph() {
    const animation = morph;
    morph = null;
    if (animation) animation.cancel();
    clearMorphStyles();
  }

  /** The list uses scroll-behavior: smooth for new answers; restoring the
   *  reading position during a layout change must be instant. */
  function restoreScroll(anchor: ScrollAnchor) {
    const style = messages.style;
    const previous = style.scrollBehavior;
    style.scrollBehavior = 'auto';
    messages.scrollTop = scrollTopFor(anchor, messages.scrollHeight, messages.clientHeight);
    style.scrollBehavior = previous;
  }

  function setFullscreen(value: boolean, options: { animate?: boolean } = {}) {
    if (fullscreen === value) return;
    const animate = (options.animate ?? true) && !prefersReducedMotion();
    // Measure before cancelling a running morph so a quick second click starts
    // from the panel where the reader actually sees it, not from the target.
    const first = panel.getBoundingClientRect();
    const firstRadius = getComputedStyle(panel).borderRadius;
    const anchor = scrollAnchor(messages.scrollTop, messages.scrollHeight, messages.clientHeight);
    stopMorph();
    fullscreen = value;
    root.classList.toggle('pa-root--full', value);
    panel.classList.toggle('pa-panel--full', value);
    document.documentElement.classList.toggle('pa-fullscreen', value);
    if (value) panel.setAttribute('aria-modal', 'true');
    else panel.removeAttribute('aria-modal');
    fullIcon.innerHTML = value ? collapseIcon() : expandIcon();
    fullLabel.textContent = value ? '收起' : '全屏';
    fullButton.setAttribute('aria-pressed', String(value));
    fullButton.setAttribute('aria-label', value ? '退出全屏阅读' : '全屏阅读');
    fullButton.title = value ? '回到小窗（Esc）' : '全屏阅读（Esc 退出）';
    const last = panel.getBoundingClientRect();
    const lastRadius = getComputedStyle(panel).borderRadius;
    autoSizeInput();
    restoreScroll(anchor);
    if (!animate || first.width < 1 || first.height < 1 || last.width < 1 || last.height < 1) return;
    const style = panel.style;
    style.position = 'fixed';
    style.left = `${first.left}px`;
    style.top = `${first.top}px`;
    style.right = 'auto';
    style.bottom = 'auto';
    style.width = `${first.width}px`;
    style.height = `${first.height}px`;
    style.margin = '0';
    const animation = panel.animate(
      [
        {
          left: `${first.left}px`,
          top: `${first.top}px`,
          width: `${first.width}px`,
          height: `${first.height}px`,
          borderRadius: firstRadius,
        },
        {
          left: `${last.left}px`,
          top: `${last.top}px`,
          width: `${last.width}px`,
          height: `${last.height}px`,
          borderRadius: lastRadius,
        },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
    morph = animation;
    const finish = () => {
      if (morph !== animation) return;
      morph = null;
      clearMorphStyles();
      autoSizeInput();
      restoreScroll(anchor);
    };
    animation.addEventListener('finish', finish);
    animation.addEventListener('cancel', finish);
  }

  function show() {
    if (fullscreen) setFullscreen(false, { animate: false });
    setOpen(true);
    writeSession(OPEN_KEY, '1');
    loadModels();
    // 恢复的对话在面板隐藏时渲染，滚动高度按 0 算；打开后回到最新一轮。
    if (hasMessages) scrollBottom();
  }

  function close() {
    const panelHadFocus = panel.contains(document.activeElement);
    if (replayOpen) closeReplay();
    if (fullscreen) setFullscreen(false, { animate: false });
    stopMorph();
    setOpen(false);
    writeSession(OPEN_KEY, '0');
    textarea.blur();
    historyOpen = false;
    historyPanel.hidden = true;
    historyButton.setAttribute('aria-expanded', 'false');
    if (panelHadFocus) fab.focus({ preventScroll: true });
  }

  function reset() {
    if (replayOpen) closeReplay();
    if (busy) stop();
    restoreSeq += 1;
    restoring = false;
    restoringRuns = 0;
    closeStream?.();
    closeStream = null;
    runId = null;
    busy = false;
    historyError = '';
    focus = null;
    figureListOpen = false;
    renderFocus();
    renderFigures();
    sessionId = newSessionId(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ''));
    chat = [];
    removeStore(CHAT_KEY);
    chatUpdatedAt = 0;
    renderChat();
    clearInput();
    updateComposer();
    void refreshContext(true);
  }

  function toggleHistory() {
    historyOpen = !historyOpen;
    historyPanel.hidden = !historyOpen;
    historyButton.setAttribute('aria-expanded', String(historyOpen));
    if (historyOpen) {
      historyError = '';
      renderHistory();
    }
  }

  function renderHistory() {
    historyPanel.replaceChildren();
    if (historyError) historyPanel.append(el('p', 'pa-history-error', historyError));
    if (restoring) historyPanel.append(el('p', 'pa-history-empty', '正在从实验台读取这次对话…'));
    if (!history.length) {
      if (!restoring && !historyError) {
        historyPanel.append(el('p', 'pa-history-empty', '还没有提问记录。完成一次问答后，这里会留下问题和运行链接。'));
      }
      return;
    }
    historyPanel.append(el('p', 'pa-history-tip', '选择「继续对话」可恢复之前的问答，接着往下问。'));
    for (const entry of history) {
      const item = el('article', 'pa-history-item');
      item.append(el('p', 'pa-history-question', entry.question));
      const metaBits = [historyLabel(entry)];
      if ((entry.turns ?? 1) > 1) metaBits.push(`${entry.turns} 轮`);
      const where = [entry.pageTitle, entry.section].filter(Boolean).join(' · ');
      const meta = el('p', 'pa-history-meta', metaBits.join(' · '));
      if (where) meta.append(document.createTextNode(` · ${where}`));
      item.append(meta);
      if (entry.error) item.append(el('p', 'pa-history-error', entry.error));
      const actions = el('div', 'pa-history-actions');
      if (canResumeHistory(entry)) {
        const resumeButton = buttonEl('', 'pa-history-action', () => void resume(entry));
        resumeButton.textContent = restoring ? '恢复中…' : '继续对话';
        resumeButton.disabled = restoring || busy;
        actions.append(resumeButton);
      }
      if (entry.runId) {
        const link = el('a', 'pa-history-link', '在实验台查看');
        link.href = runTraceUrl(location.origin, entry.runId);
        link.target = '_blank';
        link.rel = 'noopener';
        actions.append(link);
      }
      if (actions.childElementCount) item.append(actions);
      historyPanel.append(item);
    }
  }

  function remember(entry: RunHistoryEntry) {
    history = addRunHistory(history, entry);
    writeStore(HISTORY_KEY, JSON.stringify({ version: 1, items: history }));
    if (historyOpen) renderHistory();
  }

  async function resume(entry: RunHistoryEntry) {
    if (busy || restoring) return;
    const path = sessionResumePath(entry);
    if (!path) {
      historyError = '这条记录没有运行信息，无法继续这次对话。';
      renderHistory();
      return;
    }
    const seq = (restoreSeq += 1);
    restoring = true;
    historyError = '';
    updateComposer();
    renderHistory();
    try {
      const data = await labApi<unknown>(path);
      if (seq !== restoreSeq) return;
      const session = parseSessionHistory(data);
      if (!session) throw new Error('服务端返回的对话记录无法解析。');
      closeStream?.();
      closeStream = null;
      runId = null;
      sessionId = session.sessionId;
      chat = chatMessagesFromSession(session);
      renderChat('继续上次对话');
      persistChat();
      remember({ ...entry, sessionId: session.sessionId, turns: session.runs.length });
      historyOpen = false;
      historyPanel.hidden = true;
      historyButton.setAttribute('aria-expanded', 'false');
      if (open) {
        textarea.focus();
        scrollBottom();
      }
    } catch (error) {
      if (seq !== restoreSeq) return;
      historyError = `无法恢复这次对话：${friendlyError(error)}`;
    } finally {
      if (seq === restoreSeq) {
        restoring = false;
        updateComposer();
        renderHistory();
      }
    }
  }

  function currentPageRef(): ChatMessage['page'] {
    const summary = snapshot ? snapshotSummary(snapshot) : null;
    return {
      title: summary?.title || document.title,
      section: summary?.section ?? '',
      path: snapshot?.path || location.pathname,
      percent: summary ? summary.percent / 100 : 0,
    };
  }

  /** 把视图里的最新状态写回它对应的对话消息。 */
  function syncEntry(view: AssistantView) {
    const entry = view.message;
    if (!entry) return;
    entry.text = view.state.text;
    entry.status = view.state.status === 'idle' ? undefined : view.state.status;
    entry.error = view.state.error;
    entry.citations = view.state.citations;
    entry.totals = view.state.totals;
    entry.tools = view.state.tools;
    if (view.runId) entry.runId = view.runId;
  }

  /** 把当前这轮对话写进本机；刷新与切页后按它重建面板，不再走服务端重建。 */
  function persistChat() {
    if (!chat.length) {
      chatUpdatedAt = 0;
      removeStore(CHAT_KEY);
      return;
    }
    const state = buildChat(sessionId, chat);
    chatUpdatedAt = state.updatedAt;
    writeStore(CHAT_KEY, JSON.stringify(state));
  }

  /** 回答里的页面引用只在原页面可点，切到别的页面时只显示文字。 */
  function chatLinks(message: ChatMessage): { allowLinks?: boolean } {
    return { allowLinks: message.page.path ? message.page.path === location.pathname : undefined };
  }

  function renderChatUser(message: ChatMessage) {
    const node = el('article', 'pa-message pa-message--user');
    node.append(el('p', 'pa-message-text', message.text));
    const tags = [
      chatMessageWhere(message),
      message.mode === 'check' ? '检验' : message.mode === 'map' ? '概念图' : '',
      message.focus ?? '',
      chatMessageWhen(message),
    ].filter(Boolean);
    if (tags.length) node.append(el('p', 'pa-message-context', tags.join(' · ')));
    node.append(copyActions(() => message.text, '复制这条提问'));
    messages.append(node);
  }

  function renderChatAssistant(message: ChatMessage): AssistantView {
    const tools = el('div', 'pa-tools');
    const body = el('div', 'pa-answer');
    const footer = el('div', 'pa-footer');
    const node = el('article', 'pa-message pa-message--assistant', tools, body, footer);
    const view: AssistantView = {
      node,
      tools,
      body,
      footer,
      state: assistantStateFromMessage(message),
      runId: message.runId,
      blockTexts: new Map(),
      message,
    };
    const copy = copyButton(() => answerCopyText(view.state.text), '复制这条回答');
    copy.hidden = !view.state.text.trim();
    view.copy = copy;
    node.append(el('div', 'pa-message-actions', copy));
    messages.append(node);
    renderAssistant(view, chatLinks(message));
    return view;
  }

  /** 按本机快照重建整轮对话；返回每条回答的视图，供运行中的轮次接回轨迹。 */
  function renderChat(heading = '已接上次对话'): AssistantView[] {
    messages.replaceChildren();
    const views: AssistantView[] = [];
    hasMessages = chat.length > 0;
    empty.hidden = hasMessages;
    if (!hasMessages) {
      messages.append(empty);
      renderQuick();
      updateComposer();
      return views;
    }
    const banner = el('div', 'pa-restored');
    banner.append(el('strong', '', heading), el('span', '', chatSummaryLine(buildChat(sessionId, chat))));
    messages.append(banner);
    for (const message of chat) {
      if (message.role === 'user') renderChatUser(message);
      else views.push(renderChatAssistant(message));
    }
    scrollBottom();
    updateComposer();
    return views;
  }

  /**
   * 切页或刷新时这一轮还在跑：轨迹里已有部分事件，先补齐再继续订阅到 run_end，
   * 回答仍写回同一条消息。轨迹被清理或运行已中断时保留已存正文并说明原因。
   */
  async function attachRestoredRun(view: AssistantView) {
    const entry = view.message;
    const links = entry ? chatLinks(entry) : {};
    const id = entry?.runId ?? view.runId ?? '';
    if (!id) {
      view.state = { ...view.state, status: 'error', error: '这次提问没有拿到运行号（刷新或切页时中断），可以重新问一次。' };
      syncEntry(view);
      persistChat();
      renderAssistant(view, links);
      return;
    }
    view.runId = id;
    runId = id;
    restoringRuns += 1;
    setBusy(true);
    stopButton.disabled = false;
    stopButton.textContent = '停止';
    let after = 0;
    let ended = false;
    let lastTs = 0;
    try {
      const data = await labApi<{ events?: LabEvent[] }>(`/runs/${encodeURIComponent(id)}`);
      for (const event of data.events ?? []) {
        view.state = applyAssistantEvent(view.state, event);
        const seq = Number((event as { seq?: number | null }).seq);
        if (Number.isFinite(seq)) after = Math.max(after, seq + 1);
        const ts = Date.parse(String((event as { ts?: string | null }).ts ?? ''));
        if (Number.isFinite(ts)) lastTs = Math.max(lastTs, ts);
        if (event.type === 'run_end') {
          ended = true;
          break;
        }
      }
    } catch (error) {
      view.state = { ...view.state, status: 'error', error: `这次运行的结果读不到了：${friendlyError(error)}` };
      finishRestoredRun(view);
      return;
    }
    if (ended) {
      finishRestoredRun(view);
      return;
    }
    // 服务重启后进程已经没了，不再挂一个永远等不到 run_end 的事件流。
    if (lastTs && Date.now() - lastTs > 10 * 60_000) {
      view.state = { ...view.state, status: 'error', error: '这次运行已经中断，结果可能不完整；可以重新问一次。' };
      finishRestoredRun(view);
      return;
    }
    renderAssistant(view, links);
    closeStream = streamRun(
      id,
      (event: LabEvent) => {
        view.state = applyAssistantEvent(view.state, event);
        if (event.type === 'run_end') {
          closeStream?.();
          closeStream = null;
          finishRestoredRun(view);
          return;
        }
        renderAssistant(view, links);
      },
      (message) => {
        view.state = { ...view.state, status: 'error', error: message };
        closeStream?.();
        closeStream = null;
        finishRestoredRun(view);
      },
      after,
    );
  }

  function finishRestoredRun(view: AssistantView) {
    syncEntry(view);
    persistChat();
    renderAssistant(view, view.message ? chatLinks(view.message) : {});
    restoringRuns = Math.max(0, restoringRuns - 1);
    if (!restoringRuns) {
      runId = null;
      setBusy(false);
    }
  }

  /** 挂载时按本机快照重建对话；有没跑完的轮次就接回轨迹。 */
  function loadChat(): boolean {
    const stored = parseChat(readStore(CHAT_KEY));
    if (!stored) return false;
    sessionId = stored.sessionId;
    chat = stored.messages;
    chatUpdatedAt = stored.updatedAt;
    const views = renderChat();
    for (const view of views) {
      if (view.message?.status === 'running') void attachRestoredRun(view);
    }
    return true;
  }

  function toggleScreenshot() {
    screenshotEnabled = !screenshotEnabled;
    writeStore(SHOT_KEY, screenshotEnabled ? '1' : '0');
    updateShotButton();
    if (!screenshotEnabled) {
      screenshot = null;
      seenImage.hidden = true;
      seenImage.removeAttribute('src');
      updateSeenText('截图已关闭；发送时只带页面文字快照。');
    } else {
      void refreshCapture();
    }
  }

  function updateModeButton() {
    const on = chatMode === 'check';
    modeButton.setAttribute('aria-pressed', String(on));
    modeButton.classList.toggle('pa-mode-toggle--on', on);
    modeButton.title = on ? '检验已开：回答后出一道题，作答后判卷' : '回答后出一道检查题，作答后判卷';
  }

  function toggleMode() {
    chatMode = chatMode === 'check' ? 'ask' : 'check';
    writeStore(MODE_KEY, chatMode);
    updateModeButton();
    renderQuick();
  }

  function renderFigures() {
    const candidates = snapshot ? focusCandidates(snapshot) : [];
    figureButton.hidden = candidates.length === 0;
    figureButton.textContent = candidates.length ? `问图 ${candidates.length}` : '';
    figureButton.setAttribute('aria-expanded', String(figureListOpen));
    if (!figureListOpen || !candidates.length) {
      figureList.hidden = true;
      return;
    }
    figureList.hidden = false;
    figureList.replaceChildren();
    for (const candidate of candidates) {
      const item = buttonEl('', 'pa-figure-item', () => selectFocus(candidate));
      item.append(el('span', 'pa-figure-kind', candidate.kind), el('span', 'pa-figure-caption', candidate.caption));
      const section = candidate.block.sectionTitle || candidate.block.sectionId;
      if (section) item.append(el('span', 'pa-figure-section', section));
      figureList.append(item);
    }
  }

  function toggleFigureList() {
    figureListOpen = !figureListOpen;
    renderFigures();
  }

  function selectFocus(candidate: FocusCandidate) {
    focus = {
      blockIndex: candidate.block.index,
      role: candidate.block.role === 'table' ? 'table' : 'figure',
      caption: candidate.caption,
    };
    figureListOpen = false;
    renderFigures();
    renderFocus();
    renderQuick();
    void refreshCapture();
  }

  function renderFocus() {
    focusBar.hidden = !focus;
    focusText.textContent = focus ? focusLabel(focus) : '';
    focusBar.title = focus ? '提问时只截取这个元素' : '';
  }

  function clearFocus() {
    if (!focus) return;
    focus = null;
    figureListOpen = false;
    renderFigures();
    renderFocus();
    renderQuick();
    void refreshCapture();
  }

  function updateShotButton() {
    shotButton.textContent = screenshotEnabled ? '截图 开' : '截图 关';
    shotButton.setAttribute('aria-pressed', String(screenshotEnabled));
    shotButton.title = screenshotEnabled ? '提问时截取当前网页视口' : '不发送截图，只发送页面文字';
  }

  function updateSeenText(extra = '') {
    if (!snapshot) {
      seenText.textContent = extra || '正在读取页面……';
      return;
    }
    const summary = snapshotSummary(snapshot);
    const lines = [
      `${summary.title}`,
      `位置：${summary.section || '页面顶部'} · ${summary.percent}%`,
      `内容：${summary.blocks} 块，视口内 ${summary.visibleBlocks} 块${summary.selectionChars ? `，选中 ${summary.selectionChars} 字` : ''}`,
    ];
    if (screenshot) {
      const kind = screenshot.kind === 'dom' ? '视口渲染' : screenshot.kind === 'element' ? '聚焦元素' : '布局快照';
      lines.push(`截图：${kind} ${screenshot.width}×${screenshot.height}`);
    }
    if (extra) lines.push(extra);
    seenText.textContent = lines.join('\n');
  }

  function updateContext() {
    if (!snapshot) {
      contextLineEl.textContent = '正在读取页面…';
      return;
    }
    const summary = snapshotSummary(snapshot);
    contextLineEl.textContent = contextLine(snapshot);
    contextLineEl.title = `${summary.title} · ${summary.section || '页面顶部'}`;
    updateSeenText();
    renderQuick();
    renderFigures();
    renderFocus();
  }

  async function refreshContext(capture: boolean) {
    try {
      snapshot = collectPageSnapshot();
    } catch {
      contextLineEl.textContent = '页面读取失败；仍可以提问';
      return;
    }
    if (focus) {
      const block = snapshot.blocks.find((item) => item.index === focus?.blockIndex);
      if (!block || (block.role !== 'figure' && block.role !== 'table') || block.role !== focus.role) focus = null;
    }
    updateContext();
    if (capture && screenshotEnabled) await refreshCapture();
  }

  async function captureCurrent(current: PageSnapshot): Promise<Screenshot> {
    if (focus) {
      const element = findBlockElement(focus.blockIndex);
      if (element) {
        try {
          return await captureElement(element);
        } catch {
          // fall through to the viewport image
        }
      }
      showNotice('这张图没有截出来，已改发整屏截图');
    }
    return captureScreenshot(current);
  }

  async function refreshCapture() {
    if (!screenshotEnabled) return;
    // A focus selection can land while the initial viewport capture is still
    // running. Let both finish but only the newest result reaches the panel and
    // the next request.
    const seq = ++captureSeq;
    updateShotButton();
    const current = snapshot ?? (snapshot = collectPageSnapshot());
    try {
      const next = await captureCurrent(current);
      if (seq !== captureSeq || !screenshotEnabled) return;
      screenshot = next;
      seenImage.alt = next.kind === 'element' ? '选中元素截图' : '当前页面视口截图';
      seenImage.src = next.dataUrl;
      seenImage.hidden = false;
      updateSeenText();
    } catch {
      if (seq !== captureSeq) return;
      screenshot = null;
      seenImage.hidden = true;
      updateSeenText('截图失败，发送时只带页面文字快照。');
    } finally {
      if (seq === captureSeq) updateShotButton();
    }
  }

  function renderQuick() {
    quick.replaceChildren();
    if (!snapshot) return;
    for (const item of quickPrompts(snapshot, { checkMode: chatMode === 'check', focus })) {
      quick.append(buttonEl(item.label, 'pa-quick-button', () => void send(item.question, { mode: item.mode })));
    }
  }

  function copyButton(getText: () => string, label: string): HTMLButtonElement {
    const node = buttonEl('复制', 'pa-message-copy', () => void copyMessage(getText(), node));
    node.setAttribute('aria-label', label);
    node.title = label;
    return node;
  }

  async function copyMessage(text: string, trigger: HTMLButtonElement) {
    const value = text.trim();
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      flashCopy(trigger, '已复制', true);
    } catch {
      flashCopy(trigger, '复制失败', false);
    }
  }

  function flashCopy(trigger: HTMLButtonElement, label: string, ok: boolean) {
    window.clearTimeout(Number(trigger.dataset.timer ?? 0));
    trigger.textContent = label;
    trigger.classList.toggle('pa-message-copy--done', ok);
    trigger.dataset.timer = String(
      window.setTimeout(() => {
        trigger.textContent = '复制';
        trigger.classList.remove('pa-message-copy--done');
        delete trigger.dataset.timer;
      }, 1600),
    );
  }

  function copyActions(text: () => string, label: string): HTMLElement {
    return el('div', 'pa-message-actions', copyButton(text, label));
  }

  function addUser(text: string, meta: { mode?: Mode; focus?: FocusTarget | null } = {}) {
    if (!hasMessages) {
      hasMessages = true;
      empty.hidden = true;
      renderQuick();
    }
    const message = el('article', 'pa-message pa-message--user');
    message.append(el('p', 'pa-message-text', text));
    const tags = [
      snapshot ? contextLine(snapshot) : '',
      meta.mode === 'check' ? '检验' : meta.mode === 'map' ? '概念图' : '',
      meta.focus ? focusLabel(meta.focus) : '',
    ].filter(Boolean);
    if (tags.length) message.append(el('p', 'pa-message-context', tags.join(' · ')));
    message.append(copyActions(() => text, '复制这条提问'));
    messages.append(message);
    const entry: ChatMessage = { role: 'user', text, at: Date.now(), page: currentPageRef() };
    if (meta.mode) entry.mode = meta.mode;
    if (meta.focus) entry.focus = focusLabel(meta.focus);
    chat.push(entry);
    scrollBottom();
  }

  function addAssistant(): AssistantView {
    const tools = el('div', 'pa-tools');
    const body = el('div', 'pa-answer', '正在读取页面并思考……');
    const footer = el('div', 'pa-footer');
    const node = el('article', 'pa-message pa-message--assistant', tools, body, footer);
    const entry: ChatMessage = { role: 'assistant', text: '', at: Date.now(), page: currentPageRef(), status: 'running' };
    chat.push(entry);
    const view: AssistantView = {
      node,
      tools,
      body,
      footer,
      state: emptyAssistantState(),
      blockTexts: new Map(),
      message: entry,
    };
    const copy = copyButton(() => answerCopyText(view.state.text), '复制这条回答');
    copy.hidden = true;
    view.copy = copy;
    node.append(el('div', 'pa-message-actions', copy));
    messages.append(node);
    scrollBottom();
    return view;
  }

  function renderAssistant(view: AssistantView, options: { allowLinks?: boolean } = {}) {
    const state = view.state;
    if (view.copy) view.copy.hidden = !state.text.trim();
    view.tools.replaceChildren(...state.tools.map(toolNode));
    if (state.text) {
      const blockTexts = view.blockTexts;
      const resolveBlockText =
        options.allowLinks === false
          ? undefined
          : (index: number) => {
              if (!blockTexts.has(index)) {
                const element = findBlockElement(index);
                blockTexts.set(index, element ? blockElementText(element) : null);
              }
              return blockTexts.get(index) ?? null;
            };
      view.body.innerHTML = renderMarkdown(state.text, {
        citations: state.citations,
        fences: { check: 'lab-check', concept: 'lab-concept' },
        blockText: resolveBlockText,
      });
      if (options.allowLinks !== false) {
        const jump = (index: number) => {
          if (!jumpToBlock(index)) showNotice('这一块已经不在页面上');
        };
        linkPageBlocks(view.body, jump);
        bindPageCitations(view.body, jump);
      }
      interceptCitations(view.body, location.pathname, (id) => {
        if (!jumpToSection(id)) showNotice('这一节已经不在页面上');
      });
      hydrateChecks(view.body, () => textarea.focus());
      hydrateConcepts(
        view.body,
        (section) => {
          if (!jumpToSection(section)) showNotice('这一节不在当前页面上');
        },
        { allowJump: options.allowLinks !== false },
      );
      void hydrateMermaid(view.body).then(() => scrollBottom());
    } else if (state.status === 'error') {
      view.body.textContent = state.error || '没有拿到回答。';
    } else if (state.status === 'running') {
      view.body.textContent = state.tools.length ? '正在根据工具结果整理回答……' : '正在读取页面……';
    } else if (state.status === 'done') {
      view.body.textContent = '这次运行没有留下文字回答。';
    }
    const footer: string[] = [];
    if (state.status === 'running') footer.push('处理中…');
    else if (state.status === 'done') footer.push('完成');
    else if (state.status === 'error') footer.push('未完成');
    const usage = usageLine(state.totals);
    if (usage) footer.push(usage);
    const cites = citationSummary(state.citations);
    if (cites) footer.push(cites);
    const pageCites = view.body.querySelectorAll('button.pa-cite[data-block]').length;
    if (pageCites) {
      const pageVerified = view.body.querySelectorAll('button.pa-cite--verified').length;
      footer.push(`${pageCites} 条页面引用 · ${pageVerified} 条核对通过`);
    }
    if (state.error && state.status !== 'error') footer.push(state.error);
    view.footer.replaceChildren();
    if (footer.length) view.footer.append(document.createTextNode(footer.join(' · ')));
    if (view.runId) {
      if (footer.length) view.footer.append(document.createTextNode(' · '));
      if (state.status !== 'running') {
        const replayButton = buttonEl('看这次怎么跑的', 'pa-run-replay', () => void openReplay(view.runId ?? '', replayButton));
        view.footer.append(replayButton, document.createTextNode(' · '));
      }
      const link = el('a', 'pa-run-link', '在实验台查看本次运行');
      link.href = runTraceUrl(location.origin, view.runId);
      link.target = '_blank';
      link.rel = 'noopener';
      view.footer.append(link);
    }
    view.footer.classList.toggle('pa-footer--error', Boolean(state.error));
    scrollBottom();
  }

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function setReplayVisible(value: boolean) {
    for (const node of [context, seen, messages, compose, foot]) node.hidden = value;
    replayPanel.hidden = !value;
    if (value) {
      figureListOpen = false;
      figureList.hidden = true;
      focusBar.hidden = true;
    } else {
      renderFigures();
      renderFocus();
    }
  }

  function replayNotice(message: string): HTMLElement {
    const box = el('div', 'pa-replay');
    const head = el('div', 'pa-replay-head');
    const back = buttonEl('返回对话', 'pa-head-button', () => closeReplay());
    head.append(back, el('strong', '', '这次运行'));
    box.append(head, el('p', 'pa-replay-empty', message));
    return box;
  }

  async function openReplay(id: string, trigger: HTMLElement) {
    if (replayOpen || !id) return;
    historyOpen = false;
    historyPanel.hidden = true;
    historyButton.setAttribute('aria-expanded', 'false');
    replayOpen = true;
    replayScroll = messages.scrollTop;
    replayTrigger = trigger;
    setReplayVisible(true);
    replayPanel.setAttribute('aria-busy', 'true');
    replayPanel.replaceChildren(replayNotice('正在读取运行轨迹…'));
    try {
      const raw = await labApi<unknown>(`/page/runs/${encodeURIComponent(id)}/replay`);
      if (!replayOpen) return;
      const replay = parseReplay(raw);
      if (!replay) throw new Error('回放数据无法解析');
      replayPanel.replaceChildren(renderReplay(replay, closeReplay));
    } catch (error) {
      if (!replayOpen) return;
      const failure =
        error instanceof LabError
          ? { status: error.status, notReady: error.notReady, message: error.message }
          : { status: 0, notReady: false, message: friendlyError(error) };
      replayPanel.replaceChildren(replayNotice(replayErrorText(failure, friendlyError(error))));
    } finally {
      replayPanel.removeAttribute('aria-busy');
    }
  }

  function closeReplay() {
    if (!replayOpen) return;
    replayOpen = false;
    replayPanel.replaceChildren();
    setReplayVisible(false);
    messages.scrollTop = replayScroll;
    const trigger = replayTrigger;
    replayTrigger = null;
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  let noticeTimer = 0;

  function showNotice(text: string) {
    let notice = panel.querySelector<HTMLElement>('.pa-notice');
    if (!notice) {
      notice = el('div', 'pa-notice');
      notice.setAttribute('role', 'status');
      panel.append(notice);
    }
    notice.textContent = text;
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      if (notice) notice.hidden = true;
    }, 2400);
  }

  function updateComposer() {
    const locked = busy || restoring;
    sendButton.hidden = busy;
    sendButton.disabled = locked || !textarea.value.trim();
    stopButton.hidden = !busy;
    modelSelect.disabled = locked;
    reasoningSelect.disabled = locked;
    modeButton.disabled = locked;
    textarea.disabled = locked;
  }

  function setBusy(value: boolean) {
    busy = value;
    updateComposer();
  }

  async function stop() {
    if (!busy || !runId) return;
    stopButton.disabled = true;
    stopButton.textContent = '停止中…';
    try {
      await labApi(`/runs/${encodeURIComponent(runId)}/cancel`, {});
    } catch (error) {
      stopButton.title = friendlyError(error);
    }
  }

  async function send(preset?: string, options: { mode?: Mode } = {}) {
    if (busy || restoring) return;
    const question = (preset ?? textarea.value).trim();
    if (!question) return;
    const sendSessionId = sessionId;
    if (!preset) clearInput();
    updateComposer();
    await refreshContext(true);
    if (!snapshot) return;
    const mode = resolveSendMode(question, chatMode, snapshot.pageType, options.mode);
    const pageInfo = { pageTitle: snapshot.title, section: snapshotSummary(snapshot).section };
    addUser(question, { mode, focus });
    const view = addAssistant();
    // 先把这一轮提问与占位写进本机：请求途中刷新或切页，问题不会凭空消失。
    persistChat();
    setBusy(true);
    stopButton.disabled = false;
    stopButton.textContent = '停止';
    try {
      const { body, droppedScreenshot } = buildPageRequest({
        question,
        snapshot,
        screenshot: screenshot?.dataUrl ?? null,
        modelProfile: selectedModel,
        reasoningLevel: selectedReasoning,
        sessionId: sendSessionId,
        sendScreenshot: screenshotEnabled,
        mode,
        focus,
      });
      if (droppedScreenshot) view.state.error = '截图过大，本次只发送页面文字。';
      const data = await labApi<{
        run_id: string;
        screenshot_url: string;
        vision: boolean;
        model: string;
      }>('/page/runs', body);
      runId = data.run_id;
      view.runId = data.run_id;
      view.state = { ...view.state, status: 'running' };
      if (view.message) view.message.runId = data.run_id;
      persistChat();
      remember({
        runId: data.run_id,
        sessionId: sendSessionId,
        turns: 0,
        question,
        status: 'running',
        error: '',
        at: Date.now(),
        ...pageInfo,
        promptTokens: 0,
        completionTokens: 0,
      });
      renderAssistant(view);
      closeStream = streamRun(
        data.run_id,
        (event: LabEvent) => {
          view.state = applyAssistantEvent(view.state, event);
          if (event.type === 'run_end') {
            closeStream?.();
            closeStream = null;
            setBusy(false);
            runId = null;
            syncEntry(view);
            persistChat();
            remember({
              runId: data.run_id,
              sessionId: sendSessionId,
              turns: 0,
              question,
              status: event.status,
              error: event.error ?? '',
              at: Date.now(),
              ...pageInfo,
              promptTokens: Number(event.totals?.prompt_tokens ?? 0) || 0,
              completionTokens: Number(event.totals?.completion_tokens ?? 0) || 0,
            });
          }
          renderAssistant(view);
        },
        (message) => {
          view.state = { ...view.state, status: 'error', error: message };
          renderAssistant(view);
          setBusy(false);
          runId = null;
          syncEntry(view);
          persistChat();
          remember({
            runId: data.run_id,
            sessionId: sendSessionId,
            turns: 0,
            question,
            status: 'error',
            error: message,
            at: Date.now(),
            ...pageInfo,
            promptTokens: 0,
            completionTokens: 0,
          });
        },
      );
    } catch (error) {
      const message = friendlyError(error);
      view.state = { ...view.state, status: 'error', error: message };
      renderAssistant(view);
      setBusy(false);
      runId = null;
      syncEntry(view);
      persistChat();
      remember({
        runId: '',
        sessionId: sendSessionId,
        turns: 0,
        question,
        status: 'error',
        error: message,
        at: Date.now(),
        ...pageInfo,
        promptTokens: 0,
        completionTokens: 0,
      });
    }
  }

  function rebuildModels() {
    const choices = modelChoices(catalog);
    selectedModel = resolveModelChoice(choices, savedModel);
    modelSelect.replaceChildren(
      ...choices.map((choice) => {
        const option = el('option', '', choice.label);
        option.value = choice.value;
        option.title = choice.meta;
        return option;
      }),
    );
    modelSelect.value = selectedModel;
    rebuildReasoning(choices.find((choice) => choice.value === selectedModel)?.profile?.reasoning ?? null);
    updateModelHint();
    updateSetup();
  }

  function rebuildReasoning(config: ModelProfile['reasoning'] | null) {
    const choices = reasoningChoices(config);
    reasoningField.hidden = choices.length === 0;
    selectedReasoning = resolveReasoningChoice(choices, savedReasoning);
    reasoningSelect.replaceChildren(
      ...choices.map((choice) => {
        const option = el('option', '', choice.label);
        option.value = choice.value;
        option.title = choice.meta;
        return option;
      }),
    );
    reasoningSelect.value = selectedReasoning;
    syncReasoningTitle();
  }

  function syncReasoningTitle() {
    const option = reasoningSelect.selectedOptions[0];
    reasoningSelect.title = option?.title || '按所选模型档案的默认思考强度';
  }

  function updateModelHint() {
    const choices = modelChoices(catalog);
    const choice = choices.find((item) => item.value === selectedModel) ?? choices[0];
    const image = choice?.profile?.input_types.includes('image');
    hint.textContent = image ? '视觉模型 · 会收到截图' : '文本模型 · 只读页面快照';
    hint.title = choice?.meta ?? '';
  }

  /** 只在“没有档案且 .env 也没配”时出现；目录未加载或读取失败时保持隐藏。 */
  function updateSetup() {
    setup.hidden = !needsModelSetup(catalog);
  }

  function loadModels() {
    if (catalog !== null) return;
    void labApi<ModelCatalog>('/models')
      .then((data) => {
        catalog = data;
        rebuildModels();
      })
      .catch(() => {
        catalog = null;
        rebuildModels();
        hint.textContent = '模型列表未加载，使用默认模型';
      });
  }

  textarea.addEventListener('input', () => {
    autoSizeInput();
    updateComposer();
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send();
    }
  });
  sendButton.addEventListener('click', () => void send());
  modelSelect.addEventListener('change', () => {
    savedModel = modelSelect.value;
    selectedModel = modelSelect.value;
    writeStore(MODEL_KEY, savedModel);
    const choice = modelChoices(catalog).find((item) => item.value === selectedModel);
    rebuildReasoning(choice?.profile?.reasoning ?? null);
    updateModelHint();
  });
  reasoningSelect.addEventListener('change', () => {
    selectedReasoning = reasoningSelect.value;
    savedReasoning = selectedReasoning;
    writeStore(REASONING_KEY, savedReasoning);
    syncReasoningTitle();
  });
  document.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const action = escapeAction(event.key, open, fullscreen, replayOpen ? 'replay' : 'chat');
    if (action === 'back') {
      event.preventDefault();
      closeReplay();
    } else if (action === 'collapse') {
      event.preventDefault();
      setFullscreen(false);
    } else if (action === 'close') {
      close();
    }
  });
  // Fullscreen behaves like a modal: Tab stays on the assistant's own controls.
  document.addEventListener('keydown', (event) => {
    if (!fullscreen || event.key !== 'Tab' || event.isComposing) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.hidden && node.getClientRects().length > 0,
    );
    if (items.length < 2) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (open) autoSizeInput();
  });
  // 另一标签页接着问了：本页空闲时跟着换成同一份对话，避免两页显示不同的历史。
  window.addEventListener('storage', (event) => {
    if (event.key !== CHAT_KEY || busy || restoring || replayOpen) return;
    if (event.newValue === null) {
      chat = [];
      chatUpdatedAt = 0;
      renderChat();
      return;
    }
    const next = parseChat(event.newValue);
    if (!next || next.updatedAt <= chatUpdatedAt) return;
    sessionId = next.sessionId;
    chat = next.messages;
    chatUpdatedAt = next.updatedAt;
    renderChat();
  });

  // 从设置页返回（bfcache）时目录可能已经变化：清缓存后重新读取，提示随之更新。
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    catalog = null;
    if (open) loadModels();
  });

  updateShotButton();
  updateModeButton();
  updateModelHint();
  rebuildModels();
  // 刷新或切页后按本机快照重建对话；面板原来是打开的，切过来仍然打开。
  if (loadChat() && readSession(OPEN_KEY) === '1') show();
  if (document.querySelector('.personal-anno-toggle')) document.body.classList.add('pa-has-anno');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
