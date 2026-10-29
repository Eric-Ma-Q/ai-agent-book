import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterSixFlows } from '../src/lib/chapter-six-flow.ts';

const nodes = chapterSixFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterSixFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 6 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter6.md', import.meta.url),
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
    new Set(chapterSixFlows.map((view) => view.id)).size,
    chapterSixFlows.length,
  );
  for (const item of [...chapterSixFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 6 flow data keeps modality, timing and option boundaries explicit', () => {
  const [overview, events, voice, computer, robotics] = chapterSixFlows;
  assert.equal(overview.lanes[0].nodes[0].id, 'extend-space');
  assert.deepEqual(
    overview.outcomes.map((branch) => branch.nodes[0].id),
    ['async-line', 'voice-line', 'computer-line', 'robot-line'],
  );
  assert.equal(overview.after[0].id, 'primitives');
  assert.match(overview.mergeLabel, /共享同一组原语/);

  assert.equal(events.lanes[0].nodes.at(-1).id, 'event-processing');
  assert.equal(events.lanes[0].nodes.at(-1).choices.length, 3);
  assert.match(byId('event-processing').detail, /取消式.*队列式.*并行式/s);
  assert.deepEqual(
    events.outcomes.map((branch) => branch.nodes[0].id),
    ['native-async', 'sync-compat'],
  );
  assert.equal(events.after[0].id, 'reliable-async');

  assert.match(voice.intro, /不是串行升级/);
  assert.deepEqual(
    voice.outcomes.map((branch) => branch.nodes[0].id),
    ['cascade', 'omni', 'full-duplex'],
  );
  assert.deepEqual(
    voice.after.map((node) => node.id),
    ['cognitive-timing', 'speech-synthesis'],
  );
  assert.equal(byId('cognitive-timing').choices.length, 3);

  assert.equal(computer.lanes[0].nodes.at(-1).id, 'reobserve');
  assert.deepEqual(
    computer.lanes[1].nodes.map((node) => node.id),
    ['aoi', 'cu-world-model'],
  );
  assert.equal(computer.outcomes[0].nodes[0].id, 'mobile');
  assert.match(byId('grounding').detail, /按宽高比.*双向缩放/s);
  assert.match(byId('cu-world-model').detail, /真实截图.*最终事实/);

  assert.deepEqual(
    robotics.outcomes.map((branch) => branch.nodes[0].id),
    ['open-loop', 'step-check', 'predictive'],
  );
  assert.equal(robotics.after[0].id, 'sim-to-real');
  assert.match(byId('vla-limits').detail, /动作分块/);
  assert.match(
    byId('robot-world-model').detail,
    /预测只用于排序.*真实摄像头观察才是验收/,
  );
});

test('Chapter 6 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter6/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-six-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-six-flow"/g)].length, 3);
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
  for (const view of chapterSixFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-six-flow-panel-${view.id}"[^>]*>`),
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
    'book-en/chapter6',
  ]) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-six-flow"'), path);
    if (['book/chapter1', 'book-en/chapter6'].includes(path))
      assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
