import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterTwoFlows } from '../src/lib/chapter-two-flow.ts';

const nodes = chapterTwoFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.nodes ?? []),
  ...(view.after ?? []),
]);
const links = chapterTwoFlows.flatMap((view) => [
  ...(view.feedbackLinks ?? []),
  ...(view.outcomes ?? []).flatMap((outcome) => outcome.links ?? []),
]);

test('Chapter 2 flow data uses real sections and resolves every return path', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter2.md', import.meta.url),
    'utf8',
  );
  const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const headings = new Set(
    [...prose.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1]),
  );
  const ids = new Set(nodes.map((node) => node.id));
  assert.equal(ids.size, nodes.length);
  assert.equal(
    new Set(chapterTwoFlows.map((view) => view.id)).size,
    chapterTwoFlows.length,
  );
  for (const item of [...chapterTwoFlows, ...nodes]) {
    assert.ok(
      headings.has(item.section),
      `Missing section for ${item.id}: ${item.section}`,
    );
  }
  for (const link of links)
    assert.ok(ids.has(link.nodeId), `Broken return path: ${link.nodeId}`);
});

test('Chapter 2 flow data branches before tools, cache computation and optional compression', () => {
  const [overview, assembly, cache, lifecycle] = chapterTwoFlows;
  assert.equal(overview.shared.at(-1).id, 'decide');
  assert.deepEqual(
    overview.outcomes[0].nodes.map((node) => node.id),
    ['execute', 'record'],
  );
  assert.equal(overview.outcomes[0].links[0].nodeId, 'prepare');
  assert.ok(overview.outcomes.slice(1).every((branch) => !branch.nodes));
  assert.match(overview.outcomes[2].title, /上限.*停止/);
  assert.match(
    nodes.find((node) => node.id === 'record').summary,
    /tool_call_id/,
  );
  assert.match(
    nodes.find((node) => node.id === 'skill-load').detail,
    /角色由 Harness 决定/,
  );
  assert.equal(assembly.shared[0].id, 'source-boundary');
  assert.deepEqual(
    cache.outcomes.map((branch) => branch.nodes[0].id),
    ['reuse', 'recompute'],
  );
  assert.ok(
    cache.outcomes.every((branch) => branch.links[0].nodeId === 'decode'),
  );
  assert.equal(cache.after[0].id, 'decode');
  assert.equal(lifecycle.lanes[0].nodes.at(-1).id, 'budget');
  assert.ok(!lifecycle.outcomes[0].nodes);
  assert.deepEqual(
    lifecycle.outcomes[1].nodes.map((node) => node.id),
    ['compress', 'preserve', 'validate'],
  );
  assert.equal(lifecycle.outcomes[1].links[1].nodeId, 'compress');
  assert.match(lifecycle.feedback, /熔断停止/);
  assert.equal(
    nodes.find((node) => node.id === 'status-write').choices.length,
    2,
  );
});

test('Chapter 2 renders all views and working anchors outside the annotated article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter2/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-two-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-two-flow"/g)].length, 3);
  const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const flowIds = [...flow.matchAll(/\bid="([^"]+)"/g)].map(
    (match) => match[1],
  );
  for (const id of flowIds)
    assert.equal(allIds.filter((item) => item === id).length, 1, id);
  for (const node of nodes) {
    assert.ok(flow.includes(`data-flow-node="${node.id}"`), node.id);
    assert.ok(flow.includes(node.detail), node.id);
  }
  for (const view of chapterTwoFlows) {
    const panel = flow.match(
      new RegExp(`<section[^>]*id="chapter-two-flow-panel-${view.id}"[^>]*>`),
    );
    assert.ok(panel, view.id);
    assert.doesNotMatch(panel[0], /hidden/);
  }
  for (const [, fragment] of flow.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(
      allIds.includes(decodeURIComponent(fragment)),
      `Broken link: ${fragment}`,
    );
  }
  for (const path of ['book/chapter1', 'book-en/chapter2', 'book/chapter3']) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-two-flow"'), path);
  }
});
