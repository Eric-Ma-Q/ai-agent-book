// Codex chapter helpers. Re-export the Claude Code primitives so both
// teardowns stay visually consistent; add a linkable evidence block and a
// judgment card with machine-readable attributes for the page test.
import * as base from '../teardown/ui.mjs';

export const {
  esc,
  sec,
  section,
  table,
  stats,
  cards,
  note,
  analogy,
  tradeoff,
  quote,
  quiz,
  ul,
  ol,
} = base;

const attr = (text) => base.esc(String(text)).replace(/"/g, '&quot;');

/** Evidence block with a fixed-SHA permalink on the line reference. */
export const ev = (file, lines, code, href, caption = '') => `
<div class="ev" data-evidence data-path="${attr(file)}" data-lines="${attr(lines)}" data-href="${attr(href)}">
  <header><span class="path">${base.esc(file)}</span><a href="${attr(href)}">${base.esc(lines)}</a>${caption ? ` · ${base.esc(caption)}` : ''}</header>
  <pre>${base.esc(code.trim())}</pre>
</div>`;

const LABELS = {
  shared: '共有机制',
  implementation: '实现差异',
  'new-surface': '本副本可证的新增面',
  unverifiable: '不可验证',
};

/** A product judgment card. `kind` is part of the test contract. */
export const judgment = (kind, text, claim) => `
<div class="judgment ${kind}" data-product-judgment data-judgment="${kind}" data-claim="${attr(claim)}">
  <b>${LABELS[kind]}</b><p>${text}</p>
</div>`;

export const verdict = (kind, label = LABELS[kind]) =>
  `<span class="verdict ${kind}">${base.esc(label)}</span>`;

/** A stat strip using the same markup as the shared stats helper. */
export const statStrip = (items) => `<div class="source-stats">${items
  .map(([value, label, source]) => `<div class="stat"><b>${value}</b><span>${label}</span>${source ? `<em>${source}</em>` : ''}</div>`)
  .join('')}</div>`;
