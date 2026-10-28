// Requirement 016: pure page-assistant helpers, no DOM required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addRunHistory,
  applyAssistantEvent,
  assistantStateFromRun,
  buildPageRequest,
  canResumeHistory,
  chapterNumberFromPath,
  chooseCurrentBlock,
  citationSummary,
  contextLine,
  detectPageType,
  emptyAssistantState,
  historyLabel,
  MAX_SCREENSHOT_CHARS,
  newSessionId,
  parseRunHistory,
  parseSessionHistory,
  quickPrompts,
  reasoningChoices,
  resolveReasoningChoice,
  restoredWhen,
  restoredWhere,
  runTraceUrl,
  screenshotTop,
  sessionResumePath,
  sessionSummaryLine,
  shortArgs,
  snapshotSummary,
  toolLabel,
  truncateSnapshot,
  usageLine,
} from '../client/page-assistant/model.ts';
import { textWithFields } from '../client/page-assistant/capture.ts';
import { inferConceptMode, resolveSendMode } from '../client/page-assistant/modes.ts';

function block(index, overrides = {}) {
  return {
    index,
    id: '',
    tag: 'p',
    role: 'paragraph',
    sectionId: 'sec-1',
    sectionTitle: '1.1 小节',
    text: `第 ${index} 块正文。`,
    top: index * 100,
    height: 80,
    inViewport: index >= 5 && index <= 7,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const blocks = Array.from({ length: 12 }, (_, index) => block(index + 1));
  return {
    version: 1,
    url: 'http://reader/book/chapter2/',
    title: '第 2 章 上下文工程',
    path: '/book/chapter2/',
    lang: 'zh-CN',
    pageType: 'chapter',
    capturedAt: '2026-10-19T09:00:00.000Z',
    viewport: { width: 1200, height: 800, scrollY: 500, pageHeight: 4000, scrollRatio: 0.125, devicePixelRatio: 2 },
    chapter: { number: 2, key: 'ai-agents-in-depth:zh-CN:chapter2', title: '第 2 章' },
    current: { blockIndex: 6, blockId: '', sectionId: 'sec-1', sectionTitle: '1.1 小节', percent: 0.125 },
    selection: { text: '选中的原文', blockIndex: 6, sectionId: 'sec-1' },
    headings: [{ id: 'sec-1', text: '1.1 小节', level: 2, blockIndex: 1 }],
    blocks,
    links: [{ text: '原文', href: 'https://example.com', blockIndex: 6 }],
    truncated: false,
    ...overrides,
  };
}

test('detectPageType and chapter numbers cover the whole site', () => {
  assert.equal(detectPageType('/'), 'home');
  assert.equal(detectPageType('/book/chapter4/'), 'chapter');
  assert.equal(detectPageType('/book/chapter10/'), 'chapter');
  assert.equal(detectPageType('/harness/'), 'harness');
  assert.equal(detectPageType('/harness/site/ai-pm-exam.html'), 'exam');
  assert.equal(detectPageType('/harness/site/research/13-agent-evals.html'), 'harness-archive');
  assert.equal(detectPageType('/harness/interview/'), 'interview');
  assert.equal(detectPageType('/book-exam/a/'), 'exam');
  assert.equal(detectPageType('/lab/'), 'lab');
  assert.equal(detectPageType('/my-highlights/'), 'highlights');
  assert.equal(detectPageType('/other/'), 'other');
  assert.equal(chapterNumberFromPath('/book/chapter7/'), 7);
  assert.equal(chapterNumberFromPath('/nope/'), null);
});

test('summary and context line show section, position and selection', () => {
  const data = snapshot();
  assert.deepEqual(snapshotSummary(data), {
    title: '第 2 章 上下文工程',
    section: '1.1 小节',
    percent: 13,
    selectionChars: 5,
    blocks: 12,
    visibleBlocks: 3,
    pageType: 'chapter',
  });
  assert.equal(contextLine(data), '1.1 小节 · 13% · 选中 5 字');
  data.selection = null;
  assert.equal(contextLine(data), '1.1 小节 · 13%');
});

test('chooseCurrentBlock prefers the block containing the viewport center', () => {
  const blocks = [block(1, { inViewport: false }), block(5, { top: 500, height: 100, inViewport: true }), block(6, { top: 600, height: 100, inViewport: true })];
  assert.equal(chooseCurrentBlock(blocks, 520, 100), 5);
  assert.equal(chooseCurrentBlock(blocks, 520, 300), 6);
  assert.equal(chooseCurrentBlock([], 0, 800), null);
});

test('small snapshots are returned unchanged', () => {
  const data = snapshot();
  assert.equal(truncateSnapshot(data, 1_000_000).blocks.length, 12);
});

test('large snapshots keep the current block and viewport, and report truncation', () => {
  const data = snapshot();
  for (const item of data.blocks) item.text = '长'.repeat(5000);
  const result = truncateSnapshot(data, 20_000);
  assert.equal(result.truncated, true);
  assert.ok(result.blocks.length > 0 && result.blocks.length < 12);
  assert.ok(result.blocks.some((item) => item.index === 6));
  assert.ok(result.blocks.every((item) => item.index >= 1 && item.index <= 12));
  assert.equal(result.links.length, 1);
});

test('buildPageRequest trims the question and enforces limits', () => {
  const request = buildPageRequest({ question: '  这段在讲什么？  ', snapshot: snapshot(), screenshot: null, sessionId: 'pa-test-1' });
  assert.equal(request.body.question, '这段在讲什么？');
  assert.equal(request.body.sendScreenshot, false);
  assert.equal(request.body.page.blocks.length, 12);
  assert.throws(() => buildPageRequest({ question: '   ', snapshot: snapshot() }), /不能为空/);
  assert.throws(() => buildPageRequest({ question: 'x'.repeat(4001), snapshot: snapshot() }), /4000/);
});

test('buildPageRequest drops oversized screenshots instead of failing the request', () => {
  const oversized = 'x'.repeat(MAX_SCREENSHOT_CHARS + 1);
  const request = buildPageRequest({ question: 'q', snapshot: snapshot(), screenshot: oversized, sendScreenshot: true });
  assert.equal(request.droppedScreenshot, true);
  assert.equal(request.body.screenshot, null);
  assert.equal(request.body.sendScreenshot, false);
});

test('buildPageRequest respects the screenshot switch', () => {
  const request = buildPageRequest({ question: 'q', snapshot: snapshot(), screenshot: 'data:image/jpeg;base64,abc', sendScreenshot: false });
  assert.equal(request.body.screenshot, null);
  assert.equal(request.body.sendScreenshot, false);
});

test('buildPageRequest defaults to ask and carries mode and focus', () => {
  const plain = buildPageRequest({ question: 'q', snapshot: snapshot() });
  assert.equal(plain.body.mode, 'ask');
  assert.equal(plain.body.focus, null);

  const focus = { blockIndex: 6, role: 'table', caption: '表 2-1 上下文窗口' };
  const checked = buildPageRequest({ question: 'q', snapshot: snapshot(), mode: 'check', focus });
  assert.equal(checked.body.mode, 'check');
  assert.deepEqual(checked.body.focus, focus);
});

test('buildPageRequest drops the screenshot and focus for a concept map', () => {
  const request = buildPageRequest({
    question: '把本章画成概念图',
    snapshot: snapshot(),
    screenshot: 'data:image/jpeg;base64,abc',
    mode: 'map',
    focus: { blockIndex: 6, role: 'table', caption: '表 2-1' },
  });
  assert.equal(request.body.mode, 'map');
  assert.equal(request.body.focus, null);
  assert.equal(request.body.screenshot, null);
  assert.equal(request.body.sendScreenshot, false);
});

test('buildPageRequest forwards the reasoning level', () => {
  const request = buildPageRequest({ question: 'q', snapshot: snapshot(), reasoningLevel: 'high' });
  assert.equal(request.body.reasoningLevel, 'high');
  assert.equal(buildPageRequest({ question: 'q', snapshot: snapshot() }).body.reasoningLevel, '');
});

test('reasoning choices list profile levels and fall back to the profile default', () => {
  const choices = reasoningChoices({
    parameter: 'reasoning_effort',
    default: 'medium',
    levels: [
      { name: 'off', value: null },
      { name: 'low', value: 'low' },
      { name: 'medium', value: 'medium' },
      { name: 'high', value: 'high' },
    ],
  });
  assert.equal(choices[0].value, '');
  assert.equal(choices[0].label, '默认·中');
  assert.equal(choices[0].meta, 'reasoning_effort = medium');
  assert.deepEqual(choices.slice(1).map((choice) => choice.value), ['off', 'low', 'medium', 'high']);
  assert.deepEqual(choices.slice(1).map((choice) => choice.label), ['关闭', '低', '中', '高']);
  assert.equal(choices[1].meta, 'reasoning_effort 不发送');
  assert.equal(resolveReasoningChoice(choices, 'high'), 'high');
  assert.equal(resolveReasoningChoice(choices, 'max'), '');
});

test('reasoning choices hide when nothing is injected and keep custom names', () => {
  assert.deepEqual(reasoningChoices(null), []);
  assert.deepEqual(reasoningChoices({ parameter: 'reasoning_effort', default: null, levels: [{ name: 'off', value: null }] }), []);

  // 档位名与注入值不一致时保留原名，避免把 off 说成关闭。
  const odd = reasoningChoices({ parameter: 'reasoning_effort', default: null, levels: [{ name: 'off', value: 'low' }] });
  assert.equal(odd[0].label, '默认·不发送');
  assert.equal(odd[1].label, 'off');
  assert.equal(odd[1].meta, 'reasoning_effort = low');

  const custom = reasoningChoices({
    parameter: 'thinking',
    default: null,
    levels: [{ name: '平衡', value: { type: 'enabled', budget: 1024 } }],
  });
  assert.equal(custom[1].label, '平衡');
  assert.equal(custom[1].meta, 'thinking = {"type":"enabled","budget":1024}');
});

test('assistant event reducer collects tools and finishes with answer, citations and totals', () => {
  let state = emptyAssistantState();
  state = applyAssistantEvent(state, { type: 'run_start', run_id: 'r', question: 'q', config: {}, config_hash: '' });
  assert.equal(state.status, 'running');
  state = applyAssistantEvent(state, {
    type: 'tool_call',
    turn: 1,
    call_id: 'c1',
    name: 'page_context',
    args: '{"scope":"current"}',
    result: '页面内容',
    truncated: false,
    duration_ms: 42,
  });
  assert.equal(state.tools.length, 1);
  assert.equal(state.tools[0].name, 'page_context');
  state = applyAssistantEvent(state, {
    type: 'llm_response',
    turn: 1,
    purpose: 'agent',
    message: null,
    usage: {},
    retries: [],
    error: '模型挂了',
  });
  assert.equal(state.error, '模型挂了');
  state = applyAssistantEvent(state, { type: 'info', turn: 1, kind: 'compressed', detail: {} });
  assert.ok(state.notices.includes('上下文已压缩'));
  state = applyAssistantEvent(state, {
    type: 'run_end',
    status: 'ok',
    answer: '回答 [[ch2#kv-cache|原文]]',
    citations: [{ chapter: 2, quote: '原文', status: 'verified' }],
    citation_check: {},
    totals: { prompt_tokens: 100, completion_tokens: 20, tool_calls: 1 },
  });
  assert.equal(state.status, 'done');
  assert.match(state.text, /回答/);
  assert.equal(state.citations.length, 1);
});

test('assistant event reducer keeps a partial answer when the run fails', () => {
  const state = applyAssistantEvent(emptyAssistantState(), {
    type: 'run_end',
    status: 'llm_error',
    answer: '先给一部分',
    citations: [],
    citation_check: {},
    totals: {},
    error: 'HTTP 500',
  });
  assert.equal(state.status, 'error');
  assert.equal(state.text, '先给一部分');
  assert.equal(state.error, 'HTTP 500');
});

test('tool labels, short args and usage line are reader friendly', () => {
  assert.equal(toolLabel('page_read_range'), '扩大阅读范围');
  assert.equal(toolLabel('unknown_tool'), 'unknown_tool');
  assert.equal(shortArgs('{"query":"缓存命中","top_k":5}'), 'query: 缓存命中');
  assert.equal(shortArgs('{"path":"docs/dev/README.md"}'), 'path: docs/dev/README.md');
  assert.equal(shortArgs('not json'), 'not json');
  assert.equal(usageLine({ prompt_tokens: 1000, completion_tokens: 200, tool_calls: 2 }), '1,000 in · 200 out · 2 次工具');
  assert.equal(citationSummary([{ chapter: 2, quote: 'x', status: 'verified' }, { chapter: 3, quote: 'y', status: 'not_found' }]), '2 条书稿引用 · 1 条逐字核对通过');
});

test('quick prompts follow selection and page type', () => {
  const withSelection = quickPrompts(snapshot());
  assert.equal(withSelection[0].label, '解释这段');
  const chapter = quickPrompts(snapshot({ selection: null }));
  assert.equal(chapter[0].label, '这一节在讲什么');
  assert.equal(chapter.at(-1).label, '本章概念图');
  assert.equal(chapter.at(-1).mode, 'map');
  const exam = quickPrompts(snapshot({ selection: null, pageType: 'exam' }));
  assert.equal(exam[0].label, '这题考什么');
});

test('quick prompts add check and focus entry points', () => {
  const checked = quickPrompts(snapshot({ selection: null }), { checkMode: true });
  assert.equal(checked[0].label, '先考我');
  assert.equal(checked[0].mode, 'check');
  assert.equal(checked[1].label, '这一节在讲什么');

  const focused = quickPrompts(snapshot({ selection: null }), {
    focus: { blockIndex: 6, role: 'figure', caption: '图 2-1' },
  });
  assert.equal(focused[0].label, '解释这张图');
  assert.ok(focused.every((item) => item.mode !== 'map'));
});

test('concept-map intent is narrow and only on chapter pages', () => {
  assert.equal(inferConceptMode('请把本章画成概念图', 'chapter'), true);
  assert.equal(inferConceptMode('这一章的知识地图', 'chapter'), true);
  assert.equal(inferConceptMode('这个概念图里的箭头是什么意思', 'chapter'), false);
  assert.equal(inferConceptMode('把本章画成概念图', 'harness'), false);
  assert.equal(resolveSendMode('把本章画成概念图', 'check', 'chapter'), 'map');
  assert.equal(resolveSendMode('把本章画成概念图', 'ask', 'chapter', 'check'), 'check');
  assert.equal(resolveSendMode('这一节在讲什么', 'check', 'chapter'), 'check');
});

test('session ids are valid for the server validator', () => {
  const id = newSessionId(() => '12345678-1234-4234-8234-123456789abc');
  assert.match(id, /^pa-[A-Za-z0-9_-]{6,80}$/);
});

test('screenshot offset follows the current scroll position', () => {
  assert.equal(screenshotTop(-1500, 0), -1500);
  assert.equal(screenshotTop(-40, 200), -240);
  assert.equal(screenshotTop(112, 0), 112);
  assert.equal(screenshotTop(Number.NaN, 10), -10);
});

test('run history keeps newest entries and links to the lab trace', () => {
  const now = new Date('2026-10-19T12:00:00+08:00').getTime();
  const first = {
    runId: 'a',
    question: '问题一',
    status: 'ok',
    error: '',
    at: now,
    pageTitle: '第 5 章',
    section: '5.1 小节',
    promptTokens: 10,
    completionTokens: 2,
  };
  const updated = addRunHistory([first], { ...first, status: 'max_turns', error: '达到最大轮数 12' });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].status, 'max_turns');
  assert.equal(historyLabel(updated[0], now), '12:00 · 达到轮数上限');
  assert.equal(parseRunHistory(JSON.stringify({ version: 1, items: updated })).length, 1);
  assert.equal(parseRunHistory('not json').length, 0);
  assert.equal(parseRunHistory('[{"question":""}]').length, 0);
  assert.equal(runTraceUrl('http://host:4321/', '20261019-100009-06fd'), 'http://host:4321/lab/#/run/20261019-100009-06fd');
  const many = Array.from({ length: 40 }, (_, index) => ({ ...first, runId: `r-${index}` }));
  assert.equal(addRunHistory(many, { ...first, runId: 'new' }).length, 30);
  assert.equal(addRunHistory(many, { ...first, runId: 'new' })[0].runId, 'new');
});

function sessionRun(overrides = {}) {
  return {
    runId: '20261019-100000-abcd',
    question: '这一节在讲什么？',
    answer: '这一节讲上下文窗口。',
    status: 'ok',
    error: '',
    startedAt: '2026-10-19T02:00:00.000Z',
    page: { title: '第 2 章 上下文工程', section: '2.2 上下文窗口', percent: 0.125 },
    citations: [{ chapter: 2, quote: '原文', status: 'verified' }],
    totals: { prompt_tokens: 100, completion_tokens: 20 },
    ...overrides,
  };
}

test('session history parsing keeps valid turns and drops damaged rows', () => {
  const parsed = parseSessionHistory({
    sessionId: 'pa-resume-1',
    runs: [
      sessionRun(),
      sessionRun({
        runId: '20261019-100100-abcd',
        question: '  追问  ',
        answer: '',
        status: 'max_turns',
        error: '达到最大轮数',
        page: { title: '第 2 章', section: '', percent: 3 },
        citations: [{ chapter: 2, quote: '', status: 'verified' }, { chapter: 2, quote: '引文', status: 'verified' }],
      }),
      { question: '   ' },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.sessionId, 'pa-resume-1');
  assert.equal(parsed.runs.length, 2);
  assert.equal(parsed.runs[1].question, '追问');
  assert.equal(parsed.runs[1].status, 'max_turns');
  assert.equal(parsed.runs[1].page.percent, 1);
  assert.equal(parsed.runs[1].citations.length, 1);
  assert.equal(parsed.runs[1].citations[0].quote, '引文');

  assert.equal(parseSessionHistory(null), null);
  assert.equal(parseSessionHistory({ sessionId: 'bad', runs: [sessionRun()] }), null);
  assert.equal(parseSessionHistory({ sessionId: 'pa-resume-1', runs: [] }), null);
});

test('restored runs map to assistant states and readable context', (t) => {
  // 摘要行不带 now 参数，用固定时钟避免跨天时“从 10:00”变成“从 10-19 10:00”。
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T03:00:00.000Z') });
  const okRun = sessionRun();
  const done = assistantStateFromRun(okRun);
  assert.equal(done.status, 'done');
  assert.equal(done.text, '这一节讲上下文窗口。');
  assert.equal(done.citations.length, 1);

  const failed = assistantStateFromRun(sessionRun({ status: 'max_turns', answer: '先给一半', error: '' }));
  assert.equal(failed.status, 'error');
  assert.equal(failed.text, '先给一半');
  assert.equal(failed.error, '达到轮数上限');

  assert.equal(restoredWhere(okRun), '第 2 章 上下文工程 · 2.2 上下文窗口');
  assert.equal(restoredWhen(okRun, new Date('2026-10-19T03:00:00.000Z').getTime()), '10:00');
  assert.equal(restoredWhen(sessionRun({ startedAt: 'not a date' })), '');
  assert.equal(
    sessionSummaryLine({ sessionId: 'pa-resume-1', runs: [okRun, sessionRun()] }),
    '已恢复 2 轮对话 · 从 10:00 开始 · 继续提问会沿用这些上下文',
  );
  t.mock.timers.reset();
});

test('history entries resolve to a resumable server path', () => {
  assert.equal(sessionResumePath({ sessionId: 'pa-resume-1', runId: '' }), '/page/sessions/pa-resume-1');
  assert.equal(sessionResumePath({ sessionId: '', runId: '20261019-100000-abcd' }), '/page/runs/20261019-100000-abcd/session');
  assert.equal(sessionResumePath({ sessionId: '', runId: '' }), '');
  assert.equal(canResumeHistory({ sessionId: 'pa-resume-1', runId: '' }), true);
  assert.equal(canResumeHistory({ sessionId: '', runId: '20261019-100000-abcd' }), true);
  assert.equal(canResumeHistory({ sessionId: '', runId: '' }), false);
});

test('history groups turns of one session and keeps failed starts separate', () => {
  const base = {
    question: '问题',
    status: 'ok',
    error: '',
    at: 1,
    pageTitle: '第 2 章',
    section: '2.2 节',
    promptTokens: 0,
    completionTokens: 0,
  };
  const first = { ...base, runId: 'r1', sessionId: 'pa-session-1', turns: 1 };
  const second = { ...base, runId: 'r2', sessionId: 'pa-session-1', turns: 0 };
  const merged = addRunHistory([first], second);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].runId, 'r2');
  assert.equal(merged[0].turns, 2);

  const runEnd = { ...second, turns: 0, status: 'max_turns' };
  const finished = addRunHistory(merged, runEnd);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].turns, 2);

  const failedStart = { ...base, runId: '', sessionId: 'pa-session-1', turns: 0, status: 'error' };
  const kept = addRunHistory(finished, failedStart);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].runId, '');

  const restored = addRunHistory(kept, { ...first, runId: 'r1', sessionId: 'pa-session-1', turns: 5 });
  assert.equal(restored.find((item) => item.runId === 'r1').turns, 5);
  assert.equal(restored.length, 2);
});

test('stored history keeps session metadata and migrates old entries', () => {
  const raw = JSON.stringify({
    version: 1,
    items: [
      { runId: 'r1', sessionId: 'pa-session-1', turns: 2, question: '新记录', status: 'ok', at: 1 },
      { runId: 'r0', question: '旧记录', status: 'ok', at: 0 },
    ],
  });
  const [fresh, legacy] = parseRunHistory(raw);
  assert.equal(fresh.sessionId, 'pa-session-1');
  assert.equal(fresh.turns, 2);
  assert.equal(legacy.sessionId, '');
  assert.equal(legacy.turns, 1);
  assert.equal(canResumeHistory(legacy), true);
  assert.equal(canResumeHistory({ ...legacy, runId: '' }), false);
});

function textNode(value) {
  return { nodeType: 3, textContent: value };
}

function element(tagName, extra = {}) {
  return { nodeType: 1, tagName, childNodes: [], ...extra };
}

test('textWithFields reads live form values instead of only textContent', () => {
  const stem = element('P', {
    childNodes: [
      textNode('压缩旧轨迹时应优先保留四类信息：'),
      element('INPUT', { type: 'text', value: '系统提示词' }),
      textNode('、'),
      element('INPUT', { type: 'text', value: '' }),
      textNode('、'),
      element('TEXTAREA', { value: '开放题的作答' }),
      textNode('。'),
    ],
  });
  assert.equal(textWithFields(stem), '压缩旧轨迹时应优先保留四类信息：[填写: 系统提示词]、[空]、[填写: 开放题的作答]。');
});

test('textWithFields marks selections and hides secrets', () => {
  const radio = element('LABEL', {
    childNodes: [element('INPUT', { type: 'radio', checked: true }), textNode('正确')],
  });
  assert.equal(textWithFields(radio), '[已选] 正确');
  assert.equal(textWithFields(element('INPUT', { type: 'radio', checked: false })), '');
  assert.equal(textWithFields(element('SELECT', { selectedText: '决策' })), '[已选: 决策]');
  assert.equal(
    textWithFields(element('SELECT', { selectedText: '', childNodes: [textNode('候选 A'), textNode('候选 B')] })),
    '候选 A 候选 B',
  );
  assert.equal(textWithFields(element('INPUT', { type: 'password', value: 'secret' })), '');
  assert.equal(textWithFields(element('INPUT', { type: 'hidden', value: 'token' })), '');
});


test('session history keeps the page path used for block links', () => {
  const session = parseSessionHistory({
    sessionId: 'pa-test-1',
    runs: [
      {
        runId: 'r1',
        question: '问',
        answer: '答',
        status: 'ok',
        page: { title: '第 2 章', section: '2.1', percent: 0.1, path: '/book/chapter2/' },
      },
    ],
  });
  assert.equal(session.runs[0].page.path, '/book/chapter2/');
  const legacy = parseSessionHistory({
    sessionId: 'pa-test-1',
    runs: [{ runId: 'r2', question: '问', answer: '答', status: 'ok' }],
  });
  assert.equal(legacy.runs[0].page.path, '');
});
