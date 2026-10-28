// Finds where each reading annotation belongs in the chapter text. Matching
// runs on whitespace-collapsed text (as the curation tools do) and maps the
// result back to offsets in the raw text the DOM holds.
export interface AnnotationAnchor {
  id: string;
  quote: string;
  context?: string;
}

export interface Span {
  id: string;
  start: number;
  end: number;
}

export interface Collapsed {
  text: string;
  // raw offset of every collapsed character, plus one entry for the end
  offsets: number[];
}

export const collapseSpaces = (text: string) => text.replace(/\s+/g, ' ');

export function collapse(raw: string): Collapsed {
  let text = '';
  const offsets: number[] = [];
  let inSpace = false;
  for (let index = 0; index < raw.length; index++) {
    const space = /\s/.test(raw[index]);
    if (!(space && inSpace)) {
      text += space ? ' ' : raw[index];
      offsets.push(index);
    }
    inSpace = space;
  }
  offsets.push(raw.length);
  return { text, offsets };
}

function onlyMatch(text: string, needle: string) {
  const first = text.indexOf(needle);
  if (first === -1 || text.indexOf(needle, first + 1) !== -1) return -1;
  return first;
}

/** Start/end in collapsed text, or null when the anchor is missing or ambiguous. */
export function locateAnnotation(text: string, anchor: AnnotationAnchor) {
  const quote = collapseSpaces(anchor.quote);
  const context = anchor.context ? collapseSpaces(anchor.context) : '';
  if (context) {
    const inside = context.indexOf(quote);
    const at = onlyMatch(text, context);
    if (inside === -1 || at === -1) return null;
    return { start: at + inside, end: at + inside + quote.length };
  }
  const at = onlyMatch(text, quote);
  return at === -1 ? null : { start: at, end: at + quote.length };
}

/** Raw-text spans for every annotation that anchors; overlapping ones keep the earlier. */
export function annotationSpans(raw: string, anchors: AnnotationAnchor[]): Span[] {
  const { text, offsets } = collapse(raw);
  const found = anchors.flatMap((anchor) => {
    const position = locateAnnotation(text, anchor);
    return position
      ? [{ id: anchor.id, start: offsets[position.start], end: offsets[position.end - 1] + 1 }]
      : [];
  });
  const sorted = [...found].sort((a, b) => a.start - b.start || b.end - a.end);
  return sorted.reduce<Span[]>(
    (kept, span) => (kept.length && span.start < kept.at(-1)!.end ? kept : [...kept, span]),
    [],
  );
}
