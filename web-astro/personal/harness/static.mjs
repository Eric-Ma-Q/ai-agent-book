// Dev-only Connect middleware that serves the read-only Harness archive under
// /harness/site/ and the floating-nav script under /harness/nav.js. Path
// traversal, dot files and directory listings are rejected; HTML responses get
// one deferred nav script injected at the last </body>.
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.py', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.pdf', 'application/pdf'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
]);

const NAV_MARKER = 'data-harness-nav';
const escapeAttr = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const NAV_TAG = (base, options = {}) => {
  const { interview = false, homeHref, homeLabel, homeShort, homeIcon, readerLabel } = options;
  const extra = [
    homeHref === undefined ? '' : ` data-home-href="${escapeAttr(homeHref)}"`,
    homeLabel === undefined ? '' : ` data-home-label="${escapeAttr(homeLabel)}"`,
    homeShort === undefined ? '' : ` data-home-short="${escapeAttr(homeShort)}"`,
    homeIcon === undefined ? '' : ` data-home-icon="${escapeAttr(homeIcon)}"`,
    readerLabel === undefined ? '' : ` data-reader-label="${escapeAttr(readerLabel)}"`,
  ].join('');
  return `<script src="${base}harness/nav.js" data-harness-nav data-base="${base}"${interview ? ' data-interview="1"' : ''}${extra} defer></script>`;
};
const FAVORITES_MARKER = 'data-exam-favorites';
const PROGRESS_MARKER = 'data-exam-progress';
const ASSISTANT_MARKER = 'data-page-assistant';

function contentType(file) {
  return CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body === undefined || res.req?.method === 'HEAD') res.end();
  else res.end(body);
}

function plain(res, status, message, extra = {}) {
  const body = Buffer.from(`${message}\n`, 'utf8');
  send(res, status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }, body);
}

function decodeRelative(encoded) {
  let decoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return { error: 400 };
  }
  if (!decoded) return { error: 404 };
  if (decoded.includes('\0') || decoded.includes('\\')) return { error: 404 };
  if (path.isAbsolute(decoded)) return { error: 404 };
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return { error: 404 };
    if (segment.startsWith('.')) return { error: 404 };
  }
  return { relative: decoded };
}

function parseRange(header, size) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return { error: 416 };
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { error: 416 };
  if (start > end || start >= size) return { error: 416 };
  return { start, end: Math.min(end, size - 1) };
}

/**
 * @param {string} html
 * @param {string} base
 * @param {boolean | { interview?: boolean, homeHref?: string, homeLabel?: string,
 *   homeShort?: string, homeIcon?: string, readerLabel?: string }} [interviewOrOptions]
 * @returns {string}
 */
function injectNav(html, base, interviewOrOptions = false) {
  if (html.includes(NAV_MARKER)) return html;
  // Callers that predate the book exam pass a boolean; keep that call shape.
  const options = typeof interviewOrOptions === 'boolean'
    ? { interview: interviewOrOptions }
    : (interviewOrOptions ?? {});
  const tag = NAV_TAG(base, options);
  const index = html.lastIndexOf('</body>');
  if (index === -1) return `${html}${tag}\n`;
  return `${html.slice(0, index)}${tag}\n${html.slice(index)}`;
}

// The exam pages stay byte-identical to the source; the favorites UI is added
// at response time. `exam` is undefined for every other page, which leaves the
// HTML untouched. The book A/B endpoint passes a custom favoritesHref so its
// pages can link back to the shared favorites page.
function injectExamFavorites(html, { exam, src, favoritesHref } = {}) {
  if (!exam || !src || html.includes(FAVORITES_MARKER)) return html;
  const href = favoritesHref ? ` data-favorites-href="${favoritesHref}"` : '';
  const tag = `<script src="${src}" data-exam-favorites data-exam="${exam}"${href} defer></script>`;
  const index = html.lastIndexOf('</body>');
  if (index === -1) return `${html}${tag}\n`;
  return `${html.slice(0, index)}${tag}\n${html.slice(index)}`;
}

// Requirement 008: the server-backed progress script gets its own tag. It is
// injected before the favorites script so the page-level wrappers compose in a
// stable order.
function injectExamProgress(html, { exam, src } = {}) {
  if (!exam || !src || html.includes(PROGRESS_MARKER)) return html;
  const tag = `<script src="${src}" data-exam-progress data-exam="${exam}" defer></script>`;
  const index = html.lastIndexOf('</body>');
  if (index === -1) return `${html}${tag}\n`;
  return `${html.slice(0, index)}${tag}\n${html.slice(index)}`;
}

// Requirement 016: the floating page assistant is a Vite module (dev-only, like
// the rest of the personal extension). Only HTML gets the tag; archive files are
// never modified on disk.
function injectPageAssistant(html, { src } = {}) {
  if (!src || html.includes(ASSISTANT_MARKER)) return html;
  const tag = `<script type="module" src="${src}" ${ASSISTANT_MARKER}></script>`;
  const index = html.lastIndexOf('</body>');
  if (index === -1) return `${html}${tag}\n`;
  return `${html.slice(0, index)}${tag}\n${html.slice(index)}`;
}

export function createHarnessStatic({
  root,
  navFile,
  base = '/',
  log = console,
  sitePrefix = '/harness/site/',
  navPath = '/harness/nav.js',
  examFavoritesFile,
  examFavoritesPath = '/harness/exam-favorites.js',
  examProgressFile,
  examProgressPath = '/harness/exam-progress.js',
  assistantPath = '/personal/client/page-assistant.ts',
  examPages = {
    'harness-exam.html': 'harness',
    'ai-pm-exam.html': 'ai-pm',
  },
} = {}) {
  if (!root) throw new Error('createHarnessStatic requires a root');
  if (!navFile) throw new Error('createHarnessStatic requires a navFile');
  const rootReal = realpath(path.resolve(root));
  const navReal = realpath(path.resolve(navFile));
  const favoritesReal = examFavoritesFile ? realpath(path.resolve(examFavoritesFile)) : null;
  const progressReal = examProgressFile ? realpath(path.resolve(examProgressFile)) : null;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const prefix = normalizedBase === '/' ? sitePrefix : `${normalizedBase.slice(0, -1)}${sitePrefix}`;
  const navUrl = normalizedBase === '/' ? navPath : `${normalizedBase.slice(0, -1)}${navPath}`;
  const favoritesUrl = examFavoritesFile
    ? normalizedBase === '/'
      ? examFavoritesPath
      : `${normalizedBase.slice(0, -1)}${examFavoritesPath}`
    : null;
  const progressUrl = examProgressFile
    ? normalizedBase === '/'
      ? examProgressPath
      : `${normalizedBase.slice(0, -1)}${examProgressPath}`
    : null;
  const assistantUrl = normalizedBase === '/'
    ? assistantPath
    : `${normalizedBase.slice(0, -1)}${assistantPath}`;

  async function serveFile(req, res, file, exam) {
    const info = await stat(file);
    if (!info.isFile()) {
      plain(res, 404, 'Not found');
      return;
    }
    const extension = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': contentType(file),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    if (extension === '.pptx') {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
    } else if (extension === '.pdf') {
      headers['Content-Disposition'] = `inline; filename="${path.basename(file)}"`;
    }

    if (extension === '.html' || extension === '.htm') {
      const source = await readFile(file);
      const withProgress = injectExamProgress(source.toString('utf8'), {
        exam,
        src: progressUrl,
      });
      const withFavorites = injectExamFavorites(withProgress, {
        exam,
        src: favoritesUrl,
      });
      const withAssistant = injectPageAssistant(withFavorites, { src: assistantUrl });
      const body = Buffer.from(injectNav(withAssistant, normalizedBase, exam === 'ai-pm'), 'utf8');
      headers['Content-Length'] = body.length;
      send(res, 200, headers, body);
      return;
    }

    const range = req.headers.range;
    if (range) {
      const parsed = parseRange(range, info.size);
      if (parsed.error) {
        plain(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${info.size}` });
        return;
      }
      const { start, end } = parsed;
      headers['Content-Length'] = end - start + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = createReadStream(file, { start, end });
      stream.on('error', (error) => {
        log?.error?.(`harness static: read failed: ${error.message}`);
        res.destroy();
      });
      stream.pipe(res);
      return;
    }

    headers['Content-Length'] = info.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', (error) => {
      log?.error?.(`harness static: read failed: ${error.message}`);
      res.destroy();
    });
    stream.pipe(res);
  }

  async function handle(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let pathname;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      plain(res, 400, 'Bad Request');
      return;
    }

    if (pathname === navUrl) {
      const body = await readFile(await navReal);
      send(res, 200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      }, body);
      return;
    }

    if (favoritesUrl && pathname === favoritesUrl) {
      await serveFile(req, res, await favoritesReal);
      return;
    }

    if (progressUrl && pathname === progressUrl) {
      await serveFile(req, res, await progressReal);
      return;
    }

    if (!pathname.startsWith(prefix)) {
      next();
      return;
    }

    const decoded = decodeRelative(pathname.slice(prefix.length));
    if (decoded.error) {
      plain(res, decoded.error, decoded.error === 400 ? 'Bad Request' : 'Not found');
      return;
    }
    const exam = examPages[decoded.relative];

    let file;
    try {
      const rootDir = await rootReal;
      file = await realpath(path.join(rootDir, decoded.relative));
      if (!file.startsWith(`${rootDir}${path.sep}`)) {
        plain(res, 404, 'Not found');
        return;
      }
    } catch {
      plain(res, 404, 'Not found');
      return;
    }

    try {
      await serveFile(req, res, file, exam);
    } catch (error) {
      log?.error?.(`harness static: ${req.method} ${pathname} failed: ${error.message}`);
      if (!res.headersSent) plain(res, 500, 'Internal Server Error');
      else res.destroy(error);
    }
  }

  return (req, res, next) => {
    handle(req, res, next).catch((error) => {
      log?.error?.(`harness static: ${req.method} ${req.url} failed: ${error.message}`);
      if (!res.headersSent) plain(res, 500, 'Internal Server Error');
      else res.destroy(error);
    });
  };
}

export { CONTENT_TYPES, injectExamFavorites, injectExamProgress, injectNav, injectPageAssistant };
