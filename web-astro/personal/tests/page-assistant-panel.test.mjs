// Requirement 016: fullscreen layout helpers, no DOM required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeAction, scrollAnchor, scrollTopFor } from '../client/page-assistant/panel.ts';

test('a mid-answer reading position survives the reflow', () => {
  const before = scrollAnchor(300, 1300, 400); // max 900, one third down
  assert.deepEqual(before, { ratio: 1 / 3, atBottom: false });
  assert.equal(scrollTopFor(before, 2400, 600), 600); // max 1800, one third down
});

test('a list parked at the bottom stays at the bottom', () => {
  const bottom = scrollAnchor(900, 1300, 400);
  assert.deepEqual(bottom, { ratio: 1, atBottom: true });
  assert.equal(scrollTopFor(bottom, 5000, 400), 4600);

  // Within two percent of the end still counts as reading the latest answer.
  assert.equal(scrollAnchor(882, 1300, 400).atBottom, true);
});

test('short lists and clamped input stay in bounds', () => {
  assert.deepEqual(scrollAnchor(0, 300, 400), { ratio: 1, atBottom: true });
  assert.equal(scrollTopFor({ ratio: 0.5, atBottom: false }, 300, 400), 0);
  assert.equal(scrollAnchor(-20, 1300, 400).ratio, 0);
  assert.equal(scrollTopFor({ ratio: 2, atBottom: false }, 1300, 400), 900);
});

test('escape closes fullscreen before the panel', () => {
  assert.equal(escapeAction('Escape', false, false), 'none');
  assert.equal(escapeAction('Escape', false, true), 'none');
  assert.equal(escapeAction('Escape', true, false), 'close');
  assert.equal(escapeAction('Escape', true, true), 'collapse');
  // Any other key must reach the composer and the focus trap untouched.
  for (const key of ['Enter', 'Tab', 'a', '']) {
    assert.equal(escapeAction(key, true, true), 'none');
    assert.equal(escapeAction(key, true, false), 'none');
  }
});


test('escape backs out of replay before fullscreen and the panel', () => {
  assert.equal(escapeAction('Escape', true, true, 'replay'), 'back');
  assert.equal(escapeAction('Escape', true, false, 'replay'), 'back');
  assert.equal(escapeAction('Escape', true, false, 'chat'), 'close');
  assert.equal(escapeAction('Enter', true, true, 'replay'), 'none');
});
