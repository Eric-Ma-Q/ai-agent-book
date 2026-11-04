import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPan,
  clampScale,
  panBy,
  pinchFactor,
  wheelPixels,
  zoomAt,
} from '../client/page-assistant/diagram-view.ts';

test('pinch stays on the point under the fingers and within 1 to 8', () => {
  assert.equal(clampScale(0.2), 1);
  assert.equal(clampScale(12), 8);
  assert.equal(clampScale(Number.NaN), 1);

  const twice = zoomAt({ scale: 1, x: 0, y: 0 }, 100, 40, 2);
  assert.deepEqual(twice, { scale: 2, x: -100, y: -40 });
  const four = zoomAt(twice, 100, 40, 4);
  assert.deepEqual(four, { scale: 4, x: -300, y: -120 });
  assert.equal((100 - four.x) / four.scale, 100);
  assert.equal((40 - four.y) / four.scale, 40);

  assert.equal(zoomAt(twice, 100, 40, 0.1).scale, 1);
  assert.equal(zoomAt({ scale: 1, x: 0, y: 0 }, 10, 10, 99).scale, 8);
});

test('spreading fingers zooms in and one event cannot jump', () => {
  assert.ok(pinchFactor(-10) > 1);
  assert.ok(pinchFactor(10) < 1);
  assert.equal(pinchFactor(0), 1);
  assert.equal(pinchFactor(-500), 1.25);
  assert.equal(pinchFactor(500), 0.8);
});

test('wheel deltas convert by mode', () => {
  assert.equal(wheelPixels(2, 0, 80), 2);
  assert.equal(wheelPixels(2, 1, 80), 32);
  assert.equal(wheelPixels(2, 2, 80), 160);
});

test('panning stops at the edge and reports the leftover', () => {
  const frame = [100, 80, 100, 80];
  const down = panBy({ scale: 2, x: 0, y: 0 }, 0, 30, ...frame);
  assert.equal(down.view.y, -30);
  assert.equal(down.leftoverY, 0);

  const edge = panBy({ scale: 2, x: 0, y: -80 }, 0, 25, ...frame);
  assert.deepEqual(edge.view, { scale: 2, x: 0, y: -80 });
  assert.equal(edge.leftoverY, 25);

  const top = panBy({ scale: 2, x: 0, y: 0 }, 0, -20, ...frame);
  assert.equal(top.view.y, 0);
  assert.equal(top.leftoverY, -20);

  const fitted = clampPan({ scale: 1, x: -40, y: 12 }, ...frame);
  assert.deepEqual(fitted, { scale: 1, x: 0, y: 0 });
});
