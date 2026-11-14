import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterSevenFlows } from '../src/lib/chapter-seven-flow.ts';

const nodes = chapterSevenFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterSevenFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 7 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter7.md', import.meta.url),
    'utf8',
  );
  const headings = new Set(
    [...markdown.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1]),
  );
  const topics = [...markdown.matchAll(/^### (.+)$/gm)].map(
    (match) => match[1],
  );
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, nodes.length);
  assert.equal(
    new Set(chapterSevenFlows.map((view) => view.id)).size,
    chapterSevenFlows.length,
  );
  for (const item of [...chapterSevenFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 7 flow data keeps metric, environment, verification and decision boundaries explicit', () => {
  const [overview, task, dataset, auto, decision] = chapterSevenFlows;

  assert.deepEqual(
    overview.outcomes.map((branch) => branch.nodes[0].id),
    ['define-success', 'collect-tasks', 'choose-verifier', 'make-decision'],
  );
  assert.equal(overview.after[0].id, 'evidence-loop');
  assert.match(byId('define-success').detail, /Pass\^k/);
  assert.match(byId('define-success').detail, /Pass@k/);

  assert.equal(task.lanes[0].nodes[0].id, 'task-record');
  assert.equal(task.lanes[1].nodes[0].id, 'dual-control');
  assert.match(byId('dual-control').detail, /用户.*重新调用工具/s);
  assert.deepEqual(
    task.lanes[2].nodes.map((node) => node.id),
    ['pass-at-k', 'pass-power-k'],
  );
  assert.match(byId('pass-power-k').detail, /Pass\^5≈7\.8%/);
  assert.deepEqual(
    task.outcomes.map((branch) => branch.nodes[0].id),
    ['env-human', 'env-tool'],
  );
  assert.equal(byId('env-two-types').choices.length, 4);

  assert.deepEqual(
    dataset.lanes[2].nodes.map((node) => node.id),
    ['public-benchmark', 'business-suite', 'production-return'],
  );
  assert.match(byId('verifier-depth').detail, /FAIL_TO_PASS.*PASS_TO_PASS/s);
  assert.match(byId('quality-maintenance').detail, /发布不是终点/);

  assert.equal(auto.lanes[0].nodes[0].id, 'rubric-four-rules');
  assert.equal(byId('attribute-failure').choices.length, 9);
  assert.match(byId('attribute-failure').detail, /首个错误/);
  assert.deepEqual(
    auto.lanes[2].nodes.map((node) => node.id),
    ['e2e-regression', 'prefix-regression'],
  );
  assert.match(byId('prefix-regression').detail, /可接受动作集合/);
  assert.equal(auto.after[0].id, 'evidence-to-decisions');

  assert.deepEqual(
    decision.lanes[0].nodes.map((node) => node.id),
    [
      'significance',
      'model-selection',
      'behavior-strategy',
      'cost-analysis',
      'continuous-iteration',
    ],
  );
  assert.match(byId('significance').detail, /McNemar/);
  assert.match(byId('ab-testing').detail, /机制指标/);
  assert.match(byId('privacy').detail, /编译时类型检查/);
  assert.match(byId('simulation-bridge').detail, /RLVR/);
  assert.deepEqual(
    decision.outcomes.map((branch) => branch.nodes[0].id),
    ['proceed-change', 'hold-change'],
  );
});

test('Chapter 7 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter7/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-seven-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-seven-flow"/g)].length, 3);
  const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  for (const [, id] of flow.matchAll(/\bid="([^"]+)"/g))
    assert.equal(allIds.filter((item) => item === id).length, 1, id);
  for (const node of nodes) {
    const rendered = flow.match(
      new RegExp(
        `<details[^>]*data-flow-node="${node.id}"[\\s\\S]*?</details>`,
      ),
    );
    assert.ok(rendered, node.id);
    assert.ok(rendered[0].includes(node.detail), node.id);
    const proseLink = rendered[0].match(/href="#([^"]+)"/);
    assert.ok(proseLink, `Missing prose link: ${node.id}`);
    assert.ok(
      html.slice(article).includes(`id="${decodeURIComponent(proseLink[1])}"`),
      node.id,
    );
  }
  for (const view of chapterSevenFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-seven-flow-panel-${view.id}"[^>]*>`),
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
    'book/chapter4',
    'book-en/chapter7',
  ]) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-seven-flow"'), path);
    if (['book/chapter1', 'book-en/chapter7'].includes(path))
      assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
