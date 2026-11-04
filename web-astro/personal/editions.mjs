// Dev-only: compile only the editions I read. The chapter page eagerly imports
// every edition's chapters (15 × 10 Markdown files) to build cross-language
// section links, which makes the first page load slow. Other editions are
// replaced by stubs that keep every heading line, so section ids — and thus
// the language-switcher links — stay identical while the prose is skipped.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const CHAPTER = /(^|\/)(book(?:-[a-z]+)?)\/chapter\d+(?:\.[\w-]+)?\.md$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s/;
const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:/m;

export function parseEditions(value = 'book') {
  const list = value.split(',').map((item) => item.trim()).filter(Boolean);
  return list.includes('all') ? null : new Set(list.length ? list : ['book']);
}

// Keep headings (outside code fences) in order; drop everything else. A chapter
// with footnotes also gets a generated "Footnotes" heading, which the page counts
// when matching sections across editions, so the stub keeps one footnote too.
export function headingStub(source, notice) {
  let inFence = false;
  const headings = [];
  for (const line of source.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    else if (!inFence && HEADING.test(line)) headings.push(line);
  }
  const [first, ...rest] = headings;
  const title = first?.startsWith('# ') ? [first] : [];
  const others = first?.startsWith('# ') ? rest : headings;
  const footnote = FOOTNOTE_DEFINITION.test(source);
  const body = [...title, `> ${notice}${footnote ? '[^stub]' : ''}`, ...others];
  if (footnote) body.push('[^stub]: —');
  return body.join('\n\n') + '\n';
}

export function editionStubs({ keep, cacheDir, notice }) {
  return {
    name: 'personal-edition-stubs',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!keep || !CHAPTER.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const match = resolved && CHAPTER.exec(resolved.id);
      if (!match || keep.has(match[2])) return null;
      const stub = join(cacheDir, match[2], basename(resolved.id));
      mkdirSync(dirname(stub), { recursive: true });
      writeFileSync(stub, headingStub(readFileSync(resolved.id, 'utf8'), notice));
      return stub;
    },
  };
}
