import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterFourFlows } from '../src/lib/chapter-four-flow.ts';

const nodes = chapterFourFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterFourFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);

test('Chapter 4 flow data resolves every section and cross-view return path', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter4.md', import.meta.url),
    'utf8',
  );
  const headings = new Set(
    [...markdown.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1]),
  );
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, nodes.length);
  assert.equal(
    new Set(chapterFourFlows.map((view) => view.id)).size,
    chapterFourFlows.length,
  );
  for (const item of [...chapterFourFlows, ...nodes]) {
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  }
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const heading of [
    '能力的表达形式：专用工具、通用执行器与 Skill',
    '工具描述的艺术',
    '参数传递的保真性',
    '工具生态：MCP 与 Skill Hub',
    '层次化组织与按需加载',
    '模型原生的主动工具发现',
    'Skills：把工具发现变成“按需查阅”',
    '感知工具',
    '原生多模态处理',
    '提取为文本',
    '工具化多模态分析',
    '执行工具',
    '协作工具',
  ])
    assert.ok(covered.has(heading), `Missing topic: ${heading}`);
});

test('Chapter 4 flow data keeps optional routes and denied actions out of the execution chain', () => {
  const [overview, discovery, perception, execution, collaboration] =
    chapterFourFlows;
  assert.equal(overview.shared.at(-1).id, 'route');
  assert.deepEqual(
    overview.outcomes.map((branch) => branch.links[0].nodeId),
    ['perception-query', 'proposal', 'collaboration-goal'],
  );
  assert.equal(discovery.lanes.length, 2);
  assert.equal(discovery.shared.length, 0);
  assert.equal(discovery.outcomes[0].nodes[0].id, 'schema-load');
  assert.equal(discovery.outcomes[2].links[0].nodeId, 'tool-need');
  assert.deepEqual(
    perception.outcomes.map((branch) => branch.nodes[0].id),
    ['native-media', 'extract-text', 'analyze-media'],
  );
  assert.equal(execution.shared.at(-1).id, 'gate');
  assert.deepEqual(
    execution.outcomes[0].nodes.map((node) => node.id),
    ['execute-action', 'execution-state', 'verify-action'],
  );
  assert.ok(execution.outcomes.slice(1).every((branch) => !branch.nodes));
  assert.equal(execution.after, undefined);
  assert.equal(execution.outcomes[1].links[0].nodeId, 'proposal');
  assert.equal(execution.outcomes[2].links[0].nodeId, 'human-request');
  assert.match(nodes.find((node) => node.id === 'gate').detail, /等待放行/);
  assert.match(
    nodes.find((node) => node.id === 'execution-state').detail,
    /确认未完成且具备安全重试条件/,
  );
  assert.deepEqual(
    collaboration.outcomes.map((branch) => branch.nodes[0].id),
    ['agent-discover', 'human-request'],
  );
  assert.match(
    nodes.find((node) => node.id === 'human-request').detail,
    /超时不能自动解释为授权/,
  );
});

test('Chapter 4 renders all views and valid anchors outside the annotated article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter4/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-four-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-four-flow"/g)].length, 3);
  const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  for (const [, id] of flow.matchAll(/\bid="([^"]+)"/g))
    assert.equal(allIds.filter((item) => item === id).length, 1, id);
  for (const node of nodes) {
    assert.ok(flow.includes(`data-flow-node="${node.id}"`), node.id);
    assert.ok(flow.includes(node.detail), node.id);
  }
  for (const view of chapterFourFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-four-flow-panel-${view.id}"[^>]*>`),
    );
    assert.ok(panel, view.id);
    assert.doesNotMatch(panel[0], /hidden/);
  }
  for (const [, fragment] of flow.matchAll(/href="#([^"]+)"/g))
    assert.ok(allIds.includes(decodeURIComponent(fragment)), fragment);
  for (const path of [
    'book/chapter1',
    'book/chapter2',
    'book/chapter3',
    'book/chapter5',
    'book-en/chapter4',
  ]) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-four-flow"'), path);
    if (['book/chapter1', 'book-en/chapter4'].includes(path))
      assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
