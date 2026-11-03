// Dev-only Astro integration: stores highlights, notes and inserted passages
// as files under <repo>/personal/ instead of browser storage. Production builds
// are untouched, so `npm run build` and the upstream deploy behave as before.
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { createPersonalApi } from './api.mjs';
import { editionStubs, parseEditions } from './editions.mjs';
import { createLabProxy } from './lab-proxy.mjs';
import { createHarnessStatic } from './harness/static.mjs';
import { personalRoot } from './paths.mjs';
import {
  BOOK_EXAM_PATH,
  HARNESS_FAVORITES_PATH,
  HARNESS_LIBRARY_PATH,
  HARNESS_PATH,
  HIGHLIGHTS_PATH,
  LAB_PATH,
  MINI_HARNESS_PATH,
  SELFLOOP_PATH,
  SETTINGS_PATH,
  INTERVIEW_PATH,
  INTERVIEW_GUIDE_PATH,
} from './routes.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const ROOT = personalRoot();
const CLIENT_STORE = here('./client/highlight-store.ts');
const CLIENT_INSERTS = here('./client/inserts.ts');
const CLIENT_ANNOTATIONS = here('./client/annotations.ts');
const CLIENT_FONTS = here('./client/fonts.css');
const CLIENT_SECURE_CONTEXT = here('./client/secure-context.ts');
const CLIENT_ENTRY = here('./client/highlights-entry.ts');
const CLIENT_JUMP = here('./client/highlights-jump.ts');
// Requirement 016: global floating page assistant on every Astro page. Harness
// archive HTML gets the same module injected by static.mjs.
const CLIENT_PAGE_ASSISTANT = here('./client/page-assistant.ts');
// Requirement 023: turn repository filenames in the prose into preview links.
const CLIENT_FILE_PREVIEW = here('./client/file-preview.ts');
const HIGHLIGHTS_PAGE = here('./pages/highlights.astro');
// Agent lab (requirement 001): page, header entrance, citation jump, API proxy.
const LAB_PAGE = here('./pages/lab.astro');
const CLIENT_LAB_ENTRY = here('./client/lab-entry.ts');
const CLIENT_QUOTE_JUMP = here('./client/quote-jump.ts');
// Requirement 029: global settings page; model profiles are edited here instead
// of inside the lab.
const SETTINGS_PAGE = here('./pages/settings.astro');
const CLIENT_SETTINGS_ENTRY = here('./client/settings-entry.ts');
// Harness archive (requirement 006): directory page, library, header entrance,
// read-only static archive and the floating return nav. Requirement 007 adds
// the favorites page, and the favorites + progress scripts injected into the two
// exam pages.
const HARNESS_PAGE = here('./pages/harness.astro');
const HARNESS_LIBRARY_PAGE = here('./pages/harness-library.astro');
const HARNESS_FAVORITES_PAGE = here('./pages/harness-favorites.astro');
// Requirement 009: browser-side mini-harness workbench. Dev-only page, no API
// and no new data; the simulator lives in harness/mini-harness/engine.mjs.
const MINI_HARNESS_PAGE = here('./pages/mini-harness.astro');
// Requirement 014: browser-side SelfLoop workbench. Dev-only page, no API and no
// disk writes; the simulator lives in harness/selfloop/engine.mjs.
const SELFLOOP_PAGE = here('./pages/selfloop.astro');
// Requirement 013: AI PM mock interview. Dev-only page; sessions live under
// personal/harness/interview/ and model calls go through the existing proxy.
const INTERVIEW_PAGE = here('./pages/interview.astro');
// Requirement 034: interview and resume guide. Static content, no data, no model
// calls; the builder only joins strings in the browser.
const INTERVIEW_GUIDE_PAGE = here('./pages/interview-guide.astro');
// Requirement 010: book exam landing page and the A/B paper endpoint.
const BOOK_EXAM_PAGE = here('./pages/book-exam.astro');
const BOOK_EXAM_PAPER_PAGE = here('./pages/book-exam/[paper].ts');
const CLIENT_HARNESS_ENTRY = here('./client/harness-entry.ts');
const CLIENT_BOOK_EXAM_ENTRY = here('./client/book-exam-entry.ts');
// Group the four personal header entries under two overbrace labels.
const CLIENT_HEADER_GROUPS = here('./client/header-entry-groups.ts');
const HARNESS_ARCHIVE = here('./harness/archive/');
const HARNESS_NAV = here('./harness/nav.js');
const HARNESS_EXAM_FAVORITES = here('./harness/exam-favorites.js');
const HARNESS_EXAM_PROGRESS = here('./harness/exam-progress.js');
const BOOK_ROOT = here('../../');
// Book directories compiled in full; `PERSONAL_EDITIONS=all` restores every edition.
const KEEP_EDITIONS = parseEditions(process.env.PERSONAL_EDITIONS);
const STUB_NOTICE =
  '本地阅读器只编译中文版以加快加载，此版本仅保留章节标题。要阅读全文，请在 LaunchAgent 中设置 PERSONAL_EDITIONS=all 并重启服务。';

async function createRenderer() {
  const processor = unified({
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false }]],
  });
  const renderer = await processor.createRenderer({
    shikiConfig: { theme: 'github-dark' },
  });
  return async (markdown) => (await renderer.render(markdown)).code;
}

// Swap the reader's IndexedDB store for the file-backed one, leaving the
// highlight UI itself unchanged.
function storeSwap() {
  return {
    name: 'personal-highlight-store',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/highlight-store(\.ts)?$/.test(source)) return null;
      if (importer.startsWith(here('./'))) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id.endsWith('/src/lib/highlight-store.ts') ? CLIENT_STORE : null;
    },
  };
}

export default function personal() {
  // Captured from the Astro config so the static archive works under ASTRO_BASE.
  let base = '/';
  return {
    name: 'personal-notes',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig, injectScript, injectRoute }) => {
        if (command !== 'dev') return;
        base = config.base ?? '/';
        const stubs = editionStubs({
          keep: KEEP_EDITIONS,
          cacheDir: here('../node_modules/.cache/personal-editions/'),
          notice: STUB_NOTICE,
        });
        updateConfig({ vite: { plugins: [storeSwap(), stubs] } });
        injectScript('page', `import ${JSON.stringify(CLIENT_SECURE_CONTEXT)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_INSERTS)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_ANNOTATIONS)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_ENTRY)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_JUMP)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_PAGE_ASSISTANT)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_FILE_PREVIEW)};`);
        injectRoute({ pattern: HIGHLIGHTS_PATH.slice(0, -1), entrypoint: HIGHLIGHTS_PAGE });
        injectScript('page', `import ${JSON.stringify(CLIENT_LAB_ENTRY)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_QUOTE_JUMP)};`);
        injectRoute({ pattern: LAB_PATH.slice(0, -1), entrypoint: LAB_PAGE });
        injectRoute({ pattern: SETTINGS_PATH.slice(0, -1), entrypoint: SETTINGS_PAGE });
        // Harness archive (requirement 006): directory page, library and header
        // entrance; the read-only archive itself is served by a middleware.
        injectScript('page', `import ${JSON.stringify(CLIENT_HARNESS_ENTRY)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_BOOK_EXAM_ENTRY)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_SETTINGS_ENTRY)};`);
        injectScript('page', `import ${JSON.stringify(CLIENT_HEADER_GROUPS)};`);
        injectRoute({ pattern: HARNESS_PATH.slice(0, -1), entrypoint: HARNESS_PAGE });
        injectRoute({
          pattern: HARNESS_LIBRARY_PATH.slice(0, -1),
          entrypoint: HARNESS_LIBRARY_PAGE,
        });
        injectRoute({
          pattern: HARNESS_FAVORITES_PATH.slice(0, -1),
          entrypoint: HARNESS_FAVORITES_PAGE,
        });
        injectRoute({ pattern: MINI_HARNESS_PATH.slice(0, -1), entrypoint: MINI_HARNESS_PAGE });
        injectRoute({ pattern: SELFLOOP_PATH.slice(0, -1), entrypoint: SELFLOOP_PAGE });
        injectRoute({ pattern: INTERVIEW_PATH.slice(0, -1), entrypoint: INTERVIEW_PAGE });
        injectRoute({ pattern: INTERVIEW_GUIDE_PATH.slice(0, -1), entrypoint: INTERVIEW_GUIDE_PAGE });
        injectRoute({ pattern: BOOK_EXAM_PATH.slice(0, -1), entrypoint: BOOK_EXAM_PAGE });
        injectRoute({ pattern: `${BOOK_EXAM_PATH.slice(0, -1)}/[paper]`, entrypoint: BOOK_EXAM_PAPER_PAGE });
        // page-ssr puts the CSS in <head>, so text never flashes in the old font.
        injectScript('page-ssr', `import ${JSON.stringify(CLIENT_FONTS)};`);
      },
      'astro:server:setup': async ({ server, logger }) => {
        const render = await createRenderer();
        server.middlewares.use(createPersonalApi({ root: ROOT, render, bookRoot: BOOK_ROOT, log: logger }));
        server.middlewares.use(createLabProxy({ log: logger }));
        server.middlewares.use(
          createHarnessStatic({
            root: HARNESS_ARCHIVE,
            navFile: HARNESS_NAV,
            examFavoritesFile: HARNESS_EXAM_FAVORITES,
            examProgressFile: HARNESS_EXAM_PROGRESS,
            base,
            log: logger,
          }),
        );
        logger.info(`personal notes and inserts are stored in ${ROOT}`);
      },
    },
  };
}
