// Reading annotations: short glosses (terms, sources, people, updates) attached
// to exact phrases of a chapter. They are curated as JSON files in the repo and
// only read by the reader, so a malformed entry is dropped instead of failing
// the whole chapter.
import { existsSync, readFileSync } from 'node:fs';
import { annotationsFile, PersonalError } from './paths.mjs';

export const ANNOTATIONS_FORMAT = 'ai-agent-book-annotations';
export const ANNOTATION_KINDS = ['term', 'ref', 'entity', 'update', 'extend'];
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const URL_PATTERN = /^https?:\/\/[^\s"'<>]+$/;

const text = (value, max) => (typeof value === 'string' && value.trim() && value.length <= max ? value : null);

function cleanSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source) => {
    const title = text(source?.title, 300);
    const url = typeof source?.url === 'string' && URL_PATTERN.test(source.url) ? source.url : null;
    return title && url ? [{ title, url }] : [];
  });
}

export function cleanAnnotation(item) {
  const id = typeof item?.id === 'string' && ID.test(item.id) ? item.id : null;
  const quote = text(item?.quote, 200);
  const title = text(item?.title, 200);
  const body = text(item?.body, 4000);
  if (!id || !quote || !title || !body || !ANNOTATION_KINDS.includes(item.kind)) return null;
  const context = text(item.context, 400);
  return {
    id,
    quote,
    ...(context && context.includes(quote) ? { context } : {}),
    kind: item.kind,
    title,
    body,
    sources: cleanSources(item.sources),
  };
}

export function readAnnotations(root, key) {
  const file = annotationsFile(root, key);
  if (!existsSync(file)) return [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new PersonalError(500, `Annotations file is not valid JSON: ${file}: ${error.message}`);
  }
  if (data?.format !== ANNOTATIONS_FORMAT || !Array.isArray(data.annotations))
    throw new PersonalError(500, `Annotations file has an unexpected format: ${file}`);
  return data.annotations.map(cleanAnnotation).filter(Boolean);
}
