// "提问" tab: a question, the knob form, optional follow-up in the same
// session, and the live run view underneath.
import { el } from '../dom';
import { labApi } from './api';
import { createKnobForm, type KnobForm } from './knobs-form';
import { createRunView } from './run-view';
import { button, knobCatalog, modelProfiles, newSessionId, notice } from './ui';

const SESSION_KEY = 'lab-session';
const EXAMPLES = [
  'Agent 的核心公式是什么？三个组成部分分别起什么作用？',
  '为什么说保持提示词前缀稳定能降低成本？',
  '上下文压缩有哪些做法？各自会丢掉什么？',
  'RAG 和 Agentic RAG 的区别是什么？',
];

function storedSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode: the session simply is not remembered across reloads.
  }
}

export function mountAsk(host: HTMLElement) {
  const run = createRunView();
  const question = el('textarea', 'lab-input lab-question');
  question.rows = 3;
  question.placeholder = '问一个关于这本书的问题，例如：为什么说上下文决定了 Agent 的能力上限？';
  const examples = el('div', 'lab-examples', ...EXAMPLES.map((text) => button(text, 'lab-chip', () => (question.value = text))));

  const follow = el('input');
  follow.type = 'checkbox';
  let session = storedSession();
  follow.checked = Boolean(session);
  const sessionLabel = el('span', 'lab-muted');
  const showSession = () => (sessionLabel.textContent = follow.checked && session ? `会话 ${session}` : '');
  follow.addEventListener('change', () => {
    session = follow.checked ? session ?? newSessionId() : null;
    storeSession(session);
    showSession();
  });
  const newSession = button('新会话', 'lab-btn lab-btn--small', () => {
    session = follow.checked ? newSessionId() : null;
    storeSession(session);
    showSession();
  });
  showSession();

  const runButton = button('运行', 'lab-btn lab-btn--primary', () => void start());
  const cancelButton = button('取消', 'lab-btn', () => void cancel());
  cancelButton.disabled = true;
  const status = el('p', 'lab-error');
  status.hidden = true;
  const knobHost = el('details', 'lab-knob-wrap', el('summary', '', '开关'));
  let form: KnobForm | undefined;
  let currentRun: string | undefined;

  const updateSummary = () => {
    const changed = form ? Object.keys(form.overrides()).length : 0;
    knobHost.querySelector('summary')!.textContent = changed ? `开关（已改 ${changed} 项）` : '开关（全部默认）';
  };

  Promise.all([knobCatalog(), modelProfiles().catch(() => ({ version: 1, default: null, profiles: [], warnings: [] }))])
    .then(([catalog, models]) => {
      form = createKnobForm(catalog, models.profiles);
      form.onChange(updateSummary);
      knobHost.before(form.nav);
      knobHost.append(form.element);
      updateSummary();
    })
    .catch((error) => knobHost.append(notice(error, '开关')));

  async function start() {
    const text = question.value.trim();
    if (!text) {
      question.focus();
      return;
    }
    status.hidden = true;
    runButton.disabled = true;
    try {
      const body = { question: text, config: form?.overrides() ?? {}, session_id: follow.checked ? session : null };
      const { run_id } = await labApi<{ run_id: string }>('/runs', body);
      currentRun = run_id;
      cancelButton.disabled = false;
      await run.load(run_id);
    } catch (error) {
      status.hidden = false;
      status.textContent = error instanceof Error ? error.message : String(error);
      runButton.disabled = false;
    }
  }

  async function cancel() {
    if (!currentRun) return;
    cancelButton.disabled = true;
    try {
      await labApi(`/runs/${currentRun}/cancel`, {});
    } catch {
      // Already finished: nothing to cancel.
    }
  }

  run.onEnd(() => {
    runButton.disabled = false;
    cancelButton.disabled = true;
  });

  question.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void start();
  });

  const formBox = el(
    'div',
    'lab-ask-form',
    question,
    examples,
    el(
      'div',
      'lab-ask-row',
      el('label', 'lab-check', follow, '续问（同一会话，带上以前的问答）'),
      newSession,
      sessionLabel,
      el('span', 'lab-spacer'),
      cancelButton,
      runButton,
    ),
    status,
    knobHost,
  );
  host.append(el('div', 'lab-ask', formBox, run.element));
  return () => run.destroy();
}
