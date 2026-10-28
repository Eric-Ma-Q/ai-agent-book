// Requirement 014: client-side SelfLoop workbench. Everything is rendered from
// the deterministic engine in harness/selfloop/engine.mjs; no fetch, storage or
// real command execution. Data is inserted with textContent, never as markup.

import {
  DEFAULT_OPTIONS,
  GATES,
  SCENARIOS,
  STAGES,
  simulate,
  unifiedDiff,
} from '../../harness/selfloop/engine.mjs';
import type {
  Candidate,
  LoopOptions,
  Run,
  SimEvent,
  UnifiedDiff,
} from '../../harness/selfloop/engine.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stageById = new Map(STAGES.map((stage) => [stage.id, stage]));
const gateById = new Map(GATES.map((gate) => [gate.id, gate]));

type Tab = 'gates' | 'archive' | 'diff' | 'raw';

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

function svgElement(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function money(value: number) {
  return `$${value.toFixed(6)}`;
}

function bytesLabel(bytes: number) {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function scrollToNode(node: Element | null) {
  node?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function mount(root: HTMLElement) {
  const query = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const scenarioList = query<HTMLElement>('[data-sl-scenarios]')!;
  const optionsBox = query<HTMLElement>('[data-sl-options]')!;
  const stepButton = query<HTMLButtonElement>('[data-sl-step]')!;
  const playButton = query<HTMLButtonElement>('[data-sl-play]')!;
  const resetButton = query<HTMLButtonElement>('[data-sl-reset]')!;
  const backButton = query<HTMLButtonElement>('[data-sl-back]')!;
  const jumpButton = query<HTMLButtonElement>('[data-sl-jump]')!;
  const speedSelect = query<HTMLSelectElement>('[data-sl-speed]')!;
  const currentStage = query<HTMLElement>('[data-sl-current-stage]')!;
  const currentTitle = query<HTMLElement>('[data-sl-current-title]')!;
  const currentSummary = query<HTMLElement>('[data-sl-current-summary]')!;
  const progress = query<HTMLElement>('[data-sl-progress]')!;
  const progressBar = query<HTMLElement>('[data-sl-progressbar]')!;
  const metricsBox = query<HTMLElement>('[data-sl-metrics]')!;
  const chartBox = query<HTMLElement>('[data-sl-chart]')!;
  const chartNote = query<HTMLElement>('[data-sl-chart-note]')!;
  const candidatesBody = query<HTMLTableSectionElement>('[data-sl-candidates-body]')!;
  const candidatesNote = query<HTMLElement>('[data-sl-candidates-note]')!;
  const timeline = query<HTMLOListElement>('[data-sl-timeline]')!;
  const timelineEmpty = query<HTMLElement>('[data-sl-timeline-empty]')!;
  const rail = query<HTMLElement>('[data-sl-rail]')!;
  const inspectorTitle = query<HTMLElement>('[data-sl-inspector-title]')!;
  const inspectorMeta = query<HTMLElement>('[data-sl-inspector-meta]')!;
  const footStatus = query<HTMLElement>('[data-sl-foot-status]')!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-sl-tab]'));
  const panes = Array.from(root.querySelectorAll<HTMLElement>('[data-sl-pane]'));
  const workbench = query<HTMLElement>('#workbench');

  let scenarioId = SCENARIOS[0]?.id ?? 'verified';
  let options: LoopOptions = { ...DEFAULT_OPTIONS, ...(SCENARIOS[0]?.defaults ?? {}) };
  let run: Run = simulate({ scenarioId, options });
  let cursor = 0;
  let playing = false;
  let timer: number | undefined;
  let activeTab: Tab = 'gates';
  let selectedCandidateId: string | null = null;
  let diffBase: 'baseline' | 'previous' = 'baseline';

  const lastIndex = () => Math.max(0, run.events.length - 1);
  const currentEvent = (): SimEvent => run.events[Math.min(cursor, lastIndex())];
  const candidateById = (id: string | null | undefined) =>
    id ? run.candidates.find((item) => item.id === id) ?? null : null;
  const currentCandidate = (): Candidate | null => {
    const event = currentEvent();
    return candidateById(selectedCandidateId ?? event?.candidateId ?? event?.snapshot.bestCandidateId);
  };
  const visibleCandidates = (): Candidate[] =>
    run.candidates.filter(
      (candidate) => candidate.archivedAtEvent !== null && candidate.archivedAtEvent <= cursor,
    );
  const stageName = (id: string | undefined) => stageById.get(id ?? '')?.name ?? '准备';

  function stopPlay() {
    playing = false;
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    playButton.textContent = reducedMotion ? '减少动画已开启' : '自动播放';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function selectCandidate(id: string) {
    selectedCandidateId = id;
    activeTab = 'gates';
    renderAll();
  }

  function clearSelection() {
    selectedCandidateId = null;
  }

  function simulateAgain() {
    run = simulate({ scenarioId, options });
    cursor = 0;
    clearSelection();
  }

  function buildScenarios() {
    scenarioList.replaceChildren(
      ...SCENARIOS.map((item) => {
        const button = element('button', 'sl-scenario');
        button.type = 'button';
        button.dataset.scenarioId = item.id;
        button.setAttribute('aria-pressed', String(item.id === scenarioId));
        const head = element('span', 'sl-scenario-head');
        head.append(
          element('span', 'sl-scenario-title', item.title),
          element('span', 'sl-scenario-badge', item.badge ?? '场景'),
        );
        button.append(
          head,
          element('span', 'sl-scenario-task', item.task),
          element('span', 'sl-scenario-badge', `预期：${item.expectedStop}`),
        );
        button.title = item.description;
        button.addEventListener('click', () => {
          scenarioId = item.id;
          options = { ...DEFAULT_OPTIONS, ...(item.defaults ?? {}) };
          syncOptions();
          for (const other of scenarioList.querySelectorAll<HTMLButtonElement>('.sl-scenario')) {
            other.setAttribute('aria-pressed', String(other.dataset.scenarioId === scenarioId));
          }
          simulateAgain();
          activeTab = 'gates';
          renderAll();
        });
        return button;
      }),
    );
  }

  function selectField(
    key: 'maxRounds' | 'budgetUsd' | 'plateauK' | 'stopAfterRound',
    label: string,
    values: [number, string][],
    hint: string,
  ) {
    const wrap = element('label', 'sl-field');
    const select = element('select');
    select.dataset.opt = key;
    for (const [value, text] of values) {
      const option = element('option', undefined, text);
      option.value = String(value);
      select.append(option);
    }
    select.addEventListener('change', () => {
      options = { ...options, [key]: Number(select.value) };
      simulateAgain();
      renderAll();
    });
    wrap.append(element('span', 'sl-field-label', label), select, element('small', 'sl-field-hint', hint));
    return wrap;
  }

  function buildOptions() {
    const nodes: HTMLElement[] = [
      selectField(
        'maxRounds',
        '最大轮数',
        [
          [1, '1 轮'],
          [2, '2 轮'],
          [3, '3 轮'],
          [4, '4 轮'],
          [6, '6 轮'],
          [10, '10 轮（生产默认）'],
        ],
        '跑满仍没有停机条件时，以 max_rounds 结束。',
      ),
      selectField(
        'budgetUsd',
        '预算',
        [
          [0.00025, '$0.00025'],
          [0.00045, '$0.00045（演示）'],
          [0.001, '$0.001'],
          [2, '$2（生产默认）'],
        ],
        '累计成本在轮次之间比较，不在请求中途打断。',
      ),
      selectField(
        'plateauK',
        '平台期 K',
        [
          [1, '1 轮'],
          [2, '2 轮'],
          [3, '3 轮（生产默认）'],
          [5, '5 轮'],
        ],
        '连续 K 轮没有严格提升就停。',
      ),
      selectField(
        'stopAfterRound',
        '手动停止',
        [
          [0, '关闭'],
          [1, '第 1 轮后'],
          [2, '第 2 轮后'],
          [3, '第 3 轮后'],
        ],
        '模拟在轮次边界点「停止」，不会中断正在进行的验证。',
      ),
    ];

    const toggle = element('label', 'sl-toggle');
    const input = element('input');
    input.type = 'checkbox';
    input.dataset.opt = 'stopOnVerified';
    input.addEventListener('change', () => {
      options = { ...options, stopOnVerified: input.checked };
      simulateAgain();
      renderAll();
    });
    const copy = element('span', 'sl-toggle-copy');
    copy.append(
      element('strong', undefined, 'verified 后停机'),
      element('small', undefined, '关闭后，1.0 的候选也会被接受，但循环继续到预算或平台期。'),
    );
    toggle.append(input, element('span', 'sl-switch'), copy);
    nodes.push(toggle);
    optionsBox.replaceChildren(...nodes);
  }

  function syncOptions() {
    for (const select of optionsBox.querySelectorAll<HTMLSelectElement>('select[data-opt]')) {
      const key = select.dataset.opt as 'maxRounds' | 'budgetUsd' | 'plateauK' | 'stopAfterRound';
      select.value = String(options[key]);
    }
    const toggle = optionsBox.querySelector<HTMLInputElement>('input[data-opt="stopOnVerified"]');
    if (toggle) toggle.checked = options.stopOnVerified;
  }

  function renderHeader(event: SimEvent) {
    const stage = stageById.get(event.stage);
    currentStage.textContent = `${event.stage} · ${stage?.name ?? stageName(event.stage)}`;
    currentTitle.textContent = event.title;
    currentSummary.textContent = event.summary;
    progress.textContent = `事件 ${cursor + 1} / ${run.events.length}`;
    progressBar.style.width = `${((cursor + 1) / run.events.length) * 100}%`;
    const selected = candidateById(selectedCandidateId);
    inspectorTitle.textContent = selected ? `${selected.id} · 第 ${selected.round} 轮` : event.title;
    inspectorMeta.textContent = selected
      ? `事件 ${event.index + 1} · 已选中候选 · ${event.kind}`
      : `事件 ${event.index + 1} · ${event.stage} ${stage?.name ?? ''} · ${event.kind}`;

    if (event.kind === 'finished') {
      const summary = event.detail as unknown as {
        stopReason: string;
        bestScore: number;
        verified: boolean;
        bestVerified: boolean;
        tokensIn: number;
        tokensOut: number;
        costUsd: number;
      };
      footStatus.textContent =
        `已结束：${summary.stopReason} · 最优 ${summary.bestScore.toFixed(4)} · ` +
        `verified=${summary.verified}（最优候选 ${summary.bestVerified ? '是' : '否'}） · ` +
        `${summary.tokensIn}/${summary.tokensOut} tokens · ${money(summary.costUsd)}`;
    } else if (event.snapshot.stopReason) {
      footStatus.textContent = `已结束：${event.snapshot.stopReason} · 最优 ${event.snapshot.bestScore.toFixed(4)}`;
    } else if (selectedCandidateId) {
      footStatus.textContent = `已选中候选 ${selectedCandidateId} · 查看右侧闸门与 diff`;
    } else {
      footStatus.textContent = `第 ${event.round} 轮 · 离线模拟 · 无真实副作用`;
    }
  }

  function renderRail(event: SimEvent) {
    const seen = new Set(run.events.slice(0, cursor + 1).map((item) => item.stage));
    for (const button of rail.querySelectorAll<HTMLButtonElement>('[data-sl-rail-stage]')) {
      const id = button.dataset.slRailStage!;
      button.classList.toggle('is-current', id === event.stage);
      button.classList.toggle('is-seen', seen.has(id));
      button.setAttribute('aria-pressed', String(id === event.stage));
    }
  }

  function renderMetrics(event: SimEvent) {
    const snapshot = event.snapshot;
    const best = candidateById(snapshot.bestCandidateId);
    const items: { label: string; value: string; small: string; tone?: 'good' | 'bad' }[] = [
      {
        label: '最优分数',
        value: snapshot.bestScore.toFixed(4),
        small: best ? `${best.id} · 第 ${best.round} 轮` : '还没有最优候选',
        tone: snapshot.bestScore >= 1 ? 'good' : undefined,
      },
      {
        label: 'verified',
        value: String(snapshot.verified),
        small: best ? `最优候选 ${best.verified ? '已 verified' : '未 verified'}` : '还没有候选',
        tone: snapshot.verified ? 'good' : undefined,
      },
      {
        label: '累计成本',
        value: money(snapshot.costUsd),
        small: `预算 ${money(run.options.budgetUsd)}`,
      },
      {
        label: '平台期',
        value: `${snapshot.plateau} / ${run.options.plateauK}`,
        small: '连续无严格提升',
      },
      {
        label: 'tokens',
        value: `${snapshot.tokensIn} / ${snapshot.tokensOut}`,
        small: '输入 / 输出估算',
      },
      {
        label: '已入档',
        value: String(snapshot.candidateIds.length),
        small: `事件 ${event.index + 1} / ${run.events.length}`,
      },
    ];
    metricsBox.replaceChildren(
      ...items.map((item) => {
        const node = element('div', `sl-metric${item.tone ? ` is-${item.tone}` : ''}`);
        node.append(
          element('span', undefined, item.label),
          element('strong', undefined, item.value),
          element('small', undefined, item.small),
        );
        return node;
      }),
    );
  }

  function chartPoint(candidate: Candidate, x: number, y: number, selected: boolean) {
    const circle = svgElement('circle', {
      cx: x,
      cy: y,
      r: selected ? 7 : 5,
      class:
        'sl-chart-point ' +
        (candidate.isBaseline
          ? 'is-baseline'
          : candidate.verified
            ? 'is-verified'
            : candidate.accepted
              ? 'is-accepted'
              : 'is-rejected') +
        (selected ? ' is-selected' : ''),
      tabindex: 0,
      role: 'button',
      'aria-label': `${candidate.id}：第 ${candidate.round} 轮，分数 ${candidate.score.toFixed(4)}`,
    });
    const title = svgElement('title');
    title.textContent = `${candidate.id} · 第 ${candidate.round} 轮 · ${candidate.score.toFixed(4)} · ${
      candidate.verified ? 'verified' : candidate.accepted ? '接受' : '拒绝'
    }`;
    circle.append(title);
    circle.addEventListener('click', () => selectCandidate(candidate.id));
    circle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectCandidate(candidate.id);
      }
    });
    return circle;
  }

  function renderChart() {
    const candidates = visibleCandidates().slice().sort((a, b) => a.round - b.round);
    if (!candidates.length) {
      chartBox.replaceChildren(element('p', 'sl-chart-empty', '候选入档后出现分数曲线。'));
      chartNote.textContent = '还没有已入档候选';
      return;
    }
    const width = Math.max(280, Math.round(chartBox.getBoundingClientRect().width) || 640);
    const height = 200;
    const margin = { left: width < 360 ? 30 : 36, right: 12, top: 18, bottom: 26 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxRound = Math.max(run.options.maxRounds, ...candidates.map((candidate) => candidate.round), 1);
    const x = (round: number) => margin.left + (round / maxRound) * plotWidth;
    const y = (score: number) => margin.top + (1 - score) * plotHeight;

    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `分数曲线：${candidates.length} 个候选，最高 ${Math.max(
        ...candidates.map((candidate) => candidate.score),
      ).toFixed(4)}`,
    });

    for (const value of [0, 0.5, 1]) {
      const line = svgElement('line', {
        x1: margin.left,
        x2: width - margin.right,
        y1: y(value),
        y2: y(value),
        class: 'sl-chart-grid',
      });
      svg.append(line);
      const label = svgElement('text', { x: margin.left - 8, y: y(value) + 3, 'text-anchor': 'end' });
      label.textContent = value.toFixed(1);
      svg.append(label);
    }
    svg.append(
      svgElement('line', {
        x1: margin.left,
        x2: width - margin.right,
        y1: height - margin.bottom,
        y2: height - margin.bottom,
        class: 'sl-chart-axis',
      }),
    );

    const ticks: number[] = [];
    const step = maxRound > 8 ? 2 : 1;
    for (let round = 0; round <= maxRound; round += step) ticks.push(round);
    if (ticks[ticks.length - 1] !== maxRound) ticks.push(maxRound);
    for (const round of ticks) {
      const label = svgElement('text', {
        x: x(round),
        y: height - margin.bottom + 14,
        'text-anchor': 'middle',
      });
      label.textContent = String(round);
      svg.append(label);
    }

    const path = svgElement('path', {
      class: 'sl-chart-line',
      d: candidates
        .map((candidate, index) => `${index === 0 ? 'M' : 'L'} ${x(candidate.round)} ${y(candidate.score)}`)
        .join(' '),
    });
    svg.append(path);

    for (const candidate of candidates) {
      const px = x(candidate.round);
      const py = y(candidate.score);
      svg.append(chartPoint(candidate, px, py, candidate.id === selectedCandidateId));
      const scoreLabel = svgElement('text', {
        x: px,
        y: py - 11,
        'text-anchor': 'middle',
      });
      scoreLabel.textContent = candidate.score.toFixed(3);
      svg.append(scoreLabel);
    }

    chartBox.replaceChildren(svg);
    const best = Math.max(...candidates.map((candidate) => candidate.score));
    chartNote.textContent = `${candidates.length} 个已入档 · 最高 ${best.toFixed(4)} · 点击圆点看闸门`;
  }

  function verdictPill(candidate: Candidate) {
    if (candidate.accepted === null) return element('span', 'sl-pill', '未裁决');
    const pill = element('span', `sl-pill ${candidate.accepted ? 'is-ok' : 'is-bad'}`);
    pill.textContent = candidate.accepted ? '接受' : '拒绝';
    return pill;
  }

  function renderCandidates() {
    const candidates = visibleCandidates();
    if (!candidates.length) {
      const row = element('tr');
      const cell = element('td', 'sl-muted', '还没有候选入档；单步走过 baseline_archive 后出现。');
      cell.colSpan = 7;
      row.append(cell);
      candidatesBody.replaceChildren(row);
      candidatesNote.textContent = '还没有已入档候选';
      return;
    }
    candidatesBody.replaceChildren(
      ...candidates.map((candidate) => {
        const row = element(
          'tr',
          `sl-candidate-row${candidate.id === selectedCandidateId ? ' is-selected' : ''}${
            candidate.accepted === false ? ' is-rejected' : ''
          }`,
        );
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `候选 ${candidate.id}，第 ${candidate.round} 轮，分数 ${candidate.score.toFixed(4)}`);
        row.addEventListener('click', () => selectCandidate(candidate.id));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectCandidate(candidate.id);
          }
        });
        const idCell = element('span');
        idCell.append(element('code', 'sl-candidate-id', candidate.id));
        if (!candidate.integrity.ok) {
          const integrity = element('span', 'sl-pill is-bad', '完整性 ✗');
          integrity.style.marginLeft = '4px';
          idCell.append(integrity);
        }
        idCell.append(
          element(
            'span',
            'sl-candidate-gates',
            `可见 ${candidate.visible.passed}/${candidate.visible.total} · 隐藏 ${candidate.hidden.passed}/${candidate.hidden.total} · canary ${candidate.canary.passed}/${candidate.canary.total}`,
          ),
        );
        const cells: (string | HTMLElement)[] = [
          candidate.round === 0 ? '基线' : String(candidate.round),
          idCell,
          `${candidate.visible.passed}/${candidate.visible.total}`,
          `${candidate.hidden.passed}/${candidate.hidden.total}`,
          `${candidate.canary.passed}/${candidate.canary.total}`,
          element('span', 'sl-score', candidate.score.toFixed(4)),
          (() => {
            const wrap = element('span');
            wrap.append(verdictPill(candidate));
            if (candidate.verified) {
              const verified = element('span', 'sl-pill is-accent', 'verified');
              verified.style.marginLeft = '4px';
              wrap.append(verified);
            }
            return wrap;
          })(),
        ];
        for (const value of cells) {
          const cell = element('td');
          if (value instanceof Node) cell.append(value);
          else cell.textContent = value;
          row.append(cell);
        }
        return row;
      }),
    );
    candidatesNote.textContent = `${candidates.length} 个已入档 · 点击一行选中 · 窄屏可左右滑动`;
  }

  function renderTimeline() {
    const nodes: HTMLLIElement[] = [];
    run.events.forEach((item, index) => {
      const li = element('li', `sl-event sl-event-${item.tone}`);
      li.dataset.index = String(index);
      li.classList.toggle('is-past', index < cursor);
      li.classList.toggle('is-current', index === cursor);
      li.classList.toggle('is-future', index > cursor);
      const button = element('button', 'sl-event-button');
      button.type = 'button';
      button.disabled = index > cursor;
      button.setAttribute(
        'aria-label',
        `事件 ${index + 1}：${item.title}${index === cursor ? '（当前）' : index > cursor ? '（待执行）' : ''}`,
      );
      const idx = element('span', 'sl-event-index', String(index + 1).padStart(2, '0'));
      const body = element('span', 'sl-event-body');
      const top = element('span', 'sl-event-top');
      top.append(
        element('span', 'sl-stage-badge', item.stage),
        element('strong', 'sl-event-title', item.title),
        element('span', 'sl-event-kind', item.kind),
      );
      body.append(top, element('span', 'sl-event-summary', item.summary));
      const state = element(
        'span',
        'sl-event-state',
        index === cursor ? '当前' : index > cursor ? '待执行' : '已发生',
      );
      button.append(idx, body, state);
      button.addEventListener('click', () => {
        if (index > cursor) return;
        stopPlay();
        cursor = index;
        clearSelection();
        renderAll();
      });
      li.append(button);
      nodes.push(li);
    });
    timeline.replaceChildren(...nodes);
    timelineEmpty.hidden = nodes.length > 0;
    const current = timeline.querySelector<HTMLElement>('.is-current');
    const wrap = timeline.parentElement;
    if (current && wrap) {
      const currentRect = current.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      if (currentRect.top < wrapRect.top || currentRect.bottom > wrapRect.bottom) {
        wrap.scrollTop += currentRect.top - wrapRect.top - 8;
      }
    }
  }

  function pane(tab: Tab) {
    return panes.find((item) => item.dataset.slPane === tab)!;
  }

  function gateCard(
    id: string,
    value: string,
    meta: string,
    failures: HTMLElement[],
    failed: boolean,
    pending = false,
  ) {
    const gate = gateById.get(id)!;
    const card = element('article', `sl-gate-card${failed ? ' is-fail' : ''}${pending ? ' is-pending' : ''}`);
    const head = element('div', 'sl-gate-card-head');
    head.append(element('h3', undefined, gate.name), element('span', `sl-gate-value${failed ? ' is-fail' : ''}`, value));
    card.append(head, element('p', 'sl-gate-weight', meta));
    if (pending) {
      card.append(element('p', undefined, '等待该阶段执行。'));
    } else if (failures.length) {
      const list = element('ul', 'sl-failure-list');
      list.append(...failures);
      card.append(list);
    } else {
      card.append(element('p', undefined, failed ? '有失败，但没有可展示的样本。' : '没有失败样本。'));
    }
    return card;
  }

  function failureLine(text: string) {
    return element('li', undefined, text);
  }

  function renderGates(candidate: Candidate | null, event: SimEvent) {
    const target = pane('gates');
    const nodes: HTMLElement[] = [];

    if (event.kind === 'stop_check' && Array.isArray(event.detail.checks)) {
      const box = element('div', 'sl-summary-box');
      box.append(element('h3', undefined, '停机检查'));
      const list = element('ul', 'sl-checklist');
      for (const check of event.detail.checks as Array<Record<string, any>>) {
        const item = element('li');
        item.append(
          element('span', check.met ? 'sl-check-mark is-ok' : 'sl-check-mark', check.met ? '✓' : '·'),
          element('span', undefined, String(check.label)),
          element('code', undefined, `${check.value} / ${check.threshold}`),
        );
        list.append(item);
      }
      box.append(list);
      nodes.push(box);
    }

    if (
      event.kind === 'finished' &&
      (!selectedCandidateId || selectedCandidateId === event.snapshot.bestCandidateId)
    ) {
      const detail = event.detail as Record<string, any>;
      const box = element('div', 'sl-summary-box');
      box.append(
        element('h3', undefined, `运行摘要 · 停机：${detail.stopReason ?? detail.reason}`),
        element('p', undefined, String(detail.explanation ?? '')),
      );
      const stats = element('ul', 'sl-checklist');
      for (const [label, value] of [
        ['最优分数', Number(detail.bestScore ?? 0).toFixed(4)],
        ['verified 标志', String(detail.verified)],
        ['最优候选 verified', String(detail.bestVerified)],
        ['累计成本', money(Number(detail.costUsd ?? 0))],
        ['候选数', String(detail.candidates ?? '')],
        [
          '被拒轮次',
          Array.isArray(detail.rejectedRounds) && detail.rejectedRounds.length
            ? detail.rejectedRounds.join('、')
            : '无',
        ],
      ]) {
        const item = element('li');
        item.append(element('span', undefined, label), element('code', undefined, value));
        stats.append(item);
      }
      box.append(stats);
      nodes.push(box);
    }

    if (!candidate) {
      nodes.push(
        element(
          'p',
          'sl-muted',
          '此时还没有候选。单步走过基线验证或提议事件后，这里会出现四道闸门。',
        ),
      );
      target.replaceChildren(...nodes);
      return;
    }

    const candidateEventIndex = (kind: string) =>
      run.events.findIndex((item) => item.candidateId === candidate.id && item.kind === kind);
    const baselineVerifyIndex = run.events.findIndex((item) => item.kind === 'baseline_verify');
    const gateReady = (kind: string, baselineReady = false) => {
      const index = candidate.isBaseline
        ? baselineReady
          ? baselineVerifyIndex
          : -1
        : candidateEventIndex(kind);
      return index >= 0 && index <= cursor;
    };
    const visibleReady = gateReady('visible_gate', true);
    const hiddenReady = gateReady('hidden_gate', true);
    const canaryReady = gateReady('canary_gate', true);
    const integrityReady = gateReady('integrity_gate', true);
    const scoreReady = gateReady('score_computed', true);
    const verifiedReady = gateReady('verified_check', true);

    const summary = element('div', 'sl-summary-box');
    const head = element('div', 'sl-gate-card-head');
    head.append(
      element('h3', undefined, `${candidate.id} · 第 ${candidate.round} 轮`),
      element('span', 'sl-score', scoreReady ? candidate.score.toFixed(4) : '—'),
    );
    summary.append(head, element('p', undefined, candidate.rationale));
    const pills = element('p');
    pills.append(verdictPill(candidate));
    if (verifiedReady && candidate.verified) {
      const verified = element('span', 'sl-pill is-accent', 'verified');
      verified.style.marginLeft = '4px';
      pills.append(verified);
    }
    const sourceInfo = element(
      'span',
      'sl-pill',
      `${candidate.sourceBytes} B · ≈${candidate.tokensIn}/${candidate.tokensOut} tokens`,
    );
    sourceInfo.style.marginLeft = '4px';
    pills.append(sourceInfo);
    summary.append(pills);
    nodes.push(summary);

    const visibleRatio = candidate.visible.total ? candidate.visible.passed / candidate.visible.total : 0;
    const hiddenRatio = candidate.hidden.total ? candidate.hidden.passed / candidate.hidden.total : 0;
    const canaryOk = candidate.canary.total > 0 && candidate.canary.passed === candidate.canary.total;
    const grid = element('div', 'sl-gate-grid');

    const visibleFailures = visibleReady
      ? candidate.visible.failures.map((failure) =>
          failureLine(`${failure.test}: ${failure.reason}`),
        )
      : [];
    grid.append(
      gateCard(
        'visible',
        visibleReady ? `${candidate.visible.passed} / ${candidate.visible.total}` : '待验证',
        visibleReady ? `35% 权重 · ratio ${pct(visibleRatio)}` : '35% 权重 · 等待沙箱执行',
        visibleFailures,
        visibleReady && candidate.visible.passed !== candidate.visible.total,
        !visibleReady,
      ),
    );

    const hiddenFailures = hiddenReady
      ? candidate.hidden.failures
          .slice(0, 3)
          .map((failure) =>
            failureLine(
              `${failure.fn}(${failure.args}) → expected ${failure.expected}, got ${failure.got}`,
            ),
          )
      : [];
    grid.append(
      gateCard(
        'hidden',
        hiddenReady ? `${candidate.hidden.passed} / ${candidate.hidden.total}` : '待验证',
        hiddenReady
          ? `65% 权重 · ratio ${pct(hiddenRatio)} · 详情不进入提示词`
          : '65% 权重 · 等待隐藏用例执行',
        hiddenFailures,
        hiddenReady && candidate.hidden.passed !== candidate.hidden.total,
        !hiddenReady,
      ),
    );

    const canaryFailures = canaryReady
      ? candidate.canary.failures
          .slice(0, 3)
          .map((failure) => failureLine(`${failure.fn}(${failure.args}) → expected ${failure.expected}, got ${failure.got}`))
      : [];
    grid.append(
      gateCard(
        'canary',
        canaryReady ? `${candidate.canary.passed} / ${candidate.canary.total}` : '待验证',
        canaryReady
          ? canaryOk
            ? '门禁通过 · 不参与分数'
            : '门禁失败 · 分数可能仍是 1.0'
          : '门禁 · 等待分布外用例执行',
        canaryFailures,
        canaryReady && !canaryOk,
        !canaryReady,
      ),
    );

    const integrityLines = integrityReady
      ? [
          ...candidate.integrity.issues.map((issue) => failureLine(issue)),
          ...candidate.integrity.warnings.map((warning) => failureLine(warning)),
        ]
      : [];
    grid.append(
      gateCard(
        'integrity',
        integrityReady ? (candidate.integrity.ok ? '通过' : '失败') : '待验证',
        integrityReady
          ? candidate.integrity.ok
            ? '门禁通过 · 没有命中禁用能力'
            : '门禁失败 · 分数直接归零'
          : '门禁 · 等待源码扫描',
        integrityLines,
        integrityReady && !candidate.integrity.ok,
        !integrityReady,
      ),
    );
    nodes.push(grid);

    const weighted = 0.35 * visibleRatio + 0.65 * hiddenRatio;
    const formula = element('pre', 'sl-formula');
    formula.textContent = !scoreReady
      ? '分数将在四道闸门跑完后计算。'
      : candidate.integrity.ok
        ? `score = 0.35 × ${candidate.visible.passed}/${candidate.visible.total} + 0.65 × ${candidate.hidden.passed}/${candidate.hidden.total}\n      = 0.35 × ${visibleRatio.toFixed(4)} + 0.65 × ${hiddenRatio.toFixed(4)}\n      = ${candidate.score.toFixed(4)}`
        : `加权原始值 = 0.35 × ${candidate.visible.passed}/${candidate.visible.total} + 0.65 × ${candidate.hidden.passed}/${candidate.hidden.total}\n          = ${weighted.toFixed(4)}\n完整性失败 → score = 0.0000`;
    nodes.push(formula);

    if (verifiedReady) {
      const checks = element('ul', 'sl-checklist');
      const checkRows: [string, boolean, string][] = [
        ['完整性通过', candidate.integrity.ok, candidate.integrity.ok ? 'true' : 'false'],
        [
          '可见测试全部通过',
          candidate.visible.passed === candidate.visible.total && candidate.visible.total > 0,
          `${candidate.visible.passed}/${candidate.visible.total}`,
        ],
        [
          '隐藏用例全部通过',
          candidate.hidden.passed === candidate.hidden.total,
          `${candidate.hidden.passed}/${candidate.hidden.total}`,
        ],
        ['canary 全部通过', canaryOk, `${candidate.canary.passed}/${candidate.canary.total}`],
      ];
      for (const [label, ok, value] of checkRows) {
        const item = element('li');
        const mark = element('span', `sl-check-mark ${ok ? 'is-ok' : 'is-fail'}`, ok ? '✓' : '✗');
        item.append(mark, element('span', undefined, label), element('code', undefined, value));
        checks.append(item);
      }
      nodes.push(element('p', 'sl-pane-meta', `verified = ${candidate.verified}`), checks);
    } else {
      nodes.push(element('p', 'sl-pane-meta', 'verified 判定将在评分后出现。'));
    }

    const promptEvent = run.events
      .slice(0, cursor + 1)
      .reverse()
      .find((item) => item.kind === 'prompt_built');
    if (promptEvent) {
      const details = element('details', 'sl-state-section');
      details.append(
        element(
          'summary',
          undefined,
          `提示词 · 第 ${promptEvent.round} 轮 · ≈${promptEvent.detail.tokensIn} tokens`,
        ),
      );
      details.append(
        element(
          'p',
          'sl-muted',
          '隐藏用例与 canary 的详情不在这里；模型只能看到聚合数字与可见失败。',
        ),
      );
      details.append(element('pre', 'sl-code sl-raw', String(promptEvent.detail.prompt ?? '')));
      nodes.push(details);
    }

    target.replaceChildren(...nodes);
  }

  function archiveMeta(event: SimEvent): Record<string, any> {
    if (event.detail.meta && typeof event.detail.meta === 'object') {
      return event.detail.meta as Record<string, any>;
    }
    const snapshot = event.snapshot;
    return {
      run_id: run.archive.runId,
      created_at: run.archive.meta.created_at,
      status: snapshot.status,
      stop_reason: snapshot.stopReason,
      config: run.archive.meta.config,
      round: snapshot.round,
      best_score: snapshot.bestScore,
      best_candidate: snapshot.bestCandidateId,
      verified: snapshot.verified,
      tokens_in: snapshot.tokensIn,
      tokens_out: snapshot.tokensOut,
      cost_usd: snapshot.costUsd,
      plateau_count: snapshot.plateau,
    };
  }

  function archiveContent(path: string, event: SimEvent): string {
    const snapshot = event.snapshot;
    if (path === 'meta.json') return JSON.stringify(archiveMeta(event), null, 2);
    if (path === 'candidates.jsonl') {
      const allowed = new Set(snapshot.candidateIds);
      const rows = run.archive.candidatesJsonl
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, any>)
        .filter((row) => allowed.has(String(row.id)));
      return rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '';
    }
    if (path === 'best.py') {
      const best = candidateById(snapshot.bestCandidateId);
      return best?.source ?? '';
    }
    if (path.startsWith('snapshots/')) {
      const id = path.slice('snapshots/'.length, -3);
      return run.archive.snapshots[id] ?? candidateById(id)?.source ?? '';
    }
    if (path === 'events.jsonl') {
      const lines = run.archive.eventsJsonl.trim().split('\n').filter(Boolean);
      return lines.slice(0, Math.max(0, Number(event.snapshot.archivedFiles.find((file) => file.path === path)?.lines ?? 0))).join('\n') + (lines.length ? '\n' : '');
    }
    return '';
  }

  function renderArchive(event: SimEvent) {
    const target = pane('archive');
    const nodes: HTMLElement[] = [];
    const snapshot = event.snapshot;
    const meta = archiveMeta(event);
    const grid = element('div', 'sl-archive-meta');
    for (const [label, value] of [
      ['run_id', String(meta.run_id ?? run.archive.runId)],
      ['status', String(meta.status ?? snapshot.status)],
      ['stop_reason', String(meta.stop_reason ?? snapshot.stopReason ?? '—')],
      ['best_candidate', String(meta.best_candidate ?? snapshot.bestCandidateId ?? '—')],
      ['best_score', Number(meta.best_score ?? snapshot.bestScore).toFixed(4)],
      ['verified', String(meta.verified ?? snapshot.verified)],
      ['tokens', `${snapshot.tokensIn} / ${snapshot.tokensOut}`],
      ['cost_usd', money(snapshot.costUsd)],
    ]) {
      const item = element('div');
      item.append(element('span', undefined, label), element('strong', undefined, value));
      grid.append(item);
    }
    nodes.push(
      element(
        'p',
        'sl-muted',
        '内存 RunStore：结构对齐 archive.py，但不写磁盘；id 用确定性编号代替时间戳与随机后缀。',
      ),
      grid,
    );

    const files = element('div', 'sl-archive-files');
    for (const file of snapshot.archivedFiles) {
      const details = element('details', 'sl-archive-file');
      details.open = file.path === 'meta.json';
      const summary = element('summary');
      summary.append(
        element('code', undefined, file.path),
        element('span', undefined, `${bytesLabel(file.bytes)} · ${file.lines} 行`),
      );
      details.append(summary, element('pre', undefined, archiveContent(file.path, event)));
      files.append(details);
    }
    nodes.push(files);

    const current = currentCandidate();
    if (current) {
      const details = element('details', 'sl-state-section');
      details.append(element('summary', undefined, `当前候选源码 · ${current.id}`));
      details.append(element('pre', 'sl-code sl-raw', current.source));
      nodes.push(details);
    }

    target.replaceChildren(...nodes);
  }

  function previousAccepted(candidate: Candidate): Candidate | undefined {
    return run.candidates
      .filter(
        (item) =>
          item.round < candidate.round &&
          item.accepted === true &&
          item.archivedAtEvent !== null,
      )
      .at(-1);
  }

  function renderDiff(candidate: Candidate | null) {
    const target = pane('diff');
    if (!candidate) {
      target.replaceChildren(element('p', 'sl-muted', '选中一个候选后看 unified diff。'));
      return;
    }
    if (candidate.isBaseline) {
      target.replaceChildren(
        element('p', 'sl-muted', '基线候选没有 diff；它在第 0 轮定义起点。'),
        element('pre', 'sl-code sl-raw', candidate.source),
      );
      return;
    }

    const base =
      diffBase === 'previous'
        ? previousAccepted(candidate) ?? run.candidates[0]
        : run.candidates[0];
    if (!base) {
      target.replaceChildren(element('p', 'sl-muted', '找不到 diff 基线。'));
      return;
    }
    const fromFile = diffBase === 'previous' ? `${base.id}.py` : 'baseline.py';
    const diff: UnifiedDiff = unifiedDiff(base.source, candidate.source, {
      fromFile,
      toFile: `${candidate.id}.py`,
    });

    const toolbar = element('div', 'sl-diff-toolbar');
    const label = element('span', undefined, '对比');
    const select = element('select');
    for (const [value, text] of [
      ['baseline', '基线'],
      ['previous', '上一接受候选'],
    ] as const) {
      const option = element('option', undefined, text);
      option.value = value;
      select.append(option);
    }
    select.value = diffBase;
    select.addEventListener('change', () => {
      diffBase = select.value as 'baseline' | 'previous';
      renderDiff(currentCandidate());
    });
    toolbar.append(label, select, element('span', undefined, `${candidate.id} · ${candidate.sourceBytes} B`));

    const box = element('div', 'sl-diff');
    box.append(element('div', 'sl-diff-head', `--- ${diff.fromFile}\n+++ ${diff.toFile}`));
    if (!diff.changed) {
      box.append(element('p', 'sl-muted', '与所选基线没有行级差异。'));
    } else {
      for (const hunk of diff.hunks) {
        box.append(element('div', 'sl-diff-hunk', hunk.header));
        for (const line of hunk.lines) {
          const row = element(
            'div',
            `sl-diff-line ${line.kind === '+' ? 'is-add' : line.kind === '-' ? 'is-del' : 'is-ctx'}`,
          );
          row.append(
            element('span', 'sl-diff-no', line.oldNo ?? ''),
            element('span', 'sl-diff-no', line.newNo ?? ''),
            element('span', 'sl-diff-text', `${line.kind}${line.text}`),
          );
          box.append(row);
        }
      }
    }
    target.replaceChildren(toolbar, box);
  }

  function renderRaw(event: SimEvent) {
    const target = pane('raw');
    const raw = {
      id: event.id,
      index: event.index,
      round: event.round,
      stage: event.stage,
      kind: event.kind,
      tone: event.tone,
      title: event.title,
      summary: event.summary,
      candidateId: event.candidateId,
      detail: event.detail,
      snapshot: event.snapshot,
    };
    target.replaceChildren(
      element(
        'p',
        'sl-pane-meta',
        '当前事件的输入/输出；完整提示词在闸门页的「提示词」折叠块，档案在「档案」页。',
      ),
      element('pre', 'sl-code sl-raw', JSON.stringify(raw, null, 2)),
    );
  }

  function renderInspector(event: SimEvent) {
    const candidate = currentCandidate();
    renderGates(candidate, event);
    renderArchive(event);
    renderDiff(candidate);
    renderRaw(event);
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab.dataset.slTab === activeTab));
    }
    for (const item of panes) {
      item.hidden = item.dataset.slPane !== activeTab;
    }
  }

  function renderAll() {
    if (!run.events.length) return;
    cursor = Math.max(0, Math.min(cursor, lastIndex()));
    const event = currentEvent();
    renderHeader(event);
    renderRail(event);
    renderMetrics(event);
    renderChart();
    renderCandidates();
    renderTimeline();
    renderInspector(event);
  }

  function advance() {
    if (cursor >= lastIndex()) {
      stopPlay();
      return;
    }
    cursor += 1;
    clearSelection();
    renderAll();
    if (currentEvent().kind === 'finished') stopPlay();
  }

  function step() {
    stopPlay();
    advance();
  }

  function back() {
    if (cursor <= 0) return;
    stopPlay();
    cursor -= 1;
    clearSelection();
    renderAll();
  }

  function jumpToEnd() {
    stopPlay();
    cursor = lastIndex();
    clearSelection();
    renderAll();
  }

  function resetRun() {
    stopPlay();
    simulateAgain();
    renderAll();
  }

  function startPlay() {
    if (playing || reducedMotion) return;
    if (cursor >= lastIndex()) {
      cursor = 0;
      clearSelection();
      renderAll();
    }
    playing = true;
    playButton.textContent = '暂停';
    playButton.setAttribute('aria-pressed', 'true');
    const speed = Number(speedSelect.value) || 650;
    timer = window.setInterval(() => {
      advance();
      if (cursor >= lastIndex()) stopPlay();
    }, speed);
  }

  function togglePlay() {
    if (playing) stopPlay();
    else startPlay();
  }

  function focusStage(stageId: string) {
    const index = run.events.findIndex((event) => event.stage === stageId);
    if (index < 0) {
      footStatus.textContent = '这个场景没有该阶段的事件。';
      return;
    }
    stopPlay();
    cursor = index;
    clearSelection();
    renderAll();
    scrollToNode(workbench);
  }

  function setTab(tab: string) {
    activeTab = tab as Tab;
    renderInspector(currentEvent());
  }

  function bindEvents() {
    stepButton.addEventListener('click', step);
    playButton.addEventListener('click', togglePlay);
    resetButton.addEventListener('click', resetRun);
    backButton.addEventListener('click', back);
    jumpButton.addEventListener('click', jumpToEnd);
    for (const tab of tabs) {
      tab.addEventListener('click', () => setTab(tab.dataset.slTab ?? 'gates'));
    }
    for (const button of rail.querySelectorAll<HTMLButtonElement>('[data-sl-rail-stage]')) {
      button.addEventListener('click', () => focusStage(button.dataset.slRailStage ?? 'P1'));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sl-see-stage]')) {
      button.addEventListener('click', () => focusStage(button.dataset.slSeeStage ?? 'P1'));
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
  if (reducedMotion) {
    playButton.disabled = true;
    playButton.textContent = '减少动画已开启';
    playButton.title = '系统开启了 prefers-reduced-motion，自动播放已禁用；仍可单步。';
  }
  renderAll();
}

const root = document.querySelector<HTMLElement>('[data-sl-root]');
if (root) mount(root);
