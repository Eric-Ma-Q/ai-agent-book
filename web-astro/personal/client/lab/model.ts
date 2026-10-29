// Pure logic for the lab page: grouping trace events into turns, the context
// segment bar, per-turn context diffs and config diffs. No DOM, unit tested.
import type {
  GateEvent,
  InfoEvent,
  KnobGroup,
  LabEvent,
  LlmRequest,
  LlmResponse,
  Message,
  RunEnd,
  RunStart,
  ToolCall,
} from './types.ts';

export type LlmCall = { purpose: string; request: LlmRequest; response?: LlmResponse };
export type Turn = { turn: number; calls: LlmCall[]; tools: ToolCall[]; infos: InfoEvent[] };
export type RunView = {
  start?: RunStart;
  turns: Turn[];
  preInfos: InfoEvent[];
  gates: GateEvent[];
  end?: RunEnd;
  /** Chapter 10 sub-agents, each grouped like a run of its own (keyed sub-1, sub-2…). */
  subagents: Record<string, RunView>;
};

/** Which agent an event belongs to; traces from before chapter 10 have no label and are all the main agent. */
const agentOf = (event: LabEvent) => ('agent' in event && event.agent) || 'main';
const isSubagent = (agent: string) => agent.startsWith('sub-');

export function agentLabel(agent: string) {
  if (agent === 'main') return '主 Agent';
  if (agent === 'reviewer') return '审核者';
  return isSubagent(agent) ? `子 Agent ${agent.slice(4)}` : agent;
}

export function groupRun(events: LabEvent[]): RunView {
  const subEvents = new Map<string, LabEvent[]>();
  const own: LabEvent[] = [];
  for (const event of events) {
    const agent = agentOf(event);
    if (isSubagent(agent)) subEvents.set(agent, [...(subEvents.get(agent) ?? []), { ...event, agent: 'main' } as LabEvent]);
    else own.push(event);
  }
  const view: RunView = {
    turns: [],
    preInfos: [],
    gates: [],
    subagents: Object.fromEntries([...subEvents].map(([agent, items]) => [agent, groupRun(items)])),
  };
  const turns = new Map<number, Turn>();
  const turnOf = (n: number) => {
    let turn = turns.get(n);
    if (!turn) {
      turn = { turn: n, calls: [], tools: [], infos: [] };
      turns.set(n, turn);
      view.turns.push(turn);
    }
    return turn;
  };
  const ordered = [...own].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  for (const event of ordered) {
    switch (event.type) {
      case 'run_start':
        view.start = event;
        break;
      case 'llm_request':
        turnOf(event.turn).calls.push({ purpose: event.purpose, request: event });
        break;
      case 'llm_response': {
        const calls = turnOf(event.turn).calls;
        const open = calls.find((call) => !call.response && call.purpose === event.purpose);
        if (open) open.response = event;
        break;
      }
      case 'tool_call':
        turnOf(event.turn).tools.push(event);
        break;
      case 'info':
        if (event.turn <= 0) view.preInfos.push(event);
        else turnOf(event.turn).infos.push(event);
        break;
      case 'gate': {
        // Later events for the same action replace the pending one.
        const index = view.gates.findIndex((gate) => gate.action_id === event.action_id);
        if (index >= 0) view.gates[index] = event;
        else view.gates.push(event);
        break;
      }
      case 'run_end':
        view.end = event;
        break;
    }
  }
  view.turns.sort((a, b) => a.turn - b.turn);
  return view;
}

/** The sub-agent a delegate tool call started (from the subagent_start note in the same turn). */
export function subagentForCall(turn: Turn, callId: string): string | undefined {
  const start = turn.infos.find((info) => info.kind === 'subagent_start' && info.detail?.call_id === callId);
  return start ? String(start.detail.agent) : undefined;
}

/** The agent (not summary) request of a turn: what the model saw that turn. */
export function agentRequest(turn: Turn): LlmRequest | undefined {
  return turn.calls.find((call) => call.purpose === 'agent')?.request;
}

/**
 * What the model actually saw for a tool result: the matching tool message in
 * the next agent request. Undefined when the run ended before another request.
 */
export function seenToolContent(view: RunView, call: ToolCall): string | undefined {
  for (const turn of view.turns) {
    if (turn.turn <= call.turn) continue;
    const request = agentRequest(turn);
    const message = request?.messages.find((m) => m.role === 'tool' && m.tool_call_id === call.call_id);
    if (message) return String(message.content ?? '');
    if (request) return undefined;
  }
  return undefined;
}

export const SEGMENT_LABELS: Record<string, string> = {
  system: '系统提示',
  tools: '工具定义',
  user: '用户',
  assistant: '模型回复',
  tool: '工具结果',
};

export type Share = { key: string; label: string; value: number; share: number };

export function segmentShares(segments: Record<string, number> | undefined): { total: number; parts: Share[] } {
  const entries = Object.entries(segments ?? {}).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const order = Object.keys(SEGMENT_LABELS);
  const parts = entries
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([key, value]) => ({ key, label: SEGMENT_LABELS[key] ?? key, value, share: total ? value / total : 0 }));
  return { total, parts };
}

export type DiffStatus = 'same' | 'changed' | 'added';
export type MessageDiff = {
  items: { message: Message; status: DiffStatus; index: number }[];
  removed: number;
  firstChange: number; // index of the first message that differs; -1 when identical
};

const key = (message: Message) => JSON.stringify(message);

export function diffMessages(previous: Message[] | undefined, current: Message[]): MessageDiff {
  const prev = previous ?? [];
  const items = current.map((message, index) => {
    const status: DiffStatus = index >= prev.length ? 'added' : key(prev[index]) === key(message) ? 'same' : 'changed';
    return { message, status, index };
  });
  const firstDiff = items.findIndex((item) => item.status !== 'same');
  const removed = Math.max(prev.length - current.length, 0);
  return { items, removed, firstChange: firstDiff >= 0 ? firstDiff : removed ? current.length : -1 };
}

export function configDiff(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys
    .filter((name) => JSON.stringify(a[name]) !== JSON.stringify(b[name]))
    .map((name) => ({ key: name, a: a[name], b: b[name] }));
}

/** Only the fields whose value differs from the defaults. */
export function overrides(defaults: Record<string, unknown>, values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([name, value]) => JSON.stringify(defaults[name]) !== JSON.stringify(value)),
  );
}

export type ChapterPage = { chapter: number; title: string; href: string; tab: string };
export type ChapterNavItem = {
  key: string;
  label: string;
  title: string;
  changed: number;
  /** Chapter whose experiment is a whole tab rather than switches: the chip links there. */
  href?: string;
  /** Switch group whose chapter also has a tab: the group links to it. */
  page?: { href: string; tab: string };
};

/** Chapters whose experiments live on their own tab of the lab page. */
export const CHAPTER_PAGES: ChapterPage[] = [
  { chapter: 7, title: '第 7 章 · Agent 的评估', href: '#/evals', tab: '评估' },
  { chapter: 9, title: '第 9 章 · 持续进化', href: '#/rules', tab: '规则' },
];

/**
 * The chapter jump list in book order: one item per switch group (with how many of
 * its switches differ from the defaults), plus a link for chapters that only have a tab.
 */
export function chapterNav(groups: KnobGroup[], changed: Record<string, unknown>, pages: ChapterPage[] = []): ChapterNavItem[] {
  const pageOf = new Map(pages.map((page) => [page.chapter, page]));
  const fromGroups: [number, ChapterNavItem][] = groups.map((group) => {
    const page = pageOf.get(group.chapter);
    const item: ChapterNavItem = {
      key: `group-${group.chapter}`,
      label: `第 ${group.chapter} 章`,
      title: group.title,
      changed: group.fields.filter((field) => field.name in changed).length,
    };
    return [group.chapter, page ? { ...item, page: { href: page.href, tab: page.tab } } : item];
  });
  const withGroup = new Set(groups.map((group) => group.chapter));
  const fromPages: [number, ChapterNavItem][] = pages
    .filter((page) => !withGroup.has(page.chapter))
    .map((page) => [
      page.chapter,
      { key: `page-${page.chapter}`, label: `第 ${page.chapter} 章 · ${page.tab}`, title: `${page.title}（「${page.tab}」页）`, changed: 0, href: page.href },
    ]);
  return [...fromGroups, ...fromPages].sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

/** Evaluation / job states that will still change: keep polling. */
export const isActive = (status: string) => status === 'queued' || status === 'running';

export const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  ok: '完成',
  max_turns: '达到最大轮数',
  budget_exceeded: '超出 token 预算',
  llm_error: '模型接口出错',
  cancelled: '已取消',
  error: '出错',
  done: '已完成',
  failed: '失败',
  aborted: '已中止',
  pending: '待确认',
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已过期',
};

export const CITATION_LABELS: Record<string, string> = {
  verified: '核对通过',
  wrong_section: '小节不符',
  not_found: '原文找不到',
  too_short: '片段太短',
};

export const fmtNum = (value: unknown) =>
  value === null || value === undefined ? '未知' : typeof value === 'number' ? value.toLocaleString('zh-CN') : String(value);

export function fmtMs(value: unknown) {
  if (typeof value !== 'number') return '未知';
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

export function fmtMoney(value: unknown) {
  if (typeof value !== 'number') return '未知';
  if (value === 0) return '$0';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(3)}`;
}

export const fmtRate = (value: unknown) => (typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : '未知');

/** Cache hit share of a single response, null when either number is unknown. */
export function cacheRate(prompt: unknown, cached: unknown): number | null {
  if (typeof prompt !== 'number' || typeof cached !== 'number' || prompt <= 0) return null;
  return cached / prompt;
}

/** Tool results are JSON strings; show them indented when they parse. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function fmtValue(value: unknown): string {
  if (value === undefined) return '（默认）';
  if (Array.isArray(value)) return value.join(', ') || '（无）';
  if (typeof value === 'boolean') return value ? '开' : '关';
  return String(value);
}
