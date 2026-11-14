import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { PersonalError } from './paths.mjs';

export function readJson(file, fallback) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PersonalError(500, `Corrupt JSON in ${file}; fix or remove it.`);
  }
}

// Write to a sibling temp file and rename, so a crash never leaves half a file.
export function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

export function writeJson(file, value) {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function removeFile(file) {
  rmSync(file, { force: true });
}
