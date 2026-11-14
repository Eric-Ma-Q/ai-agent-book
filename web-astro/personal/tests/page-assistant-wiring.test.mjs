// Requirement 016 wiring: the assistant module is injected into Astro pages and
// into the read-only Harness archive without touching files on disk.
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectPageAssistant } from '../harness/static.mjs';

const HTML = '<!doctype html><html><body><h1>Harness</h1></body></html>';

test('integration injects the page assistant globally', async () => {
  const source = await readFile(new URL('../integration.mjs', import.meta.url), 'utf8');
  assert.match(source, /CLIENT_PAGE_ASSISTANT/);
  assert.match(source, /injectScript\('page', `import \$\{JSON\.stringify\(CLIENT_PAGE_ASSISTANT\)\};`\)/);
});

test('static archive injection is idempotent, module-based and base-aware', () => {
  const once = injectPageAssistant(HTML, { src: '/personal/client/page-assistant.ts' });
  assert.equal(once.match(/data-page-assistant/g).length, 1);
  assert.match(once, /<script type="module" src="\/personal\/client\/page-assistant\.ts" data-page-assistant><\/script>/);
  assert.ok(once.indexOf('data-page-assistant') < once.indexOf('</body>'));
  const twice = injectPageAssistant(once, { src: '/personal/client/page-assistant.ts' });
  assert.equal(twice, once);
  assert.equal(injectPageAssistant(HTML, {}), HTML);
  const base = injectPageAssistant(HTML, { src: '/reader/personal/client/page-assistant.ts' });
  assert.match(base, /src="\/reader\/personal\/client\/page-assistant\.ts"/);
});

test('fragment pages still get the assistant before the closing body or appended', () => {
  const fragment = injectPageAssistant('<p>fragment</p>', { src: '/personal/client/page-assistant.ts' });
  assert.ok(fragment.endsWith('</script>\n'));
  assert.match(fragment, /data-page-assistant/);
});

test('the assistant CSS defines the panel and respects reduced motion and print', async () => {
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  assert.match(css, /\.pa-panel/);
  assert.match(css, /\.pa-fab/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media print/);
  assert.match(css, /body:has\(\.personal-anno-toggle\)/);
  // Archive pages put their own theme button at right 20 / bottom 22; the
  // assistant entry must sit above it instead of swallowing the click.
  assert.match(css, /body:has\(#themeFab\) \.pa-root/);
  // The reader toolbar is fixed to the bottom edge at ≤1000px; the entry
  // must clear it instead of covering the sections/highlights/focus buttons.
  assert.match(css, /body:has\(\.reader-controls:not\(\[hidden\]\)\) \.pa-root/);
});

test('concept maps scroll horizontally and keep a readable relationship list', async () => {
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  const canvas = css.match(/\.pa-concept-canvas\s*\{[\s\S]*?\}/)[0];
  assert.match(canvas, /overflow-x:\s*auto/);
  assert.match(css, /\.pa-concept-note/);
  assert.match(css, /\.pa-concept-rel-title/);
  assert.match(css, /\.pa-concept-rel\b/);
  assert.match(css, /\.pa-concept-arrow--solid/);
  assert.match(css, /\.pa-concept-arrow--dashed/);
});

test('plain HTML pages can still hide the panel and keep readable colours', async () => {
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  // Archive pages and exam papers have no global [hidden] rule. Without this
  // guard their .pa-panel { display: flex } beats the browser's [hidden],
  // so the panel shows up on load and the close button cannot hide it.
  const hiddenGuard = css.match(/\.pa-root \[hidden\]\s*\{[^}]*\}/);
  assert.ok(hiddenGuard, 'expected a .pa-root [hidden] rule');
  assert.match(hiddenGuard[0], /display:\s*none\s*!important/);

  const rootRule = css.match(/\.pa-root\s*\{[\s\S]*?\}/)[0];
  // Reader-only variables get a fallback chain for the static archive pages,
  // which define --paper/--card/--ink-soft instead of --bg/--surface/--muted.
  for (const name of [
    '--bg',
    '--surface',
    '--ink',
    '--muted',
    '--line',
    '--accent',
    '--accent-ink',
    '--interactive',
    '--sans',
    '--serif',
  ]) {
    assert.match(rootRule, new RegExp(`var\\(${name}[,)]`), `missing fallback for ${name}`);
  }
  const rest = css.replace(rootRule, '');
  for (const name of ['--bg', '--surface', '--ink', '--muted', '--line', '--accent', '--accent-ink', '--sans', '--serif']) {
    assert.doesNotMatch(rest, new RegExp(`var\\(${name}\\)`), `unmapped ${name} outside .pa-root`);
  }
  assert.match(css, /\.pa-answer \.lab-diagram-svg svg/);
  assert.match(css, /\.pa-answer \.lab-diagram-svg \{\s*overflow:\s*hidden/);
  assert.match(css, /\.pa-answer \.lab-diagram-stage \{\s*width:\s*100%;\s*transform-origin:\s*0 0;/);
  assert.doesNotMatch(css, /\.lab-diagram-stage[^}]*transition/);
});

test('panel keeps archive-page element styles out of its chrome', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  // Archive pages write bare element rules such as `section{padding:64px 0}`
  // and `body{font:15px/1.85}`. The panel used to be a <section>, so those
  // rules left a 64px empty band at the top and shifted every header height.
  assert.match(entry, /const panel = el\('div', 'pa-panel'\)/);
  assert.match(entry, /const historyPanel = el\('div', 'pa-history'\)/);
  assert.match(entry, /const replayPanel = el\('div', 'pa-replay-panel'\)/);
  assert.doesNotMatch(entry, /el\('section', 'pa-/);

  const panelRule = css.match(/\.pa-panel\s*\{[\s\S]*?\n\}/)[0];
  assert.match(panelRule, /padding:\s*0;/);
  assert.match(panelRule, /font-size:\s*1rem;/);
  assert.match(panelRule, /line-height:\s*normal;/);
  // Buttons must not fall back to the browser's Arial on pages that style
  // `button` without a font, and anchors must not inherit the page underline.
  assert.match(css, /\.pa-panel button,[\s\S]*?font-family:\s*inherit/);
  assert.match(css, /\.pa-panel a\s*\{\s*border-bottom:\s*0/);

  // Answer blocks get the same treatment: archive pages also style bare h3,
  // blockquote and table/th/td, which changed heading size, quote font and
  // table width page by page.
  assert.match(css, /\.pa-answer h3\s*\{[^}]*font-size:\s*1\.17em/);
  assert.match(css, /\.pa-answer blockquote\s*\{[^}]*font-size:\s*inherit/);
  assert.match(css, /\.pa-answer table\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.pa-answer tr:last-child td\s*\{[^}]*border-bottom:\s*1px solid/);
  assert.match(css, /\.pa-answer pre\s*\{[^}]*white-space:\s*pre/);
});

test('diagram rendering loads the vendored mermaid build only from the assistant', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const diagram = await readFile(new URL('../client/page-assistant/diagram.ts', import.meta.url), 'utf8');
  const vendor = await readFile(new URL('../client/vendor/mermaid.min.js', import.meta.url), 'utf8');
  assert.match(entry, /hydrateMermaid\(view\.body\)/);
  assert.match(diagram, /securityLevel: 'strict'/);
  assert.match(diagram, /htmlLabels: false/);
  assert.doesNotMatch(diagram, /flowchart:\s*\{[^}]*htmlLabels/);
  assert.match(diagram, /vendor\/mermaid\.min\.js\?url/);
  assert.match(diagram, /attachDiagramView/);
  assert.match(diagram, /捏合放大，双指移动，双击复位/);
  assert.match(diagram, /适合窗口/);
  assert.ok(vendor.includes('globalThis["mermaid"]'));
  assert.ok(vendor.length > 1_000_000);
});

test('fullscreen keeps the same panel and does not depend on the Fullscreen API', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  // One panel node changes layout state; no dialog, window or route is opened.
  assert.doesNotMatch(entry, /requestFullscreen|showModal\(/);
  assert.match(entry, /panel\.animate\(/);
  assert.match(entry, /prefers-reduced-motion: reduce/);
  assert.match(entry, /aria-modal/);
  assert.match(entry, /pa-fullscreen/);
  assert.match(entry, /escapeAction\(event\.key, open, fullscreen, replayOpen \? 'replay' : 'chat'\)/);
  assert.match(entry, /scrollAnchor\(/);
  assert.match(entry, /scrollTopFor\(/);
  // The surface and its reading column are CSS-only targets for the morph.
  assert.match(css, /\.pa-panel--full\s*\{[\s\S]*?--pa-col:\s*820px/);
  assert.match(css, /--pa-col-pad:\s*max\(20px, calc\(\(100% - var\(--pa-col\)\) \/ 2\)\)/);
  assert.match(css, /\.pa-panel--full\s*\{[\s\S]*?width:\s*min\(1080px, calc\(100vw - 32px\)\)/);
  assert.match(css, /html\.pa-fullscreen/);
  assert.match(css, /\.pa-scrim/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.pa-panel--full[\s\S]*?height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.pa-expand-label[\s\S]*?display:\s*none/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.pa-subtitle[\s\S]*?display:\s*none/);
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g)?.join('\n') ?? '';
  assert.match(reduced, /\.pa-scrim/);
  assert.match(css, /@media print\s*\{\s*\.pa-root\s*\{\s*display:\s*none/);
});


test('composer keeps one stable input row and resets its height after sending', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  // Input and send share the first row; controls sit underneath. The old
  // five-row stack made the composer 166px tall in a 432px panel.
  assert.match(css, /\.pa-compose\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /grid-template-areas:[\s\S]*?'quick quick'[\s\S]*?'input actions'[\s\S]*?'settings settings'/);
  assert.match(css, /\.pa-quick\s*\{[\s\S]*?grid-area:\s*quick/);
  assert.match(css, /\.pa-quick\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(css, /\.pa-quick\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.pa-compose\s*\{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(css, /\.pa-input\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.pa-input\s*\{[\s\S]*?max-height:\s*min\(132px,\s*26dvh\)/);
  assert.match(css, /\.pa-input\s*\{[\s\S]*?box-sizing:\s*border-box/);
  assert.match(css, /\.pa-messages\s*\{[\s\S]*?min-height:\s*96px/);
  assert.match(css, /\.pa-foot\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(css, /@media \(max-height: 560px\)[\s\S]*?\.pa-panel:not\(\.pa-panel--full\) \.pa-input[\s\S]*?max-height:\s*64px/);
  assert.match(css, /@media \(max-height: 560px\)[\s\S]*?\.pa-panel:not\(\.pa-panel--full\) \.pa-seen[\s\S]*?display:\s*none/);
  // Quick prompts stay on one fixed row above the input so a later selection
  // still has its shortcuts without wrapping the composer.
  assert.match(entry, /const compose = el\('div', 'pa-compose', quick, textarea, actions, settings\)/);
  assert.doesNotMatch(entry, /empty\.append\([\s\S]*?quick,\s*\)/);
  // Sending clears the value and the stale inline height in the same step.
  assert.match(entry, /function clearInput\(\)/);
  assert.match(entry, /textarea\.value = '';\s*autoSizeInput\(\)/);
  assert.match(entry, /if \(!preset\) clearInput\(\)/);
  assert.match(entry, /sendButton\.hidden = busy/);
  assert.match(entry, /问这一页，或让我去查…/);
});

test('learning features are mounted, styled and free of new runtime dependencies', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../client/lab/markdown.ts', import.meta.url), 'utf8');
  const concept = await readFile(new URL('../client/page-assistant/concept.ts', import.meta.url), 'utf8');
  const replay = await readFile(new URL('../client/page-assistant/replay.ts', import.meta.url), 'utf8');
  for (const token of [
    'hydrateChecks(view.body',
    'hydrateConcepts(',
    'linkPageBlocks(view.body',
    'bindPageCitations(view.body',
    'interceptCitations(view.body',
    'blockText: resolveBlockText',
    'openReplay(',
    'captureElement(',
    'focusCandidates(',
    "fences: { check: 'lab-check', concept: 'lab-concept' }",
  ]) {
    assert.ok(entry.includes(token), `missing ${token}`);
  }
  for (const token of [
    '.pa-check',
    '.pa-block-ref',
    '.pa-cite',
    '.pa-cite--missing',
    '.pa-concept',
    '.pa-concept-note',
    '.pa-concept-rel',
    '.pa-concept--dense',
    '.pa-replay-panel',
    '.pa-figure-list',
    '.pa-focus',
    '.pa-notice',
    'prefers-reduced-motion',
  ]) {
    assert.ok(css.includes(token), `missing ${token}`);
  }
  assert.match(markdown, /fences\?: Record<string, string>/);
  assert.match(markdown, /opts\.fences\?\.\[lang/);
  assert.match(markdown, /blockText\?: \(index: number\) => string \| null/);
  assert.match(markdown, /PAGE_CITATION/);
  // Concept labels and replay rows are built with textContent, never HTML.
  assert.match(concept, /textContent/);
  assert.match(concept, /pa-concept-arrow--solid/);
  assert.match(concept, /pa-concept-arrow--dashed/);
  assert.match(concept, /edge\.dashed \? dashedMarkerId : solidMarkerId/);
  assert.doesNotMatch(concept, /innerHTML/);
  assert.match(replay, /textContent/);
  assert.doesNotMatch(replay, /innerHTML/);
  // Replay only reads the compact projection; it must not start a model run.
  assert.doesNotMatch(replay, /fetch\(|EventSource|labApi/);
  assert.doesNotMatch(entry, /requestFullscreen|showModal\(/);
});

test('every question and answer has a copy button with a plain-HTTP fallback', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../client/page-assistant.css', import.meta.url), 'utf8');
  // The LAN reader is plain HTTP, where navigator.clipboard does not exist.
  assert.match(entry, /ensureClipboard\(navigator, document\)/);
  assert.match(entry, /navigator\.clipboard\?\.writeText/);
  assert.match(entry, /copyActions\(\(\) => text, '复制这条提问'\)/);
  assert.match(entry, /copyActions\(\(\) => message\.text, '复制这条提问'\)/);
  assert.match(entry, /answerCopyText\(view\.state\.text\)/);
  // The assistant button only appears once there is an answer to copy.
  assert.match(entry, /view\.copy\.hidden = !state\.text\.trim\(\)/);
  assert.match(entry, /pa-message-copy--done/);
  assert.match(css, /\.pa-message-actions\s*\{[\s\S]*?justify-content:\s*flex-end/);
  assert.match(css, /\.pa-message-copy\s*\{[\s\S]*?min-height:\s*22px/);
});

test('the conversation survives page switches and reloads in one shared panel', async () => {
  const entry = await readFile(new URL('../client/page-assistant.ts', import.meta.url), 'utf8');
  // One conversation snapshot in localStorage, rebuilt on every page load.
  assert.match(entry, /const CHAT_KEY = 'page-assistant:chat'/);
  assert.match(entry, /parseChat\(readStore\(CHAT_KEY\)\)/);
  assert.match(entry, /buildChat\(sessionId, chat\)/);
  assert.match(entry, /writeStore\(CHAT_KEY, JSON\.stringify\(state\)\)/);
  assert.match(entry, /removeStore\(CHAT_KEY\)/);
  // Every new turn and every finished run writes the snapshot back.
  assert.match(entry, /persistChat\(\);\n\s+setBusy\(true\);/);
  assert.match(entry, /view\.message\.runId = data\.run_id/);
  assert.match(entry, /syncEntry\(view\);\n\s+persistChat\(\);/);
  // Mount restores the messages and reattaches a run that was still going.
  assert.match(entry, /function loadChat\(\): boolean/);
  assert.match(entry, /if \(loadChat\(\) && readSession\(OPEN_KEY\) === '1'\) show\(\)/);
  assert.match(entry, /view\.message\?\.status === 'running'\) void attachRestoredRun\(view\)/);
  assert.match(entry, /labApi<\{ events\?: LabEvent\[\] \}>\(`\/runs\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(entry, /streamRun\(\n\s+id,/);
  // Other tabs share the same conversation instead of drifting apart.
  assert.match(entry, /addEventListener\('storage'/);
  assert.match(entry, /next\.updatedAt <= chatUpdatedAt/);
  // 新对话 in another tab clears this one too.
  assert.match(entry, /if \(event\.newValue === null\) \{/);
  // Panel open/closed state is per tab, not remembered for future visits.
  assert.match(entry, /writeSession\(OPEN_KEY, '1'\)/);
  assert.match(entry, /writeSession\(OPEN_KEY, '0'\)/);
  // 新对话 clears the local snapshot so a reload does not bring it back.
  assert.match(entry, /chat = \[\];\n\s+removeStore\(CHAT_KEY\);/);
});
