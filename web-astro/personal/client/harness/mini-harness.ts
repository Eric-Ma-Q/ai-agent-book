// Requirement 009: client-side workbench. Everything is rendered from the
// deterministic engine in harness/mini-harness/engine.mjs; no fetch, storage or
// real command execution. Data is inserted with textContent, never as markup.

import {
  DEFAULT_OPTIONS,
  EVAL_CASES,
  SCENARIOS,
  STAGES,
  estimateTokens,
  runEvals,
  simulate,
} from '../../harness/mini-harness/engine.mjs';

type Stage = {
  id: string;
  name: string;
  short: string;
  file: string;
  question: string;
  how: string;
  cost: string;
  code: string;
  events: string[];
};
type EvalRow = {
  id: string;
  task: string;
  instruction: string;
  passed: boolean;
  steps: number;
  toolCalls: number;
  tokens: number;
  note: string;
  expected: unknown;
  check: string;
};
type Scenario = {
  id: string;
  title: string;
  badge?: string;
  task: string;
  description: string;
  defaults: Partial<Options>;
};
type Options = {
  permissions: 'strict' | 'open';
  contextLimit: number;
  spillChars: number;
  subagent: boolean;
  memoryGate: boolean;
  maxSteps: number;
};
type Run = {
  scenario: { id: string; title: string; task: string };
  options: Options;
  decisions: Record<string, string>;
  events: SimEvent[];
  pendingAsk: null | {
    key: string;
    tool: string;
    arguments: Record<string, unknown>;
    reason: string;
    source: string;
    eventIndex: number;
  };
  summary: null | {
    content: string;
    steps: number;
    toolCalls: number;
    tokens: number;
    compactions: number;
    stopped: string;
    taint: string[];
    artifacts: { path: string; bytes: number; lines: number }[];
    memory: { entries: number; drafts: number; outcome: string | null };
    session: { id: string; path: string; count: number; jsonl: string };
    outcomes: Record<string, string | null>;
  };
  workspace: Record<string, string>;
  memory: { index: string; entries: MemoryEntry[]; drafts: MemoryEntry[] };
  session: { id: string; path: string; count: number; records: unknown[] };
};
type MemoryEntry = {
  category: string;
  name: string;
  content: string;
  created: string;
  sourceSession: string;
  tainted: boolean;
  draft: boolean;
  path: string;
};
type SimEvent = {
  id: number;
  index: number;
  round: number;
  stage: string;
  kind: string;
  scope: 'main' | 'subagent' | 'system';
  tone: 'info' | 'ok' | 'warn' | 'deny' | 'model' | 'accent';
  title: string;
  summary: string;
  detail: Record<string, any>;
  snapshot: {
    step: number;
    toolCalls: number;
    tokens: number;
    compactions: number;
    stopped: string | null;
    round: number;
    messages: Message[];
    files: Record<string, string>;
    artifacts: { path: string; bytes: number; lines: number; content: string; tool: string }[];
    memory: { index: string; entries: MemoryEntry[]; drafts: MemoryEntry[] };
    session: { id: string; path: string; count: number; lastRecords: Record<string, unknown>[] };
    taint: string[];
    subagentRuns: { steps: number; toolCalls: number; tokens: number; summary: string }[];
    systemPrompt: string;
  };
};
type Message = {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stageById = new Map<string, Stage>((STAGES as Stage[]).map((stage) => [stage.id, stage]));

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string | number,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function scrollTo(node: Element | null) {
  node?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function formatBytes(bytes: number) {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function roleLabel(role: string) {
  if (role === 'system') return 'system';
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool') return 'tool';
  return role;
}

function mount(root: HTMLElement) {
  const query = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const scenarios = SCENARIOS as Scenario[];

  const scenarioList = query<HTMLElement>('[data-mh-scenarios]')!;
  const optionsBox = query<HTMLElement>('[data-mh-options]')!;
  const stepButton = query<HTMLButtonElement>('[data-mh-step]')!;
  const playButton = query<HTMLButtonElement>('[data-mh-play]')!;
  const resetButton = query<HTMLButtonElement>('[data-mh-reset]')!;
  const jumpButton = query<HTMLButtonElement>('[data-mh-jump]')!;
  const backButton = query<HTMLButtonElement>('[data-mh-back]')!;
  const speedSelect = query<HTMLSelectElement>('[data-mh-speed]')!;
  const timeline = query<HTMLOListElement>('[data-mh-timeline]')!;
  const timelineEmpty = query<HTMLElement>('[data-mh-timeline-empty]')!;
  const currentStage = query<HTMLElement>('[data-mh-current-stage]')!;
  const currentTitle = query<HTMLElement>('[data-mh-current-title]')!;
  const currentSummary = query<HTMLElement>('[data-mh-current-summary]')!;
  const progress = query<HTMLElement>('[data-mh-progress]')!;
  const progressBar = query<HTMLElement>('[data-mh-progressbar]')!;
  const footStatus = query<HTMLElement>('[data-mh-foot-status]')!;
  const askBox = query<HTMLElement>('[data-mh-ask]')!;
  const askReason = query<HTMLElement>('[data-mh-ask-reason]')!;
  const askArgs = query<HTMLElement>('[data-mh-ask-args]')!;
  const approveButton = query<HTMLButtonElement>('[data-mh-approve]')!;
  const denyButton = query<HTMLButtonElement>('[data-mh-deny]')!;
  const rail = query<HTMLElement>('[data-mh-rail]')!;
  const inspectorTitle = query<HTMLElement>('[data-mh-inspector-title]')!;
  const inspectorMeta = query<HTMLElement>('[data-mh-inspector-meta]')!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mh-tab]'));
  const panes = Array.from(root.querySelectorAll<HTMLElement>('[data-mh-pane]'));
  const evalBody = query<HTMLTableSectionElement>('[data-mh-eval-body]')!;
  const evalStatus = query<HTMLElement>('[data-mh-eval-status]')!;
  const evalCount = query<HTMLElement>('[data-mh-eval-count]')!;
  const evalRun = query<HTMLButtonElement>('[data-mh-eval-run]')!;
  const evalNoop = query<HTMLButtonElement>('[data-mh-eval-noop]')!;
  const evalReset = query<HTMLButtonElement>('[data-mh-eval-reset]')!;

  let scenarioId = scenarios[0]?.id ?? 'full';
  let options: Options = { ...DEFAULT_OPTIONS, ...(scenarios[0]?.defaults ?? {}) } as Options;
  let decisions: Record<string, 'approve' | 'deny'> = {};
  let run: Run = simulate({ scenarioId, options, decisions }) as Run;
  let cursor = 0;
  let playing = false;
  let timer: number | undefined;
  let activeTab = 'context';
  let evalTimer: number | undefined;

  const scenario = () => scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const maxCursor = () =>
    run.pendingAsk ? Math.min(run.pendingAsk.eventIndex, run.events.length - 1) : run.events.length - 1;
  const currentEvent = (): SimEvent | undefined => run.events[Math.min(cursor, run.events.length - 1)];
  const stageName = (id: string | undefined) => stageById.get(id ?? '')?.name ?? '准备';

  function stopPlay() {
    playing = false;
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    playButton.textContent = '自动播放';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function resetRun() {
    stopPlay();
    decisions = {};
    run = simulate({ scenarioId, options, decisions }) as Run;
    cursor = 0;
    renderAll();
  }

  function setOption<K extends keyof Options>(key: K, value: Options[K]) {
    options = { ...options, [key]: value };
    resetRun();
  }

  function buildScenarios() {
    scenarioList.replaceChildren(
      ...scenarios.map((item) => {
        const button = element('button', 'mh-scenario');
        button.type = 'button';
        button.dataset.scenarioId = item.id;
        button.setAttribute('aria-pressed', String(item.id === scenarioId));
        const head = element('span', 'mh-scenario-head');
        head.append(
          element('span', 'mh-scenario-title', item.title),
          element('span', 'mh-scenario-badge', item.badge ?? '场景'),
        );
        button.append(head, element('span', 'mh-scenario-task', item.task));
        button.addEventListener('click', () => {
          scenarioId = item.id;
          options = { ...DEFAULT_OPTIONS, ...(item.defaults ?? {}) } as Options;
          syncOptions();
          for (const other of scenarioList.querySelectorAll<HTMLButtonElement>('.mh-scenario')) {
            other.setAttribute('aria-pressed', String(other.dataset.scenarioId === scenarioId));
          }
          resetRun();
        });
        return button;
      }),
    );
  }

  function buildOptions() {
    const selectSpecs: {
      key: 'permissions' | 'contextLimit' | 'spillChars';
      label: string;
      values: [string | number, string][];
      hint: string;
    }[] = [
      {
        key: 'permissions',
        label: '权限策略',
        values: [
          ['strict', '严格规则'],
          ['open', '放宽（对照）'],
        ],
        hint: '严格：rm -rf 拒绝，git push 询问。',
      },
      {
        key: 'contextLimit',
        label: '压缩阈值',
        values: [
          [0, '关闭'],
          [300, '300 tokens'],
          [420, '420 tokens'],
          [480, '480 tokens'],
          [580, '580 tokens'],
          [900, '900 tokens'],
        ],
        hint: '超过阈值时，下一轮调用前压缩旧历史。',
      },
      {
        key: 'spillChars',
        label: '落盘阈值',
        values: [
          [0, '关闭（改用截断）'],
          [300, '300 字符'],
          [500, '500 字符'],
          [600, '600 字符'],
          [1000, '1000 字符'],
        ],
        hint: '先落盘；关闭后超过 10,000 字符才硬截断。',
      },
    ];
    const nodes: HTMLElement[] = [];
    for (const spec of selectSpecs) {
      const label = element('label', 'mh-field');
      const head = element('span', 'mh-field-label', spec.label);
      const select = element('select');
      select.dataset.opt = spec.key;
      for (const [value, text] of spec.values) {
        const option = element('option', undefined, text);
        option.value = String(value);
        select.append(option);
      }
      select.addEventListener('change', () => {
        if (spec.key === 'permissions') setOption('permissions', select.value as Options['permissions']);
        else setOption(spec.key, Number(select.value));
      });
      label.append(head, select, element('small', 'mh-field-hint', spec.hint));
      nodes.push(label);
    }
    for (const [key, title, hint] of [
      ['subagent', '只读子代理', '关闭后 explore 工具不存在，盘点改在主循环。'],
      ['memoryGate', '记忆闸门', '关闭后读过外部内容的 remember 仍写正式记忆。'],
    ] as const) {
      const label = element('label', 'mh-toggle');
      const input = element('input');
      input.type = 'checkbox';
      input.dataset.opt = key;
      input.addEventListener('change', () => setOption(key, input.checked));
      const copy = element('span', 'mh-toggle-copy');
      copy.append(element('strong', undefined, title), element('small', undefined, hint));
      label.append(input, element('span', 'mh-switch'), copy);
      nodes.push(label);
    }
    optionsBox.replaceChildren(...nodes);
  }

  function syncOptions() {
    for (const select of optionsBox.querySelectorAll<HTMLSelectElement>('select[data-opt]')) {
      const key = select.dataset.opt as 'permissions' | 'contextLimit' | 'spillChars';
      select.value = String(options[key]);
    }
    for (const input of optionsBox.querySelectorAll<HTMLInputElement>('input[data-opt]')) {
      const key = input.dataset.opt as 'subagent' | 'memoryGate';
      input.checked = Boolean(options[key]);
    }
  }

  function renderRail(event: SimEvent | undefined) {
    const pastStages = new Set(run.events.slice(0, cursor + 1).map((item) => item.stage));
    for (const button of rail.querySelectorAll<HTMLButtonElement>('[data-mh-rail-stage]')) {
      const id = button.dataset.mhRailStage!;
      button.classList.toggle('is-current', id === event?.stage);
      button.classList.toggle('is-seen', pastStages.has(id));
      button.setAttribute('aria-pressed', String(id === event?.stage));
    }
  }

  function renderTimeline(event: SimEvent | undefined) {
    const nodes: HTMLLIElement[] = [];
    run.events.forEach((item, index) => {
      const li = element('li', `mh-event mh-event-${item.tone}`);
      li.dataset.index = String(index);
      li.classList.toggle('is-past', index < cursor);
      li.classList.toggle('is-current', index === cursor);
      li.classList.toggle('is-future', index > cursor);
      li.classList.toggle('is-subagent', item.scope === 'subagent');
      const button = element('button', 'mh-event-button');
      button.type = 'button';
      button.disabled = index > cursor;
      button.setAttribute(
        'aria-label',
        `事件 ${index + 1}：${item.title}${index === cursor ? '（当前）' : index > cursor ? '（待执行）' : ''}`,
      );
      const idx = element('span', 'mh-event-index', String(index + 1).padStart(2, '0'));
      const body = element('span', 'mh-event-body');
      const top = element('span', 'mh-event-top');
      top.append(
        element('span', 'mh-stage-badge', item.stage),
        element('strong', 'mh-event-title', item.title),
        element('span', 'mh-event-kind', item.kind),
        ...(item.scope === 'subagent' ? [element('span', 'mh-event-sub', '子代理')] : []),
      );
      body.append(top, element('span', 'mh-event-summary', item.summary));
      const state = element(
        'span',
        'mh-event-state',
        index === cursor ? '当前' : index > cursor ? '待执行' : '已发生',
      );
      button.append(idx, body, state);
      button.addEventListener('click', () => {
        if (index > cursor) return;
        cursor = index;
        stopPlay();
        renderAll();
      });
      li.append(button);
      nodes.push(li);
    });
    timeline.replaceChildren(...nodes);
    timelineEmpty.hidden = nodes.length > 0;
    const current = timeline.querySelector<HTMLElement>('.is-current');
    if (current) {
      const wrap = timeline.parentElement;
      if (wrap) {
        const currentRect = current.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (currentRect.top < wrapRect.top || currentRect.bottom > wrapRect.bottom) {
          wrap.scrollTop += currentRect.top - wrapRect.top - 8;
        }
      }
    }
  }

  function renderAsk() {
    const ask = run.pendingAsk;
    const ready = ask && cursor >= ask.eventIndex;
    askBox.hidden = !ready;
    if (!ready || !ask) return;
    askReason.textContent = `${ask.reason}（来源：${ask.source}）`;
    askArgs.textContent = JSON.stringify({ tool: ask.tool, arguments: ask.arguments }, null, 2);
  }

  function renderHeader(event: SimEvent | undefined) {
    const stage = stageById.get(event?.stage ?? '');
    currentStage.textContent = event ? `${event.stage} · ${stage?.name ?? stageName(event.stage)}` : '准备';
    currentTitle.textContent = event?.title ?? '载入实验配置';
    currentSummary.textContent = event?.summary ?? '选择一个场景，然后点「单步执行」。';
    progress.textContent = `事件 ${run.events.length ? cursor + 1 : 0} / ${run.events.length}`;
    progressBar.style.width = run.events.length ? `${((cursor + 1) / run.events.length) * 100}%` : '0%';
    inspectorTitle.textContent = event?.title ?? '载入实验配置';
    inspectorMeta.textContent = event
      ? `事件 ${event.index + 1} · ${event.stage} ${stage?.name ?? ''} · ${event.kind}`
      : '事件 0 · S1';
    if (run.summary) {
      footStatus.textContent =
        `已结束：${run.summary.stopped} · ${run.summary.steps} 步 · ` +
        `${run.summary.toolCalls} 次工具 · ≈${run.summary.tokens} tokens`;
    } else if (run.pendingAsk && cursor >= run.pendingAsk.eventIndex) {
      footStatus.textContent = '等待裁决：批准或拒绝后继续';
    } else {
      footStatus.textContent = `第 ${event?.round ?? 0} 轮 · 离线模拟 · 无真实副作用`;
    }
  }

  function messageCard(message: Message) {
    const card = element('article', `mh-message mh-message-${message.role}`);
    const head = element('header', 'mh-message-head');
    head.append(
      element('span', 'mh-role', roleLabel(message.role)),
      element('span', 'mh-message-tokens', `≈${estimateTokens([message])} tokens`),
    );
    if (message.tool_call_id) head.append(element('code', 'mh-message-id', message.tool_call_id));
    card.append(head);
    if (message.content) {
      card.append(element('pre', 'mh-message-content', message.content));
    } else if (message.tool_calls?.length) {
      card.append(element('p', 'mh-muted', `调用 ${message.tool_calls.length} 个工具`));
    }
    if (message.tool_calls?.length) {
      const calls = element('div', 'mh-tool-calls');
      for (const call of message.tool_calls) {
        calls.append(
          element('code', 'mh-tool-call', `${call.function.name}(${call.function.arguments})`),
        );
      }
      card.append(calls);
    }
    return card;
  }

  function renderContext(event: SimEvent | undefined) {
    const pane = panes.find((item) => item.dataset.mhPane === 'context')!;
    if (!event) {
      pane.replaceChildren(element('p', 'mh-muted', '运行后在这里查看当时的消息列表。'));
      return;
    }
    const isSub = event.scope === 'subagent' && Array.isArray(event.detail.messages);
    const messages = (isSub ? event.detail.messages : event.snapshot.messages) as Message[];
    const nodes: HTMLElement[] = [];
    if (isSub) {
      nodes.push(
        element(
          'p',
          'mh-banner',
          '子代理独立窗口：这些消息不会回流父会话；父会话只收到最后一段摘要。',
        ),
      );
    }
    const meta = element('div', 'mh-pane-meta');
    meta.append(
      element('span', undefined, `${messages.length} 条消息`),
      element('span', undefined, `≈${messages.length ? estimateTokens(messages) : 0} tokens`),
      element('span', undefined, isSub ? '子代理上下文' : '主上下文'),
    );
    nodes.push(meta);
    if (!messages.length) nodes.push(element('p', 'mh-muted', '此时还没有消息。'));
    for (const message of messages) nodes.push(messageCard(message));
    pane.replaceChildren(...nodes);
  }

  function stateSection(title: string, content: Node, open = false) {
    const details = element('details', 'mh-state-section');
    details.open = open;
    details.append(element('summary', undefined, title), content);
    return details;
  }

  function renderState(event: SimEvent | undefined) {
    const pane = panes.find((item) => item.dataset.mhPane === 'state')!;
    if (!event) {
      pane.replaceChildren(element('p', 'mh-muted', '运行后在这里查看工作区、记忆与会话记录。'));
      return;
    }
    const snapshot = event.snapshot;
    const nodes: HTMLElement[] = [];
    const conclusion =
      event.kind === 'summary' || event.kind === 'final'
        ? String(event.detail.content ?? '').trim()
        : '';
    if (conclusion) {
      const answer = element('div', 'mh-final-answer');
      answer.append(
        element('p', 'mh-pane-meta', '最终回答'),
        element('pre', 'mh-code', conclusion),
      );
      nodes.push(answer);
    }
    const stats = element('div', 'mh-stat-grid');
    for (const [label, value] of [
      ['模型步数', snapshot.step],
      ['工具调用', snapshot.toolCalls],
      ['tokens 估算', snapshot.tokens],
      ['压缩', snapshot.compactions],
      ['消息', snapshot.messages.length],
      ['污点', snapshot.taint.length],
      ['落盘', snapshot.artifacts.length],
      ['状态', snapshot.stopped ?? '运行中'],
    ]) {
      const item = element('div', 'mh-stat');
      item.append(element('span', undefined, label), element('strong', undefined, String(value)));
      stats.append(item);
    }
    nodes.push(stats);

    const files = element('ul', 'mh-file-list');
    for (const [file, content] of Object.entries(snapshot.files).sort(([a], [b]) => a.localeCompare(b))) {
      const item = element('li');
      item.append(element('code', undefined, file), element('span', undefined, formatBytes(content.length)));
      files.append(item);
    }
    nodes.push(stateSection(`工作区文件（${Object.keys(snapshot.files).length}）`, files));

    if (snapshot.artifacts.length) {
      const artifacts = element('div', 'mh-stack');
      for (const artifact of snapshot.artifacts) {
        const block = element('div', 'mh-artifact');
        block.append(
          element('code', undefined, artifact.path),
          element('span', 'mh-muted', `${artifact.lines} 行 · ${formatBytes(artifact.bytes)}`),
          element('pre', 'mh-code', artifact.content.split('\n').slice(0, 5).join('\n')),
        );
        artifacts.append(block);
      }
      nodes.push(stateSection(`落盘产物（${snapshot.artifacts.length}）`, artifacts));
    }

    const memoryBox = element('div', 'mh-stack');
    memoryBox.append(
      element(
        'p',
        'mh-pane-meta',
        `正式记忆 ${snapshot.memory.entries.length} 条 · 草稿 ${snapshot.memory.drafts.length} 条`,
      ),
      element('pre', 'mh-code', snapshot.memory.index || '(还没有记忆索引)'),
    );
    if (snapshot.memory.drafts.length) {
      const drafts = element('ul', 'mh-file-list');
      for (const draft of snapshot.memory.drafts) {
        const item = element('li');
        item.append(element('code', undefined, draft.path), element('span', 'mh-muted', '待审'));
        drafts.append(item);
      }
      memoryBox.append(drafts);
    }
    nodes.push(stateSection('记忆索引与草稿', memoryBox));

    const sessionBox = element('div', 'mh-stack');
    sessionBox.append(
      element(
        'p',
        'mh-pane-meta',
        `${snapshot.session.path} · ${snapshot.session.count} 条记录`,
      ),
      element(
        'pre',
        'mh-code',
        snapshot.session.lastRecords.map((record) => JSON.stringify(record)).join('\n') || '(暂无)',
      ),
    );
    nodes.push(stateSection('会话 JSONL（真相源）', sessionBox));

    if (snapshot.taint.length) {
      const taint = element('ul', 'mh-file-list');
      for (const marker of snapshot.taint) taint.append(element('li', undefined, marker));
      nodes.push(stateSection('污点来源', taint));
    }
    if (snapshot.subagentRuns.length) {
      const runs = element('ul', 'mh-file-list');
      for (const sub of snapshot.subagentRuns) {
        runs.append(
          element(
            'li',
            undefined,
            `${sub.steps} 步 · ${sub.toolCalls} 次工具 · ≈${sub.tokens} tokens`,
          ),
        );
      }
      nodes.push(stateSection('子代理运行', runs));
    }
    pane.replaceChildren(...nodes);
  }

  function renderRaw(event: SimEvent | undefined) {
    const pane = panes.find((item) => item.dataset.mhPane === 'raw')!;
    if (!event) {
      pane.replaceChildren(element('p', 'mh-muted', '点击时间线事件查看原始数据。'));
      return;
    }
    const raw = {
      id: event.id,
      index: event.index,
      round: event.round,
      stage: event.stage,
      kind: event.kind,
      scope: event.scope,
      tone: event.tone,
      title: event.title,
      summary: event.summary,
      detail: event.detail,
    };
    pane.replaceChildren(
      element(
        'p',
        'mh-pane-meta',
        '这里是产生该事件的输入/输出；完整消息列表在「上下文」，状态统计在「状态」。',
      ),
      element('pre', 'mh-code mh-raw', JSON.stringify(raw, null, 2)),
    );
  }

  function renderInspector(event: SimEvent | undefined) {
    renderContext(event);
    renderState(event);
    renderRaw(event);
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab.dataset.mhTab === activeTab));
    }
    for (const pane of panes) {
      pane.hidden = pane.dataset.mhPane !== activeTab;
    }
  }

  function renderAll() {
    const max = maxCursor();
    if (cursor > max) cursor = max;
    if (cursor < 0) cursor = 0;
    const event = currentEvent();
    renderHeader(event);
    renderRail(event);
    renderTimeline(event);
    renderAsk();
    renderInspector(event);
  }

  function advance() {
    const max = maxCursor();
    if (cursor >= max) {
      stopPlay();
      return;
    }
    cursor += 1;
    renderAll();
    if (run.pendingAsk && cursor >= run.pendingAsk.eventIndex) stopPlay();
  }

  function step() {
    stopPlay();
    advance();
  }

  function back() {
    if (cursor <= 0) return;
    stopPlay();
    cursor -= 1;
    renderAll();
  }

  function startPlay() {
    if (playing) return;
    if (cursor >= maxCursor()) {
      cursor = 0;
      renderAll();
    }
    playing = true;
    playButton.textContent = '暂停';
    playButton.setAttribute('aria-pressed', 'true');
    const speed = Number(speedSelect.value) || 650;
    timer = window.setInterval(() => {
      advance();
      if (cursor >= maxCursor()) stopPlay();
    }, speed);
  }

  function togglePlay() {
    if (playing) stopPlay();
    else startPlay();
  }

  function decide(choice: 'approve' | 'deny') {
    const ask = run.pendingAsk;
    if (!ask) return;
    stopPlay();
    decisions = { ...decisions, [ask.key]: choice };
    run = simulate({ scenarioId, options, decisions }) as Run;
    const resolved = run.events.findIndex(
      (event) =>
        event.kind === 'permission_ask' &&
        event.detail.key === ask.key &&
        event.detail.decision === choice,
    );
    cursor = Math.max(0, Math.min((resolved >= 0 ? resolved : ask.eventIndex) + 1, run.events.length - 1));
    renderAll();
  }

  function jumpToEnd() {
    stopPlay();
    cursor = maxCursor();
    renderAll();
  }

  function firstEventIndex(stage: string) {
    return run.events.findIndex((event) => event.stage === stage);
  }

  function focusStage(stage: string) {
    if (stage === 'S6') {
      scrollTo(query('#eval'));
      return;
    }
    const currentIndex = firstEventIndex(stage);
    if (currentIndex >= 0) {
      cursor = currentIndex;
      stopPlay();
      renderAll();
      scrollTo(query('#workbench'));
      return;
    }
    const mapped: Record<string, string> = {
      S1: 'full',
      S2: 'permission',
      S3: 'context',
      S4: 'context',
      S5: 'context',
      S7: 'memory',
    };
    scenarioId = mapped[stage] ?? 'full';
    const target = scenario();
    options = { ...DEFAULT_OPTIONS, ...(target?.defaults ?? {}) } as Options;
    syncOptions();
    for (const other of scenarioList.querySelectorAll<HTMLButtonElement>('.mh-scenario')) {
      other.setAttribute('aria-pressed', String(other.dataset.scenarioId === scenarioId));
    }
    decisions = {};
    run = simulate({ scenarioId, options, decisions }) as Run;
    const index = firstEventIndex(stage);
    cursor = index >= 0 ? index : 0;
    renderAll();
    scrollTo(query('#workbench'));
  }

  function setTab(tab: string) {
    activeTab = tab;
    renderInspector(currentEvent());
  }

  function renderEvalRows(rows: EvalRow[], shown: number) {
    evalBody.replaceChildren(
      ...rows.slice(0, shown).map((row) => {
        const tr = element('tr', row.passed ? 'is-pass' : 'is-fail');
        const result = element('span', `mh-result ${row.passed ? 'is-pass' : 'is-fail'}`, row.passed ? 'PASS' : 'FAIL');
        const cells: (string | HTMLElement)[] = [
          row.task,
          result,
          String(row.steps),
          String(row.toolCalls),
          String(row.tokens),
          row.note,
        ];
        cells.forEach((value, index) => {
          const cell = element('td');
          if (value instanceof Node) cell.append(value);
          else cell.textContent = value;
          if (index === 0) cell.className = 'mh-task-cell';
          tr.append(cell);
        });
        return tr;
      }),
    );
  }

  function runEvalBench(model: 'scripted' | 'noop') {
    if (evalTimer !== undefined) window.clearTimeout(evalTimer);
    const rows = runEvals({ model }) as EvalRow[];
    evalBody.replaceChildren();
    evalStatus.textContent =
      model === 'noop'
        ? '空操作模型没有写答案文件，逐行看判分器的下闸门。'
        : '脚本模型按任务写答案；判分器从 fixture 现算期望。';
    evalCount.textContent = '运行中…';
    let shown = 0;
    const tick = () => {
      shown += 1;
      renderEvalRows(rows, shown);
      evalCount.textContent = `${rows.slice(0, shown).filter((row) => row.passed).length} / ${shown}`;
      if (shown < rows.length) {
        evalTimer = window.setTimeout(tick, 220);
      } else {
        evalTimer = undefined;
        const passed = rows.filter((row) => row.passed).length;
        evalCount.textContent = `${passed} / ${rows.length} 通过`;
        evalStatus.textContent =
          model === 'noop'
            ? '0/5：答案文件不存在，判分器没有被“脚本模型全过”掩盖。'
            : '5/5：五个任务都通过现算期望；上闸门成立。';
      }
    };
    tick();
  }

  function resetEvalBench() {
    if (evalTimer !== undefined) window.clearTimeout(evalTimer);
    evalTimer = undefined;
    evalBody.replaceChildren();
    evalStatus.textContent = '尚未运行。点「运行脚本模型」逐行看判分。';
    evalCount.textContent = '—';
  }

  function bindEvents() {
    stepButton.addEventListener('click', step);
    playButton.addEventListener('click', togglePlay);
    resetButton.addEventListener('click', resetRun);
    jumpButton.addEventListener('click', jumpToEnd);
    backButton.addEventListener('click', back);
    approveButton.addEventListener('click', () => decide('approve'));
    denyButton.addEventListener('click', () => decide('deny'));
    evalRun.addEventListener('click', () => runEvalBench('scripted'));
    evalNoop.addEventListener('click', () => runEvalBench('noop'));
    evalReset.addEventListener('click', resetEvalBench);
    for (const tab of tabs) {
      tab.addEventListener('click', () => setTab(tab.dataset.mhTab ?? 'context'));
    }
    for (const button of rail.querySelectorAll<HTMLButtonElement>('[data-mh-rail-stage]')) {
      button.addEventListener('click', () => focusStage(button.dataset.mhRailStage ?? 'S1'));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mh-see-stage]')) {
      button.addEventListener('click', () => focusStage(button.dataset.mhSeeStage ?? 'S1'));
    }
    document.addEventListener('keydown', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, select, textarea, button, a, summary, [contenteditable="true"]')) return;
      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        step();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        back();
      }
    });
  }

  buildScenarios();
  buildOptions();
  syncOptions();
  bindEvents();
  renderAll();
}

const root = document.querySelector<HTMLElement>('[data-mh-root]');
if (root) mount(root);

// Referencing EVAL_CASES keeps the page data honest even though the table is
// rendered from runEvals(); the static HTML also lists the five tasks.
void EVAL_CASES;
