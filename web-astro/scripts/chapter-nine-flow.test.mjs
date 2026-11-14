import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterNineFlows } from '../src/lib/chapter-nine-flow.ts';

const nodes = chapterNineFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterNineFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 9 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter9.md', import.meta.url),
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
    new Set(chapterNineFlows.map((view) => view.id)).size,
    chapterNineFlows.length,
  );
  for (const item of [...chapterNineFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 9 flow data keeps verification, carriers, loop and safety boundaries explicit', () => {
  const [overview, signal, methods, loop] = chapterNineFlows;

  assert.deepEqual(
    overview.lanes[0].nodes.map((node) => node.id),
    ['signal-map', 'route-map', 'proposal-map', 'release-map'],
  );
  assert.deepEqual(
    overview.lanes[1].nodes.map((node) => node.id),
    ['product-axis', 'method-axis'],
  );
  assert.equal(overview.after[0].id, 'guard-map');
  assert.equal(overview.outcomes.length, 3);
  assert.match(byId('signal-map').detail, /证据不足/);
  assert.match(byId('route-map').detail, /并不互斥/);
  assert.match(byId('proposal-map').detail, /搜索尺度/);

  assert.deepEqual(
    signal.lanes[0].nodes.map((node) => node.id),
    ['outcome-verifier', 'process-verifier', 'quality-verifier', 'signal-shape'],
  );
  assert.match(byId('quality-verifier').summary, /Rubric/);
  assert.equal(byId('signal-shape').choices.length, 4);
  assert.match(byId('evidence-table').summary, /支持|反驳/);
  assert.match(byId('transfer-gate').detail, /Reflexion/);

  assert.deepEqual(
    methods.lanes.map((lane) => lane.nodes[0].id),
    [
      'knowledge-method',
      'instruction-method',
      'program-layer',
      'parameter-method',
      'method-scale',
    ],
  );
  assert.equal(byId('browser-lifecycle').choices.length, 4);
  assert.match(byId('browser-lifecycle').detail, /动作执行成功与任务成功/);
  assert.match(byId('self-modify-release').detail, /灰度/);
  assert.match(byId('composable-harness').summary, /时间可组合性/);
  assert.match(byId('composable-harness').summary, /空间可组合性/);
  assert.equal(byId('method-scale').choices.length, 4);
  assert.match(byId('method-scale').detail, /ACE/);
  assert.match(byId('method-scale').detail, /Dream-RSI/);
  assert.equal(methods.outcomes.length, 4);

  assert.equal(loop.lanes[0].nodes[0].id, 'online-loop');
  assert.deepEqual(
    loop.lanes[1].nodes.map((node) => node.id),
    ['offline-loop', 'release-gate', 'layered-metrics'],
  );
  assert.deepEqual(
    loop.lanes[2].nodes.map((node) => node.id),
    ['eval-boundary', 'evidence-isolation', 'staging-isolation', 'immutable-safety', 'sleep-learning'],
  );
  assert.match(byId('offline-loop').detail, /Voyager/);
  assert.match(byId('release-gate').detail, /Harness 受益能力/);
  assert.match(byId('eval-boundary').detail, /实现漂移/);
  assert.match(byId('evidence-isolation').detail, /置信度/);
  assert.match(byId('immutable-safety').detail, /删除失败用例/);
  assert.equal(loop.outcomes.length, 3);
});

test('Chapter 9 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter9/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-nine-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-nine-flow"/g)].length, 3);
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
  for (const view of chapterNineFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-nine-flow-panel-${view.id}"[^>]*>`),
    );
    assert.ok(panel, view.id);
    assert.doesNotMatch(panel[0], /hidden/);
  }
  for (const [, fragment] of flow.matchAll(/href="#([^"]+)"/g))
    assert.ok(allIds.includes(decodeURIComponent(fragment)), fragment);
  for (const path of ['book/chapter1', 'book-en/chapter9']) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-nine-flow"'), path);
    assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
