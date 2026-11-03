import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterEightFlows } from '../src/lib/chapter-eight-flow.ts';

const nodes = chapterEightFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterEightFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 8 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter8.md', import.meta.url),
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
    new Set(chapterEightFlows.map((view) => view.id)).size,
    chapterEightFlows.length,
  );
  for (const item of [...chapterEightFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 8 flow data keeps stages, data, RL loop, environment and reward boundaries explicit', () => {
  const [overview, data, rl, reward] = chapterEightFlows;

  assert.deepEqual(
    overview.lanes[0].nodes.map((node) => node.id),
    ['pretrain-map', 'midtrain-map', 'sft-map', 'sft-rl-map'],
  );
  assert.deepEqual(
    overview.lanes[1].nodes.map((node) => node.id),
    ['backfill-map', 'choose-map'],
  );
  assert.equal(overview.after[0].id, 'practice-map');
  assert.equal(overview.outcomes.length, 3);
  assert.match(byId('backfill-map').summary, /pass@k/);
  assert.match(byId('sft-rl-map').detail, /mass-covering/);
  assert.match(byId('sft-rl-map').detail, /mode-seeking/);

  assert.deepEqual(
    data.lanes[0].nodes.map((node) => node.id),
    ['agent-env', 'action-space'],
  );
  assert.deepEqual(
    data.lanes[1].nodes.map((node) => node.id),
    ['midtrain-data', 'midtrain-gate'],
  );
  assert.equal(byId('midtrain-data').choices.length, 5);
  assert.deepEqual(
    data.lanes[2].nodes.map((node) => node.id),
    ['problem-data', 'case-early-stop', 'case-quotes', 'case-copy'],
  );
  assert.match(byId('case-early-stop').detail, /保留集/);
  assert.match(byId('case-copy').detail, /首个出现差异的位置/);

  assert.deepEqual(
    rl.lanes[0].nodes.map((node) => node.id),
    ['grpo-loop', 'on-policy', 'numeric-mismatch'],
  );
  assert.deepEqual(
    rl.lanes[1].nodes.map((node) => node.id),
    ['env-playground', 'model-as-env', 'eval-isolation'],
  );
  assert.deepEqual(
    rl.lanes[2].nodes.map((node) => node.id),
    ['multi-turn', 'tool-calling'],
  );
  assert.match(byId('grpo-loop').detail, /16 条 rollout/);
  assert.match(byId('on-policy').detail, /on-policy/);
  assert.match(byId('numeric-mismatch').detail, /log probability/);
  assert.match(byId('model-as-env').detail, /ZeroSearch/);
  assert.match(byId('model-as-env').detail, /DreamGym/);
  assert.match(byId('tool-calling').detail, /屏蔽环境返回的 token/);
  assert.equal(rl.outcomes.length, 2);

  assert.deepEqual(
    reward.lanes[0].nodes.map((node) => node.id),
    ['reward-source', 'reward-when', 'reward-format', 'rlvp'],
  );
  assert.deepEqual(
    reward.lanes[1].nodes.map((node) => node.id),
    ['opd', 'opsd'],
  );
  assert.ok(byId('rlvp').summary.includes('R = O + βΦ'));
  assert.match(byId('reward-when').detail, /隐藏测试/);
  assert.match(byId('opd').detail, /KL 散度/);
  assert.match(byId('opsd').summary, /特权信息/);
  assert.equal(reward.outcomes.length, 4);
});

test('Chapter 8 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter8/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-eight-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-eight-flow"/g)].length, 3);
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
  for (const view of chapterEightFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-eight-flow-panel-${view.id}"[^>]*>`),
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
    'book-en/chapter8',
  ]) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-eight-flow"'), path);
    if (['book/chapter1', 'book-en/chapter8'].includes(path))
      assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
