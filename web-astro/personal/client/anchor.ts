// Where an insert belongs, expressed so it survives upstream edits:
// the opening text of the block it follows, plus the enclosing section and
// the block's position inside that section as a fallback.
export interface Block {
  text: string; // whitespace-normalized text content
  heading?: string; // id when the block is an h2/h3 section heading
}

export interface InsertAnchor {
  after: string;
  section: string;
  offset: number;
}

export interface Placement {
  index: number;
  exact: boolean;
}

export const ANCHOR_LENGTH = 120;

export const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();

// Section id for every block: the latest heading at or before it ('' before the first).
function sectionStarts(blocks: Block[]) {
  let section = '';
  let start = -1;
  return blocks.map((block, index) => {
    if (block.heading) {
      section = block.heading;
      start = index;
    }
    return { section, start };
  });
}

export function anchorFor(blocks: Block[], index: number): InsertAnchor {
  const { section, start } = sectionStarts(blocks)[index];
  return {
    after: blocks[index].text.slice(0, ANCHOR_LENGTH),
    section,
    offset: index - start,
  };
}

export function locate(blocks: Block[], anchor: InsertAnchor): Placement | null {
  const sections = sectionStarts(blocks);
  if (anchor.after) {
    const matches = blocks.flatMap((block, index) =>
      block.text.slice(0, ANCHOR_LENGTH) === anchor.after ? [index] : [],
    );
    const inSection = matches.filter((index) => sections[index].section === anchor.section);
    const index = inSection[0] ?? matches[0];
    if (index !== undefined) return { index, exact: true };
  }
  // The anchor text changed upstream: fall back to the same slot in the same section.
  const headingIndex = anchor.section
    ? blocks.findIndex((block) => block.heading === anchor.section)
    : -1;
  if (anchor.section && headingIndex === -1) return null;
  const sectionEnd = sections.reduce(
    (last, entry, index) => (entry.start === headingIndex ? index : last),
    headingIndex,
  );
  if (sectionEnd < 0) return null;
  const index = Math.min(headingIndex + anchor.offset, sectionEnd);
  return { index: Math.max(index, 0), exact: !anchor.after && index === headingIndex + anchor.offset };
}
