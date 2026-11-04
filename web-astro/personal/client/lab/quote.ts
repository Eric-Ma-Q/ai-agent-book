// Locating a quoted passage in page text, ignoring whitespace, full/half width
// and quote-mark style — the same normalisation the agent-lab citation checker
// uses (agent_lab/book/parser.py: normalize_for_match). Pure, unit tested.
const DROP = /[\s*#>|`]/;
const QUOTES: Record<string, string> = { '“': '"', '”': '"', '„': '"', '‟': '"', '‘': "'", '’': "'", '「': '"', '」': '"' };

export type Normalized = { norm: string; starts: number[]; ends: number[] };

/** Normalised text plus, for each normalised char, the source range it came from. */
export function normalizeChars(text: string): Normalized {
  let norm = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const ch of text) {
    const next = index + ch.length;
    if (!DROP.test(ch)) {
      for (const out of ch.normalize('NFKC')) {
        const mapped = QUOTES[out] ?? out;
        if (DROP.test(mapped)) continue;
        norm += mapped;
        starts.push(index);
        ends.push(next);
      }
    }
    index = next;
  }
  return { norm, starts, ends };
}

/** [start, end) offsets of the quote in text, or null. */
export function locateQuote(text: string, quote: string): [number, number] | null {
  const needle = normalizeChars(quote).norm;
  if (!needle) return null;
  const hay = normalizeChars(text);
  const at = hay.norm.indexOf(needle);
  if (at < 0) return null;
  return [hay.starts[at], hay.ends[at + needle.length - 1]];
}

export type Position = { segment: number; offset: number };

/** The quote's start and end inside a list of text segments (e.g. DOM text nodes). */
export function locateInSegments(segments: string[], quote: string): { start: Position; end: Position } | null {
  const found = locateQuote(segments.join(''), quote);
  if (!found) return null;
  const toPosition = (offset: number, isEnd: boolean): Position => {
    let base = 0;
    for (let segment = 0; segment < segments.length; segment++) {
      const length = segments[segment].length;
      const inside = isEnd ? offset <= base + length : offset < base + length;
      if (inside) return { segment, offset: offset - base };
      base += length;
    }
    return { segment: segments.length - 1, offset: segments.at(-1)?.length ?? 0 };
  };
  return { start: toPosition(found[0], false), end: toPosition(found[1], true) };
}
