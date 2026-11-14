import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run against an existing dev server with an available Playwright installation:
// FLOW_TEST_CHAPTER=6 FLOW_TEST_URL=http://127.0.0.1:4322 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/chapter-flow.browser.mjs
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const chapter = Number(process.env.FLOW_TEST_CHAPTER ?? 6);
const config = {
  2: { id: 'chapter-two-flow', views: 4, detail: 'cache', node: 'reuse' },
  4: {
    id: 'chapter-four-flow',
    views: 5,
    detail: 'discovery',
    node: 'schema-load',
  },
  5: {
    id: 'chapter-five-flow',
    views: 5,
    detail: 'recovery',
    node: 'takeover',
  },
  6: {
    id: 'chapter-six-flow',
    views: 5,
    detail: 'computer-use',
    node: 'cu-world-model',
  },
  8: {
    id: 'chapter-eight-flow',
    views: 4,
    detail: 'reward',
    node: 'rlvp',
  },
  9: {
    id: 'chapter-nine-flow',
    views: 4,
    detail: 'signal',
    node: 'signal-map',
  },
  10: {
    id: 'chapter-ten-flow',
    views: 6,
    detail: 'isolated',
    node: 'scratchpad',
  },
}[chapter];
assert.ok(config, `Unsupported flow chapter: ${chapter}`);
const chapterUrl = `/book/chapter${chapter}/`;
const flowLink = `a[href="#${config.id}"]`;
const output = mkdtempSync(join(tmpdir(), `chapter${chapter}-flow-`));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
const failures = [];
const base = process.env.FLOW_TEST_URL ?? 'http://127.0.0.1:4322';
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);
page.on('pageerror', (e) => failures.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
const visiblePanel = () => page.locator('[data-flow-panel]:not([hidden])');
const select = async (id) => {
  await page.locator(`[data-flow-tab="${id}"]`).click();
  assert.equal(await visiblePanel().count(), 1);
  assert.equal(await visiblePanel().getAttribute('data-flow-panel'), id);
};
const assertNoOverflow = async () => {
  const sizes = await page.evaluate(() => ({
    window: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  assert.ok(sizes.width <= sizes.window, JSON.stringify(sizes));
  const bad = await visiblePanel()
    .locator('.flow-node, .flow-links a')
    .evaluateAll((es) =>
      es
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.className),
    );
  assert.deepEqual(bad, []);
  assert.ok(
    await page
      .locator('.flow-tabs a')
      .evaluateAll((tabs) =>
        tabs.every((tab) => tab.scrollWidth <= tab.clientWidth + 1),
      ),
  );
};
const screenshot = async (name) => {
  const style = await page.addStyleTag({
    content:
      '.site-header, .reader-controls { visibility: hidden !important; }',
  });
  try {
    const clip = await page.locator('[data-chapter-flow]').evaluate((e) => {
      const rect = e.getBoundingClientRect();
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    });
    // Capture the document bounds without auto-scrolling the long guide.
    await page.screenshot({
      path: join(output, `${name}.png`),
      fullPage: true,
      clip,
    });
  } finally {
    await style.evaluate((e) => e.remove());
  }
};
try {
  await page.goto(`${base}${chapterUrl}`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-flow-tab][role="tab"]');
  assert.equal(
    await page.locator('#chapter-content [data-chapter-flow]').count(),
    0,
  );
  const viewIds = await page
    .locator('[data-flow-tab]')
    .evaluateAll((es) => es.map((e) => e.dataset.flowTab));
  assert.equal(viewIds.length, config.views);
  for (const id of viewIds) {
    await select(id);
    const panel = visiblePanel();
    const nodes = panel.locator('[data-flow-node]');
    await nodes.first().locator('summary').click();
    assert.equal(await nodes.first().evaluate((e) => e.open), true);
    await page.locator('[data-flow-expand]').click();
    assert.ok(await nodes.evaluateAll((es) => es.every((e) => e.open)));
    await select(id === 'overview' ? config.detail : 'overview');
    await select(id);
    assert.ok(await nodes.evaluateAll((es) => es.every((e) => e.open)));
    await page.locator('[data-flow-expand]').click();
    assert.ok(await nodes.evaluateAll((es) => es.every((e) => !e.open)));
    const aria = await page.locator('[data-flow-tab]').evaluateAll((es) =>
      es.every((e) => {
        const p = document.getElementById(e.getAttribute('aria-controls'));
        return (
          p &&
          p.getAttribute('aria-labelledby') === e.id &&
          p.getAttribute('role') === 'tabpanel'
        );
      }),
    );
    assert.ok(aria);
  }
  results.push(
    'All views: tabs, native nodes, expand/collapse, saved state and ARIA passed',
  );
  await select('overview');
  const first = page.locator('[data-flow-tab]').first();
  await first.focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(
    await visiblePanel().getAttribute('data-flow-panel'),
    viewIds.at(-1),
  );
  await page.keyboard.press('Home');
  assert.equal(
    await visiblePanel().getAttribute('data-flow-panel'),
    'overview',
  );
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await visiblePanel().getAttribute('data-flow-panel'),
    viewIds[1],
  );
  await page.keyboard.press('End');
  assert.equal(
    await visiblePanel().getAttribute('data-flow-panel'),
    viewIds.at(-1),
  );
  await page.keyboard.press('Tab');
  assert.ok(
    await page
      .locator('[data-flow-expand]')
      .evaluate((e) => e === document.activeElement),
  );
  await page.keyboard.press('Enter');
  assert.ok(
    await visiblePanel()
      .locator('[data-flow-node]')
      .evaluateAll((es) => es.every((e) => e.open)),
  );
  results.push('Keyboard: wrapping arrows, Home/End, Tab, Enter passed');
  for (const id of viewIds) {
    await select(id);
    const hrefs = await visiblePanel()
      .locator('.flow-links a')
      .evaluateAll((es) => es.map((e) => e.getAttribute('href')));
    for (const href of hrefs) {
      await select(id);
      await visiblePanel()
        .locator(`.flow-links a[href="${href}"]`)
        .first()
        .click();
      await page.waitForFunction(
        (hash) =>
          document.querySelector(hash)?.open &&
          !document.querySelector(hash)?.closest('[data-flow-panel]')?.hidden,
        href,
      );
      const target = page.locator(href);
      assert.ok(await target.isVisible());
      await page.waitForFunction(
        (hash) =>
          document.querySelector(hash)?.contains(document.activeElement),
        href,
        { timeout: 3000 },
      );
    }
  }
  results.push(
    'Every branch/feedback link opens and focuses its target, including cross-view and repeated hashes',
  );
  await select('overview');
  const node = visiblePanel().locator('[data-flow-node]').first();
  if (!(await node.evaluate((e) => e.open)))
    await node.locator('summary').click();
  const proseLink = node.locator('.flow-node-detail a');
  const proseHash = await proseLink.getAttribute('href');
  await proseLink.click();
  await page.waitForTimeout(400);
  const top = await page
    .locator(proseHash)
    .evaluate((e) => e.getBoundingClientRect().top);
  assert.ok(top >= 80 && top < 350, `Heading hidden: ${top}`);
  await page.locator(`.section-outline ${flowLink}`).click();
  assert.ok(await page.locator(`#${config.id}`).evaluate((e) => e.open));
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.locator('#open-sections').click();
  await page.locator(`.dialog-outline ${flowLink}`).click();
  assert.equal(
    await page.locator('#chapter-navigation').evaluate((e) => e.open),
    false,
  );
  results.push('Desktop outline, dialog outline, real prose anchors passed');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const id of viewIds) {
        await select(id);
        if (
          (await page.locator('[data-flow-expand]').innerText()) ===
          '展开全部节点'
        )
          await page.locator('[data-flow-expand]').click();
        await assertNoOverflow();
        if (width === 390 && id === config.detail)
          await screenshot(`${theme}-${width}-${id}-expanded`);
        await page.locator('[data-flow-expand]').click();
        if (width === 1440) await screenshot(`${theme}-${width}-${id}`);
      }
      await select('overview');
      const tab = page.locator('[aria-selected="true"][data-flow-tab]');
      await tab.hover();
      await tab.focus();
      await page.keyboard.press('Home');
      await page.waitForTimeout(250);
      const colors = await tab.evaluate((e) => {
        const s = getComputedStyle(e);
        const r = getComputedStyle(document.documentElement);
        return {
          bg: s.backgroundColor,
          color: s.color,
          accent: r.getPropertyValue('--accent').trim(),
          outline: s.outlineStyle,
        };
      });
      assert.notEqual(colors.outline, 'none');
      const expected =
        theme === 'dark' ? 'rgb(170, 199, 255)' : 'rgb(216, 237, 122)';
      assert.equal(colors.bg, expected);
      await screenshot(`${theme}-${width}`);
    }
  }
  results.push(
    'Every view expanded at 1440/390/320px, both themes: no overflow; selected+hover/focus colors passed',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-outline > summary').click();
  if (!(await page.locator('.mobile-outline').evaluate((e) => e.open)))
    await page.locator('.mobile-outline > summary').click();
  await page.locator(`.mobile-outline ${flowLink}`).click();
  await page.locator('.mobile-menu').click();
  await page.locator(`.dialog-outline ${flowLink}`).click();
  assert.equal(
    await page.locator('#chapter-navigation').evaluate((e) => e.open),
    false,
  );
  await page.screenshot({ path: join(output, 'mobile-viewport.png') });
  assert.equal(
    await page.locator('.mobile-outline').evaluate((e) => e.open),
    false,
  );
  await page.locator(`#${config.id} > summary`).click();
  assert.equal(
    await page.locator(`#${config.id}`).evaluate((e) => e.open),
    false,
  );
  await page.locator('.mobile-outline > summary').click();
  await page.locator(`.mobile-outline ${flowLink}`).click();
  assert.equal(
    await page.locator(`#${config.id}`).evaluate((e) => e.open),
    true,
  );
  results.push(
    'Mobile chapter outline, modal navigation and reopening the guide passed',
  );
  await page.goto(`${base}${chapterUrl}#${config.id}-panel-${config.detail}`);
  await page.waitForLoadState('networkidle');
  assert.equal(
    await visiblePanel().getAttribute('data-flow-panel'),
    config.detail,
  );
  await page.goto(`${base}/book/chapter3/#flow-panel-rag`);
  await page.waitForLoadState('networkidle');
  assert.equal(await visiblePanel().getAttribute('data-flow-panel'), 'rag');
  await select('maintenance');
  await page.locator('[data-flow-expand]').click();
  assert.ok(
    await visiblePanel()
      .locator('[data-flow-node]')
      .evaluateAll((es) => es.every((e) => e.open)),
  );
  results.push(
    `Chapter ${chapter} direct-view URL and Chapter 3 legacy URL/interactions passed`,
  );
  const fallback = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(`${base}${chapterUrl}`);
  assert.equal(
    await fallbackPage.locator('[data-flow-panel]:visible').count(),
    config.views,
  );
  assert.equal(
    await fallbackPage.locator('[data-flow-tools]:visible').count(),
    0,
  );
  await fallbackPage.locator(`[data-flow-tab="${config.detail}"]`).click();
  assert.ok(
    fallbackPage.url().endsWith(`#${config.id}-panel-${config.detail}`),
  );
  const fallbackNode = fallbackPage.locator(
    `[data-flow-node="${config.node}"]`,
  );
  await fallbackNode.locator('summary').click();
  assert.equal(await fallbackNode.evaluate((e) => e.open), true);
  await fallback.close();
  results.push(
    'JavaScript disabled: all panels, native details and anchors passed',
  );
  assert.deepEqual(failures, []);
  results.push('No browser exceptions or failed HTTP responses');
  console.log(JSON.stringify({ results, output }, null, 2));
} catch (e) {
  console.log(JSON.stringify(results, null, 2));
  console.error(e);
  console.log(
    await page.evaluate(() => ({
      hash: location.hash,
      focus: document.activeElement?.outerHTML.slice(0, 500),
      panel: document.querySelector('[data-flow-panel]:not([hidden])')?.id,
    })),
  );
  await page.screenshot({ path: join(output, 'failure.png') });
  process.exitCode = 1;
} finally {
  await browser.close();
}
