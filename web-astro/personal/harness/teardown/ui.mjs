// Small HTML helpers shared by the teardown chapters. Everything is plain
// strings: the chapters are data, build.mjs wraps them in the page shell.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
export const esc = (text) => String(text).replace(/[&<>]/g, (ch) => ESC[ch]);

/** A numbered section. */
export const sec = (id, title, body) => `
<section id="${id}">
  <h2><span class="num">${title.slice(0, 2).match(/^\d\d$/) ? '' : ''}${''}</span>${title}</h2>
  ${body}
</section>`;

/** Section with an explicit 01-style index in the heading. */
export const section = (no, title, body) => `
<section id="s${no}">
  <h2><span class="num">${no}</span>${title}</h2>
  ${body}
</section>`;

/**
 * Evidence block: a short verbatim excerpt plus the exact file and line range
 * it came from. `code` is escaped; keep excerpts under ~14 lines.
 */
export const ev = (file, lines, code, caption = '') => `
<div class="ev">
  <header><span class="path">${esc(file)}</span><span>${esc(lines)}${caption ? ` · ${esc(caption)}` : ''}</span></header>
  <pre>${esc(code.trim())}</pre>
</div>`;

/** Rows: array of arrays. `numeric` marks columns rendered right-aligned. */
export const table = (headers, rows, numeric = []) => {
  const head = headers.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${h}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${cell}</td>`).join('')}</tr>`)
    .join('\n      ');
  return `<div class="tw"><table>
      <thead><tr>${head}</tr></thead>
      <tbody>
      ${body}
      </tbody>
    </table></div>`;
};

export const stats = (items) => `<div class="grid g4">${items
  .map(([value, label, source]) => `<div class="stat"><b>${value}</b><span>${label}</span>${source ? `<em>${source}</em>` : ''}</div>`)
  .join('')}</div>`;

export const cards = (items, columns = 3) => `<div class="grid g${columns}">${items
  .map(([title, body]) => `<div class="card"><h3>${title}</h3><p>${body}</p></div>`)
  .join('')}</div>`;

export const note = (kind, html) => `<div class="note ${kind}">${html}</div>`;

export const analogy = (html) => `<div class="analogy"><i aria-hidden="true">≈</i><div>${html}</div></div>`;

export const tradeoff = (gain, cost) => `<div class="tradeoff"><div><b>换来什么</b>${gain}</div><div><b>付出什么</b>${cost}</div></div>`;

export const quote = (text, who) => `<div class="note quote"><blockquote>${text}</blockquote><span class="who">${who}</span></div>`;

/** A collapsible self-check question. */
export const quiz = (q, a) => `<details class="quiz"><summary>${q}</summary><div class="a">${a}</div></details>`;

export const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
export const ol = (items) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
