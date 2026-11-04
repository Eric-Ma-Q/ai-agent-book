import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterTenFlows } from '../src/lib/chapter-ten-flow.ts';

const nodes = chapterTenFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterTenFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 10 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter10.md', import.meta.url),
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
    new Set(chapterTenFlows.map((view) => view.id)).size,
    chapterTenFlows.length,
  );
  for (const item of [...chapterTenFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 10 flow data keeps information gain, planes, topologies and failures explicit', () => {
  const [overview, decision, shared, isolated, topologies, failure] =
    chapterTenFlows;
  assert.deepEqual(
    chapterTenFlows.map((view) => view.id),
    ['overview', 'decision', 'shared', 'isolated', 'topologies', 'failure'],
  );

  assert.deepEqual(
    overview.lanes[0].nodes.map((node) => node.id),
    ['new-info'],
  );
  assert.deepEqual(
    overview.lanes[1].nodes.map((node) => node.id),
    ['context-dim', 'topology-dim'],
  );
  assert.deepEqual(
    overview.lanes[2].nodes.map((node) => node.id),
    ['data-plane', 'control-plane', 'fault-closure'],
  );
  assert.equal(overview.after[0].id, 'society-map');
  assert.equal(overview.outcomes.length, 3);
  assert.match(byId('data-plane').detail, /路径字符串/);
  assert.match(byId('fault-closure').detail, /拜占庭/);

  assert.deepEqual(
    decision.lanes[0].nodes.map((node) => node.id),
    ['no-new-info', 'exec-feedback', 'visual-feedback'],
  );
  assert.deepEqual(
    decision.lanes[1].nodes.map((node) => node.id),
    ['feedback-loop', 'search-space', 'step-budget'],
  );
  assert.match(byId('exec-feedback').detail, /RLEF/);
  assert.match(byId('visual-feedback').detail, /26\.4%.*51\.9%/s);
  assert.match(byId('search-space').detail, /266 个漏洞/);

  assert.equal(byId('shared-tradeoff').id, 'shared-tradeoff');
  assert.deepEqual(
    shared.lanes[1].nodes.map((node) => node.id),
    ['prompt-switch', 'skill-load', 'kv-cache'],
  );
  assert.equal(shared.outcomes.length, 2);

  assert.deepEqual(
    isolated.lanes[0].nodes.map((node) => node.id),
    [
      'scratchpad',
      'shared-workspace',
      'mounted-resources',
      'builtin-resources',
      'path-interface',
    ],
  );
  assert.deepEqual(
    isolated.lanes[1].nodes.map((node) => node.id),
    ['message-passing', 'status-query', 'termination', 'scheduling'],
  );
  assert.equal(isolated.lanes[2].nodes[0].id, 'a2a');
  assert.equal(isolated.after, undefined);
  assert.match(byId('status-query').detail, /progress\.md/);

  assert.deepEqual(
    topologies.lanes.map((lane) => lane.nodes[0].id),
    ['loop-engineering', 'manager-core', 'orchestration-choreography'],
  );
  assert.match(byId('loop-engineering').detail, /瓶颈在验证器/);
  assert.match(byId('manager-core').detail, /弱规划者|Planner/);
  assert.match(byId('autogen-swarm').detail, /handoff/);
  assert.equal(byId('handoff-protocol').detail.length > 0, true);

  assert.deepEqual(
    failure.lanes[0].nodes.map((node) => node.id),
    [
      'concurrency-conflict',
      'cascade-amplify',
      'homogeneous-drift',
      'conflict-abuse',
      'runaway-loop',
      'understanding-debt',
    ],
  );
  assert.deepEqual(
    failure.lanes[1].nodes.map((node) => node.id),
    [
      'social-emergence',
      'agentopia',
      'moltbook',
      'economic-emergence',
      'vending-arena',
      'strategic-games',
    ],
  );
  assert.equal(failure.lanes[2].nodes[0].id, 'fault-design');
  assert.match(byId('concurrency-conflict').detail, /worktree/);
  assert.match(byId('homogeneous-drift').detail, /Bertrand/);
  assert.match(byId('social-emergence').detail, /记忆流/);
  assert.equal(failure.outcomes.length, 3);
});

test('Chapter 10 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter10/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-ten-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-ten-flow"/g)].length, 3);
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
  for (const view of chapterTenFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-ten-flow-panel-${view.id}"[^>]*>`),
    );
    assert.ok(panel, view.id);
    assert.doesNotMatch(panel[0], /hidden/);
  }
  for (const [, fragment] of flow.matchAll(/href="#([^"]+)"/g))
    assert.ok(allIds.includes(decodeURIComponent(fragment)), fragment);
  for (const path of ['book/chapter1', 'book-en/chapter10']) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-ten-flow"'), path);
    assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
