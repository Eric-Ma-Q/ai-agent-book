// 随页问答的纯函数：页面摘要、请求体、事件归约和工具文案。
// 不访问 DOM，`node --test` 可以直接加载。
import type { Citation, LabEvent, ToolCall, RunEnd } from '../lab/types.ts';
import { formatReasoningValue, type ReasoningConfig, type ReasoningLevel } from '../settings/model-profiles.ts';
import type { Mode } from './modes.ts';

export type PageRole = 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'table' | 'figure' | 'other';

export type PageBlock = {
  index: number;
  id: string;
  tag: string;
  role: PageRole;
  sectionId: string;
  sectionTitle: string;
  text: string;
  top: number;
  height: number;
  inViewport: boolean;
};

export type PageHeading = { id: string; text: string; level: number; blockIndex: number | null };
export type PageLink = { text: string; href: string; blockIndex: number | null };

export type PageSnapshot = {
  version: number;
  url: string;
  title: string;
  path: string;
  lang: string;
  pageType: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
    scrollY: number;
    pageHeight: number;
    scrollRatio: number;
    devicePixelRatio: number;
  };
  chapter: { number: number | null; key: string; title: string };
  current: { blockIndex: number | null; blockId: string; sectionId: string; sectionTitle: string; percent: number };
  selection: { text: string; blockIndex: number | null; sectionId: string } | null;
  headings: PageHeading[];
  blocks: PageBlock[];
  links: PageLink[];
  truncated: boolean;
};

export type PageSummary = {
  title: string;
  section: string;
  percent: number;
  selectionChars: number;
  blocks: number;
  visibleBlocks: number;
  pageType: string;
};

export type FocusRole = 'figure' | 'table';

/** 读者在页面上选中的一张图或一张表；服务端按块号复核。 */
export type FocusTarget = {
  blockIndex: number;
  role: FocusRole;
  caption: string;
};

export type PageRequest = {
  question: string;
  page: PageSnapshot;
  screenshot: string | null;
  modelProfile: string;
  reasoningLevel: string;
  sessionId: string | null;
  sendScreenshot: boolean;
  mode: Mode;
  focus: FocusTarget | null;
};

export type PageRequestInput = {
  question: string;
  snapshot: PageSnapshot;
  screenshot?: string | null;
  modelProfile?: string;
  reasoningLevel?: string;
  sessionId?: string | null;
  sendScreenshot?: boolean;
  mode?: Mode;
  focus?: FocusTarget | null;
};

/** 面板「思考」下拉的一项：空值表示沿用档案默认，其余为档案里的档位名。 */
export type ReasoningChoice = {
  value: string;
  label: string;
  meta: string;
};

export type ToolView = {
  callId: string;
  name: string;
  args: string;
  result: string;
  durationMs: number;
  error: string;
};

export type RunHistoryEntry = {
  runId: string;
  sessionId: string;
  turns: number;
  question: string;
  status: string;
  error: string;
  at: number;
  pageTitle: string;
  section: string;
  promptTokens: number;
  completionTokens: number;
};

export type SessionRun = {
  runId: string;
  question: string;
  answer: string;
  status: string;
  error: string;
  startedAt: string;
  page: { title: string; section: string; percent: number; path: string };
  citations: Citation[];
  totals: Record<string, unknown>;
};

export type SessionHistory = { sessionId: string; runs: SessionRun[] };

export type AssistantState = {
  status: 'idle' | 'running' | 'done' | 'error';
  text: string;
  tools: ToolView[];
  error: string;
  notices: string[];
  citations: Citation[];
  totals: Record<string, unknown>;
};

export const MAX_BLOCKS = 3000;
export const MAX_TOTAL_CHARS = 250_000;
export const MAX_SCREENSHOT_CHARS = 3_300_000;
export const MAX_QUESTION = 4000;
export const MAX_HISTORY = 30;
export const MAX_SESSION_RUNS = 60;
const SESSION_ID = /^[A-Za-z0-9_-]{6,80}$/;

export const TOOL_LABELS: Record<string, string> = {
  page_context: '查看页面',
  page_read_range: '扩大阅读范围',
  page_find: '页内检索',
  page_outline: '页面大纲',
  page_elements: '提取页面元素',
  page_selection: '读取选中文字',
  page_screenshot: '查看截图',
  search_book: '检索书稿',
  read_section: '阅读书稿',
  list_chapters: '书稿目录',
  list_highlights: '读取划线',
  list_inserts: '读取补充',
  read_file: '读文件',
  glob: '查找文件',
  grep: '搜索文件内容',
  write_file: '写工作区文件',
  edit_file: '编辑工作区文件',
  bash: '运行命令',
  code_interpreter: '运行代码',
  web_search: '联网搜索',
  web_fetch: '读取网页',
};

export function detectPageType(pathname: string): string {
  const path = pathname || '/';
  if (/\/book\/chapter\d+\/?/.test(path)) return 'chapter';
  if (/\/(?:harness|ai-pm)-exam\.html$/.test(path)) return 'exam';
  if (path.includes('/harness/site/')) return 'harness-archive';
  if (/^\/harness\/interview(\/|$)/.test(path)) return 'interview';
  if (path.startsWith('/harness')) return 'harness';
  if (path.startsWith('/book-exam')) return 'exam';
  if (path.startsWith('/lab')) return 'lab';
  if (path.startsWith('/my-highlights')) return 'highlights';
  if (path === '/' || path === '') return 'home';
  return 'other';
}

export function chapterNumberFromPath(pathname: string): number | null {
  const match = /\/book\/chapter(\d+)\/?/.exec(pathname || '');
  return match ? Number(match[1]) : null;
}

export function snapshotSummary(snapshot: PageSnapshot): PageSummary {
  const section =
    snapshot.current.sectionTitle ||
    snapshot.current.sectionId ||
    snapshot.headings[0]?.text ||
    snapshot.chapter.title ||
    '';
  return {
    title: snapshot.title || snapshot.path || '当前页面',
    section,
    percent: Math.round(Math.max(0, Math.min(1, snapshot.viewport.scrollRatio)) * 100),
    selectionChars: snapshot.selection?.text.trim().length ?? 0,
    blocks: snapshot.blocks.length,
    visibleBlocks: snapshot.blocks.filter((block) => block.inViewport).length,
    pageType: snapshot.pageType,
  };
}

export function contextLine(snapshot: PageSnapshot): string {
  const summary = snapshotSummary(snapshot);
  const bits = [summary.section || summary.title];
  bits.push(`${summary.percent}%`);
  if (summary.selectionChars) bits.push(`选中 ${summary.selectionChars} 字`);
  return bits.join(' · ');
}

export function chooseCurrentBlock(blocks: PageBlock[], scrollY: number, viewportHeight: number): number | null {
  if (!blocks.length) return null;
  const center = scrollY + viewportHeight / 2;
  const visible = blocks.filter((block) => block.inViewport);
  const pool = visible.length ? visible : blocks;
  const containing = pool.find((block) => block.top <= center && block.top + block.height >= center);
  if (containing) return containing.index;
  return pool.reduce((best, block) => (Math.abs(block.top + block.height / 2 - center) < Math.abs(best.top + best.height / 2 - center) ? block : best)).index;
}

/**
 * 页面文本超过上限时，优先保留当前视口、当前块附近和前后文，再向外扩。
 * 块序号保持不变，服务端的 page_read_range 仍能对得上。
 */
export function truncateSnapshot(snapshot: PageSnapshot, maxChars = MAX_TOTAL_CHARS): PageSnapshot {
  const blocks = [...snapshot.blocks].sort((a, b) => a.index - b.index).slice(0, MAX_BLOCKS);
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (total <= maxChars) return { ...snapshot, blocks, truncated: snapshot.truncated };

  const current = snapshot.current.blockIndex;
  const center = current ?? blocks.find((block) => block.inViewport)?.index ?? blocks[0]?.index ?? 0;
  const ordered = [...blocks].sort((a, b) => {
    const da = a.index === center ? -1 : Math.abs(a.index - center);
    const db = b.index === center ? -1 : Math.abs(b.index - center);
    return da - db;
  });
  const keep = new Set<number>();
  let used = 0;
  for (const block of ordered) {
    if (used + block.text.length > maxChars && keep.size > 0) continue;
    keep.add(block.index);
    used += block.text.length;
  }
  const selected = blocks.filter((block) => keep.has(block.index));
  return {
    ...snapshot,
    blocks: selected,
    headings: snapshot.headings.filter((heading) => heading.blockIndex === null || keep.has(heading.blockIndex)),
    links: snapshot.links.filter((link) => link.blockIndex === null || keep.has(link.blockIndex)),
    truncated: true,
  };
}

export function buildPageRequest(input: PageRequestInput): { body: PageRequest; droppedScreenshot: boolean } {
  const question = input.question.trim();
  if (!question) throw new Error('问题不能为空');
  if (question.length > MAX_QUESTION) throw new Error(`问题不能超过 ${MAX_QUESTION} 字`);
  const page = truncateSnapshot(input.snapshot);
  const mode = input.mode ?? 'ask';
  // 概念图只看本章结构与正文，不接受聚焦元素，也不发送截图。
  const focus = mode === 'map' ? null : (input.focus ?? null);
  const rawScreenshot = input.sendScreenshot === false || mode === 'map' ? null : (input.screenshot ?? null);
  const droppedScreenshot = Boolean(rawScreenshot && rawScreenshot.length > MAX_SCREENSHOT_CHARS);
  const screenshot = droppedScreenshot ? null : rawScreenshot;
  return {
    body: {
      question,
      page,
      screenshot,
      modelProfile: input.modelProfile ?? '',
      reasoningLevel: input.reasoningLevel ?? '',
      sessionId: input.sessionId ?? null,
      sendScreenshot: Boolean(screenshot && input.sendScreenshot !== false),
      mode,
      focus,
    },
    droppedScreenshot,
  };
}

/** 档案没有可注入的档位时不显示选择器：全部为空值时没有可切换的状态。 */
export function reasoningChoices(config?: ReasoningConfig | null): ReasoningChoice[] {
  const levels = config?.levels ?? [];
  if (!config || !levels.some((level) => level.value !== null && level.value !== undefined)) return [];
  const fallback = config.default ? levels.find((level) => level.name === config.default) : undefined;
  return [
    {
      value: '',
      label: `默认·${fallback ? reasoningLevelLabel(fallback) : '不发送'}`,
      meta: fallback ? reasoningLevelMeta(config, fallback) : `${config.parameter} 不发送`,
    },
    ...levels.map((level) => ({
      value: level.name,
      label: reasoningLevelLabel(level),
      meta: reasoningLevelMeta(config, level),
    })),
  ];
}

/** 本机记忆的档位在新档案里不存在时回退到「默认」，不改档案。 */
export function resolveReasoningChoice(choices: ReasoningChoice[], saved: string): string {
  return choices.some((choice) => choice.value === saved) ? saved : '';
}

/** 标准档位翻成中文；名字与实际注入值不一致时保留原名，避免把 off 说成关闭。 */
export function reasoningLevelLabel(level: ReasoningLevel): string {
  const value = level.value;
  if (value === null || value === undefined) return level.name.toLowerCase() === 'off' ? '关闭' : `${level.name}（不发送）`;
  const labels: Record<string, string> = { low: '低', medium: '中', high: '高' };
  const label = labels[level.name.toLowerCase()];
  if (label && typeof value === 'string' && value.toLowerCase() === level.name.toLowerCase()) return label;
  return level.name;
}

export function reasoningLevelMeta(config: ReasoningConfig, level: ReasoningLevel): string {
  if (level.value === null || level.value === undefined) return `${config.parameter} 不发送`;
  return `${config.parameter} = ${formatReasoningValue(level.value)}`;
}

export function emptyAssistantState(): AssistantState {
  return { status: 'idle', text: '', tools: [], error: '', notices: [], citations: [], totals: {} };
}

function toolView(call: ToolCall): ToolView {
  return {
    callId: call.call_id || `tool-${call.name}`,
    name: call.name,
    args: call.args ?? '',
    result: call.result ?? '',
    durationMs: call.duration_ms ?? 0,
    error: call.error ?? '',
  };
}

export function applyAssistantEvent(state: AssistantState, event: LabEvent): AssistantState {
  if (event.type === 'run_start') return { ...state, status: 'running' };
  if (event.type === 'tool_call') {
    const next = toolView(event);
    const tools = state.tools.some((item) => item.callId === next.callId)
      ? state.tools.map((item) => (item.callId === next.callId ? next : item))
      : [...state.tools, next];
    return { ...state, tools };
  }
  if (event.type === 'llm_response') {
    if (event.error) return { ...state, error: event.error };
    return state;
  }
  if (event.type === 'info') {
    if (event.kind === 'compressed') return { ...state, notices: [...state.notices, '上下文已压缩'] };
    return state;
  }
  if (event.type === 'run_end') {
    const end = event as RunEnd;
    const failed = end.status !== 'ok';
    return {
      ...state,
      status: failed ? 'error' : 'done',
      text: end.answer ?? '',
      citations: end.citations ?? [],
      totals: end.totals ?? {},
      error: failed ? end.error || statusText(end.status) : state.error,
    };
  }
  return state;
}

export function statusText(status: string): string {
  return (
    {
      running: '处理中',
      ok: '完成',
      max_turns: '达到轮数上限',
      budget_exceeded: '超过 token 上限',
      llm_error: '模型调用失败',
      cancelled: '已停止',
      interrupted: '已中断',
      error: '运行出错',
    }[status] ?? status
  );
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function shortArgs(raw: string, limit = 52): string {
  if (!raw) return '';
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ['query', 'pattern', 'path', 'command', 'url', 'scope', 'start_block']) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        const value = String(data[key]).replace(/\s+/g, ' ').trim();
        return `${key}: ${value.slice(0, limit)}`;
      }
    }
    return JSON.stringify(data).slice(0, limit);
  } catch {
    return raw.replace(/\s+/g, ' ').trim().slice(0, limit);
  }
}

const COPY_PAGE_CITATION = /\[\[#(\d{1,6})(?:\s*[–—~-]\s*(\d{1,6}))?(?:\|([^\]]+))?\]\]/g;
const COPY_BOOK_CITATION = /\[\[ch(\d+)(?:#([^|\]]*))?\|([^\]]+)\]\]/g;

/**
 * 复制到剪贴板的回答正文：保留 Markdown 结构与换行，只把面板内部的引用
 * 标记还原成可读文字（有片段用片段，只有块号写「第 N 块」）。
 */
export function answerCopyText(source: string): string {
  return (source ?? '')
    .replace(COPY_PAGE_CITATION, (_match, first: string, second: string | undefined, quote: string | undefined) => {
      if (quote) return quote;
      return second ? `第 ${first}–${second} 块` : `第 ${first} 块`;
    })
    .replace(COPY_BOOK_CITATION, (_match, _chapter: string, _section: string | undefined, quote: string) => quote)
    .trim();
}

export function citationSummary(citations: Citation[]): string {
  if (!citations.length) return '';
  const verified = citations.filter((item) => item.status === 'verified').length;
  return `${citations.length} 条书稿引用 · ${verified} 条逐字核对通过`;
}

export function usageLine(totals: Record<string, unknown>): string {
  const prompt = Number(totals.prompt_tokens ?? 0);
  const completion = Number(totals.completion_tokens ?? 0);
  const tools = Number(totals.tool_calls ?? 0);
  const parts = [];
  if (Number.isFinite(prompt) && prompt > 0) parts.push(`${prompt.toLocaleString('en-US')} in`);
  if (Number.isFinite(completion) && completion > 0) parts.push(`${completion.toLocaleString('en-US')} out`);
  if (Number.isFinite(tools) && tools > 0) parts.push(`${tools} 次工具`);
  return parts.join(' · ');
}

/** 截图克隆的 vertical 偏移：rect.top 已含窗口滚动，再减去内容根自身的 scrollTop。 */
export function screenshotTop(rectTop: number, scrollTop = 0): number {
  const top = Number.isFinite(rectTop) ? rectTop : 0;
  const inner = Number.isFinite(scrollTop) ? scrollTop : 0;
  return top - inner;
}

export function runTraceUrl(origin: string, runId: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}/lab/#/run/${encodeURIComponent(runId)}`;
}

export function historyWhen(at: number, now = Date.now()): string {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return '';
  const today = new Date(now);
  const head = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const sameDay =
    date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  if (sameDay) return head;
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${head}`;
}

export function historyLabel(entry: RunHistoryEntry, now = Date.now()): string {
  return [historyWhen(entry.at, now), statusText(entry.status)].filter(Boolean).join(' · ');
}

export function parseRunHistory(raw: string | null | undefined): RunHistoryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    const items = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : [];
    const out: RunHistoryEntry[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === 'string' ? record.question.trim() : '';
      if (!question) continue;
      const sessionId = typeof record.sessionId === 'string' && SESSION_ID.test(record.sessionId) ? record.sessionId : '';
      out.push({
        runId: typeof record.runId === 'string' ? record.runId : '',
        sessionId,
        turns: Math.max(1, Math.min(999, Math.floor(Number(record.turns) || 1))),
        question: question.slice(0, 500),
        status: typeof record.status === 'string' ? record.status : 'ok',
        error: typeof record.error === 'string' ? record.error.slice(0, 300) : '',
        at: Number.isFinite(Number(record.at)) ? Number(record.at) : 0,
        pageTitle: typeof record.pageTitle === 'string' ? record.pageTitle.slice(0, 200) : '',
        section: typeof record.section === 'string' ? record.section.slice(0, 200) : '',
        promptTokens: Number(record.promptTokens) || 0,
        completionTokens: Number(record.completionTokens) || 0,
      });
      if (out.length >= MAX_HISTORY) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 同一会话的多次提问只保留最新一条索引；`turns` 记录这次对话共有几轮。
 * 旧版本地历史没有 sessionId，继续按单条运行保留。
 */
export function addRunHistory(items: RunHistoryEntry[], entry: RunHistoryEntry, limit = MAX_HISTORY): RunHistoryEntry[] {
  const sessionId = entry.sessionId ?? '';
  const sameRun = entry.runId ? items.find((item) => item.runId === entry.runId) : undefined;
  // 没有 run_id 的失败请求不入会话分组，避免把已有的对话索引顶掉。
  const mergeSession = Boolean(sessionId && entry.runId);
  const sameSession = mergeSession
    ? items.find((item) => item.sessionId === sessionId && item.runId && item !== sameRun)
    : undefined;
  const base = Math.max(entry.turns ?? 0, sameRun?.turns ?? 0);
  const turns = sameRun
    ? Math.max(1, base)
    : Math.max(1, sameSession ? Math.max(base, (sameSession.turns ?? 1) + 1) : base);
  const next = { ...entry, sessionId, turns };
  const rest = items.filter((item) => item !== sameRun && item !== sameSession);
  return [next, ...rest].slice(0, Math.max(1, limit));
}

/** 历史索引对应的服务端查询路径：优先用会话，旧记录用 run_id 反查。 */
export function sessionResumePath(entry: Pick<RunHistoryEntry, 'sessionId' | 'runId'>): string {
  if (entry.sessionId) return `/page/sessions/${encodeURIComponent(entry.sessionId)}`;
  if (entry.runId) return `/page/runs/${encodeURIComponent(entry.runId)}/session`;
  return '';
}

export function canResumeHistory(entry: Pick<RunHistoryEntry, 'sessionId' | 'runId'>): boolean {
  return Boolean(entry.sessionId || entry.runId);
}

function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const quote = typeof record.quote === 'string' ? record.quote : '';
    if (!quote) continue;
    const citation: Citation = {
      chapter: Number(record.chapter) || 0,
      quote,
      status: typeof record.status === 'string' ? record.status : 'unknown',
    };
    if (typeof record.section_id === 'string') citation.section_id = record.section_id;
    if (typeof record.found_section_id === 'string') citation.found_section_id = record.found_section_id;
    if (typeof record.link === 'string') citation.link = record.link;
    out.push(citation);
  }
  return out;
}

/** 校验服务端返回的会话轨迹；字段缺失时丢弃该轮，不把坏数据塞进面板。 */
export function parseSessionHistory(raw: unknown): SessionHistory | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const sessionId = typeof record.sessionId === 'string' && SESSION_ID.test(record.sessionId) ? record.sessionId : '';
  if (!sessionId) return null;
  const items = Array.isArray(record.runs) ? record.runs : [];
  const runs: SessionRun[] = [];
  for (const item of items.slice(0, MAX_SESSION_RUNS)) {
    if (!item || typeof item !== 'object') continue;
    const run = item as Record<string, unknown>;
    const question = typeof run.question === 'string' ? run.question.trim() : '';
    if (!question) continue;
    const page = run.page && typeof run.page === 'object' ? (run.page as Record<string, unknown>) : {};
    const percent = Number(page.percent);
    runs.push({
      runId: typeof run.runId === 'string' ? run.runId : '',
      question: question.slice(0, 4000),
      answer: typeof run.answer === 'string' ? run.answer : '',
      status: typeof run.status === 'string' ? run.status : 'error',
      error: typeof run.error === 'string' ? run.error.slice(0, 500) : '',
      startedAt: typeof run.startedAt === 'string' ? run.startedAt : '',
      page: {
        title: typeof page.title === 'string' ? page.title.slice(0, 300) : '',
        section: typeof page.section === 'string' ? page.section.slice(0, 300) : '',
        percent: Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : 0,
        path: typeof page.path === 'string' ? page.path.slice(0, 2000) : '',
      },
      citations: parseCitations(run.citations),
      totals: run.totals && typeof run.totals === 'object' ? (run.totals as Record<string, unknown>) : {},
    });
  }
  return runs.length ? { sessionId, runs } : null;
}

/** 恢复的历史轮次直接映射成面板消息状态。 */
export function assistantStateFromRun(run: SessionRun): AssistantState {
  const failed = run.status !== 'ok';
  return {
    status: failed ? 'error' : 'done',
    text: run.answer,
    tools: [],
    error: failed ? run.error || statusText(run.status) : '',
    notices: [],
    citations: run.citations,
    totals: run.totals,
  };
}

export function restoredWhen(run: SessionRun, now = Date.now()): string {
  const at = Date.parse(run.startedAt || '');
  return Number.isFinite(at) ? historyWhen(at, now) : '';
}

export function restoredWhere(run: SessionRun): string {
  return [run.page.title, run.page.section].filter(Boolean).join(' · ');
}

export function sessionSummaryLine(data: SessionHistory): string {
  const when = data.runs[0] ? restoredWhen(data.runs[0]) : '';
  return [`已恢复 ${data.runs.length} 轮对话`, when ? `从 ${when} 开始` : '', '继续提问会沿用这些上下文'].filter(Boolean).join(' · ');
}

export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHAT_ANSWER = 12_000;
export const MAX_CHAT_TOOL_RESULT = 240;
export const MAX_CHAT_TOOLS = 12;
export const CHAT_VERSION = 2;

/** 一条提问或回答所在的页面；跨页恢复时按它决定引用能否点击。 */
export type ChatPageRef = { title: string; section: string; path: string; percent: number };

/**
 * 当前这轮对话的一条消息。正文存本机，刷新与切页后直接按它重建面板，
 * 不再依赖服务端轨迹（轨迹被清理时对话仍能显示，只是少了追问上下文）。
 */
export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  at: number;
  page: ChatPageRef;
  mode?: Mode;
  focus?: string;
  status?: AssistantState['status'];
  error?: string;
  citations?: Citation[];
  totals?: Record<string, unknown>;
  tools?: ToolView[];
  runId?: string;
};

export type ChatState = { version: number; sessionId: string; updatedAt: number; messages: ChatMessage[] };

function clipText(value: string, limit: number): string {
  const text = value ?? '';
  return text.length > limit ? text.slice(0, limit) : text;
}

function trimChatMessage(message: ChatMessage): ChatMessage {
  const tools = (message.tools ?? []).slice(-MAX_CHAT_TOOLS).map((tool) => ({
    ...tool,
    args: clipText(tool.args ?? '', 200),
    result: clipText(tool.result ?? '', MAX_CHAT_TOOL_RESULT),
  }));
  const next: ChatMessage = {
    role: message.role,
    text: clipText(message.text, message.role === 'user' ? MAX_QUESTION : MAX_CHAT_ANSWER),
    at: message.at,
    page: message.page,
  };
  if (message.mode) next.mode = message.mode;
  if (message.focus) next.focus = message.focus;
  if (message.status) next.status = message.status;
  if (message.error) next.error = clipText(message.error, 500);
  if (message.citations?.length) next.citations = message.citations.slice(0, 50);
  if (message.totals && Object.keys(message.totals).length) next.totals = message.totals;
  if (tools.length) next.tools = tools;
  if (message.runId) next.runId = message.runId;
  return next;
}

/** 写入本机的对话快照：只保留最近 40 条、单条回答 12k 字、工具结果 240 字。 */
export function buildChat(sessionId: string, messages: ChatMessage[], now = Date.now()): ChatState {
  return {
    version: CHAT_VERSION,
    sessionId: SESSION_ID.test(sessionId) ? sessionId : '',
    updatedAt: now,
    messages: messages.slice(-MAX_CHAT_MESSAGES).map(trimChatMessage),
  };
}

function parseChatPage(raw: unknown): ChatPageRef {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const percent = Number(record.percent);
  return {
    title: typeof record.title === 'string' ? record.title.slice(0, 300) : '',
    section: typeof record.section === 'string' ? record.section.slice(0, 300) : '',
    path: typeof record.path === 'string' ? record.path.slice(0, 2000) : '',
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : 0,
  };
}

function parseChatTools(raw: unknown): ToolView[] {
  if (!Array.isArray(raw)) return [];
  const tools: ToolView[] = [];
  for (const item of raw.slice(-MAX_CHAT_TOOLS)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    if (!name) continue;
    tools.push({
      callId: typeof record.callId === 'string' ? record.callId : `tool-${name}`,
      name,
      args: typeof record.args === 'string' ? record.args.slice(0, 200) : '',
      result: typeof record.result === 'string' ? record.result.slice(0, MAX_CHAT_TOOL_RESULT) : '',
      durationMs: Number(record.durationMs) || 0,
      error: typeof record.error === 'string' ? record.error.slice(0, 400) : '',
    });
  }
  return tools;
}

function parseChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const role = record.role === 'user' ? 'user' : record.role === 'assistant' ? 'assistant' : '';
  if (!role) return null;
  const text = typeof record.text === 'string' ? record.text : '';
  if (role === 'user' && !text.trim()) return null;
  const message: ChatMessage = {
    role,
    text,
    at: Number(record.at) || 0,
    page: parseChatPage(record.page),
  };
  if (record.mode === 'ask' || record.mode === 'check' || record.mode === 'map') message.mode = record.mode;
  if (typeof record.focus === 'string' && record.focus) message.focus = record.focus.slice(0, 200);
  if (record.status === 'running' || record.status === 'done' || record.status === 'error') message.status = record.status;
  if (typeof record.error === 'string' && record.error) message.error = record.error.slice(0, 500);
  const citations = parseCitations(record.citations);
  if (citations.length) message.citations = citations;
  if (record.totals && typeof record.totals === 'object') message.totals = record.totals as Record<string, unknown>;
  const tools = parseChatTools(record.tools);
  if (tools.length) message.tools = tools;
  if (typeof record.runId === 'string' && record.runId) message.runId = record.runId.slice(0, 80);
  return message;
}

/** 校验本机对话快照；坏数据整条丢弃，不把半条记录渲染成对话。 */
export function parseChat(raw: string | null | undefined): ChatState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return null;
    const sessionId = typeof data.sessionId === 'string' && SESSION_ID.test(data.sessionId) ? data.sessionId : '';
    if (!sessionId) return null;
    const items = Array.isArray(data.messages) ? data.messages.slice(-MAX_CHAT_MESSAGES) : [];
    const messages: ChatMessage[] = [];
    for (const item of items) {
      const message = parseChatMessage(item);
      if (message) messages.push(message);
    }
    return messages.length ? { version: CHAT_VERSION, sessionId, updatedAt: Number(data.updatedAt) || 0, messages } : null;
  } catch {
    return null;
  }
}

/** 恢复出来的消息直接映射成面板状态。 */
export function assistantStateFromMessage(message: ChatMessage): AssistantState {
  const status = message.status && message.status !== 'idle' ? message.status : 'done';
  return {
    status,
    text: message.text,
    tools: message.tools ?? [],
    error: message.error ?? '',
    notices: [],
    citations: message.citations ?? [],
    totals: message.totals ?? {},
  };
}

export function chatMessageWhere(message: ChatMessage): string {
  return [message.page.title, message.page.section].filter(Boolean).join(' · ');
}

export function chatMessageWhen(message: ChatMessage, now = Date.now()): string {
  return message.at ? historyWhen(message.at, now) : '';
}

export function chatSummaryLine(chat: ChatState, now = Date.now()): string {
  const turns = chat.messages.filter((item) => item.role === 'user').length;
  const first = chat.messages[0];
  const when = first ? historyWhen(first.at, now) : '';
  return [`${turns} 轮对话`, when ? `从 ${when} 开始` : '', '继续提问会沿用这些上下文'].filter(Boolean).join(' · ');
}

/** 服务端会话轨迹转成本机快照，用于从「历史」恢复后继续刷新、切页。 */
export function chatMessagesFromSession(session: SessionHistory): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const run of session.runs) {
    const parsed = Date.parse(run.startedAt || '');
    const at = Number.isFinite(parsed) ? parsed : 0;
    const page: ChatPageRef = { ...run.page };
    messages.push({ role: 'user', text: run.question, at, page });
    messages.push({
      role: 'assistant',
      text: run.answer,
      at,
      page,
      status: run.status === 'ok' ? 'done' : 'error',
      error: run.status === 'ok' ? '' : run.error || statusText(run.status),
      citations: run.citations,
      totals: run.totals,
      runId: run.runId,
    });
  }
  return messages;
}

export function newSessionId(random: () => string, now = Date.now()): string {
  const id = random().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (id.length >= 6) return `pa-${id}`;
  return `pa-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type QuickPrompt = { label: string; question: string; mode?: Mode };

export type QuickPromptOptions = {
  checkMode?: boolean;
  focus?: FocusTarget | null;
};

function checkPrompt(focus?: FocusTarget | null): QuickPrompt {
  const target = focus ? (focus.role === 'table' ? '这张表' : '这张图') : '当前这一节';
  return { label: '先考我', question: `先别讲，就${target}考我一个能一句话回答的问题。`, mode: 'check' };
}

/** 有聚焦元素时先问这张图/表；否则按选中、章节、题目、普通页面给入口。 */
export function quickPrompts(snapshot: PageSnapshot, options: QuickPromptOptions = {}): QuickPrompt[] {
  const focus = options.focus ?? null;
  const check = options.checkMode ? [checkPrompt(focus)] : [];
  if (focus) {
    const kind = focus.role === 'table' ? '表' : '图';
    return [
      { label: `解释这张${kind}`, question: `请解释这张${kind}在讲什么，并说明它和当前小节的关系。` },
      { label: `这张${kind}和正文什么关系`, question: `这张${kind}对应正文哪一段？请结合上下文说明它在论证什么。` },
      ...check,
    ];
  }
  const selection = snapshot.selection?.text.trim();
  if (selection) {
    return [
      { label: '解释这段', question: '请用通俗的话解释我选中的这段，并结合上下文说明它在讲什么。' },
      { label: '和书里哪节有关', question: '我选中的这段和书稿哪一节最相关？请检索原文并给出引用。' },
      ...check,
    ];
  }
  if (snapshot.pageType === 'chapter') {
    return [
      ...check,
      { label: '这一节在讲什么', question: '请概括我当前在看的这一节，指出关键概念和它在全书中的位置。' },
      { label: '找书里相关章节', question: '围绕当前这一节，帮我找书里最相关的其他小节，并说明关系。' },
      { label: '本章概念图', question: '请把这一章整理成概念图，节点对应到具体小节。', mode: 'map' },
    ];
  }
  if (snapshot.pageType === 'exam') {
    return [
      ...check,
      { label: '这题考什么', question: '请说明我当前看到的这道题考什么、关键陷阱是什么。' },
      { label: '为什么这个选项不对', question: '请逐项分析当前题目的选项，说明为什么正确项对、错误项错。' },
    ];
  }
  return [
    ...check,
    { label: '这页在讲什么', question: '请概括我当前看到的这个页面，重点是什么。' },
    { label: '帮我查一下', question: '请围绕当前页面里的关键词联网搜索，并给出带链接的摘要。' },
  ];
}
