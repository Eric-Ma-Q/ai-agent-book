import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendGeometry } from '../client/lab/trend-geom.ts';

const box = { width: 200, height: 120, pad: 10 };

test('maps pass rates onto the chart and draws the Wilson band', () => {
  const geo = trendGeometry(
    [
      { pass_rate: 0.5, wilson: [0.3, 0.7] },
      { pass_rate: 1, wilson: [0.8, 1] },
    ],
    box,
  );
  assert.deepEqual(geo.coords, [
    { x: 10, y: 60 },
    { x: 190, y: 10 },
  ]);
  assert.equal(geo.line, 'M10.0,60.0 L190.0,10.0');
  assert.match(geo.band, /^M10\.0,40\.0 L190\.0,10\.0 L190\.0,30\.0 L10\.0,80\.0 Z$/);
  assert.deepEqual(geo.ticks.map((t) => t.value), [0, 0.25, 0.5, 0.75, 1]);
});

test('a single point is centred and missing intervals mean no band', () => {
  const geo = trendGeometry([{ pass_rate: 0 }], box);
  assert.deepEqual(geo.coords, [{ x: 100, y: 110 }]);
  assert.equal(geo.band, '');
});

test('values are clamped to [0, 1]', () => {
  const geo = trendGeometry([{ pass_rate: 1.5 }, { pass_rate: -1 }], box);
  assert.equal(geo.coords[0].y, 10);
  assert.equal(geo.coords[1].y, 110);
});
