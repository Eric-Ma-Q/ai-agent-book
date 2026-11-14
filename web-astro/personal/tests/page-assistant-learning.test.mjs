// Requirement 021: pure helpers for check cards, concept maps and focus targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion } from '../client/page-assistant/check.ts';
import { conceptTextWidth, fitConceptText, layoutConcept, parseConcept } from '../client/page-assistant/concept.ts';
import { focusCandidates } from '../client/page-assistant/focus.ts';
import { blockRefSpans } from '../client/page-assistant/anchors.ts';
import { formatDuration, parseReplay, replayErrorText, replaySummary, usageText } from '../client/page-assistant/replay.ts';

function node(id, overrides = {}) {
  return { id, label: `概念${id}`, section: 'sec-1', note: '', ...overrides };
}

function concept(overrides = {}) {
  return {
    title: '第 2 章',
    nodes: [node('n1'), node('n2'), node('n3')],
    edges: [
      { from: 'n1', to: 'n2', label: '影响' },
      { from: 'n2', to: 'n3', label: '导致' },
    ],
    ...overrides,
  };
}

// The 12-node map produced by run 20261024-225606-6f8e.
function chapter7Map() {
  return {
    title: '第 7 章 · Agent 的评估',
    nodes: [
      { id: 'n1', label: '任务定义四要素', section: '任务定义的四个组成部分', note: '指令、环境、工具、验证器缺一不可' },
      { id: 'n2', label: '评估指标', section: '评估指标：成功的定义', note: 'Pass@k 看上限，Pass^k 看可靠' },
      { id: 'n3', label: '评估环境', section: '评估环境', note: '人机交互型与工具调用型两类' },
      { id: 'n4', label: '评估数据集', section: '评估数据集的设计', note: '难度分层、防泄漏、长期维护' },
      { id: 'n5', label: 'LLM-as-a-Judge', section: 'llm-as-a-judge自动化评估的核心', note: '开放式任务缺标准答案时的裁判' },
      { id: 'n6', label: 'Rubric 四准则', section: 'llm-as-a-judge自动化评估的核心', note: '专家基础、全面、加权、自包含' },
      { id: 'n7', label: '裁判偏差', section: 'llm-as-a-judge自动化评估的核心', note: '长度偏差等，需审计与回炉改标准' },
      { id: 'n8', label: '失败归因', section: '失败归因从整条轨迹定位首个错误', note: '定位轨迹中第一个错误步骤' },
      { id: 'n9', label: '回归任务', section: '端到端回归任务与轨迹前缀回归任务', note: '端到端与前缀切片两种验证粒度' },
      { id: 'n10', label: '配对比较排名', section: '配对比较与模型排名', note: '成对评判算出模型偏好序' },
      { id: 'n11', label: '模型选型', section: '评估驱动的模型选型', note: '看行为策略与成本，不只看分数' },
      { id: 'n12', label: '内部评估设施', section: '从外部评估到内部评估生产级-agent-的评估基础设施', note: '消融、AB 测试、特性开关支撑迭代' },
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '产生' },
      { from: 'n1', to: 'n3', label: '依赖' },
      { from: 'n3', to: 'n4', label: '承载' },
      { from: 'n4', to: 'n5', label: '供给' },
      { from: 'n5', to: 'n6', label: '约束' },
      { from: 'n6', to: 'n7', label: '抑制' },
      { from: 'n5', to: 'n8', label: '补充' },
      { from: 'n8', to: 'n9', label: '沉淀' },
      { from: 'n5', to: 'n10', label: '产生' },
      { from: 'n2', to: 'n11', label: '支撑' },
      { from: 'n10', to: 'n11', label: '支撑' },
      { from: 'n9', to: 'n12', label: '汇入' },
      { from: 'n11', to: 'n12', label: '衔接' },
      { from: 'n7', to: 'n6', label: '反馈' },
    ],
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('checkQuestion strips a label and blank lines, and caps the text', () => {
  assert.equal(checkQuestion('问题：为什么工具描述重要？\n\n'), '为什么工具描述重要？');
  assert.equal(checkQuestion('  第一行\n\n第二行  '), '第一行\n第二行');
  assert.equal(checkQuestion(''), '');
  assert.equal(checkQuestion('x'.repeat(400)).length, 300);
});

test('parseConcept accepts the documented shape and defaults the title', () => {
  const map = parseConcept(JSON.stringify(concept()));
  assert.equal(map.title, '第 2 章');
  assert.equal(map.nodes.length, 3);
  assert.equal(map.edges.length, 2);
  const untitled = parseConcept(JSON.stringify(concept({ title: '' })));
  assert.equal(untitled.title, '本章概念图');
  const fenced = parseConcept(`这里是图：\n${JSON.stringify(concept())}\n结束`);
  assert.equal(fenced.nodes.length, 3);
});

test('parseConcept rejects broken or misleading maps', () => {
  assert.equal(parseConcept('not json'), null);
  assert.equal(parseConcept(''), null);
  assert.equal(parseConcept(JSON.stringify(concept({ nodes: [node('n1')] }))), null);
  assert.equal(parseConcept(JSON.stringify(concept({ nodes: Array.from({ length: 13 }, (_, i) => node(`n${i}`)) }))), null);
  assert.equal(parseConcept(JSON.stringify(concept({ nodes: [node('n1'), node('n1')] }))), null);
  assert.equal(parseConcept(JSON.stringify(concept({ edges: [{ from: 'n1', to: 'n9', label: '' }] }))), null);
  assert.equal(parseConcept(JSON.stringify(concept({ edges: [{ from: 'n1', to: 'n1', label: '' }] }))), null);
  assert.equal(
    parseConcept(JSON.stringify(concept({ edges: Array.from({ length: 25 }, () => ({ from: 'n1', to: 'n2' })) }))),
    null,
  );
});

test('parseConcept dedupes repeated edges and keeps labels', () => {
  const map = parseConcept(
    JSON.stringify(
      concept({
        edges: [
          { from: 'n1', to: 'n2', label: '影响' },
          { from: 'n1', to: 'n2', label: '重复' },
        ],
      }),
    ),
  );
  assert.equal(map.edges.length, 1);
  assert.equal(map.edges[0].label, '影响');
});

test('parseConcept caps edge labels at eight characters', () => {
  const map = parseConcept(JSON.stringify(concept({ edges: [{ from: 'n1', to: 'n2', label: '一二三四五六七八九十' }] })));
  assert.equal(map.edges[0].label, '一二三四五六七八');
});

test('layoutConcept puts a chain on consecutive layers without overlap', () => {
  const map = parseConcept(JSON.stringify(concept()));
  const layout = layoutConcept(map, 360);
  assert.equal(layout.width, 360);
  const byId = new Map(layout.nodes.map((box) => [box.id, box]));
  assert.equal(byId.get('n1').layer, 0);
  assert.equal(byId.get('n2').layer, 1);
  assert.equal(byId.get('n3').layer, 2);
  assert.ok(byId.get('n1').y < byId.get('n2').y);
  assert.ok(byId.get('n2').y < byId.get('n3').y);
  for (const box of layout.nodes) {
    assert.ok(box.x >= 0 && box.x + box.width <= layout.width + 0.01);
    assert.ok(box.y >= 0 && box.y + box.height <= layout.height);
  }
  assert.ok(layout.height > 120);
});

test('layoutConcept keeps a wide layer on one row and expands the canvas', () => {
  const nodes = Array.from({ length: 6 }, (_, index) => node(`n${index}`));
  const layout = layoutConcept({ title: 'x', nodes, edges: [] }, 320);
  assert.equal(new Set(layout.nodes.map((box) => box.y)).size, 1);
  assert.equal(layout.nodes[0].layer, 0);
  assert.ok(layout.width > 320);
  assert.ok(layout.nodes.every((box) => box.width >= 76));
  assert.ok(layout.nodes.every((box) => box.x >= 0 && box.x + box.width <= layout.width + 0.01));
  assert.ok(layout.nodes.every((box) => box.y >= 0 && box.y + box.height <= layout.height));
});

test('conceptTextWidth and fitConceptText keep CJK labels inside the node', () => {
  assert.ok(conceptTextWidth('概念', 11) > conceptTextWidth('ab', 11));
  assert.equal(fitConceptText('短标签', 100, 11), '短标签');
  assert.ok(fitConceptText('一个很长的节点标签', 40, 11).endsWith('…'));
  assert.ok(conceptTextWidth(fitConceptText('一个很长的节点标签', 40, 11), 11) <= 40);
});

test('layoutConcept handles a cycle without infinite recursion', () => {
  const map = parseConcept(
    JSON.stringify({
      title: 'x',
      nodes: [node('a'), node('b')],
      edges: [
        { from: 'a', to: 'b', label: '' },
        { from: 'b', to: 'a', label: '' },
      ],
    }),
  );
  const layout = layoutConcept(map, 360);
  assert.equal(layout.nodes.length, 2);
  assert.ok(layout.edges.some((edge) => edge.dashed));
  assert.equal(layout.nodes.find((box) => box.id === 'a').layer, 0);
  assert.equal(layout.nodes.find((box) => box.id === 'b').layer, 1);
});

test('layoutConcept puts the chapter 7 feedback edge on its own layer', () => {
  const map = parseConcept(JSON.stringify(chapter7Map()));
  const layout = layoutConcept(map, 372);
  const boxes = new Map(layout.nodes.map((box) => [box.id, box]));
  assert.equal(boxes.get('n6').layer, 4);
  assert.equal(boxes.get('n7').layer, 5);
  assert.equal(boxes.get('n11').layer, 5);
  for (const edge of layout.edges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (edge.dashed) assert.ok(to.layer <= from.layer, `${edge.from} -> ${edge.to} should be a back edge`);
    else assert.ok(to.layer > from.layer, `${edge.from} -> ${edge.to} should go down`);
  }
  const feedback = layout.edges.find((edge) => edge.from === 'n7' && edge.to === 'n6');
  assert.equal(feedback.dashed, true);
  assert.equal(feedback.side, true);
  const long = layout.edges.find((edge) => edge.from === 'n2' && edge.to === 'n11');
  assert.equal(long.kind, 'long');
  assert.equal(long.side, true);
  assert.ok(long.labelX > Math.max(...layout.nodes.map((box) => box.x + box.width)));
  assert.ok(feedback.labelX < Math.min(...layout.nodes.map((box) => box.x)));
  assert.equal(layout.crossings, 0);
  assert.equal(layout.labelOverlaps, 0);
  assert.equal(layout.dense, false);
  assert.equal(layout.sideCount, 2);
});

test('layoutConcept keeps every chapter 7 edge label apart from labels and nodes', () => {
  const map = parseConcept(JSON.stringify(chapter7Map()));
  for (const width of [296, 372, 392, 820]) {
    const layout = layoutConcept(map, width);
    assert.equal(layout.labelOverlaps, 0, `width ${width}`);
    const labels = layout.edges
      .filter((edge) => edge.label)
      .map((edge) => ({ x: edge.labelX - edge.labelWidth / 2, y: edge.labelY - 9, w: edge.labelWidth, h: 18 }));
    for (const label of labels) {
      assert.ok(label.x >= 0 && label.x + label.w <= layout.width + 0.01, `label inside canvas at ${width}`);
    }
    for (let first = 0; first < labels.length; first++) {
      for (let second = first + 1; second < labels.length; second++) {
        assert.equal(rectsOverlap(labels[first], labels[second]), false, `labels overlap at ${width}`);
      }
      for (const box of layout.nodes) {
        assert.equal(rectsOverlap(labels[first], { x: box.x, y: box.y, w: box.width, h: box.height }), false, `label over node at ${width}`);
      }
    }
    assert.ok(layout.nodes.every((box) => box.width >= 76 && box.width <= 132));
  }
});

test('layoutConcept expands the canvas instead of shrinking nodes below 76', () => {
  const map = parseConcept(JSON.stringify(chapter7Map()));
  const narrow = layoutConcept(map, 296);
  assert.ok(narrow.width > 296);
  assert.ok(narrow.nodes.every((box) => box.width >= 76));
  assert.equal(narrow.dense, false);
  const wide = layoutConcept(map, 820);
  assert.equal(wide.width, 820);
  assert.equal(wide.nodes[0].width, 132);
});

test('layoutConcept falls back to structure only when relationships are dense', () => {
  const nodes = Array.from({ length: 12 }, (_, index) => node(`d${index}`));
  const edges = [
    ['d0', 'd1'], ['d0', 'd2'], ['d0', 'd3'], ['d1', 'd4'], ['d2', 'd4'], ['d3', 'd5'],
    ['d4', 'd6'], ['d4', 'd7'], ['d5', 'd7'], ['d5', 'd8'], ['d6', 'd9'], ['d7', 'd9'],
    ['d8', 'd10'], ['d9', 'd10'], ['d10', 'd11'], ['d6', 'd11'], ['d3', 'd6'], ['d1', 'd5'],
    ['d2', 'd6'], ['d7', 'd10'], ['d8', 'd11'], ['d9', 'd11'], ['d2', 'd9'], ['d3', 'd10'],
  ].map(([from, to]) => ({ from, to, label: '关系' }));
  const layout = layoutConcept({ title: 'dense', nodes, edges }, 372);
  assert.equal(layout.dense, true);
  assert.ok(layout.sideCount >= 6);
});

function pageBlock(index, role, overrides = {}) {
  return {
    index,
    id: '',
    tag: role === 'table' ? 'table' : 'figure',
    role,
    sectionId: 'sec-1',
    sectionTitle: '1.1 小节',
    text: `${role} ${index} 的内容`,
    top: index * 100,
    height: 80,
    inViewport: false,
    ...overrides,
  };
}

test('focusCandidates keeps figures and tables, near blocks first, capped at 8', () => {
  const blocks = [];
  for (let index = 1; index <= 30; index++) {
    blocks.push(pageBlock(index, index % 2 ? 'figure' : 'table'));
    blocks.push(pageBlock(index + 100, 'paragraph'));
  }
  const snapshot = {
    version: 1,
    url: 'http://reader/book/chapter2/',
    title: '第 2 章',
    path: '/book/chapter2/',
    lang: 'zh-CN',
    pageType: 'chapter',
    capturedAt: '',
    viewport: { width: 1200, height: 800, scrollY: 0, pageHeight: 4000, scrollRatio: 0.1, devicePixelRatio: 2 },
    chapter: { number: 2, key: '', title: '' },
    current: { blockIndex: 5, blockId: '', sectionId: '', sectionTitle: '', percent: 0.1 },
    selection: null,
    headings: [],
    blocks,
    links: [],
    truncated: false,
  };
  const candidates = focusCandidates(snapshot);
  assert.equal(candidates.length, 8);
  assert.ok(candidates.every((item) => item.block.role === 'figure' || item.block.role === 'table'));
  assert.equal(candidates[0].block.index, 1);
  assert.ok(candidates.every((item) => item.block.index <= 20));
  const far = focusCandidates({ ...snapshot, current: { ...snapshot.current, blockIndex: 200 } });
  assert.equal(far.length, 8);
});

test('focusCandidates skips empty or collapsed blocks and falls back to a numbered caption', () => {
  const snapshot = {
    version: 1,
    url: 'http://reader/book/chapter2/',
    title: '第 2 章',
    path: '/book/chapter2/',
    lang: 'zh-CN',
    pageType: 'chapter',
    capturedAt: '',
    viewport: { width: 1200, height: 800, scrollY: 0, pageHeight: 4000, scrollRatio: 0.1, devicePixelRatio: 2 },
    chapter: { number: 2, key: '', title: '' },
    current: { blockIndex: 1, blockId: '', sectionId: '', sectionTitle: '', percent: 0.1 },
    selection: null,
    headings: [],
    blocks: [
      pageBlock(1, 'figure', { text: '' }),
      pageBlock(2, 'table', { height: 0 }),
      pageBlock(3, 'figure', { text: '\n' }),
      pageBlock(4, 'table', { text: '项目 | 值' }),
    ],
    links: [],
    truncated: false,
  };
  const candidates = focusCandidates(snapshot);
  assert.deepEqual(candidates.map((item) => item.block.index), [4]);
  assert.equal(candidates[0].caption, '项目 | 值');
  const bare = pageBlock(5, 'figure', { text: '图注' });
  assert.equal(focusCandidates({ ...snapshot, blocks: [bare] })[0].caption, '图注');
});


test('parseReplay keeps turns, tools and usage and drops broken rows', () => {
  const replay = parseReplay({
    runId: '20261023-101500-a1b2',
    question: '这一节在讲什么？',
    model: 'deepseek-chat',
    status: 'ok',
    startedAt: '2026-10-23T02:15:00.000+00:00',
    endedAt: '2026-10-23T02:15:08.000+00:00',
    durationMs: 8000,
    totals: { prompt_tokens: 100, completion_tokens: 20 },
    turns: [
      {
        turn: 1,
        request: { messageCount: 4, tools: ['page_context', 'search_book'], segments: { system: 10 } },
        response: { latencyMs: 1200, usage: { prompt_tokens: 30, completion_tokens: 8 }, finishReason: 'tool_calls', model: 'm', error: '', retries: 1 },
        tools: [{ name: 'page_context', args: '{"scope":"current"}', result: 'ok', durationMs: 12, error: '', truncated: false }],
        notes: [{ kind: 'compressed', detail: 'x' }],
      },
      { turn: 'bad' },
      { turn: 2, request: null, response: null, tools: [], notes: [] },
    ],
  });
  assert.equal(replay.runId, '20261023-101500-a1b2');
  assert.equal(replay.turns.length, 2);
  assert.equal(replay.turns[0].request.tools.length, 2);
  assert.equal(replay.turns[0].response.retries, 1);
  assert.equal(replay.turns[0].tools[0].durationMs, 12);
  assert.equal(replay.turns[1].request, null);
  assert.equal(usageText(replay.totals), '100 in / 20 out');
  assert.match(replaySummary(replay), /deepseek-chat/);
  assert.match(replaySummary(replay), /8\.0s/);
  assert.match(replaySummary(replay), /2 轮/);
  assert.equal(formatDuration(900), '900ms');
  assert.equal(formatDuration(1500), '1.5s');
});

test('parseReplay tolerates missing fields and rejects an empty id', () => {
  assert.equal(parseReplay(null), null);
  assert.equal(parseReplay({ turns: [] }), null);
  const replay = parseReplay({ runId: 'r1' });
  assert.equal(replay.status, 'error');
  assert.deepEqual(replay.turns, []);
  assert.equal(replay.answer, '');
  const negative = parseReplay({ runId: 'r1', durationMs: -5, turns: [{ turn: 1, response: { latencyMs: -2 } }] });
  assert.equal(negative.durationMs, 0);
  assert.equal(negative.turns[0].response.latencyMs, 0);
});


test('blockRefSpans keeps a range as one label and prefers the last block', () => {
  const range = blockRefSpans('见第 212–213 块。');
  assert.equal(range.length, 1);
  assert.equal(range[0].first, 212);
  assert.equal(range[0].last, 213);
  assert.equal(range[0].label, '第 212–213 块');
  assert.equal(range[0].start, 1);
  assert.equal(blockRefSpans('第 42 块')[0].first, 42);
  assert.equal(blockRefSpans('第 42 块')[0].last, 42);
  const through = blockRefSpans('第 1 至 3 块');
  assert.equal(through[0].first, 1);
  assert.equal(through[0].last, 3);
  assert.equal(blockRefSpans('第 3 块和第 4 块').length, 2);
  assert.equal(blockRefSpans('第 0 块').length, 0);
  assert.equal(blockRefSpans('没有块号').length, 0);
});


test('replayErrorText separates an old service from a missing trace', () => {
  assert.match(
    replayErrorText({ status: 404, notReady: true, message: '该功能的服务尚未就绪' }, '该功能的服务尚未就绪'),
    /回放接口还没有加载.*旧版本/,
  );
  assert.match(replayErrorText({ status: 0, message: '连接失败' }, '实验台服务没有启动'), /无法回放.*实验台服务没有启动/);
  assert.match(replayErrorText({ status: 404, message: '轨迹已清理' }, '轨迹已清理'), /无法回放.*轨迹已清理/);
});
