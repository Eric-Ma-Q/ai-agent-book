// Read-only index of the book repository, used by the reader's filename links.
// Nothing here writes: the only entry points are resolve, read and blob, and all
// of them go through the same allow/deny rules as the index.
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import { PersonalError } from './paths.mjs';

export const MAX_INDEX_ENTRIES = 80_000;
export const INDEX_TTL_MS = 60_000;
export const MAX_TEXT_BYTES = 4 * 1024 * 1024;
export const MAX_BLOB_BYTES = 20 * 1024 * 1024;
export const MAX_CANDIDATES = 8;
export const MAX_RESOLVE_NAMES = 50;
export const MAX_NAME_LENGTH = 300;

const ALLOWED_EXT = new Set([
  'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'txt', 'log',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'astro',
  'css', 'scss', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'conf',
  'xml', 'sql', 'html', 'htm', 'ipynb',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif',
  'pdf', 'docx', 'xlsx', 'pptx', 'zip',
]);

const DENY_DIRS = new Set([
  '.git', 'personal', 'node_modules', 'dist', 'run-logs', '.astro', '.cache',
  '__pycache__', '.venv', '_web', 'agentbook', 'cursor-chats',
]);

const DENY_FILE = [
  /^\./,
  /\.(key|pem|p12|pfx)$/i,
  /^(id_rsa|id_ed25519)$/i,
  /^(credentials|secrets|tokens|cookies)/i,
];

const MIME = {
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  jsonl: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  py: 'text/x-python; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  tsx: 'text/typescript; charset=utf-8',
  jsx: 'text/javascript; charset=utf-8',
  astro: 'text/plain; charset=utf-8',
  css: 'text/css; charset=utf-8',
  scss: 'text/x-scss; charset=utf-8',
  sh: 'text/x-shellscript; charset=utf-8',
  bash: 'text/x-shellscript; charset=utf-8',
  zsh: 'text/x-shellscript; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  toml: 'text/plain; charset=utf-8',
  ini: 'text/plain; charset=utf-8',
  conf: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  sql: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  ipynb: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

const CODE_EXT = new Set([
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'astro', 'css', 'scss',
  'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'conf', 'xml', 'sql', 'ipynb',
]);

const TEXT_FORMATS = new Set(['markdown', 'text', 'code', 'json', 'jsonl', 'csv', 'tsv', 'html']);

const posix = (path) => path.split(sep).join('/');

export function formatForExt(ext) {
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';
  if (ext === 'jsonl') return 'jsonl';
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'avif')
    return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx' || ext === 'zip') return 'binary';
  if (CODE_EXT.has(ext)) return 'code';
  if (ext === 'txt' || ext === 'log') return 'text';
  return 'binary';
}

export function isTextFormat(format) {
  return TEXT_FORMATS.has(format);
}

export function mimeForExt(ext) {
  return MIME[ext] ?? 'application/octet-stream';
}

function isDeniedName(name) {
  return DENY_FILE.some((pattern) => pattern.test(name));
}

function hasDeniedSegment(posixPath) {
  return posixPath.split('/').some((part) => DENY_DIRS.has(part) || isDeniedName(part));
}

function entryFor(root, fullPath) {
  const path = posix(relative(root, fullPath));
  const ext = extname(fullPath).slice(1).toLowerCase();
  const stat = statSync(fullPath);
  const dir = posix(dirname(path));
  return {
    path,
    name: basename(fullPath),
    dir: dir === '.' ? '' : dir,
    ext,
    format: formatForExt(ext),
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function buildIndex(root, log, now) {
  const entries = [];
  const byName = new Map();
  let truncated = false;

  const walk = (dir) => {
    if (entries.length >= MAX_INDEX_ENTRIES) {
      truncated = true;
      return;
    }
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (entries.length >= MAX_INDEX_ENTRIES) {
        truncated = true;
        return;
      }
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (DENY_DIRS.has(item.name) || item.name.startsWith('.')) continue;
        walk(join(dir, item.name));
        continue;
      }
      if (!item.isFile() || isDeniedName(item.name)) continue;
      const ext = extname(item.name).slice(1).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      let entry;
      try {
        entry = entryFor(root, join(dir, item.name));
      } catch {
        continue;
      }
      entries.push(entry);
      const bucket = byName.get(entry.name);
      if (bucket) bucket.push(entry);
      else byName.set(entry.name, [entry]);
    }
  };

  walk(root);
  if (truncated) log.warn?.(`files: index stopped at ${MAX_INDEX_ENTRIES} entries`);
  return { entries, byName, builtAt: now(), truncated };
}

function chapterNumber(chapter, page) {
  const fromKey = typeof chapter === 'string' ? /chapter(10|[1-9])\b/.exec(chapter) : null;
  if (fromKey) return fromKey[1];
  const fromPage = typeof page === 'string' ? /chapter(10|[1-9])(?:\/|$)/.exec(page) : null;
  return fromPage ? fromPage[1] : null;
}

function languageRoot(page) {
  if (typeof page !== 'string') return null;
  const first = page.split('/').filter(Boolean)[0];
  return first && /^book(?:-[a-z]{2,4})?$/.test(first) ? first : null;
}

// Higher score wins. The request name is the only thing that can award the
// exact-path bonus, so a bare `README.md` never jumps to another directory.
function score(entry, name, chapterNo, langRoot) {
  let value = 0;
  const wanted = name.includes('/') ? name.replace(/^\.\//, '') : null;
  if (wanted && (entry.path === wanted || entry.path.endsWith(`/${wanted}`))) value += 1000;
  if (chapterNo && new RegExp(`^chapter${chapterNo}(/|$)`).test(entry.path)) value += 300;
  if (chapterNo && langRoot && entry.path === `${langRoot}/chapter${chapterNo}.md`) value += 250;
  if (chapterNo && langRoot && entry.path.startsWith(`${langRoot}/chapter${chapterNo}`)) value += 180;
  if (langRoot && (entry.path === langRoot || entry.path.startsWith(`${langRoot}/`))) value += 60;
  if (chapterNo && entry.path.includes(`chapter${chapterNo}`)) value += 20;
  value -= entry.path.split('/').length;
  return value;
}

function sortCandidates(list, name, chapter, page) {
  const chapterNo = chapterNumber(chapter, page);
  const langRoot = languageRoot(page);
  return [...list].sort((a, b) => {
    const diff = score(b, name, chapterNo, langRoot) - score(a, name, chapterNo, langRoot);
    if (diff !== 0) return diff;
    if (a.mtime !== b.mtime) return a.mtime < b.mtime ? 1 : -1;
    return a.path.localeCompare(b.path);
  });
}

function assertRelative(input) {
  if (typeof input !== 'string' || !input.trim()) throw new PersonalError(400, 'path is required');
  if (input.length > 1000) throw new PersonalError(400, 'path is too long');
  if (input.includes('\0')) throw new PersonalError(403, 'path contains NUL');
  if (input.includes('\\')) throw new PersonalError(403, 'path must use forward slashes');
  if (isAbsolute(input)) throw new PersonalError(403, 'path must be relative');
  const segments = input.split('/');
  if (segments.includes('..')) throw new PersonalError(403, 'path may not contain ..');
  if (segments.includes('')) throw new PersonalError(403, 'path may not contain empty segments');
  if (hasDeniedSegment(input)) throw new PersonalError(403, 'path is not previewable');
  const ext = extname(input).slice(1).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new PersonalError(403, 'file type is not previewable');
}

export function createFilesStore({ bookRoot, log = console, now = () => Date.now() } = {}) {
  if (!bookRoot) throw new Error('createFilesStore requires bookRoot');
  const root = resolvePath(bookRoot);
  const realRoot = realpathSync(root);
  let index = null;

  const currentIndex = () => {
    if (!index || now() - index.builtAt > INDEX_TTL_MS) {
      index = buildIndex(root, log, now);
      log.info?.(`files: indexed ${index.entries.length} files`);
    }
    return index;
  };

  // Resolve inside the repository, then re-check the real path so a symlink
  // cannot point at personal/ or outside the checkout.
  const assertAllowed = (input) => {
    assertRelative(input);
    const full = resolvePath(root, input);
    if (full !== root && !full.startsWith(`${root}${sep}`)) throw new PersonalError(403, 'path escapes the repository');
    let real;
    try {
      real = realpathSync(full);
    } catch {
      throw new PersonalError(404, 'file not found');
    }
    if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) throw new PersonalError(403, 'path escapes the repository');
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new PersonalError(403, 'symbolic links are not previewable');
    if (!statSync(full).isFile()) throw new PersonalError(404, 'not a file');
    return real;
  };

  const resolve = (names, options = {}) => {
    if (!Array.isArray(names)) throw new PersonalError(400, 'names must be an array');
    if (names.length > MAX_RESOLVE_NAMES) throw new PersonalError(400, `at most ${MAX_RESOLVE_NAMES} names`);
    const seen = new Set();
    const files = {};
    const totals = {};
    const indexNow = currentIndex();
    for (const raw of names) {
      if (typeof raw !== 'string') throw new PersonalError(400, 'names must be strings');
      const name = raw.trim();
      if (!name || name.length > MAX_NAME_LENGTH) throw new PersonalError(400, 'name is invalid');
      if (seen.has(name)) continue;
      seen.add(name);
      const list = indexNow.byName.get(basename(name)) ?? [];
      const matching = name.includes('/')
        ? list.filter((entry) => entry.path === name || entry.path.endsWith(`/${name}`))
        : list;
      const sorted = sortCandidates(matching, name, options.chapter, options.page);
      files[name] = sorted.slice(0, MAX_CANDIDATES);
      totals[name] = sorted.length;
    }
    return { files, totals };
  };

  const read = (input) => {
    const real = assertAllowed(input);
    const entry = entryFor(realRoot, real);
    const binary = !isTextFormat(entry.format);
    const size = entry.bytes;
    if (binary) {
      return {
        ...entry,
        mime: mimeForExt(entry.ext),
        binary: true,
        bytes: size,
        truncated: false,
      };
    }
    const length = Math.min(size, MAX_TEXT_BYTES);
    const buffer = Buffer.alloc(length);
    const fd = openSync(real, 'r');
    try {
      let offset = 0;
      while (offset < length) {
        const readBytes = readSync(fd, buffer, offset, length - offset, offset);
        if (!readBytes) break;
        offset += readBytes;
      }
    } finally {
      closeSync(fd);
    }
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return {
      ...entry,
      mime: mimeForExt(entry.ext),
      binary: false,
      bytes: size,
      text,
      truncated: size > MAX_TEXT_BYTES,
    };
  };

  const blob = (input) => {
    const real = assertAllowed(input);
    const stat = statSync(real);
    if (stat.size > MAX_BLOB_BYTES) {
      throw new PersonalError(413, `file is ${stat.size} bytes; the limit is ${MAX_BLOB_BYTES}`);
    }
    const ext = extname(real).slice(1).toLowerCase();
    const format = formatForExt(ext);
    return {
      __blob: true,
      buffer: readFileSync(real),
      mime: mimeForExt(ext),
      size: stat.size,
      fileName: basename(real),
      disposition: format === 'image' || format === 'pdf' ? 'inline' : 'attachment',
    };
  };

  return {
    resolve,
    read,
    blob,
    stats: () => {
      const current = currentIndex();
      return { files: current.entries.length, byName: current.byName.size, truncated: current.truncated };
    },
  };
}
