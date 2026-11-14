import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterFiveFlows } from '../src/lib/chapter-five-flow.ts';

const nodes = chapterFiveFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterFiveFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);
const byId = (id) => nodes.find((node) => node.id === id);

test('Chapter 5 flow data covers every topic and resolves sections and return paths', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter5.md', import.meta.url),
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
    new Set(chapterFiveFlows.map((view) => view.id)).size,
    chapterFiveFlows.length,
  );
  for (const item of [...chapterFiveFlows, ...nodes])
    assert.ok(headings.has(item.section), `Missing section: ${item.section}`);
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
  const covered = new Set(nodes.map((node) => node.section));
  for (const topic of topics)
    assert.ok(covered.has(topic), `Missing topic: ${topic}`);
});

test('Chapter 5 flow data keeps rejection, recovery limits and optional capabilities explicit', () => {
  const [overview, execution, recovery, capabilities, artifacts] =
    chapterFiveFlows;
  assert.equal(overview.lanes[0].nodes.at(-1).id, 'validate');
  assert.deepEqual(
    overview.outcomes[0].nodes.map((node) => node.id),
    ['deliver'],
  );
  assert.ok(overview.outcomes.slice(1).every((branch) => !branch.nodes));
  assert.equal(execution.lanes[0].nodes.at(-1).id, 'boundary');
  assert.deepEqual(
    execution.outcomes[0].nodes.map((node) => node.id),
    ['run'],
  );
  assert.ok(execution.outcomes.slice(1).every((branch) => !branch.nodes));
  assert.equal(execution.after, undefined);
  assert.equal(recovery.lanes[0].nodes[0].id, 'detect');
  assert.deepEqual(
    recovery.outcomes.map((branch) => branch.nodes[0].id),
    ['retry', 'repair', 'continue', 'takeover', 'stop'],
  );
  for (const branch of recovery.outcomes.slice(0, -1))
    assert.ok(branch.links.some((link) => link.nodeId === 'stop'));
  assert.equal(recovery.outcomes.at(-1).links, undefined);
  assert.match(byId('continue').detail, /去重.*避免.*副作用/);
  assert.match(byId('takeover').detail, /文字作为普通内容.*凭证丢弃/);
  assert.match(byId('stop').detail, /禁用.*调用模型/);
  assert.equal(capabilities.shared.length, 0);
  assert.deepEqual(
    capabilities.outcomes.map((branch) => branch.nodes[0].id),
    ['reason', 'rules', 'media', 'adapter', 'ui', 'bootstrap'],
  );
  assert.match(byId('rules').detail, /数据库事实.*服务端时间.*通过才执行/);
  assert.match(byId('rules').detail, /不采信模型自报/);
  assert.deepEqual(
    artifacts.outcomes[0].nodes.map((node) => node.id),
    ['propose', 'render', 'quality'],
  );
  assert.equal(artifacts.outcomes[0].links[0].nodeId, 'propose');
  assert.match(byId('quality').detail, /最大迭代次数.*不能当作成功/);
  assert.match(byId('data-boundary').detail, /只读账号.*单条 SELECT.*参数化/);
  assert.match(byId('data-boundary').detail, /全部数据访问经过稳定数据层/);
});

test('Chapter 5 renders accessible fallback views and real prose links outside the article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter5/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-five-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-five-flow"/g)].length, 3);
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
  for (const view of chapterFiveFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-five-flow-panel-${view.id}"[^>]*>`),
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
    'book-en/chapter5',
  ]) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-five-flow"'), path);
    if (['book/chapter1', 'book-en/chapter5'].includes(path))
      assert.ok(!other.includes('data-chapter-flow'), path);
  }
});
