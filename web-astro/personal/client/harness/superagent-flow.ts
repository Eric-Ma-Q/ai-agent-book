// Requirement 045: client-side workbench for the archived superagent-flow lab.
// Everything is rendered from the deterministic engine in
// harness/superagent-flow/engine.mjs; no fetch, browser storage or real command
// execution. Data goes in with textContent, never as markup.

import { PHASES, SCENARIOS, replay } from '../../harness/superagent-flow/engine.mjs';

interface Mandate {
  policyVersion: number;
  strength: string;
  basis: string;
  rules: string[];
  sender: string;
  source: string;
  scope: string;
}

interface Assignment {
  id: string;
  state: string;
  endedReason: string | null;
}

interface Report {
  kind: string;
  text: string;
  tick: number;
  pr: number | null;
}

interface TicketSnapshot {
  id: string;
  thread: string;
  source: string;
  state: string;
  stage: string;
  endedReason: string | null;
  mandate: Mandate | null;
  inputs: string[];
  assignments: Assignment[];
  reports: Report[];
  prs: { id: number; state: string }[];
  attention: string | null;
  deliveryFailed: boolean;
  lastHumanTick: number;
}

interface Decision {
  id: string;
  thread: string;
  kind: string;
  strength: string;
  rules: string[];
  triggers: string[];
  reason: string;
}

interface Message {
  ticket: string;
  conversation: string;
  kind: string;
  text: string;
  state: string;
  tick: number;
}

interface Problem {
  thread: string;
  triggers: string[];
  reason: string;
}

interface Snapshot {
  tick: number;
  policy: { version: number; acceptMode: string; rules: string[] };
  tickets: TicketSnapshot[];
  decisions: Decision[];
  messages: Message[];
  problems: Problem[];
}

interface RecordItem {
  tick: number;
  phase: string;
  key: string;
  outcome: string;
  detail: string;
  source: string;
}

interface Run {
  scenario: string;
  title: string;
  policy: { version: number; acceptMode: string; rules: string[] };
  records: RecordItem[];
  snapshots: Snapshot[];
  tickets: TicketSnapshot[];
  messages: Message[];
  problems: Problem[];
  decisions: Decision[];
  final: string;
}

interface Phase {
  id: string;
  name: string;
  question: string;
  note: string;
}

type Tab = 'record' | 'tickets' | 'ledger' | 'raw';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const phaseById = new Map<string, Phase>(PHASES.map((phase: Phase) => [phase.id, phase]));

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

function code(text: string) {
  return element('code', undefined, text);
}

function fact(label: string, value: string) {
  const row = element('div', 'sf-fact');
  row.append(element('dt', undefined, label), element('dd', undefined, value));
  return row;
}

function mount(root: HTMLElement) {
  const query = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const scenarioList = query<HTMLElement>('[data-sf-scenarios]')!;
  const stepButton = query<HTMLButtonElement>('[data-sf-step]')!;
  const playButton = query<HTMLButtonElement>('[data-sf-play]')!;
  const backButton = query<HTMLButtonElement>('[data-sf-back]')!;
  const resetButton = query<HTMLButtonElement>('[data-sf-reset]')!;
  const jumpButton = query<HTMLButtonElement>('[data-sf-jump]')!;
  const speedSelect = query<HTMLSelectElement>('[data-sf-speed]')!;
  const currentPhase = query<HTMLElement>('[data-sf-current-phase]')!;
  const currentTitle = query<HTMLElement>('[data-sf-current-title]')!;
  const currentSummary = query<HTMLElement>('[data-sf-current-summary]')!;
  const progress = query<HTMLElement>('[data-sf-progress]')!;
  const policyLine = query<HTMLElement>('[data-sf-policy]')!;
  const rail = query<HTMLElement>('[data-sf-rail]')!;
  const progressBar = query<HTMLElement>('[data-sf-progressbar]')!;
  const metrics = query<HTMLElement>('[data-sf-metrics]')!;
  const timeline = query<HTMLOListElement>('[data-sf-timeline]')!;
  const timelineEmpty = query<HTMLElement>('[data-sf-timeline-empty]')!;
  const footStatus = query<HTMLElement>('[data-sf-foot-status]')!;
  const inspectorTitle = query<HTMLElement>('[data-sf-inspector-title]')!;
  const inspectorMeta = query<HTMLElement>('[data-sf-inspector-meta]')!;
  const recordBody = query<HTMLElement>('[data-sf-record-body]')!;
  const ticketsBody = query<HTMLElement>('[data-sf-tickets-body]')!;
  const ledgerBody = query<HTMLElement>('[data-sf-ledger-body]')!;
  const rawBody = query<HTMLElement>('[data-sf-raw]')!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-sf-tab]'));
  const panes = Array.from(root.querySelectorAll<HTMLElement>('[data-sf-pane]'));
  const railButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-sf-stage]'));

  let scenarioId = SCENARIOS[0]?.id ?? 'explicit-request';
  let run = replay(scenarioId) as Run;
  let index = 0;
  let playing = false;
  let timer: number | undefined;
  let activeTab: Tab = 'record';
  let eventButtons: HTMLButtonElement[] = [];

  const lastIndex = () => run.records.length;
  const currentRecord = (): RecordItem | null => (index > 0 ? run.records[index - 1] : null);
  const currentSnapshot = (): Snapshot => run.snapshots[Math.min(index, run.snapshots.length - 1)];
  const currentPhaseMeta = (): Phase | null => {
    const record = currentRecord();
    return record ? phaseById.get(record.phase) ?? null : null;
  };

  function stopPlay() {
    playing = false;
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    playButton.textContent = reducedMotion ? '减少动画已开启' : '自动播放';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function startPlay() {
    if (reducedMotion) {
      playButton.textContent = '减少动画已开启';
      return;
    }
    if (index >= lastIndex()) index = 0;
    playing = true;
    playButton.textContent = '暂停';
    playButton.setAttribute('aria-pressed', 'true');
    const delay = Number(speedSelect.value);
    timer = window.setInterval(() => {
      if (index >= lastIndex()) {
        stopPlay();
        return;
      }
      index += 1;
      render();
      if (index >= lastIndex()) stopPlay();
    }, delay);
  }

  function togglePlay() {
    if (playing) stopPlay();
    else startPlay();
  }

  function go(next: number) {
    index = Math.max(0, Math.min(lastIndex(), next));
    render();
  }

  function buildTimeline() {
    eventButtons = run.records.map((record, position) => {
      const positionIndex = position + 1;
      const button = element('button', 'sf-event');
      button.type = 'button';
      button.dataset.index = String(positionIndex);
      const head = element('span', 'sf-event-head');
      head.append(
        element('span', 'sf-event-tick', `t${record.tick}`),
        element('span', 'sf-event-phase', phaseById.get(record.phase)?.name ?? record.phase),
        element('span', 'sf-event-key', record.key),
        element('span', 'sf-event-outcome', record.outcome),
      );
      button.append(head, element('span', 'sf-event-detail', record.detail));
      button.addEventListener('click', () => {
        stopPlay();
        go(positionIndex);
      });
      return button;
    });
    timeline.replaceChildren(...eventButtons);
    timelineEmpty.hidden = run.records.length > 0;
  }

  function buildScenarios() {
    for (const button of scenarioList.querySelectorAll<HTMLButtonElement>('[data-sf-scenario]')) {
      const id = button.dataset.sfScenario ?? '';
      button.setAttribute('aria-pressed', String(id === scenarioId));
      button.addEventListener('click', () => {
        scenarioId = id;
        run = replay(scenarioId) as Run;
        index = 0;
        stopPlay();
        for (const other of scenarioList.querySelectorAll<HTMLButtonElement>('[data-sf-scenario]')) {
          other.setAttribute('aria-pressed', String(other.dataset.sfScenario === scenarioId));
        }
        activeTab = 'record';
        syncTabs();
        buildTimeline();
        render();
      });
    }
  }

  function syncTabs() {
    for (const tab of tabs) {
      const selected = tab.dataset.sfTab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
    }
    for (const pane of panes) pane.hidden = pane.dataset.sfPane !== activeTab;
  }

  function renderHeader() {
    const record = currentRecord();
    const phase = currentPhaseMeta();
    const snapshot = currentSnapshot();
    progress.textContent = `记录 ${index} / ${lastIndex()}`;
    policyLine.textContent = `策略 v${snapshot.policy.version} · ${snapshot.policy.acceptMode} · ${
      snapshot.policy.rules.join(', ') || '无启用规则'
    }`;
    progressBar.style.width = `${lastIndex() ? (index / lastIndex()) * 100 : 0}%`;

    if (!record) {
      currentPhase.textContent = '运行开始';
      currentTitle.textContent = '选择场景后单步';
      currentSummary.textContent = '当前显示运行前状态；点「单步」处理第一个事件。';
      return;
    }
    currentPhase.textContent = `${phase?.name ?? record.phase} · tick ${record.tick}`;
    currentTitle.textContent = record.key;
    currentSummary.textContent = record.detail;
  }

  function renderRail() {
    for (const button of railButtons) {
      const phaseId = button.dataset.sfStage ?? '';
      let first = -1;
      for (let position = 1; position <= index; position += 1) {
        if (run.records[position - 1].phase === phaseId) {
          first = position;
          break;
        }
      }
      button.disabled = first === -1;
      button.classList.toggle('is-done', first !== -1);
      button.classList.toggle('is-current', currentRecord()?.phase === phaseId);
      button.setAttribute('aria-pressed', String(currentRecord()?.phase === phaseId));
    }
  }

  function renderMetrics() {
    const snapshot = currentSnapshot();
    const values: [string, string | number][] = [
      ['Tick', snapshot.tick],
      ['记录', index],
      ['工单', snapshot.tickets.length],
      ['决策', snapshot.decisions.length],
      ['消息', snapshot.messages.length],
      ['问题', snapshot.problems.length],
    ];
    metrics.replaceChildren(
      ...values.map(([label, value]) => {
        const item = element('div');
        item.append(element('dt', undefined, label), element('dd', undefined, value));
        return item;
      }),
    );
  }

  function renderTimeline() {
    for (const [position, button] of eventButtons.entries()) {
      const positionIndex = position + 1;
      button.disabled = positionIndex > index;
      button.classList.toggle('is-past', positionIndex < index);
      button.classList.toggle('is-current', positionIndex === index);
      if (positionIndex === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    if (index > 0) {
      eventButtons[index - 1]?.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderRecord() {
    const record = currentRecord();
    const phase = currentPhaseMeta();
    const snapshot = currentSnapshot();
    inspectorTitle.textContent = record ? record.key : '运行开始';
    inspectorMeta.textContent = `记录 ${index} · tick ${snapshot.tick}`;
    if (!record) {
      const note = element('p', 'sf-muted', '运行前：策略已加载，还没有任何记录。');
      recordBody.replaceChildren(note);
      return;
    }
    const facts = element('dl', 'sf-facts');
    facts.append(
      fact('tick', String(record.tick)),
      fact('phase', `${phase?.name ?? record.phase}（${record.phase}）`),
      fact('key', record.key),
      fact('outcome', record.outcome),
      fact('detail', record.detail),
    );
    const cite = element('p', 'sf-cite');
    cite.append('原文出处：', code(record.source));
    const note = element('p', 'sf-muted', phase?.note ?? '');
    recordBody.replaceChildren(facts, cite, note);
  }

  function ticketCard(ticket: TicketSnapshot) {
    const card = element('article', 'sf-ticket');
    const head = element('div', 'sf-ticket-head');
    head.append(
      element('h3', undefined, `${ticket.id} · ${ticket.state}`),
      element('span', `sf-badge is-${ticket.state}`, ticket.stage),
    );
    const facts = element('dl', 'sf-facts');
    facts.append(
      fact('Thread', ticket.thread),
      fact('Source', ticket.source),
      fact('结束原因', ticket.endedReason ?? '—'),
      fact('最近人类 tick', String(ticket.lastHumanTick)),
      fact('投递失败', ticket.deliveryFailed ? '是' : '否'),
    );
    card.append(head, facts);

    if (ticket.mandate) {
      const mandateBox = element('div', 'sf-subcard');
      mandateBox.append(element('h4', undefined, 'Mandate'));
      const mandateFacts = element('dl', 'sf-facts');
      mandateFacts.append(
        fact('策略版本', `v${ticket.mandate.policyVersion}`),
        fact('强度', ticket.mandate.strength),
        fact('依据', ticket.mandate.basis),
        fact('规则', ticket.mandate.rules.join(', ') || '—'),
        fact('签发人', ticket.mandate.sender),
        fact('作用域', ticket.mandate.scope),
      );
      mandateBox.append(mandateFacts);
      card.append(mandateBox);
    }

    const inputs = element('div', 'sf-subcard');
    inputs.append(element('h4', undefined, `输入（${ticket.inputs.length}）`));
    if (ticket.inputs.length) {
      const chips = element('p', 'sf-chips');
      chips.append(...ticket.inputs.map((item) => code(item)));
      inputs.append(chips);
    } else {
      inputs.append(element('p', 'sf-muted', '无'));
    }
    card.append(inputs);

    const assignments = element('div', 'sf-subcard');
    assignments.append(element('h4', undefined, `Assignment（${ticket.assignments.length}）`));
    const list = element('ul', 'sf-mini-list');
    for (const assignment of ticket.assignments) {
      list.append(
        element(
          'li',
          undefined,
          `${assignment.id} · ${assignment.state}${
            assignment.endedReason ? ` · ${assignment.endedReason}` : ''
          }`,
        ),
      );
    }
    if (!ticket.assignments.length) list.append(element('li', 'sf-muted', '还没有 Assignment'));
    assignments.append(list);
    card.append(assignments);

    const reports = element('div', 'sf-subcard');
    reports.append(element('h4', undefined, `Report（${ticket.reports.length}）`));
    const reportList = element('ul', 'sf-mini-list');
    for (const item of ticket.reports) {
      reportList.append(
        element('li', undefined, `t${item.tick} · ${item.kind} · ${item.text || '无说明'}`),
      );
    }
    if (!ticket.reports.length) reportList.append(element('li', 'sf-muted', '还没有 Report'));
    reports.append(reportList);
    card.append(reports);

    if (ticket.prs.length) {
      const prBox = element('div', 'sf-subcard');
      prBox.append(element('h4', undefined, 'Pull request'));
      const prList = element('ul', 'sf-mini-list');
      for (const item of ticket.prs) prList.append(element('li', undefined, `#${item.id} · ${item.state}`));
      prBox.append(prList);
      card.append(prBox);
    }
    return card;
  }

  function renderTickets() {
    const snapshot = currentSnapshot();
    if (!snapshot.tickets.length) {
      ticketsBody.replaceChildren(element('p', 'sf-muted', '这个 tick 还没有工单。'));
      return;
    }
    ticketsBody.replaceChildren(...snapshot.tickets.map(ticketCard));
  }

  function renderLedger() {
    const snapshot = currentSnapshot();
    const blocks: HTMLElement[] = [];

    const decisions = element('section', 'sf-ledger-block');
    decisions.append(element('h4', undefined, `Decision（${snapshot.decisions.length}）`));
    if (snapshot.decisions.length) {
      const list = element('ul', 'sf-mini-list');
      for (const decision of snapshot.decisions) {
        list.append(
          element(
            'li',
            undefined,
            `${decision.id} · ${decision.kind} · ${decision.strength} · rules=${
              decision.rules.join(',') || '-'
            } · triggers=${decision.triggers.join(',')} — ${decision.reason}`,
          ),
        );
      }
      decisions.append(list);
    } else {
      decisions.append(element('p', 'sf-muted', '还没有 Decision。'));
    }
    blocks.push(decisions);

    const messages = element('section', 'sf-ledger-block');
    messages.append(element('h4', undefined, `Message（${snapshot.messages.length}）`));
    if (snapshot.messages.length) {
      const list = element('ul', 'sf-mini-list');
      for (const message of snapshot.messages) {
        list.append(
          element(
            'li',
            undefined,
            `t${message.tick} · ${message.kind} · ${message.ticket} · ${message.state} — ${message.text}`,
          ),
        );
      }
      messages.append(list);
    } else {
      messages.append(element('p', 'sf-muted', '还没有 Message。'));
    }
    blocks.push(messages);

    const problems = element('section', 'sf-ledger-block');
    problems.append(element('h4', undefined, `Problem（${snapshot.problems.length}）`));
    if (snapshot.problems.length) {
      const list = element('ul', 'sf-mini-list');
      for (const problem of snapshot.problems) {
        list.append(
          element(
            'li',
            undefined,
            `${problem.thread} · triggers=${problem.triggers.join(',')} — ${problem.reason}`,
          ),
        );
      }
      problems.append(list);
    } else {
      problems.append(element('p', 'sf-muted', '还没有 Problem。'));
    }
    blocks.push(problems);

    ledgerBody.replaceChildren(...blocks);
  }

  function renderRaw() {
    const payload = {
      scenario: run.scenario,
      index,
      record: currentRecord(),
      snapshot: currentSnapshot(),
    };
    rawBody.textContent = JSON.stringify(payload, null, 2);
  }

  function render() {
    renderHeader();
    renderRail();
    renderMetrics();
    renderTimeline();
    renderRecord();
    renderTickets();
    renderLedger();
    renderRaw();
    footStatus.textContent =
      index >= lastIndex() && lastIndex() > 0
        ? `最终状态 · ${run.final}`
        : `已回放 ${index} / ${lastIndex()} 条记录`;
    if (reducedMotion) playButton.disabled = true;
  }

  buildScenarios();
  buildTimeline();
  syncTabs();
  render();

  stepButton.addEventListener('click', () => {
    stopPlay();
    go(index + 1);
  });
  backButton.addEventListener('click', () => {
    stopPlay();
    go(index - 1);
  });
  resetButton.addEventListener('click', () => {
    stopPlay();
    go(0);
  });
  jumpButton.addEventListener('click', () => {
    stopPlay();
    go(lastIndex());
  });
  playButton.addEventListener('click', togglePlay);
  speedSelect.addEventListener('change', () => {
    if (playing) {
      stopPlay();
      startPlay();
    }
  });

  for (const button of railButtons) {
    button.addEventListener('click', () => {
      const phaseId = button.dataset.sfStage ?? '';
      for (let position = 1; position <= index; position += 1) {
        if (run.records[position - 1].phase === phaseId) {
          stopPlay();
          go(position);
          return;
        }
      }
    });
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      activeTab = (tab.dataset.sfTab ?? 'record') as Tab;
      syncTabs();
    });
  }

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === ' ' && target?.closest('button')) return;
    if (event.key === ' ') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stopPlay();
      go(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stopPlay();
      go(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      stopPlay();
      go(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      stopPlay();
      go(lastIndex());
    }
  });

  if (reducedMotion) {
    playButton.disabled = true;
    playButton.textContent = '减少动画已开启';
  }
}

const root = document.querySelector<HTMLElement>('[data-sf-root]');
if (root) mount(root);
