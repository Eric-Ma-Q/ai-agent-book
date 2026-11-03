// One-shot migration tool: copy the tracked files of the old `~/project/harness`
// repository into `archive/` (served) and `meta/` (archive only), then write
// manifest.json with byte counts and SHA-256 hashes. Run it once; afterwards use
// verify.mjs to check the archive. See README.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = path.join(os.homedir(), 'project', 'harness');
const ARCHIVE_DIR = path.join(HERE, 'archive');
const META_DIR = path.join(HERE, 'meta');
const MANIFEST_PATH = path.join(HERE, 'manifest.json');

const SITE_PREFIX = '/harness/site/';

// The four repository meta files are archived under meta/ with a .txt suffix:
// a nested AGENTS.md would look like a live rule file, and dot files must not
// end up inside the served archive.
const META_FILES = {
  'AGENTS.md': 'agents-md.txt',
  'CLAUDE.md': 'claude-md.txt',
  '.gitignore': 'gitignore.txt',
  '.zcodeignore': 'zcodeignore.txt',
};

// A single nested dot file: keep it as content without leaving a dot file in
// the archive (the repository .gitignore ignores `.*`).
const RENAMED = {
  'labs/selfloop/.gitignore': 'labs/selfloop/gitignore.txt',
};

const EXPECTED_COUNTS = {
  page: 15,
  research: 18,
  longform: 2,
  lab: 41,
  doc: 21,
  collab: 71,
  build: 8,
  artifact: 2,
  meta: 4,
};
const EXPECTED_TOTAL = 182;

const EXCLUDED = [
  '.git/',
  '.playwright-mcp/',
  '**/__pycache__/',
  '*.pyc',
  'labs/selfloop/.selfloop/',
  '_deck/pdfout/',
  '.DS_Store',
];

function parseArgs(argv) {
  const out = { source: DEFAULT_SOURCE, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') out.force = true;
    else if (arg === '--source') out.source = argv[(i += 1)];
    else if (arg.startsWith('--source=')) out.source = arg.slice('--source='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!out.source) throw new Error('--source requires a directory');
  return out;
}

function git(source, args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' });
}

function classify(relative) {
  if (relative in META_FILES) return 'meta';
  const top = relative.split('/')[0];
  if (top === 'research') return 'research';
  if (top === 'labs') return 'lab';
  if (top === 'docs') return 'doc';
  if (top === 'collab') return 'collab';
  if (top === 'hooks-33' || top === '_deck') return 'build';
  if (!relative.includes('/')) {
    if (relative.endsWith('.html')) return 'page';
    if (relative.endsWith('.md')) return 'longform';
    if (relative.endsWith('.pptx') || relative.endsWith('.pdf')) return 'artifact';
  }
  throw new Error(`cannot classify ${relative}`);
}

function targetFor(relative, category) {
  if (category === 'meta') return `meta/${META_FILES[relative]}`;
  return `archive/${RENAMED[relative] ?? relative}`;
}

function encodePath(relative) {
  return relative.split('/').map(encodeURIComponent).join('/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readModes(source, files) {
  const modes = new Map();
  const out = git(source, ['ls-files', '-s', '-z']);
  for (const entry of out.split('\0')) {
    if (!entry) continue;
    const match = /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/s.exec(entry);
    if (!match) continue;
    modes.set(match[2], match[1]);
  }
  for (const file of files) if (!modes.has(file)) throw new Error(`no git mode for ${file}`);
  return modes;
}

export async function migrate({ source = DEFAULT_SOURCE, force = false, log = console.log } = {}) {
  const sourceRoot = await realpath(source);
  const sourceStat = await stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`source is not a directory: ${source}`);
  const dirty = git(sourceRoot, ['status', '--short']).trim();
  if (dirty) throw new Error(`source has uncommitted changes:\n${dirty}`);
  const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']).trim();

  const tracked = git(sourceRoot, ['ls-files', '-z']).split('\0').filter(Boolean);
  if (tracked.length !== EXPECTED_TOTAL) {
    throw new Error(`expected ${EXPECTED_TOTAL} tracked files, found ${tracked.length}`);
  }
  const modes = await readModes(sourceRoot, tracked);
  const sorted = [...tracked].sort();

  if (!force) {
    const existing = await stat(ARCHIVE_DIR).catch(() => null);
    if (existing) throw new Error(`${ARCHIVE_DIR} already exists; pass --force to overwrite`);
  }

  await rm(ARCHIVE_DIR, { recursive: true, force: true });
  await rm(META_DIR, { recursive: true, force: true });

  const counts = {};
  const files = [];
  let totalBytes = 0;

  for (const relative of sorted) {
    const category = classify(relative);
    const sourceFile = path.join(sourceRoot, relative);
    const target = targetFor(relative, category);
    const destination = path.join(HERE, target);
    const buffer = await readFile(sourceFile);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    const mode = modes.get(relative);
    if (mode === '100755') await chmod(destination, 0o755);

    const entry = {
      source: relative,
      target,
      category,
      url: category === 'meta' ? null : SITE_PREFIX + encodePath(target.slice('archive/'.length)),
      bytes: buffer.length,
      sha256: sha256(buffer),
      mode,
    };
    files.push(entry);
    counts[category] = (counts[category] ?? 0) + 1;
    totalBytes += buffer.length;
  }

  for (const [category, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = counts[category] ?? 0;
    if (actual !== expected) throw new Error(`category ${category}: expected ${expected}, found ${actual}`);
  }
  const extra = Object.keys(counts).filter((category) => !(category in EXPECTED_COUNTS));
  if (extra.length) throw new Error(`unexpected categories: ${extra.join(', ')}`);

  // The 15 root pages must stay byte-identical to the old repository.
  const pages = files.filter((file) => file.category === 'page');
  for (const page of pages) {
    const original = await readFile(path.join(sourceRoot, page.source));
    const copied = await readFile(path.join(HERE, page.target));
    if (!original.equals(copied)) throw new Error(`page differs after copy: ${page.source}`);
  }

  const manifest = {
    format: 'harness-migration-manifest',
    version: 1,
    source: sourceRoot,
    sourceCommit,
    sourceDirty: false,
    migratedAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes,
    counts,
    files,
    excluded: EXCLUDED,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  log(`migrated ${files.length} files (${totalBytes} bytes) from ${sourceRoot}@${sourceCommit.slice(0, 7)}`);
  log(`counts: ${JSON.stringify(counts)}`);
  log(`pages byte-identical: ${pages.length}/${pages.length}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    await migrate(args);
  } catch (error) {
    console.error(`migrate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
