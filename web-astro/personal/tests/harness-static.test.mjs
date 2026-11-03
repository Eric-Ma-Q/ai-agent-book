// Requirement 006, step 2: the archive middleware serves the migrated files,
// injects the return nav exactly once and refuses anything outside the root.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createHarnessStatic,
  injectExamFavorites,
  injectExamProgress,
} from '../harness/static.mjs';

let root;
let outside;
let server;
let base;
const errors = [];

const HTML = '<!doctype html><html><body><h1>Harness</h1></body></html>';

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'harness-static-'));
  outside = await mkdtemp(path.join(tmpdir(), 'harness-outside-'));
  await writeFile(path.join(outside, 'secret.txt'), 'SECRET');

  await writeFile(path.join(root, 'page.html'), HTML);
  await writeFile(path.join(root, 'harness-exam.html'), HTML);
  await writeFile(path.join(root, 'ai-pm-exam.html'), HTML);
  await writeFile(path.join(root, 'pre-injected.html'), `${HTML}${HTML.replace('</body>', '<script data-harness-nav></script></body>')}`);
  await writeFile(path.join(root, 'no-body.html'), '<p>fragment</p>');
  await writeFile(path.join(root, 'notes.md'), '# Notes\n');
  await writeFile(path.join(root, 'data.json'), '{"ok":true}');
  await writeFile(path.join(root, 'app.js'), 'console.log(1);');
  await writeFile(path.join(root, 'style.css'), 'body{}');
  await writeFile(path.join(root, 'icon.svg'), '<svg/>');
  await writeFile(path.join(root, 'slides.pptx'), 'zip');
  await writeFile(path.join(root, 'doc.pdf'), '0123456789');
  await writeFile(path.join(root, 'blob.bin'), 'bin');
  await writeFile(path.join(root, '.hidden'), 'nope');
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'sub', '.env'), 'nope');
  await writeFile(path.join(root, 'sub', '中文 文件.txt'), 'hello');
  await writeFile(path.join(root, 'sub', 'harness-exam.html'), HTML);
  await mkdir(path.join(root, 'dir'));
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));

  const navFile = path.join(root, 'nav.js');
  await writeFile(navFile, '/*nav*/');
  const favoritesFile = path.join(root, 'exam-favorites.js');
  await writeFile(favoritesFile, '/*favorites*/');
  const progressFile = path.join(root, 'exam-progress.js');
  await writeFile(progressFile, '/*progress*/');

  const middleware = createHarnessStatic({
    root,
    navFile,
    examFavoritesFile: favoritesFile,
    examProgressFile: progressFile,
    log: { error: (message) => errors.push(message) },
  });
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418;
      res.end('next');
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const site = (pathname) => `${base}/harness/site/${pathname}`;

test('serves HTML with the nav injected exactly once', async () => {
  const response = await fetch(site('page.html'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  const body = await response.text();
  assert.equal(body.match(/data-harness-nav/g).length, 1);
  assert.equal(body.match(/data-page-assistant/g).length, 1);
  assert.match(body, /<script type="module" src="\/personal\/client\/page-assistant\.ts" data-page-assistant><\/script>/);
  assert.match(body, /<script src="\/harness\/nav\.js" data-harness-nav data-base="\/" defer><\/script>/);
  assert.ok(body.indexOf('data-harness-nav') > body.indexOf('<h1>Harness</h1>'));
  assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(body));
});

test('does not inject twice and appends when there is no body tag', async () => {
  const twice = await (await fetch(site('pre-injected.html'))).text();
  assert.equal(twice.match(/data-harness-nav/g).length, 1);
  const fragment = await (await fetch(site('no-body.html'))).text();
  assert.equal(fragment.match(/data-harness-nav/g).length, 1);
  assert.ok(fragment.endsWith('defer></script>\n'));
});

test('HEAD returns headers without a body', async () => {
  const response = await fetch(site('page.html'), { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get('content-length')) > 0);
  assert.equal(await response.text(), '');
});

test('serves text, data, script, image and PDF types', async () => {
  const cases = [
    ['notes.md', 'text/plain; charset=utf-8'],
    ['data.json', 'application/json; charset=utf-8'],
    ['app.js', 'application/javascript; charset=utf-8'],
    ['style.css', 'text/css; charset=utf-8'],
    ['icon.svg', 'image/svg+xml'],
    ['blob.bin', 'application/octet-stream'],
    ['doc.pdf', 'application/pdf'],
  ];
  for (const [file, type] of cases) {
    const response = await fetch(site(file));
    assert.equal(response.status, 200, file);
    assert.equal(response.headers.get('content-type'), type, file);
    assert.doesNotMatch(response.headers.get('content-disposition') ?? '', /attachment/, file);
  }
  const pptx = await fetch(site('slides.pptx'));
  assert.equal(pptx.status, 200);
  assert.match(pptx.headers.get('content-disposition') ?? '', /^attachment; filename="slides\.pptx"$/);
});

test('serves the nav script and only accepts GET or HEAD', async () => {
  const nav = await fetch(`${base}/harness/nav.js`);
  assert.equal(nav.status, 200);
  assert.equal(nav.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(await nav.text(), '/*nav*/');

  const post = await fetch(site('page.html'), { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('serves percent-encoded Chinese and space file names', async () => {
  const response = await fetch(site(`sub/${encodeURIComponent('中文 文件.txt')}`));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'hello');
});

test('rejects dot files, traversal, null bytes and directories', async () => {
  // Dot files, directories and unknown names stay inside the middleware and get
  // a plain 404. Encoded dot segments are normalized away by the URL parser
  // before the middleware sees them, so those fall through to the next handler
  // (418 in this test); either way they must never expose the outside file.
  const notFound = ['.hidden', 'sub/.env', 'page.html%00.txt', 'dir', 'dir/', '', 'escape.txt', 'missing.txt'];
  for (const pathname of notFound) {
    const response = await fetch(site(pathname));
    assert.equal(response.status, 404, pathname);
  }
  const traversal = ['%2e%2e/secret.txt', '%2e%2e%2fsecret.txt', 'sub%2f..%2f..%2fsecret.txt'];
  for (const pathname of traversal) {
    const response = await fetch(site(pathname));
    assert.ok([404, 418].includes(response.status), `${pathname}: ${response.status}`);
    assert.doesNotMatch(await response.text(), /SECRET/);
  }
  const malformed = await fetch(`${base}/harness/site/%E0%A4%A`);
  assert.equal(malformed.status, 400);
});

test('supports a single byte range and rejects anything else', async () => {
  const partial = await fetch(site('doc.pdf'), { headers: { Range: 'bytes=2-5' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(partial.headers.get('content-length'), '4');
  assert.equal(await partial.text(), '2345');

  const open = await fetch(site('doc.pdf'), { headers: { Range: 'bytes=8-' } });
  assert.equal(open.status, 206);
  assert.equal(await open.text(), '89');

  for (const range of ['bytes=20-30', 'bytes=5-2', 'bytes=0-1,3-4', 'items=0-1']) {
    const response = await fetch(site('doc.pdf'), { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), 'bytes */10', range);
  }
});

test('leaves other paths to the next middleware', async () => {
  for (const pathname of ['/harness/', '/harness/library/', '/api/notes', '/harness/nav.js.map']) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 418, pathname);
  }
});

test('reports an unreadable file as 500 without leaking details', async () => {
  if (process.getuid?.() === 0) return; // root ignores the permission bits
  const locked = path.join(root, 'locked.html');
  await writeFile(locked, HTML);
  await chmod(locked, 0o000);
  try {
    const response = await fetch(site('locked.html'));
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'Internal Server Error\n');
    assert.ok(errors.some((message) => message.includes('locked.html')));
  } finally {
    await chmod(locked, 0o644);
  }
});

test('injects the favorites script only into the two exam pages', async () => {
  const harness = await fetch(site('harness-exam.html'));
  const harnessBody = await harness.text();
  assert.equal(harness.status, 200);
  assert.match(
    harnessBody,
    /<script src="\/harness\/exam-favorites\.js" data-exam-favorites data-exam="harness" defer><\/script>/,
  );
  assert.ok(harnessBody.indexOf('data-exam-favorites') < harnessBody.indexOf('data-harness-nav'));

  const pmBody = await (await fetch(site('ai-pm-exam.html'))).text();
  assert.match(pmBody, /data-exam-favorites data-exam="ai-pm"/);

  for (const page of ['page.html', 'pre-injected.html', 'sub/harness-exam.html']) {
    const body = await (await fetch(site(page))).text();
    assert.doesNotMatch(body, /data-exam-favorites/, page);
  }
});

test('marks only the AI PM exam page for the interview entry', async () => {
  const pm = await (await fetch(site('ai-pm-exam.html'))).text();
  assert.match(pm, /data-harness-nav data-base="\/" data-interview="1" defer/);
  const harness = await (await fetch(site('harness-exam.html'))).text();
  assert.doesNotMatch(harness, /data-interview/);
  const plain = await (await fetch(site('page.html'))).text();
  assert.doesNotMatch(plain, /data-interview/);
});

test('injects the progress script before favorites and nav', async () => {
  for (const [page, exam] of [
    ['harness-exam.html', 'harness'],
    ['ai-pm-exam.html', 'ai-pm'],
  ]) {
    const body = await (await fetch(site(page))).text();
    assert.match(
      body,
      new RegExp(
        `<script src="/harness/exam-progress\\.js" data-exam-progress data-exam="${exam}" defer></script>`,
      ),
      page,
    );
    assert.ok(body.indexOf('data-exam-progress') < body.indexOf('data-exam-favorites'), page);
    assert.ok(body.indexOf('data-exam-favorites') < body.indexOf('data-harness-nav'), page);
  }
  for (const page of ['page.html', 'pre-injected.html', 'sub/harness-exam.html']) {
    const body = await (await fetch(site(page))).text();
    assert.doesNotMatch(body, /data-exam-progress/, page);
  }
});

test('serves the progress script without wrapping it as HTML', async () => {
  const response = await fetch(`${base}/harness/exam-progress.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(await response.text(), '/*progress*/');

  const head = await fetch(`${base}/harness/exam-progress.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('the progress injector handles base paths, fragments and duplicates', () => {
  const html = '<html><body><p>x</p></body></html>';
  const injected = injectExamProgress(html, {
    exam: 'harness',
    src: '/reader/harness/exam-progress.js',
  });
  assert.match(
    injected,
    /<script src="\/reader\/harness\/exam-progress\.js" data-exam-progress data-exam="harness" defer><\/script>/,
  );
  assert.ok(injected.indexOf('data-exam-progress') < injected.indexOf('</body>'));
  assert.equal(
    injectExamProgress(injected, {
      exam: 'harness',
      src: '/reader/harness/exam-progress.js',
    }),
    injected,
  );
  assert.equal(injectExamProgress(html, { exam: undefined, src: '/x' }), html);
  assert.equal(injectExamProgress(html, { exam: 'harness', src: undefined }), html);
  const fragment = injectExamProgress('<p>x</p>', { exam: 'ai-pm', src: '/x.js' });
  assert.ok(fragment.endsWith('</script>\n'));
});

test('serves the favorites script without wrapping it as HTML', async () => {
  const response = await fetch(`${base}/harness/exam-favorites.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(await response.text(), '/*favorites*/');

  const head = await fetch(`${base}/harness/exam-favorites.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('the favorites injector handles base paths, fragments and duplicates', () => {
  const html = '<html><body><p>x</p></body></html>';
  const injected = injectExamFavorites(html, {
    exam: 'harness',
    src: '/reader/harness/exam-favorites.js',
  });
  assert.match(
    injected,
    /<script src="\/reader\/harness\/exam-favorites\.js" data-exam-favorites data-exam="harness" defer><\/script>/,
  );
  assert.ok(injected.indexOf('data-exam-favorites') < injected.indexOf('</body>'));
  assert.equal(
    injectExamFavorites(injected, { exam: 'harness', src: '/reader/harness/exam-favorites.js' }),
    injected,
  );
  assert.equal(injectExamFavorites(html, { exam: undefined, src: '/x' }), html);
  assert.equal(injectExamFavorites(html, { exam: 'harness', src: undefined }), html);
  const fragment = injectExamFavorites('<p>x</p>', { exam: 'ai-pm', src: '/x.js' });
  assert.ok(fragment.endsWith('</script>\n'));
});

test('the favorites injector can point at a custom favorites page', () => {
  const injected = injectExamFavorites('<html><body></body></html>', {
    exam: 'book-a',
    src: '/harness/exam-favorites.js',
    favoritesHref: '/harness/favorites/',
  });
  assert.match(
    injected,
    /data-exam-favorites data-exam="book-a" data-favorites-href="\/harness\/favorites\/" defer/,
  );
});
