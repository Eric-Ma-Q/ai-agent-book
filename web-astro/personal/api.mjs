// Connect-style middleware for the dev server. Responses use one envelope:
// { ok: true, data } or { ok: false, error }.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchNote, putNotes, readNotes, removeNote } from './notes-store.mjs';
import { listInserts, removeInsert, saveInsert } from './inserts-store.mjs';
import { listAllHighlights } from './highlights-index.mjs';
import { readAnnotations } from './annotations-store.mjs';
import { readExamFavorites, setExamFavorite } from './harness/favorites-store.mjs';
import { readExamProgress, saveExamProgress } from './harness/exam-progress-store.mjs';
import {
  createInterviewSession,
  deleteInterviewSession,
  listInterviewSessions,
  readAllInterviewSessions,
  readInterviewSession,
  saveInterviewSession,
} from './harness/interview-store.mjs';
import { buildCandidateProfile, buildInterviewPlan, normalizeSettings } from './harness/interview-profile.mjs';
import { readExamQuestions } from './harness/questions.mjs';
import { createFilesStore } from './files-store.mjs';
import { createUpdateCenter } from './update.mjs';
import { PersonalError } from './paths.mjs';

export const API_PREFIX = '/__personal';
// A custom header forces a CORS preflight, which this API never answers, so
// other websites open in the browser cannot write into the user's files.
export const API_HEADER = 'x-personal-api';
// Exam progress arrives as one store snapshot; 30 attempts can approach 1 MB.
const MAX_BODY = 4 * 1024 * 1024;
const MAX_RENDER_CACHE = 2000;
// Interview requests are one session snapshot; the browser never sends files.
const MAX_INTERVIEW_BODY = 1024 * 1024;
const ARCHIVE_ROOT = fileURLToPath(new URL('./harness/archive/', import.meta.url));
const EXAMS_ROOT = fileURLToPath(new URL('./exams/', import.meta.url));
let aiPmQuestions;

function interviewQuestions() {
  aiPmQuestions ??= readExamQuestions(ARCHIVE_ROOT, { bookRoot: EXAMS_ROOT }).filter(
    (question) => question.exam === 'ai-pm',
  );
  return aiPmQuestions;
}

function interviewProfile(root, resumeSignals) {
  const examProgress = readExamProgress(root, 'ai-pm');
  const { sessions } = readAllInterviewSessions(root);
  return buildCandidateProfile({
    examProgress,
    questions: interviewQuestions(),
    pastSessions: sessions.filter((session) => session.status === 'finished'),
    resumeSignals,
  });
}

function assertInterviewBody(body) {
  const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (bytes > MAX_INTERVIEW_BODY) {
    throw new PersonalError(413, `面试请求 ${bytes} 字节；上限是 ${MAX_INTERVIEW_BODY}，请缩短简历摘要。`);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new PersonalError(413, 'Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new PersonalError(400, 'Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

// `bookRoot` (the repo root) lets the all-highlights listing name each section.
// The update center (requirement 031) is created once per API instance; tests
// can pass their own instance or the low-level implementations.
export function createPersonalApi({
  root,
  render,
  bookRoot,
  log = console,
  update,
  env = process.env,
  fetchImpl,
  fsImpl,
  spawnImpl,
  now,
}) {
  const updateCenter =
    update ??
    createUpdateCenter({
      root: bookRoot ?? dirname(root),
      env,
      fetchImpl,
      fsImpl,
      spawnImpl,
      now,
      log,
    });
  const files = bookRoot ? createFilesStore({ bookRoot, log }) : null;
  const fileStore = () => {
    if (!files) throw new PersonalError(500, 'File preview needs bookRoot');
    return files;
  };
  const withHtml = async (insert) => ({ ...insert, html: await render(insert.markdown) });
  // Annotation bodies rarely change, and a chapter has dozens of them.
  const rendered = new Map();
  const renderOnce = async (markdown) => {
    if (!rendered.has(markdown)) {
      if (rendered.size >= MAX_RENDER_CACHE) rendered.clear();
      rendered.set(markdown, await render(markdown));
    }
    return rendered.get(markdown);
  };
  const annotationWithHtml = async (item) => ({ ...item, html: await renderOnce(item.body) });

  const routes = {
    'GET /highlights': () => listAllHighlights(root, bookRoot),
    'GET /notes': (_body, query) => readNotes(root, query.get('chapter')),
    'POST /notes/put': (body) => putNotes(root, body.chapter, body.items, body.remove),
    'POST /notes/patch': (body) => patchNote(root, body.chapter, body.id, body.patch),
    'POST /notes/remove': (body) => removeNote(root, body.chapter, body.id) ?? null,
    'GET /inserts': (_body, query) =>
      Promise.all(listInserts(root, query.get('chapter')).map(withHtml)),
    'POST /inserts/save': (body) => withHtml(saveInsert(root, body.chapter, body.insert)),
    'POST /inserts/remove': (body) => removeInsert(root, body.chapter, body.id) ?? null,
    'GET /annotations': (_body, query) =>
      Promise.all(readAnnotations(root, query.get('chapter')).map(annotationWithHtml)),
    // Persistent favorites for the two archived question banks (requirement 007).
    'GET /exam-favorites': () => readExamFavorites(root),
    'POST /exam-favorites/set': (body) => setExamFavorite(root, body),
    // Server-side draft, attempts and wrong book for the two exam pages.
    'GET /exam-progress': (_body, query) => readExamProgress(root, query.get('exam')),
    'POST /exam-progress/save': (body) => {
      if (body.cleared !== undefined && typeof body.cleared !== 'boolean')
        throw new PersonalError(400, 'cleared must be a boolean');
      return saveExamProgress(root, body.exam, body.store, { cleared: body.cleared === true });
    },
    // Interview sessions (requirement 013). The reader owns the transcript;
    // the lab only returns one turn or one report at a time.
    'GET /interview/sessions': () => listInterviewSessions(root),
    'POST /interview/sessions': (body) => {
      assertInterviewBody(body);
      const profile = interviewProfile(root, body.resumeSignals);
      let settings;
      try {
        settings = normalizeSettings(body.settings ?? {}, profile);
      } catch (error) {
        throw new PersonalError(400, error instanceof Error ? error.message : String(error));
      }
      const plan = buildInterviewPlan(settings, profile);
      return createInterviewSession(root, { settings, profile, plan });
    },
    'GET /interview/session': (_body, query) => readInterviewSession(root, query.get('id')),
    'POST /interview/session/save': (body) => {
      assertInterviewBody(body);
      const { id, ...patch } = body;
      return saveInterviewSession(root, id, patch);
    },
    'POST /interview/session/delete': (body) => deleteInterviewSession(root, body.id),
    // Read-only repository files for requirement 023. Paths are resolved by the
    // store, never joined here; blob responses bypass the JSON envelope.
    'POST /files/resolve': (body) => fileStore().resolve(body.names, { page: body.page, chapter: body.chapter }),
    'GET /files/read': (_body, query) => fileStore().read(query.get('path')),
    'GET /files/blob': (_body, query) => fileStore().blob(query.get('path')),
    // Update center (requirement 031). GET must not touch the network; check is
    // always an explicit refresh; apply authenticates with a header and answers
    // 202 because the script keeps running in the background.
    'GET /update/status': () => updateCenter.status(),
    'POST /update/check': () => updateCenter.check({ force: true }),
    'POST /update/apply': async (_body, _query, headers) => ({
      __status: 202,
      data: await updateCenter.apply({ token: headers?.['x-update-token'] }),
    }),
  };

  return async function personalApi(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) return next();
    const route = routes[`${req.method} ${url.pathname.slice(API_PREFIX.length)}`];
    try {
      if (!route) throw new PersonalError(404, 'Unknown personal API route');
      if (req.headers[API_HEADER] !== '1')
        throw new PersonalError(403, `Missing ${API_HEADER} header`);
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json'))
        throw new PersonalError(415, 'Use application/json');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const data = await route(body, url.searchParams, req.headers);
      // Routes that need a non-200 success code (apply returns 202) opt in with
      // this envelope; everything else keeps the plain 200 JSON envelope.
      if (data?.__status) {
        send(res, data.__status, { ok: true, data: data.data ?? null });
        return;
      }
      if (data?.__blob) {
        const name = data.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
        res.statusCode = 200;
        res.setHeader('content-type', data.mime);
        res.setHeader('content-length', String(data.size));
        res.setHeader(
          'content-disposition',
          `${data.disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(data.fileName)}`,
        );
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('cache-control', 'no-store');
        res.end(data.buffer);
        return;
      }
      send(res, 200, { ok: true, data: data ?? null });
    } catch (error) {
      const status = error instanceof PersonalError ? error.status : 500;
      if (status >= 500)
        log.error(`${req.method} ${url.pathname} failed: ${error?.stack ?? error}`);
      send(res, status, {
        ok: false,
        error: status >= 500 && !(error instanceof PersonalError)
          ? 'Could not access local files; see the dev server log.'
          : error.message,
      });
    }
  };
}
