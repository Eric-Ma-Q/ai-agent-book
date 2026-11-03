// Finds which section of a chapter a highlight belongs to, using the book's
// Markdown source. A highlight only stores its quote and surrounding text, so
// the match is best effort: Markdown syntax is dropped from both sides and
// what remains (letters and digits) is compared.
const squash = (text) => text.replace(/[^\p{L}\p{N}]+/gu, '');

const PROBE_QUOTE = 24;
const PROBE_PREFIX = 12;
const MIN_PROBE = 4;

// Link targets and raw HTML never appear in the rendered chapter text.
function plainText(line) {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '');
}

const headingTitle = (raw) => plainText(raw).replace(/[*_`]/g, '').trim();

/** Reduces chapter Markdown to its title, its h2/h3 sections and searchable text. */
export function parseOutline(markdown) {
  const sections = [];
  let title = '';
  let text = '';
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const heading = fenced ? null : /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading && heading[1].length === 1) {
      title ||= headingTitle(heading[2]);
    } else if (heading) {
      sections.push({
        depth: heading[1].length,
        title: headingTitle(heading[2]),
        start: text.length,
      });
    }
    text += squash(plainText(heading ? heading[2] : line));
  }
  return { title, sections, text, sourceLength: markdown.length };
}

function occurrences(text, probe) {
  const found = [];
  for (let at = text.indexOf(probe); at !== -1; at = text.indexOf(probe, at + 1)) found.push(at);
  return found;
}

function probesFor(record) {
  const head = squash(record.quote).slice(0, PROBE_QUOTE);
  const lead = squash(record.prefix ?? '').slice(-PROBE_PREFIX);
  return [lead + head, head, head.slice(0, 10)].filter((probe) => probe.length >= MIN_PROBE);
}

/**
 * The section holding the highlight, as `{ title, parent }`, or null when the
 * quote cannot be found in the source (for example text from a table or a figure).
 */
export function findSection(outline, record) {
  const expected = record.start / Math.max(1, outline.sourceLength);
  for (const probe of probesFor(record)) {
    const hits = occurrences(outline.text, probe);
    if (!hits.length) continue;
    // A repeated phrase resolves to the occurrence at the same relative position.
    const at = hits.reduce((best, hit) =>
      Math.abs(hit / outline.text.length - expected) < Math.abs(best / outline.text.length - expected)
        ? hit
        : best,
    );
    let current = null;
    let parent = null;
    for (const section of outline.sections) {
      if (section.start > at) break;
      if (section.depth === 2) parent = section;
      current = section;
    }
    if (!current) return null;
    return {
      title: current.title,
      parent: current.depth === 3 && parent ? parent.title : null,
    };
  }
  return null;
}
