// A small, safe Markdown renderer for agent answers and insert previews.
// Everything is HTML-escaped first; only the constructs below become markup.
// Citations [[chN#section|quote]] turn into links to the reader with a badge
// showing whether the quote was verified against the book.
// The page assistant also emits the block form [[#118|quote]]; with a block
// resolver it becomes a jump button whose badge says whether the quote is in
// that block. Without a resolver it stays a neutral, unverified pill.
import { normalizeChars } from './quote.ts';
import type { Citation } from './types.ts';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

const CITATION = /\[\[ch(\d+)(?:#([^|\]]*))?\|([^\]]+)\]\]/g;
const PAGE_CITATION = /\[\[#(\d{1,6})(?:\s*[–—~-]\s*(\d{1,6}))?(?:\|([^\]]+))?\]\]/g;
const MIN_PAGE_QUOTE_CHARS = 6;
const MAX_PAGE_RANGE = 20;
const BADGES: Record<string, string> = { verified: '✓', wrong_section: '⚠', not_found: '✗', too_short: '✗' };
const STATUS_TITLES: Record<string, string> = {
  verified: '原文核对通过',
  wrong_section: '原文存在，但不在标注的小节',
  not_found: '书中找不到这段原文',
  too_short: '引用片段太短，无法核对',
};
const PAGE_BADGES: Record<string, string> = { verified: '✓', not_found: '⚠', too_short: '✗', missing: '✗' };
const PAGE_TITLES: Record<string, string> = {
  verified: '页面原文核对通过',
  not_found: '标注的页面块里找不到这段原文',
  too_short: '引用片段太短，无法核对',
  missing: '页面上没有标注的块',
};

export function citationHref(chapter: number, sectionId: string | null | undefined, quote: string, base = '') {
  const href = `${base}/book/chapter${chapter}/?quote=${encodeURIComponent(quote.slice(0, 200))}`;
  return sectionId ? `${href}#${encodeURIComponent(sectionId)}` : href;
}

export type RenderOptions = {
  citations?: Citation[];
  base?: string;
  fences?: Record<string, string>;
  /** Page assistant: the block's current text, so [[#N|quote]] can be checked. */
  blockText?: (index: number) => string | null;
};

type PageStatus = 'verified' | 'not_found' | 'too_short' | 'missing' | 'unchecked';

function pageCitationStatus(first: number, last: number, quote: string, opts: RenderOptions): PageStatus {
  if (!opts.blockText) return 'unchecked';
  if (last - first >= MAX_PAGE_RANGE) return 'missing';
  const texts: string[] = [];
  for (let index = first; index <= last; index += 1) {
    const text = opts.blockText(index);
    if (text == null) return 'missing';
    texts.push(text);
  }
  const needle = normalizeChars(quote).norm;
  if (needle.length < MIN_PAGE_QUOTE_CHARS) return 'too_short';
  return normalizeChars(texts.join('\n')).norm.includes(needle) ? 'verified' : 'not_found';
}

function pageCitationHtml(first: number, last: number, quote: string, opts: RenderOptions) {
  const start = Math.min(first, last);
  const end = Math.max(first, last);
  const label = start === end ? `第 ${start} 块` : `第 ${start}–${end} 块`;
  const status = pageCitationStatus(start, end, quote, opts);
  if (status === 'unchecked') {
    return (
      `<span class="lab-cite lab-cite--unchecked" title="页面引用，未核对">` +
      `<span class="lab-cite-ref">${label}</span><span class="lab-cite-quote">${escapeHtml(quote)}</span>` +
      `<sup class="lab-cite-badge" aria-label="页面引用，未核对">?</sup></span>`
    );
  }
  const title = `${PAGE_TITLES[status]} · 点击跳到${label}`;
  const range = start === end ? '' : ` data-block-first="${start}"`;
  return (
    `<button type="button" class="pa-cite pa-cite--${status}" data-block="${end}"${range} title="${escapeHtml(title)}">` +
    `<span class="pa-cite-ref">${label}</span><span class="pa-cite-quote">${escapeHtml(quote)}</span>` +
    `<sup class="pa-cite-badge" aria-label="${escapeHtml(title)}">${PAGE_BADGES[status]}</sup></button>`
  );
}

function findCitation(citations: Citation[], chapter: number, quote: string) {
  return citations.find((c) => c.chapter === chapter && c.quote.trim() === quote.trim());
}

function citationHtml(chapter: number, sectionId: string, quote: string, opts: RenderOptions) {
  const info = findCitation(opts.citations ?? [], chapter, quote);
  const status = info?.status ?? 'unchecked';
  const target = info?.found_section_id || sectionId || null;
  const href = citationHref(chapter, target, quote, opts.base ?? '');
  const title = STATUS_TITLES[status] ?? '尚未核对';
  const badge = BADGES[status] ?? '?';
  return (
    `<a class="lab-cite lab-cite--${escapeHtml(status)}" href="${escapeHtml(href)}" title="${escapeHtml(title)}" target="_blank" rel="noopener">` +
    `<span class="lab-cite-ref">ch${chapter}</span><span class="lab-cite-quote">${escapeHtml(quote)}</span>` +
    `<sup class="lab-cite-badge" aria-label="${escapeHtml(title)}">${badge}</sup></a>`
  );
}

function inline(text: string, opts: RenderOptions): string {
  const slots: string[] = [];
  const stash = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let work = text.replace(/\u0000/g, '');
  work = work.replace(/`([^`]+)`/g, (_m, code: string) => stash(`<code>${escapeHtml(code)}</code>`));
  work = work.replace(PAGE_CITATION, (_match, first: string, second: string | undefined, quote: string | undefined) => {
    const start = Number(first);
    const end = second ? Number(second) : start;
    if (quote) return stash(pageCitationHtml(start, end, quote, opts));
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    return stash(low === high ? `第 ${low} 块` : `第 ${low}–${high} 块`);
  });
  work = work.replace(CITATION, (_m, ch: string, section: string | undefined, quote: string) =>
    stash(citationHtml(Number(ch), section ?? '', quote, opts)),
  );
  work = work.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, (_m, label: string, url: string) =>
    stash(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`),
  );
  work = escapeHtml(work)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return work.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => slots[Number(index)]);
}

const FENCE = /^\s*(```|~~~)[ \t]*([^ \t`]*)(?:[ \t]+([^`]*?))?[ \t]*$/;
// Closed fences in these languages become a diagram source. The page assistant
// hydrates `.lab-mermaid` after the answer is in the DOM. The source stays
// escaped here, so a failed render still shows text rather than markup.
const MERMAID_START =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|block-beta|xychart-beta|sankey-beta)\b/;
const DIAGRAM_LANG = new Set([
  'mermaid',
  'flowchart',
  'graph',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'statediagram-v2',
  'erdiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'quadrantchart',
  'gitgraph',
  'c4context',
  'block-beta',
  'xychart-beta',
  'sankey-beta',
]);

/** Mermaid source for a closed fence, or null when the fence is ordinary code. */
export function mermaidSource(lang: string, info: string, body: string): string | null {
  const key = lang.trim().toLowerCase();
  const text = body.replace(/\s+$/, '');
  if (!text.trim()) return null;
  if (key === 'mermaid') return text;
  if (key === '') return MERMAID_START.test(text.trimStart()) ? text : null;
  if (!DIAGRAM_LANG.has(key)) return null;
  if (MERMAID_START.test(text.trimStart())) return text;
  const directive = [lang.trim(), info.trim()].filter(Boolean).join(' ');
  return `${directive}\n${text}`;
}
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map((line) => inline(line, opts)).join('<br>')}</p>`);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].trim().startsWith(fence[1])) {
          closed = true;
          break;
        }
        code.push(lines[i]);
      }
      const lang = fence[2] ?? '';
      const info = fence[3] ?? '';
      const body = code.join('\n');
      const diagram = closed ? mermaidSource(lang, info, body) : null;
      const special = closed ? opts.fences?.[lang.trim().toLowerCase()] : undefined;
      if (special) out.push(`<pre class="${escapeHtml(special)}"><code>${escapeHtml(body)}</code></pre>`);
      else if (diagram !== null) out.push(`<pre class="lab-mermaid"><code>${escapeHtml(diagram)}</code></pre>`);
      else {
        const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
        out.push(`<pre><code${langClass}>${escapeHtml(body)}</code></pre>`);
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inline(heading[2], opts)}</h${level}>`);
      continue;
    }
    if (HR.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }
    if (line.trimStart().startsWith('>')) {
      flush();
      const quoted: string[] = [];
      for (; i < lines.length && lines[i].trimStart().startsWith('>'); i++) quoted.push(lines[i].trimStart().replace(/^>\s?/, ''));
      i--;
      out.push(`<blockquote>${renderMarkdown(quoted.join('\n'), opts)}</blockquote>`);
      continue;
    }
    if (line.trimStart().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trimStart().startsWith('|'); i++) rows.push(cells(lines[i]));
      i--;
      const th = head.map((cell) => `<th>${inline(cell, opts)}</th>`).join('');
      const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, opts)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="lab-table"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[1]);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const match = LIST_ITEM.exec(lines[i]);
        if (match && /\d/.test(match[1]) === ordered) items.push(match[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += `\n${lines[i].trim()}`;
        else break;
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      const lis = items.map((text) => `<li>${text.split('\n').map((part) => inline(part, opts)).join('<br>')}</li>`);
      out.push(`<${tag}>${lis.join('')}</${tag}>`);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return out.join('\n');
}
