import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureClipboard } from '../client/clipboard.ts';

// Just enough of the DOM for the execCommand copy path.
function fakeDocument({ copies = true, dialog = null } = {}) {
  const body = { children: [] };
  const doc = {
    body,
    activeElement: { focused: 0, focus() { this.focused += 1; } },
    copied: null,
    createElement: () => ({
      style: {},
      setAttribute(name, value) { this[name] = value; },
      select() { doc.selected = this; },
      remove() { this.parent.children = this.parent.children.filter((el) => el !== this); },
    }),
    querySelector: (selector) => (selector === 'dialog[open]' ? dialog : null),
    execCommand(command) {
      assert.equal(command, 'copy');
      if (copies) doc.copied = doc.selected.value;
      return copies;
    },
  };
  for (const host of [body, dialog].filter(Boolean)) {
    host.appendChild = (el) => { el.parent = host; host.children.push(el); };
  }
  return doc;
}

test('copies through a temporary textarea when the Clipboard API is missing', async () => {
  const nav = {};
  const doc = fakeDocument();
  const previous = doc.activeElement;
  ensureClipboard(nav, doc);
  await nav.clipboard.writeText('{"highlights":[]}');
  assert.equal(doc.copied, '{"highlights":[]}');
  assert.equal(doc.body.children.length, 0);
  assert.equal(previous.focused, 1);
});

test('puts the textarea inside an open modal dialog so it is not inert', async () => {
  const dialog = { children: [] };
  const nav = {};
  const doc = fakeDocument({ dialog });
  ensureClipboard(nav, doc);
  await nav.clipboard.writeText('backup');
  assert.equal(doc.selected.parent, dialog);
  assert.equal(dialog.children.length, 0);
});

test('rejects when the browser refuses to copy, so callers can fall back', async () => {
  const nav = {};
  const doc = fakeDocument({ copies: false });
  ensureClipboard(nav, doc);
  await assert.rejects(nav.clipboard.writeText('x'), /Copy failed/);
  assert.equal(doc.body.children.length, 0);
});

test('keeps the native Clipboard API when one exists', () => {
  const clipboard = { writeText: async () => {} };
  const nav = { clipboard };
  ensureClipboard(nav, fakeDocument());
  assert.equal(nav.clipboard, clipboard);
});
