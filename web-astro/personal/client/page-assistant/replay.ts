// 运行回放：校验 /page/runs/<id>/replay 的投影，并在面板里画成轮次时间线。
// 不调用模型，也不展示消息正文；服务端已经裁剪过，客户端再兜一层长度。

import { statusText } from './model.ts';

export type ReplayTool = {
  name: string;
  args: string;
  result: string;
  durationMs: number;
  error: string;
  truncated: boolean;
};

export type ReplayRequest = { messageCount: number; tools: string[]; segments: Record<string, number> };
export type ReplayResponse = {
  latencyMs: number;
  usage: Record<string, number>;
  finishReason: string;
  model: string;
  error: string;
  retries: number;
};

export type ReplayTurn = {
  turn: number;
  request: ReplayRequest | null;
  response: ReplayResponse | null;
  tools: ReplayTool[];
  notes: { kind: string; detail: string }[];
};

export type Replay = {
  runId: string;
  question: string;
  model: string;
  status: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totals: Record<string, number>;
  turns: ReplayTurn[];
  answer: string;
  error: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function numbers(value: unknown): Record<string, number> {
  const source = record(value);
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(source)) {
    const parsed = Number(item);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, limit).map((item) => item.slice(0, 80));
}

function parseTurn(raw: unknown): ReplayTurn | null {
  const data = record(raw);
  const turn = Math.floor(number(data.turn));
  if (turn < 1 || turn > 10_000) return null;
  const requestData = data.request === null || data.request === undefined ? null : record(data.request);
  const responseData = data.response === null || data.response === undefined ? null : record(data.response);
  const request = requestData
    ? {
        messageCount: Math.floor(number(requestData.messageCount)),
        tools: strings(requestData.tools, 40),
        segments: numbers(requestData.segments),
      }
    : null;
  const response = responseData
    ? {
        latencyMs: Math.floor(number(responseData.latencyMs)),
        usage: numbers(responseData.usage),
        finishReason: text(responseData.finishReason, 60),
        model: text(responseData.model, 120),
        error: text(responseData.error, 400),
        retries: Math.floor(number(responseData.retries)),
      }
    : null;
  const tools = (Array.isArray(data.tools) ? data.tools : []).slice(0, 20).map((item) => {
    const tool = record(item);
    return {
      name: text(tool.name, 80),
      args: text(tool.args, 600),
      result: text(tool.result, 1200),
      durationMs: Math.floor(number(tool.durationMs)),
      error: text(tool.error, 400),
      truncated: Boolean(tool.truncated),
    };
  });
  const notes = (Array.isArray(data.notes) ? data.notes : []).slice(0, 20).map((item) => {
    const note = record(item);
    return { kind: text(note.kind, 60), detail: text(note.detail, 600) };
  });
  return { turn, request, response, tools, notes };
}

export function parseReplay(raw: unknown): Replay | null {
  const data = record(raw);
  const runId = text(data.runId, 80);
  if (!runId) return null;
  const turns = (Array.isArray(data.turns) ? data.turns : [])
    .slice(0, 40)
    .map(parseTurn)
    .filter((item): item is ReplayTurn => item !== null);
  return {
    runId,
    question: text(data.question, 500),
    model: text(data.model, 120),
    status: text(data.status, 40) || 'error',
    startedAt: text(data.startedAt, 60),
    endedAt: text(data.endedAt, 60),
    durationMs: Math.floor(number(data.durationMs)),
    totals: numbers(data.totals),
    turns,
    answer: text(data.answer, 2000),
    error: text(data.error, 400),
  };
}

/** A FastAPI 404 for an unknown route means the replay endpoint is not deployed yet, not that the service is down. */
export function replayErrorText(error: { status: number; notReady?: boolean; message: string }, fallback: string): string {
  if (error.status === 404 && error.notReady) {
    return '这次运行的回放接口还没有加载：agent-lab 可能还是旧版本。重启 agent-lab 后再试。';
  }
  return `无法回放这次运行：${fallback}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function usageText(usage: Record<string, number>): string {
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const bits = [];
  if (prompt) bits.push(`${prompt.toLocaleString('en-US')} in`);
  if (completion) bits.push(`${completion.toLocaleString('en-US')} out`);
  return bits.join(' / ');
}

export function replaySummary(replay: Replay): string {
  const bits = [replay.model, formatDuration(replay.durationMs)];
  const usage = usageText(replay.totals);
  if (usage) bits.push(usage);
  if (replay.turns.length) bits.push(`${replay.turns.length} 轮`);
  return bits.filter(Boolean).join(' · ');
}

function row(className: string, label: string, value: string): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  const head = document.createElement('span');
  head.className = 'pa-replay-row-label';
  head.textContent = label;
  const body = document.createElement('span');
  body.className = 'pa-replay-row-value';
  body.textContent = value;
  node.append(head, body);
  return node;
}

function toolNode(tool: ReplayTool): HTMLElement {
  const details = document.createElement('details');
  details.className = 'pa-replay-tool';
  const summary = document.createElement('summary');
  summary.textContent = `${tool.name}${tool.durationMs ? ` · ${formatDuration(tool.durationMs)}` : ''}`;
  details.append(summary);
  if (tool.args) {
    const label = document.createElement('p');
    label.className = 'pa-replay-pre-label';
    label.textContent = '参数';
    const args = document.createElement('pre');
    args.className = 'pa-replay-pre';
    args.textContent = tool.args;
    details.append(label, args);
  }
  if (tool.result) {
    const label = document.createElement('p');
    label.className = 'pa-replay-pre-label';
    label.textContent = tool.truncated ? '结果（已截断）' : '结果';
    const result = document.createElement('pre');
    result.className = 'pa-replay-pre';
    result.textContent = tool.result;
    details.append(label, result);
  }
  if (tool.error) {
    const error = document.createElement('p');
    error.className = 'pa-replay-error';
    error.textContent = tool.error;
    details.append(error);
  }
  return details;
}

export function renderReplay(replay: Replay, onBack: () => void): HTMLElement {
  const view = document.createElement('div');
  view.className = 'pa-replay';

  const head = document.createElement('div');
  head.className = 'pa-replay-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'pa-head-button';
  back.textContent = '返回对话';
  back.addEventListener('click', onBack);
  const title = document.createElement('strong');
  title.textContent = '这次运行';
  const status = document.createElement('span');
  status.className = `pa-replay-status pa-replay-status--${replay.status === 'ok' ? 'ok' : 'error'}`;
  status.textContent = statusText(replay.status);
  head.append(back, title, status);
  view.append(head);

  const summary = document.createElement('section');
  summary.className = 'pa-replay-summary';
  const question = document.createElement('p');
  question.className = 'pa-replay-question';
  question.textContent = replay.question;
  const meta = document.createElement('p');
  meta.className = 'pa-replay-meta';
  meta.textContent = replaySummary(replay);
  summary.append(question, meta);
  if (replay.error) {
    const error = document.createElement('p');
    error.className = 'pa-replay-error';
    error.textContent = replay.error;
    summary.append(error);
  }
  view.append(summary);

  const turns = document.createElement('div');
  turns.className = 'pa-replay-turns';
  for (const turn of replay.turns) {
    const article = document.createElement('article');
    article.className = 'pa-replay-turn';
    const rail = document.createElement('div');
    rail.className = 'pa-replay-rail';
    const dot = document.createElement('span');
    dot.className = 'pa-replay-dot';
    dot.textContent = String(turn.turn);
    rail.append(dot);
    const body = document.createElement('div');
    body.className = 'pa-replay-body';

    if (turn.request) {
      const toolNames = turn.request.tools.join('、');
      body.append(
        row(
          'pa-replay-row',
          '模型请求',
          `${turn.request.messageCount} 条消息${toolNames ? ` · ${turn.request.tools.length} 个工具` : ''}`,
        ),
      );
      if (toolNames) {
        const tools = document.createElement('p');
        tools.className = 'pa-replay-tools';
        tools.textContent = toolNames;
        body.append(tools);
      }
    }
    if (turn.response) {
      const usage = usageText(turn.response.usage);
      const bits = [
        turn.response.latencyMs ? formatDuration(turn.response.latencyMs) : '',
        usage,
        turn.response.finishReason,
        turn.response.retries ? `重试 ${turn.response.retries} 次` : '',
      ].filter(Boolean);
      body.append(row('pa-replay-row', '模型回复', bits.join(' · ') || '无用量信息'));
      if (turn.response.error) {
        const error = document.createElement('p');
        error.className = 'pa-replay-error';
        error.textContent = turn.response.error;
        body.append(error);
      }
    }
    for (const tool of turn.tools) body.append(toolNode(tool));
    for (const note of turn.notes) body.append(row('pa-replay-row', '备注', `${note.kind}${note.detail ? `：${note.detail}` : ''}`));
    if (!body.childElementCount) body.append(row('pa-replay-row', '本轮', '没有可展示的事件'));
    article.append(rail, body);
    turns.append(article);
  }
  if (!replay.turns.length) {
    const empty = document.createElement('p');
    empty.className = 'pa-replay-empty';
    empty.textContent = '这次运行没有留下按轮次的事件。';
    turns.append(empty);
  }
  view.append(turns);

  if (replay.answer) {
    const details = document.createElement('details');
    details.className = 'pa-replay-answer';
    const summaryNode = document.createElement('summary');
    summaryNode.textContent = '最终回答';
    const answer = document.createElement('pre');
    answer.textContent = replay.answer;
    details.append(summaryNode, answer);
    view.append(details);
  }
  return view;
}
