// Requirement 031: the settings-page update card and the header dot. These
// checks read the sources and never touch the network, so they run in the plain
// `test:personal` suite. Visual and live-service behaviour is verified in the
// browser against the local update service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('the settings page owns a mount point and loads the update styles', async () => {
  const page = await read('../pages/settings.astro');
  assert.match(page, /<section id="update-root" class="settings-section"><\/section>/);
  assert.match(page, /import '\.\.\/client\/update\/update\.css';/);
});

test('settings main.ts mounts the update card below the model profiles', async () => {
  const main = await read('../client/settings/main.ts');
  assert.match(main, /import \{ mountUpdateSettings \} from '\.\.\/update\/update-page';/);
  assert.match(main, /getElementById\('update-root'\)/);
  assert.match(main, /mountUpdateSettings\(updateRoot\)/);
  const models = main.indexOf('mountModelSettings(root)');
  const update = main.indexOf('mountUpdateSettings(updateRoot)');
  assert.ok(models >= 0 && update > models, 'update card mounts after model settings');
});

test('the update card talks to the documented endpoints with the required headers', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /const API = '\/__personal\/update'/);
  for (const endpoint of ["'/status'", "'/check'", "'/apply'"])
    assert.ok(source.includes(endpoint), endpoint);

  assert.match(source, /'x-personal-api': '1'/);
  assert.match(source, /headers\['x-update-token'\] = options\.token/);
  assert.match(source, /headers\['content-type'\] = 'application\/json'/);
  assert.match(source, /body: method === 'POST' \? '\{\}' : undefined/);

  // The one-click button only posts after an admin token is available.
  assert.match(source, /if \(!token\) \{\s*showTokenForm\(\);/);
  assert.match(source, /await call\('\/apply', \{ method: 'POST', token \}\)/);
});

test('the admin token lives under the documented localStorage key', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /const UPDATE_TOKEN_KEY = 'agent-book-update-token'/);
  assert.match(source, /localStorage\.getItem\(UPDATE_TOKEN_KEY\)/);
  assert.match(source, /localStorage\.setItem\(UPDATE_TOKEN_KEY, value\)/);
  assert.match(source, /localStorage\.removeItem\(UPDATE_TOKEN_KEY\)/);
  // The token field is a password input, never a visible text box.
  assert.match(source, /tokenInput\.type = 'password'/);
});

test('a 401 clears the token and asks for it again', async () => {
  const source = await read('../client/update/update-page.ts');
  const block = source.slice(source.indexOf('const status = error instanceof UpdateRequestError'));
  assert.ok(block.length > 0, 'apply error handler');
  assert.match(block.slice(0, 1200), /status === 401/);
  assert.match(block.slice(0, 1200), /forgetToken\(\)/);
  assert.match(block.slice(0, 1200), /token = null/);
  assert.match(block.slice(0, 1200), /showTokenForm\(\)/);
  assert.match(block.slice(0, 1200), /管理员 token 不正确，请重新输入/);
  assert.match(source, /class UpdateRequestError extends Error/);
});

test('failed updates render the log with textContent, never innerHTML', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /log\.textContent = info\.logTail \?\? ''/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
  // Notes are text nodes plus http(s) anchors only.
  assert.match(source, /link\.rel = 'noreferrer noopener'/);
  assert.match(source, /link\.target = '_blank'/);
  assert.match(source, /function isHttpUrl/);
  assert.match(source, /fragment\.append\(text\.slice\(index, start\)\)/);
});

test('the card polls every two seconds and reloads three seconds after done', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /const POLL_MS = 2000/);
  assert.match(source, /const RELOAD_DELAY_MS = 3000/);
  assert.match(source, /setInterval\(\(\) => void poll\(\), POLL_MS\)/);
  assert.match(source, /location\.reload\(\)/);
  assert.match(source, /页面将在 3 秒后刷新/);
  assert.match(source, /正在更新…/);
});

test('an unconfigured service shows the disabled notice and no buttons', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /未启用：部署时未配置 UPDATE_REPO/);
  const block = source.slice(source.indexOf('if (!info.enabled)'), source.indexOf('badge.textContent = info.state'));
  assert.match(block, /actions\.hidden = true/);
  assert.match(block, /tokenForm\.hidden = true/);
  assert.match(block, /stopPolling\(\)/);
});

test('timers are cleared when the card is disposed or the page is hidden', async () => {
  const source = await read('../client/update/update-page.ts');
  assert.match(source, /export function dispose\(\)/);
  assert.match(source, /window\.clearInterval\(pollTimer\)/);
  assert.match(source, /window\.clearTimeout\(reloadTimer\)/);
  assert.match(source, /addEventListener\('pagehide', cleanup\)/);
  assert.match(source, /addEventListener\('visibilitychange', onVisibility\)/);
  assert.match(source, /if \(document\.hidden\) stopPolling\(\)/);
});

test('the header dot is requested once per five minutes and cached in sessionStorage', async () => {
  const source = await read('../client/update/update-badge.ts');
  assert.match(source, /const CACHE_KEY = 'agent-book-update-badge'/);
  assert.match(source, /const CACHE_TTL = 5 \* 60 \* 1000/);
  assert.match(source, /sessionStorage\.getItem\(CACHE_KEY\)/);
  assert.match(source, /sessionStorage\.setItem\(CACHE_KEY/);
  assert.match(source, /querySelector<HTMLAnchorElement>\('\.settings-entry'\)/);
  assert.match(source, /classList\.add\('has-update'\)/);
  assert.match(source, /设置（有新版本 \$\{version\}）/);
  assert.match(source, /dot\.className = 'update-dot'/);
  // A failed check must stay silent.
  assert.match(source, /catch \{\s*\/\/ Silent by design/);

  const entry = await read('../client/settings-entry.ts');
  assert.match(entry, /import '\.\/update\/update-badge';/);
});

test('the dot and card styles cover light and dark themes', async () => {
  const css = await read('../client/update/update.css');
  assert.match(css, /\.update-dot\s*\{[^}]*width:\s*8px/s);
  assert.match(css, /\.update-dot\s*\{[^}]*height:\s*8px/s);
  assert.match(css, /\.update-dot\s*\{[^}]*box-shadow:\s*0 0 0 2px/s);
  assert.match(css, /\.update-log\s*\{[^}]*max-height:\s*220px/s);
  assert.match(css, /\.update-log\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\[data-theme='dark'\] \.update-card/);
  assert.match(css, /var\(--line,\s*#dedfd7\)/);
  assert.match(css, /var\(--line,\s*#383b43\)/);
});
