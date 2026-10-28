// Verify the Harness archive against manifest.json: every listed file exists,
// its byte count and SHA-256 match, no unlisted file sits in archive/ or meta/,
// and the category counts still add up. `--update` rewrites the hashes after an
// intentional edit and records `updatedAt`; the original hashes stay in git.
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = ['archive', 'meta'];
// Run state produced by the archived labs (Python bytecode, SelfLoop sessions,
// deck output). It is documented in manifest.excluded and git-ignored; the
// manifest only covers migrated content.
const RUN_STATE = /(^|\/)(__pycache__|\.selfloop|pdfout)(\/|$)|\.pyc$|\.DS_Store$/;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function walk(root, prefix = '') {
  const out = [];
  let entries;
  try {
    entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(root, relative)));
    else out.push(relative);
  }
  return out;
}

export async function verify({ update = false, log = console.log, root = HERE, manifestPath = path.join(root, 'manifest.json') } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'harness-migration-manifest') throw new Error('unexpected manifest format');

  const problems = [];
  const seen = new Set();
  const counts = {};
  let totalBytes = 0;
  const updated = [];

  for (const file of manifest.files) {
    if (seen.has(file.target)) problems.push(`duplicate target: ${file.target}`);
    seen.add(file.target);
    const absolute = path.join(root, file.target);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) {
      problems.push(`missing: ${file.target}`);
      continue;
    }
    const buffer = await readFile(absolute);
    if (buffer.length !== file.bytes) {
      if (update) file.bytes = buffer.length;
      else problems.push(`bytes differ: ${file.target} (${buffer.length} != ${file.bytes})`);
    }
    const digest = sha256(buffer);
    if (digest !== file.sha256) {
      if (update) {
        file.sha256 = digest;
        if (!updated.includes(file.target)) updated.push(file.target);
      } else {
        problems.push(`sha256 differs: ${file.target}`);
      }
    }
    counts[file.category] = (counts[file.category] ?? 0) + 1;
    totalBytes += buffer.length;
  }

  for (const rootName of ROOTS) {
    for (const relative of await walk(path.join(root, rootName))) {
      if (RUN_STATE.test(relative)) continue;
      const target = `${rootName}/${relative}`;
      if (!seen.has(target)) problems.push(`unlisted file: ${target}`);
    }
  }

  if (manifest.fileCount !== manifest.files.length) {
    problems.push(`fileCount ${manifest.fileCount} != ${manifest.files.length}`);
  }
  for (const [category, value] of Object.entries(counts)) {
    if (manifest.counts?.[category] !== value) {
      problems.push(`count for ${category}: manifest ${manifest.counts?.[category]} != ${value}`);
    }
  }
  for (const category of Object.keys(manifest.counts ?? {})) {
    if (!(category in counts)) problems.push(`count for ${category} has no files`);
  }
  if (!update && manifest.totalBytes !== totalBytes) {
    problems.push(`totalBytes ${manifest.totalBytes} != ${totalBytes}`);
  }

  if (update && updated.length) {
    manifest.totalBytes = totalBytes;
    manifest.counts = counts;
    manifest.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (problems.length) {
    for (const problem of problems) log(`  ${problem}`);
    throw new Error(`${problems.length} manifest problem(s): ${problems.slice(0, 5).join('; ')}`);
  }
  const summary = Object.entries(manifest.counts)
    .map(([category, value]) => `${category}=${value}`)
    .join(' ');
  log(`verified ${manifest.files.length}/${manifest.fileCount} files, ${totalBytes} bytes (${summary})`);
  if (updated.length) log(`updated ${updated.length} hash(es): ${updated.join(', ')}`);
  return { manifest, updated };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verify({ update: process.argv.includes('--update') });
  } catch (error) {
    console.error(`verify failed: ${error.message}`);
    process.exitCode = 1;
  }
}
