// One turn of a run: each model call (segment bar, usage, the exact messages
// sent, diff against the previous turn) and each tool call it triggered.
import { button, el } from '../dom';
import {
  STATUS_LABELS,
  agentLabel,
  agentRequest,
  cacheRate,
  diffMessages,
  fmtMoney,
  fmtMs,
  fmtNum,
  fmtRate,
  prettyJson,
  seenToolContent,
  segmentShares,
  subagentForCall,
  type LlmCall,
  type RunView,
  type Turn,
} from './model';
import type { InfoEvent, Message, ToolCall } from './types';
import { longText, pre } from './ui';

/** prefix keeps the open/closed state of a sub-agent's panels apart from the main agent's. */
export type TurnUi = { open: Set<string>; diffMode: Set<number>; prefix?: string };

const ROLE_LABELS: Record<string, string> = { system: '系统', user: '用户', assistant: '模型', tool: '工具结果' };
const INFO_LABELS: Record<string, string> = {
  compressed: '上下文压缩',
  memory_recalled: '注入记忆',
  memory_saved: '保存记忆',
  rules_applied: '注入学习规则',
  review_retry: '审核者的输出无法解析，提醒后重试一次',
  review_unparsed: '审核者的输出无法解析，按通过处理',
  review_failed: '审核者调用出错，保留当前回答',
  revision_incomplete: '修改没能在轮数内完成，保留上一版回答',
};

function reviewChip(info: InfoEvent) {
  const d = info.detail ?? {};
  const pass = d.verdict === 'pass';
  const mode = d.mode === 'evidence' ? '带核对证据' : '只看回答';
  const chip = el(
    'div',
    `lab-review lab-review--${pass ? 'pass' : 'revise'}`,
    el('strong', '', pass ? '审核者：通过' : `审核者：退回（第 ${String(d.round ?? 1)} 次）`),
    el('span', 'lab-muted', mode),
  );
  const issues = Array.isArray(d.issues) ? (d.issues as unknown[]) : [];
  if (issues.length) chip.append(el('ol', 'lab-info-items', ...issues.map((issue) => el('li', '', String(issue)))));
  return chip;
}

function details(rawKey: string, ui: TurnUi, summary: Node | string, ...body: Node[]) {
  const key = `${ui.prefix ?? ''}${rawKey}`;
  const node = el('details', 'lab-details');
  node.dataset.key = key;
  node.open = ui.open.has(key);
  node.addEventListener('toggle', () => (node.open ? ui.open.add(key) : ui.open.delete(key)));
  node.append(el('summary', '', summary), ...body);
  return node;
}

export function segmentBar(segments: Record<string, number>) {
  const { total, parts } = segmentShares(segments);
  const bar = el('div', 'lab-segbar');
  const legend = el('div', 'lab-seglegend');
  for (const part of parts) {
    const piece = el('span', `lab-seg lab-seg--${part.key}`);
    piece.style.width = `${(part.share * 100).toFixed(2)}%`;
    piece.title = `${part.label} ≈ ${part.value} token（${(part.share * 100).toFixed(0)}%）`;
    bar.append(piece);
    legend.append(el('span', 'lab-seglegend-item', el('i', `lab-seg-dot lab-seg--${part.key}`), `${part.label} ${part.value}`));
  }
  legend.append(el('span', 'lab-seglegend-note', `合计 ≈ ${total} token（估计值，只看比例）`));
  return el('div', 'lab-segwrap', bar, legend);
}

function messageText(message: Message) {
  const parts: string[] = [];
  if (message.content) parts.push(String(message.content));
  for (const call of message.tool_calls ?? []) {
    parts.push(`调用 ${call.function?.name ?? '?'} ${call.function?.arguments ?? ''}`);
  }
  return parts.join('\n') || '（空）';
}

function messageRow(message: Message, index: number, status?: string) {
  const role = message.role;
  const row = el('div', `lab-msg lab-msg--${role}${status ? ` lab-msg--${status}` : ''}`);
  const head = el('div', 'lab-msg-head', el('span', 'lab-role', `${index + 1}. ${ROLE_LABELS[role] ?? role}`));
  if (status === 'added') head.append(el('span', 'lab-diff-tag', '新增'));
  if (status === 'changed') head.append(el('span', 'lab-diff-tag lab-diff-tag--changed', '改变'));
  row.append(head, longText(messageText(message), 800, 'lab-pre lab-msg-text'));
  return row;
}

function messagesPanel(turn: Turn, previous: Message[] | undefined, ui: TurnUi, messages: Message[]) {
  const box = el('div', 'lab-msgs');
  const diffOn = ui.diffMode.has(turn.turn);
  const toggle = el(
    'div',
    'lab-seg-toggle',
    button('全部消息', diffOn ? '' : 'is-active', () => {
      ui.diffMode.delete(turn.turn);
      render();
    }),
    button('与上一轮的差异', diffOn ? 'is-active' : '', () => {
      ui.diffMode.add(turn.turn);
      render();
    }),
  );
  const list = el('div', 'lab-msg-list');
  const render = () => {
    const on = ui.diffMode.has(turn.turn);
    toggle.querySelectorAll('button').forEach((b, i) => b.classList.toggle('is-active', on === (i === 1)));
    list.replaceChildren();
    if (!on) {
      messages.forEach((message, index) => list.append(messageRow(message, index)));
      return;
    }
    if (!previous) {
      list.append(el('p', 'lab-muted', '这是第一轮，没有可比较的上一轮。'));
      return;
    }
    const diff = diffMessages(previous, messages);
    const same = diff.firstChange < 0 ? messages.length : diff.firstChange;
    list.append(
      el(
        'p',
        'lab-diff-note',
        diff.firstChange < 0
          ? '与上一轮完全相同。'
          : `前 ${same} 条消息与上一轮逐字相同（这段前缀可以命中缓存）；从第 ${same + 1} 条开始不同。`,
      ),
    );
    if (diff.removed) list.append(el('p', 'lab-diff-note', `上一轮末尾的 ${diff.removed} 条消息这一轮没有发送。`));
    diff.items.filter((item) => item.status !== 'same').forEach((item) => list.append(messageRow(item.message, item.index, item.status)));
  };
  render();
  box.append(toggle, list);
  return box;
}

function usageLine(call: LlmCall) {
  const response = call.response;
  if (!response) return el('p', 'lab-muted lab-pending', '等待模型返回……');
  if (response.error) return el('p', 'lab-error', `模型出错：${response.error}`);
  const u = response.usage ?? {};
  const rate = cacheRate(u.prompt_tokens, u.cached_tokens);
  const line = el(
    'div',
    'lab-usage',
    el('span', '', `输入 ${fmtNum(u.prompt_tokens)}`),
    el('span', '', `缓存命中 ${fmtNum(u.cached_tokens)}${rate === null ? '' : `（${fmtRate(rate)}）`}`),
    el('span', '', `输出 ${fmtNum(u.completion_tokens)}`),
    el('span', '', `推理 ${fmtNum(u.reasoning_tokens)}`),
    el('span', '', `延迟 ${fmtMs(response.latency_ms)}`),
    el('span', '', `成本 ${fmtMoney(response.cost)}`),
  );
  if (response.reference_cost !== undefined && response.reference_cost !== null) {
    const ref = el('span', 'lab-muted', `参考价 ${fmtMoney(response.reference_cost)}`);
    ref.title = '按假设的参考单价计算，仅供学习成本分析';
    line.append(ref);
  }
  if (response.retries?.length) {
    const retry = el('span', 'lab-warn', `重试 ${response.retries.length} 次`);
    retry.title = response.retries.map((r) => r.reason ?? '').join('\n');
    line.append(retry);
  }
  return line;
}

const CALL_TITLES: Record<string, string> = { summary: '摘要压缩调用', proposal: '改进提案调用', review: '审核者调用' };

function callBlock(turn: Turn, call: LlmCall, previous: Message[] | undefined, ui: TurnUi) {
  const title = CALL_TITLES[call.purpose] ?? '模型调用';
  const block = el('div', `lab-call lab-call--${call.purpose}`, el('h4', 'lab-h4', title));
  block.append(segmentBar(call.request.segments ?? {}), usageLine(call));
  const message = call.response?.message;
  if (message?.reasoning_content) {
    block.append(details(`t${turn.turn}-${call.purpose}-reason`, ui, '推理内容', longText(String(message.reasoning_content), 400)));
  }
  if (message?.content && message.tool_calls?.length) block.append(el('p', 'lab-thought', String(message.content)));
  const messages = call.request.messages ?? [];
  const tools = call.request.tools;
  const sentTitle = `这一轮发给模型的 ${messages.length} 条消息${tools ? ` + ${tools.length} 个工具定义` : '（没有工具定义）'}`;
  const panel = details(`t${turn.turn}-${call.purpose}-msgs`, ui, sentTitle);
  panel.addEventListener('toggle', () => {
    if (panel.open && panel.childElementCount === 1) panel.append(messagesPanel(turn, call.purpose === 'agent' ? previous : undefined, ui, messages));
  });
  if (panel.open) panel.append(messagesPanel(turn, call.purpose === 'agent' ? previous : undefined, ui, messages));
  block.append(panel);
  return block;
}

const MODE_LABELS: Record<string, string> = { shared: '共享上下文', isolated: '不共享上下文' };

/** Chapter 10: the delegated sub-agent's own turns, folded under the delegate call that started it. */
function subagentBlock(agent: string, sub: RunView, ui: TurnUi) {
  const subUi: TurnUi = { ...ui, prefix: `${agent}:` };
  const title = `${agentLabel(agent)} 的过程：${sub.turns.length} 轮、${sub.turns.reduce((n, t) => n + t.tools.length, 0)} 次工具调用`;
  const box = el('div', 'lab-subagent');
  box.append(details(`${agent}-trace`, ui, title, ...sub.turns.map((turn, index) => turnCard(sub, turn, index, subUi))));
  return box;
}

function toolCard(view: RunView, call: ToolCall, ui: TurnUi, turn?: Turn) {
  const head = el('div', 'lab-tool-head', el('span', 'lab-tool-name', `→ ${call.name || '（无名工具）'}`), el('span', 'lab-muted', fmtMs(call.duration_ms)));
  if (call.error) head.append(el('span', 'lab-badge lab-badge--error', '出错'));
  if (call.truncated) head.append(el('span', 'lab-badge lab-badge--warn', '已截断'));
  const card = el('div', `lab-tool${call.error ? ' lab-tool--error' : ''}`, head);
  card.append(el('div', 'lab-tool-label', '参数'), pre(prettyJson(call.args || '{}'), 'lab-pre lab-pre--small'));
  const result = call.error ? `错误：${call.error}` : prettyJson(call.result);
  card.append(details(`tool-${call.call_id}-${call.turn}`, ui, call.error ? '工具返回的错误' : `工具结果（${call.result.length} 字）`, pre(result, 'lab-pre lab-pre--small')));
  const agent = call.name === 'delegate' && turn ? subagentForCall(turn, call.call_id) : undefined;
  const sub = agent ? view.subagents[agent] : undefined;
  if (agent && sub) card.append(subagentBlock(agent, sub, ui));
  const seen = seenToolContent(view, call);
  if (seen !== undefined && seen !== call.result) {
    card.append(
      el('div', 'lab-seen', el('strong', '', '模型实际看到：'), el('span', '', seen.length > 300 ? `${seen.slice(0, 300)}…` : seen)),
      el('p', 'lab-field-help', '轨迹记录的是工具的真实输出；开关或压缩改写了发给模型的内容，以上是下一轮请求里的实际文字。'),
    );
  }
  return card;
}

function subagentChip(kind: string, d: Record<string, unknown>) {
  const who = agentLabel(String(d.agent ?? ''));
  const text =
    kind === 'subagent_start'
      ? `委派给${who}（${MODE_LABELS[String(d.mode)] ?? String(d.mode)}，带 ${String(d.input_messages)} 条消息）：${String(d.task ?? '')}`
      : `${who} 结束：${STATUS_LABELS[String(d.status)] ?? String(d.status)}，${String(d.turns)} 轮，${fmtNum(d.tokens)} token`;
  return el('div', 'lab-info lab-info--subagent', el('span', 'lab-info-kind', kind === 'subagent_start' ? '⇢' : '⇠'), el('span', '', text));
}

export function infoChip(info: InfoEvent) {
  if (info.kind === 'review_verdict') return reviewChip(info);
  const d = info.detail ?? {};
  if (info.kind === 'subagent_start' || info.kind === 'subagent_end') return subagentChip(info.kind, d);
  let text = INFO_LABELS[info.kind] ?? info.kind;
  if (info.kind === 'compressed') text += `：${d.mode} 模式，处理 ${d.messages} 条消息，约 ${d.before} → ${d.after} token`;
  const chip = el('div', 'lab-info', el('span', 'lab-info-kind', '※'), el('span', '', text));
  const items = Array.isArray(d.items) ? (d.items as unknown[]) : [];
  if (items.length) chip.append(el('ul', 'lab-info-items', ...items.map((item) => el('li', '', String(item)))));
  else if (info.kind === 'review_unparsed' || info.kind === 'review_retry') chip.append(el('code', 'lab-muted', String(d.raw ?? '').slice(0, 300)));
  else if (info.kind !== 'compressed' && Object.keys(d).length) chip.append(el('code', 'lab-muted', JSON.stringify(d)));
  return chip;
}

export function turnCard(view: RunView, turn: Turn, index: number, ui: TurnUi) {
  const previousTurn = view.turns[index - 1];
  const previous = previousTurn ? agentRequest(previousTurn)?.messages : undefined;
  const card = el('article', 'lab-turn', el('h3', 'lab-turn-title', `第 ${turn.turn} 轮`));
  turn.infos.forEach((info) => card.append(infoChip(info)));
  turn.calls.forEach((call) => card.append(callBlock(turn, call, previous, ui)));
  turn.tools.forEach((call) => card.append(toolCard(view, call, ui, turn)));
  return card;
}
