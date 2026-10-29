import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterThreeFlows } from '../src/lib/chapter-three-flow.ts';

const nodes = chapterThreeFlows.flatMap((view) => [
  ...view.lanes.flatMap((lane) => lane.nodes),
  ...view.shared,
]);

test('flow data links every node to an existing Chinese chapter section', () => {
  const markdown = readFileSync(
    new URL('../../book/chapter3.md', import.meta.url),
    'utf8',
  );
  const headings = new Set(
    [...markdown.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1]),
  );
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
  assert.equal(
    new Set(chapterThreeFlows.map((view) => view.id)).size,
    chapterThreeFlows.length,
  );
  for (const node of nodes) {
    assert.ok(
      headings.has(node.section),
      `Missing chapter section for ${node.id}: ${node.section}`,
    );
  }
});

test('flow data distinguishes indexing, retrieval decisions, and approved knowledge publication', () => {
  const rag = chapterThreeFlows.find((view) => view.id === 'rag');
  assert.deepEqual(
    rag.lanes[0].nodes.map((node) => node.id),
    ['ingest', 'chunk', 'prefix', 'index'],
  );
  assert.deepEqual(
    rag.lanes[1].nodes.map((node) => node.id),
    ['plan', 'recall-index', 'rank', 'verify'],
  );
  assert.match(rag.outcomes[1].text, /澄清/);
  assert.match(
    nodes.find((node) => node.id === 'recall-index').detail,
    /权限、租户与生效时间过滤/,
  );
  const maintenance = chapterThreeFlows.find(
    (view) => view.id === 'maintenance',
  );
  assert.deepEqual(
    maintenance.shared.map((node) => node.id),
    ['review', 'checks', 'publish', 'regression'],
  );
  assert.match(maintenance.outcomes[0].text, /转人工/);
});

test('Chapter 3 flow renders complete fallback content outside the annotated book article', () => {
  const html = readFileSync(
    new URL('../dist/book/chapter3/index.html', import.meta.url),
    'utf8',
  );
  const start = html.indexOf('id="chapter-three-flow"');
  const article = html.indexOf('<article');
  assert.ok(start > 0 && start < article);
  const flow = html.slice(start, article);
  assert.equal([...html.matchAll(/href="#chapter-three-flow"/g)].length, 3);
  for (const node of nodes) {
    assert.ok(flow.includes(`data-flow-node="${node.id}"`), node.id);
    assert.ok(flow.includes(node.detail), node.id);
  }
  for (const view of chapterThreeFlows) {
    assert.match(flow, new RegExp(`id="flow-panel-${view.id}"[^>]*>`));
    assert.doesNotMatch(
      flow.match(
        new RegExp(`<section[^>]*id="flow-panel-${view.id}"[^>]*>`),
      )[0],
      /hidden/,
    );
  }
  const ids = new Set(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  );
  for (const [, fragment] of flow.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(
      ids.has(decodeURIComponent(fragment)),
      `Broken flow link: ${fragment}`,
    );
  }
  for (const path of ['book/chapter1', 'book-en/chapter3']) {
    const other = readFileSync(
      new URL(`../dist/${path}/index.html`, import.meta.url),
      'utf8',
    );
    assert.ok(!other.includes('id="chapter-three-flow"'));
    assert.ok(!other.includes('data-chapter-flow'));
  }
});
