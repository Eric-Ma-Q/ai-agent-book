// Pure helpers for the filename links and the file preview. Everything here is
// independent of the DOM so the reader can test it with node:test.

export type FileFormat =
  | 'markdown'
  | 'text'
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'tsv'
  | 'code'
  | 'html'
  | 'image'
  | 'pdf'
  | 'binary';

export type FileEntryLike = {
  path: string;
  name: string;
  dir: string;
  ext: string;
  format: FileFormat;
  bytes: number;
  mtime: string;
};

// Same allow-list as files-store.mjs. Detection is intentionally a little
// wider than the server: the server decides what actually exists.
const EXTENSIONS = [
  'markdown', 'ipynb', 'astro', 'jsonl', 'scss', 'toml', 'yaml', 'docx', 'xlsx', 'pptx',
  'jpeg', 'webp', 'avif', 'json', 'html', 'bash', 'conf', 'css', 'csv', 'gif', 'htm',
  'jpg', 'log', 'mjs', 'pdf', 'png', 'py', 'sh', 'sql', 'svg', 'tsv', 'tsx', 'txt',
  'xml', 'yml', 'zip', 'ini', 'js', 'jsx', 'md', 'cjs', 'zsh',
];

const EXT_PATTERN = EXTENSIONS.join('|');
const NAME_RE = new RegExp(
  `(?:\\.{1,2}\\/)?(?:[\\p{L}\\p{N}_.-]+\\/)*[\\p{L}\\p{N}_.-]*[\\p{L}\\p{N}_-]\\.(?:${EXT_PATTERN})(?![\\p{L}\\p{N}_-])`,
  'gu',
);

const TEXT_FORMATS = new Set<FileFormat>(['markdown', 'text', 'code', 'json', 'jsonl', 'csv', 'tsv', 'html']);

const CODE_EXT = new Set([
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'astro', 'css', 'scss', 'sh', 'bash',
  'zsh', 'yaml', 'yml', 'toml', 'ini', 'conf', 'xml', 'sql', 'ipynb',
]);

const FORMAT_LABELS: Record<FileFormat, string> = {
  markdown: 'Markdown',
  text: '文本',
  json: 'JSON',
  jsonl: 'JSONL',
  csv: 'CSV',
  tsv: 'TSV',
  code: '源码',
  html: 'HTML',
  image: '图片',
  pdf: 'PDF',
  binary: '其他格式',
};

const MIME = {
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  jsonl: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  pdf: 'application/pdf',
};

export function extOf(name: string): string {
  const clean = name.split('/').pop() ?? name;
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export function formatOf(ext: string): FileFormat {
  const value = ext.toLowerCase();
  if (value === 'md' || value === 'markdown') return 'markdown';
  if (value === 'json') return 'json';
  if (value === 'jsonl') return 'jsonl';
  if (value === 'csv') return 'csv';
  if (value === 'tsv') return 'tsv';
  if (value === 'html' || value === 'htm') return 'html';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(value)) return 'image';
  if (value === 'pdf') return 'pdf';
  if (['docx', 'xlsx', 'pptx', 'zip'].includes(value)) return 'binary';
  if (CODE_EXT.has(value)) return 'code';
  if (value === 'txt' || value === 'log') return 'text';
  return 'binary';
}

export function formatLabel(format: FileFormat | string): string {
  return FORMAT_LABELS[format as FileFormat] ?? '其他格式';
}

export function isTextFormat(format: FileFormat | string): boolean {
  return TEXT_FORMATS.has(format as FileFormat);
}

export function mimeOf(ext: string): string {
  return MIME[ext.toLowerCase() as keyof typeof MIME] ?? 'application/octet-stream';
}

export type NameMatch = { name: string; start: number; end: number; text: string };

// Pull probable filenames out of one text node, with offsets so the caller can
// split the node into text + link + text. The server confirms existence; a
// domain, a version or an unknown extension never matches.
export function findFileNames(text: string): NameMatch[] {
  const found: NameMatch[] = [];
  const seen = new Set<string>();
  NAME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NAME_RE.exec(text))) {
    let name = match[0].replace(/^\.{1,2}\//, '');
    if (name.startsWith('/')) name = name.slice(1);
    if (!name || name.includes('..') || seen.has(name)) continue;
    seen.add(name);
    found.push({ name, start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return found;
}

export function detectFileNames(text: string): string[] {
  return findFileNames(text).map((match) => match.name);
}


export type SliceResult = { text: string; end: number; total: number; done: boolean };

export type SliceOptions = { blockAware?: boolean; maxExtend?: number };

// Split text into lines for progressive rendering. The boundary moves forward
// to the next blank line when it would cut a table, and past the closing fence
// when it lands inside a fenced block. A block that never ends (the real T3A
// log is one 4,568-line fence) is capped so the first render stays small.
export function sliceLines(
  text: string,
  loaded: number,
  size = 200,
  { blockAware = true, maxExtend = size }: SliceOptions = {},
): SliceResult {
  const lines = text.split('\n');
  const total = lines.length;
  let end = Math.max(0, Math.min(loaded, total));
  if (blockAware && end > 0 && end < total) {
    const limit = Math.min(total, end + maxExtend);
    const atTable = lines[end - 1]?.trim().startsWith('|') && lines[end]?.trim().startsWith('|');
    if (atTable) {
      while (end < limit && lines[end].trim()) end += 1;
    } else {
      const fences = lines.slice(0, end).filter((line) => /^\s*```/.test(line)).length;
      if (fences % 2 === 1) {
        while (end < limit && !/^\s*```/.test(lines[end])) end += 1;
        if (end < limit) end += 1;
      }
    }
  }
  return { text: lines.slice(0, end).join('\n'), end, total, done: end >= total };
}

export type CsvResult = {
  header: string[];
  rows: string[][];
  shown: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
};

// Quote-aware CSV/TSV parser. Stops after maxRows so a pathological export
// cannot freeze the dialog; the preview says how many rows are shown.
export function parseDelimited(
  text: string,
  { delimiter = ',', maxRows = 500, maxCols = 40 }: { delimiter?: string; maxRows?: number; maxCols?: number } = {},
): CsvResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let truncatedCols = false;
  let stopped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      if (row.length >= maxCols) truncatedCols = true;
      else row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      if (row.length >= maxCols) truncatedCols = true;
      else row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > maxRows) {
        stopped = true;
        break;
      }
    } else {
      cell += ch;
    }
  }
  if (!stopped && (cell || row.length)) {
    if (row.length >= maxCols) truncatedCols = true;
    else row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  const header = rows.shift() ?? [];
  const truncatedRows = stopped || rows.length > maxRows;
  return {
    header: header.slice(0, maxCols),
    rows: rows.slice(0, maxRows),
    shown: Math.min(rows.length, maxRows),
    truncatedRows,
    truncatedCols: truncatedCols || header.length > maxCols,
  };
}

export type JsonResult = { ok: boolean; text: string };

export function formatJson(text: string): JsonResult {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
  } catch {
    return { ok: false, text };
  }
}

export type JsonlResult = { ok: boolean; text: string; lines: number; truncated: boolean; failed: boolean };

export function formatJsonl(text: string, limit = 500): JsonlResult {
  const lines = text.split('\n').filter((line) => line.trim());
  const shown = lines.slice(0, limit);
  const out: string[] = [];
  let failed = false;
  for (const line of shown) {
    try {
      out.push(JSON.stringify(JSON.parse(line), null, 2));
    } catch {
      failed = true;
      out.push(line);
    }
  }
  return {
    ok: !failed,
    text: out.join('\n'),
    lines: lines.length,
    truncated: lines.length > limit,
    failed,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function candidateLabel(entry: FileEntryLike): string {
  const path = entry.dir ? `${entry.dir}/${entry.name}` : entry.name;
  return `${path} · ${formatBytes(entry.bytes)}`;
}

export function depthOf(path: string): number {
  return path.split('/').length;
}

export type ScrollBox = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  top: number;
  bottom: number;
};

// Return the scrollTop that brings a find hit into view, or null when it is
// already inside the padded viewport band. Use the hit rect directly: scrolling
// its parent element would centre a whole long <pre> or <p> instead.
export function scrollTopForHit(
  view: ScrollBox,
  hit: { top: number; bottom: number },
  padTop = 40,
  padBottom = 32,
): number | null {
  const height = Math.max(0, hit.bottom - hit.top);
  const topEdge = view.top + padTop;
  const bottomEdge = view.bottom - padBottom;
  if (hit.top >= topEdge && hit.bottom <= bottomEdge) return null;
  const max = Math.max(0, view.scrollHeight - view.clientHeight);
  const target =
    bottomEdge - topEdge > height
      ? view.scrollTop + hit.top - view.top - (view.clientHeight - height) / 2
      : view.scrollTop + hit.top - topEdge;
  return Math.min(Math.max(0, target), max);
}

export type IndexEntry = {
  name: string;
  candidate: FileEntryLike;
  total: number;
  occurrences: number;
};

// Keep the order the names first appeared in the prose and merge duplicates;
// names the server did not confirm (empty candidate list) drop out.
export function buildIndexEntries(
  order: string[],
  occurrences: Map<string, number>,
  candidates: Map<string, FileEntryLike[]>,
  totals: Map<string, number>,
): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const name of order) {
    const list = candidates.get(name);
    if (!list?.length) continue;
    entries.push({
      name,
      candidate: list[0],
      total: totals.get(name) ?? list.length,
      occurrences: occurrences.get(name) ?? 1,
    });
  }
  return entries;
}
