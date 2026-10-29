// Requirement 013: page orchestrator. The reader owns the session; this module
// wires the setup form, the chat, the stateless lab calls and persistence.
import { InterviewChat } from './interview-chat';
import {
  createSession,
  deleteSession,
  fetchModels,
  getSession,
  interviewReport,
  interviewTurn,
  listSessions,
  saveSession,
  type InterviewBootstrap,
  type InterviewReportBody,
  type InterviewSession,
  type InterviewSlot,
  type InterviewTurnBody,
  type ResumeSignals,
} from './interview-api';
import { modelButtonLabel, modelChoices, resolveModelChoice, type ModelChoice } from './interview-model';
import { mountModelMenu, type ModelMenu } from './interview-model-menu';
import { enrichReport, renderReport } from './interview-report';
import {
  fillModelSelect,
  readFocusTopics,
  readResumeSignalsFromStorage,
  readSetupSettings,
  renderHistory,
  setSetupStatus,
  updateTopicCount,
} from './interview-setup';

const MODEL_KEY = 'harness-interview:model';
const TOAST_MS = 3200;

type Pending =
  | { kind: 'turn'; body: InterviewTurnBody; candidateId: string }
  | { kind: 'report'; body: InterviewReportBody };

function readBootstrap(): InterviewBootstrap | null {
  const node = document.querySelector<HTMLScriptElement>('[data-iv-bootstrap]');
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || '{}') as InterviewBootstrap;
  } catch {
    return null;
  }
}

function pick<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`面试页面缺少 ${selector}`);
  return node;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readSavedModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeSavedModel(value: string) {
  try {
    localStorage.setItem(MODEL_KEY, value);
  } catch {
    // Private mode or storage disabled: the in-memory selection still works.
  }
}

function init() {
  const bootstrap = readBootstrap();
  if (!bootstrap) return;
  const setupRoot = pick<HTMLElement>('[data-iv-setup]');
  const historySection = pick<HTMLElement>('[data-iv-history-section]');
  const sessionSection = pick<HTMLElement>('[data-iv-session]');
  const reportSection = pick<HTMLElement>('[data-iv-report]');
  const reportBody = pick<HTMLElement>('[data-iv-report-body]');
  const form = pick<HTMLFormElement>('[data-iv-form]');
  const modelSelect = pick<HTMLSelectElement>('[data-iv-model]');
  const modelNote = pick<HTMLElement>('[data-iv-model-note]');
  const modelError = pick<HTMLElement>('[data-iv-model-error]');
  const topics = pick<HTMLElement>('[data-iv-topics]');
  const topicCount = pick<HTMLElement>('[data-iv-topic-count]');
  const resumeBox = pick<HTMLElement>('[data-iv-resume-signals]');
  const useResume = pick<HTMLInputElement>('[data-iv-use-resume]');
  const resumeText = pick<HTMLElement>('[data-iv-resume-text]');
  const resumeLine = pick<HTMLElement>('[data-iv-resume-line]');
  const startButton = pick<HTMLButtonElement>('[data-iv-start]');
  const setupStatus = pick<HTMLElement>('[data-iv-setup-status]');
  const toastNode = pick<HTMLElement>('[data-iv-toast]');

  let session: InterviewSession | null = null;
  let choices: ModelChoice[] = modelChoices(null);
  let modelWarnings: string[] = [];
  let selectedModel = resolveModelChoice(choices, readSavedModel());
  let modelMenu: ModelMenu | null = null;
  let loading = false;
  let pending: Pending | null = null;
  let abort: AbortController | null = null;
  let lastCandidateId: string | null = null;
  let dirty = false;
  let resumeSignals: ResumeSignals | null = null;
  let toastTimer: number | undefined;

  const toast = (message: string) => {
    toastNode.textContent = message;
    toastNode.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastNode.hidden = true;
    }, TOAST_MS);
  };

  const setModelError = (message = '') => {
    modelError.textContent = message;
    modelError.hidden = !message;
  };

  const updateSideModel = () => {
    const choice = choices.find((item) => item.value === selectedModel);
    chat.setSelectedModel(choice ? modelButtonLabel(choice) : '默认模型');
  };

  const saveModel = () => writeSavedModel(selectedModel);

  const applyModel = (value: string) => {
    selectedModel = resolveModelChoice(choices, value);
    saveModel();
    fillModelSelect(modelSelect, choices, selectedModel);
    modelMenu?.setValue(selectedModel);
    updateSideModel();
  };

  const persist = async () => {
    if (!session) return;
    try {
      const summary = await saveSession(session.id, {
        turns: session.turns,
        plan: session.plan.map((slot) => ({ id: slot.id, status: slot.status })),
        status: session.status,
        ...(session.report ? { report: session.report } : {}),
      });
      session.updatedAt = summary.updatedAt;
      dirty = false;
      chat.clearSaveWarning();
    } catch (error) {
      dirty = true;
      chat.showSaveWarning(`记录未保存：${errorText(error)}`);
      toast('回答已生成，但记录没有保存；点「重试保存」。');
    }
  };

  const updateUrl = (id?: string) => {
    const next = id ? `${location.pathname}?session=${encodeURIComponent(id)}` : location.pathname;
    window.history.replaceState(null, '', next);
  };

  const showSetup = () => {
    chat.stopTimer();
    session = null;
    pending = null;
    loading = false;
    lastCandidateId = null;
    dirty = false;
    setupRoot.hidden = false;
    historySection.hidden = false;
    sessionSection.hidden = true;
    reportSection.hidden = true;
    updateUrl();
    modelMenu?.close();
    void refreshHistory();
  };

  const showReport = () => {
    if (!session) return;
    chat.stopTimer();
    setupRoot.hidden = true;
    historySection.hidden = true;
    sessionSection.hidden = true;
    reportSection.hidden = false;
    renderReport(reportBody, session, {
      onRetry: () => void regenerate(),
      onNew: () => showSetup(),
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const startOpening = async () => {
    if (!session) return;
    const first = session.plan[0];
    if (!first) return;
    const body = buildBody(null, first, false);
    pending = { kind: 'turn', body, candidateId: '' };
    await callTurn(body);
  };

  const openSession = async (next: InterviewSession) => {
    session = next;
    pending = null;
    loading = false;
    abort = null;
    lastCandidateId = null;
    dirty = false;
    selectedModel = resolveModelChoice(choices, next.settings.modelProfile);
    fillModelSelect(modelSelect, choices, selectedModel);
    setupRoot.hidden = true;
    historySection.hidden = true;
    reportSection.hidden = true;
    sessionSection.hidden = false;
    updateUrl(next.id);
    ensureModelMenu();
    modelMenu?.setValue(selectedModel);
    chat.setSession(next);
    updateSideModel();
    if (next.report || next.status === 'finished') {
      showReport();
      return;
    }
    if (!next.turns.length) {
      await startOpening();
    } else {
      chat.setStatus('从上次的环节继续。');
    }
  };

  const nextTurnId = () => {
    if (!session) return 't1';
    const max = session.turns.reduce((value, turn) => {
      const number = Number(turn.id.replace(/^t/, ''));
      return Number.isFinite(number) ? Math.max(value, number) : value;
    }, 0);
    return `t${max + 1}`;
  };

  const addCandidate = (text: string, skipped: boolean) => {
    if (!session) return '';
    const id = nextTurnId();
    session.turns.push({
      id,
      role: 'candidate',
      text,
      at: new Date().toISOString(),
      ...(skipped ? { skipped: true } : {}),
    });
    lastCandidateId = id;
    chat.clearInput();
    chat.render(true);
    return id;
  };

  const hasFollowup = (slotId: string) =>
    Boolean(session?.turns.some((turn) => turn.role === 'interviewer' && turn.slot === slotId && turn.followup));

  const activeSlot = (): InterviewSlot | null => {
    if (!session) return null;
    return session.plan.find((slot) => slot.status === 'active')
      ?? session.plan.find((slot) => slot.status === 'pending')
      ?? null;
  };

  const nextPendingAfter = (slot: InterviewSlot): InterviewSlot | null => {
    if (!session) return null;
    const index = session.plan.findIndex((item) => item.id === slot.id);
    return session.plan.slice(index + 1).find((item) => item.status === 'pending') ?? null;
  };

  const buildBody = (
    answeredSlot: InterviewSlot | null,
    nextSlot: InterviewSlot | null,
    skipped: boolean,
  ): InterviewTurnBody => {
    if (!session) throw new Error('还没有面试');
    return {
      settings: {
        role: session.settings.role,
        round: session.settings.round,
        level: session.settings.level,
        mode: session.settings.mode,
        questionCount: session.settings.questionCount,
      },
      profile: {
        brief: session.profile.brief,
        weakTopics: session.profile.exam?.weakTopics.map((topic) => topic.id) ?? [],
      },
      plan: session.plan,
      answeredSlot,
      nextSlot,
      transcript: session.turns.map(({ role, text, feedback, skipped }) => ({
        role,
        text,
        ...(feedback ? { feedback } : {}),
        ...(skipped ? { skipped: true } : {}),
      })),
      followupAllowed: answeredSlot ? !hasFollowup(answeredSlot.id) : false,
      skipped,
      modelProfile: selectedModel,
    };
  };

  const updatePlan = (body: InterviewTurnBody, result: { followup: boolean; closing: boolean }) => {
    if (!session) return;
    if (body.answeredSlot) {
      const answered = session.plan.find((slot) => slot.id === body.answeredSlot?.id);
      if (answered && !result.followup) {
        answered.status = body.skipped ? 'skipped' : 'done';
        if (body.nextSlot) {
          const next = session.plan.find((slot) => slot.id === body.nextSlot?.id);
          if (next) next.status = 'active';
        }
      }
    } else if (body.nextSlot) {
      const next = session.plan.find((slot) => slot.id === body.nextSlot?.id);
      if (next) next.status = 'active';
    }
    if (result.closing) {
      for (const slot of session.plan) {
        if (slot.status === 'active') slot.status = 'done';
      }
    }
  };

  const callTurn = async (body: InterviewTurnBody) => {
    if (!session) return;
    loading = true;
    chat.clearError();
    chat.setLoading(true);
    abort = new AbortController();
    try {
      const result = await interviewTurn(body, abort.signal);
      const slotId = result.followup
        ? body.answeredSlot?.id
        : body.nextSlot?.id ?? body.answeredSlot?.id;
      session.turns.push({
        id: nextTurnId(),
        role: 'interviewer',
        text: result.text,
        at: new Date().toISOString(),
        ...(slotId ? { slot: slotId } : {}),
        focus: result.focus,
        feedback: result.feedback,
        followup: result.followup,
        closing: result.closing,
        model: result.model,
        modelProfile: result.modelProfile,
        usage: result.usage,
        latency_ms: result.latency_ms,
        cost: result.cost,
      });
      updatePlan(body, result);
      pending = null;
      lastCandidateId = null;
      await persist();
      loading = false;
      chat.setLoading(false);
      chat.render(true);
      const remaining = session.plan.some((slot) => slot.status === 'pending' || slot.status === 'active');
      chat.setStatus(
        result.closing || !remaining
          ? '面试结束。点「结束面试，生成复盘」整理这一场。'
          : '',
      );
    } catch (error) {
      loading = false;
      chat.setLoading(false);
      const aborted = (error as { name?: string } | null)?.name === 'AbortError';
      chat.showError(
        aborted
          ? '已停止等待。服务端可能还在生成，但本页不再等待；可以重试或撤销这条回答。'
          : `模型调用失败：${errorText(error)}`,
        { retry: true, undo: Boolean(lastCandidateId) },
      );
    } finally {
      abort = null;
    }
  };

  const sendAnswer = async (text: string) => {
    if (!session || loading) return;
    if (session.status !== 'active' || session.report) {
      showReport();
      return;
    }
    if (pending) {
      toast('上一轮还没完成；先重试或撤销这条回答。');
      return;
    }
    const answered = activeSlot();
    if (!answered) {
      toast('没有待答环节；可以点「结束面试」生成复盘。');
      return;
    }
    const next = nextPendingAfter(answered);
    const id = addCandidate(text, false);
    const body = buildBody(answered, next, false);
    pending = { kind: 'turn', body, candidateId: id };
    await callTurn(body);
  };

  const skipAnswer = async () => {
    if (!session || loading || pending) return;
    if (!window.confirm('跳过当前环节？复盘会把它记为证据不足。')) return;
    const answered = activeSlot();
    if (!answered) return;
    const next = nextPendingAfter(answered);
    const id = addCandidate('这题我暂时没有把握，想先跳过。', true);
    const body = buildBody(answered, next, true);
    pending = { kind: 'turn', body, candidateId: id };
    await callTurn(body);
  };

  const retry = async () => {
    if (!pending) return;
    if (pending.kind === 'turn') {
      chat.clearError();
      await callTurn(pending.body);
    } else {
      chat.clearError();
      await callReport(pending.body, true);
    }
  };

  const undo = async () => {
    if (!session || !lastCandidateId) return;
    session.turns = session.turns.filter((turn) => turn.id !== lastCandidateId);
    lastCandidateId = null;
    pending = null;
    chat.clearError();
    chat.render(true);
    await persist();
    chat.focusInput();
  };

  const buildReportBody = (): InterviewReportBody => ({
    ...buildBody(null, null, false),
    reviewOptions: bootstrap.resources.map((resource) => ({ id: resource.id, label: resource.label })),
  });

  const callReport = async (body: InterviewReportBody, regenerating: boolean) => {
    if (!session) return;
    loading = true;
    if (!regenerating) chat.setLoading(true);
    if (!regenerating) chat.setStatus('正在整理复盘……');
    try {
      const result = await interviewReport(body);
      session.report = enrichReport(result.report, bootstrap.resources);
      session.status = 'finished';
      pending = null;
      await persist();
      loading = false;
      showReport();
      if (!result.parsed) toast('复盘没有按结构输出，已保留原文；可以重新生成。');
    } catch (error) {
      loading = false;
      if (!regenerating) chat.setLoading(false);
      if (regenerating) {
        toast(`重新生成复盘失败：${errorText(error)}`);
      } else {
        chat.showError(`复盘生成失败：${errorText(error)}`, { retry: true, undo: false });
      }
    }
  };

  const finish = async () => {
    if (!session || loading) return;
    if (session.report || session.status === 'finished') {
      showReport();
      return;
    }
    const answered = session.turns.filter((turn) => turn.role === 'candidate').length;
    if (!answered) {
      toast('先回答至少一题，再生成复盘。');
      return;
    }
    const remaining = session.plan.filter(
      (slot) => slot.status === 'pending' || slot.status === 'active',
    ).length;
    if (!window.confirm(remaining ? `还有 ${remaining} 个环节没完成，按已有回答生成复盘？` : '生成面试复盘？')) {
      return;
    }
    const body = buildReportBody();
    pending = { kind: 'report', body };
    await callReport(body, false);
  };

  const regenerate = async () => {
    if (!session || loading) return;
    const message = session.report ? '重新生成复盘？当前复盘会被覆盖。' : '生成面试复盘？';
    if (!window.confirm(message)) return;
    const body = buildReportBody();
    pending = { kind: 'report', body };
    await callReport(body, true);
  };

  const refreshHistory = async () => {
    try {
      const data = await listSessions();
      renderHistory(historySection, data.sessions, (id) => void removeSession(id));
    } catch (error) {
      toast(`面试记录读取失败：${errorText(error)}`);
    }
  };

  const removeSession = async (id: string) => {
    if (!window.confirm('删除这条面试记录？删除后不可恢复。')) return;
    try {
      await deleteSession(id);
      if (session?.id === id) showSetup();
      else await refreshHistory();
      toast('已删除。');
    } catch (error) {
      toast(`删除失败：${errorText(error)}`);
    }
  };

  const exit = () => {
    if (!session) {
      showSetup();
      return;
    }
    if (session.status === 'active' && session.turns.length
      && !window.confirm('离开这场面试？记录会保留，可从「面试记录」继续。')) {
      return;
    }
    showSetup();
  };

  const ensureModelMenu = () => {
    if (modelMenu) {
      modelMenu.setChoices(choices);
      modelMenu.setValue(selectedModel);
      return;
    }
    const host = sessionSection.querySelector<HTMLElement>('[data-iv-model-host]');
    if (!host) return;
    modelMenu = mountModelMenu({
      host,
      choices,
      value: selectedModel,
      onChange: (value) => applyModel(value),
      settingsHref: bootstrap.settingsHref,
      warnings: modelWarnings,
    });
  };

  const loadModels = async () => {
    try {
      const catalog = await fetchModels();
      choices = modelChoices(catalog);
      modelWarnings = catalog.warnings ?? [];
      const defaultProfile = catalog.profiles.find((profile) => profile.id === catalog.default);
      modelNote.textContent = catalog.profiles.length
        ? `已读取 ${catalog.profiles.length} 个模型档案；默认：${defaultProfile?.name ?? '.env'}。`
        : '还没有模型档案，使用 .env 默认模型；可以在『设置』里添加模型档案。';
      setModelError('');
    } catch (error) {
      choices = modelChoices(null);
      modelWarnings = [];
      modelNote.textContent = '模型档案读取失败；默认模型仍可尝试。';
      setModelError(
        `模型档案读取失败：${errorText(error)}。在 agent-lab 目录运行 uv run python -m agent_lab serve --port 4330 后刷新。`,
      );
    }
    selectedModel = resolveModelChoice(choices, session?.settings.modelProfile || selectedModel);
    fillModelSelect(modelSelect, choices, selectedModel);
    ensureModelMenu();
    modelMenu?.setValue(selectedModel);
    updateSideModel();
  };

  const chat = new InterviewChat(sessionSection, {
    onSend: (text) => void sendAnswer(text),
    onStop: () => {
      abort?.abort();
      chat.setStatus('正在停止等待……');
    },
    onSkip: () => void skipAnswer(),
    onEnd: () => void finish(),
    onExit: exit,
    onRetry: () => void retry(),
    onUndo: () => void undo(),
    onSaveRetry: () => void persist(),
  });

  try {
    resumeSignals = readResumeSignalsFromStorage(window.localStorage);
  } catch {
    resumeSignals = null;
  }
  if (resumeSignals) {
    resumeBox.hidden = false;
    resumeText.textContent = `检测到简历指南的本机记录：自检 ${resumeSignals.selfCheck}/10、30 天计划 ${resumeSignals.planDone}/${resumeSignals.planTotal}。`;
    resumeLine.textContent = `简历自检：${resumeSignals.selfCheck}/10 · 30 天计划 ${resumeSignals.planDone}/${resumeSignals.planTotal}。`;
  }

  updateTopicCount(topics, topicCount);
  topics.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.matches('[data-iv-topic]') && input.checked && readFocusTopics(topics).length > 4) {
      input.checked = false;
      toast('重点专题最多选 4 个。');
    }
    updateTopicCount(topics, topicCount);
  });
  modelSelect.addEventListener('change', () => applyModel(modelSelect.value));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      if (loading) return;
      let settings;
      try {
        settings = readSetupSettings(form);
      } catch (error) {
        setSetupStatus(setupStatus, errorText(error), true);
        return;
      }
      startButton.disabled = true;
      setSetupStatus(setupStatus, '正在创建面试记录……');
      try {
        const created = await createSession(
          settings,
          useResume.checked ? resumeSignals : null,
        );
        selectedModel = resolveModelChoice(choices, created.settings.modelProfile || selectedModel);
        saveModel();
        await openSession(created);
        setSetupStatus(setupStatus, '');
      } catch (error) {
        setSetupStatus(setupStatus, `创建失败：${errorText(error)}`, true);
        toast('面试没有创建成功，检查实验台服务后重试。');
      } finally {
        startButton.disabled = false;
      }
    })();
  });

  renderHistory(historySection, bootstrap.sessions, (id) => void removeSession(id));
  const modelsReady = loadModels();
  void (async () => {
    await modelsReady;
    const requested = new URLSearchParams(location.search).get('session');
    if (requested) {
      try {
        await openSession(await getSession(requested));
      } catch (error) {
        setSetupStatus(setupStatus, `面试记录读取失败：${errorText(error)}`, true);
        toast('这条面试记录没有打开；可以从下方历史记录重新进入。');
      }
    } else if (bootstrap.session) {
      await openSession(bootstrap.session);
    } else {
      setSetupStatus(setupStatus, '模型调用发生在你点击开始或发送之后，不会后台自动运行。');
    }
  })();

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
