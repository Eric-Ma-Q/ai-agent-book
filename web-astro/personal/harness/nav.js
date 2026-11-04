// Floating return navigation for the archived Harness pages and the book exam.
// Injected at runtime by harness/static.mjs and the book-exam endpoint; the
// source HTML stays untouched and keeps working if this script fails to load.
// Optional attributes (all consumed here, not by the archive): data-home-href
// (an absolute in-site path, or "none" to drop the first link), data-home-label,
// data-home-short, data-home-icon and data-reader-label.
(function () {
  var script = document.currentScript;
  var base = (script && script.getAttribute('data-base')) || '/';
  if (base !== '/' && base.slice(-1) !== '/') base += '/';

  function attr(name, fallback) {
    var value = script && script.getAttribute(name);
    return value === null || value === '' ? fallback : value;
  }

  var homeHref = attr('data-home-href', base + 'harness/');
  var homeLabel = attr('data-home-label', 'Harness 目录');
  var homeShort = attr('data-home-short', '目录');
  var homeIcon = attr('data-home-icon', '▤');
  var readerLabel = attr('data-reader-label', '阅读器');

  function mount() {
    if (document.getElementById('harness-floating-nav')) return;
    var body = document.body;
    if (!body) return;

    var style = document.createElement('style');
    style.textContent = [
      '#harness-floating-nav{position:fixed;left:20px;bottom:22px;z-index:75;display:flex;gap:8px;font:500 13px/1.2 system-ui,-apple-system,"PingFang SC",sans-serif;}',
      '#harness-floating-nav a{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:999px;text-decoration:none;',
      'color:var(--ink,var(--text,#222));background:var(--card,var(--surface,#fff));border:1px solid var(--line,var(--border,#ddd));',
      'box-shadow:0 4px 16px rgba(0,0,0,.14);transition:transform .15s ease,box-shadow .15s ease;}',
      '#harness-floating-nav a:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,.2);}',
      '#harness-floating-nav a:focus-visible{outline:2px solid #2f6feb;outline-offset:2px;}',
      '#harness-floating-nav .hfn-icon{font-size:14px;line-height:1;}',
      '@media (max-width:400px){#harness-floating-nav a{padding:8px 11px;}#harness-floating-nav .hfn-long{display:none;}}',
      '@media (min-width:401px){#harness-floating-nav .hfn-short{display:none;}}',
      '@media (prefers-reduced-motion:reduce){#harness-floating-nav a{transition:none;}}',
    ].join('');

    var nav = document.createElement('nav');
    nav.id = 'harness-floating-nav';
    nav.setAttribute('aria-label', '页面导航');

    function link(href, long, short, icon, label) {
      var a = document.createElement('a');
      a.href = href;
      a.setAttribute('aria-label', label);
      a.title = label;
      a.innerHTML =
        '<span class="hfn-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="hfn-long">' + long + '</span>' +
        '<span class="hfn-short">' + short + '</span>';
      return a;
    }

    if (homeHref !== 'none') {
      nav.appendChild(link(homeHref, homeLabel, homeShort, homeIcon, homeLabel));
    }
    if (script && script.getAttribute('data-interview') === '1') {
      nav.appendChild(link(base + 'harness/interview/', '模拟面试', '面试', '◇', 'AI 产品经理模拟面试'));
    }
    nav.appendChild(link(base, readerLabel, readerLabel, '←', '返回阅读器'));

    body.appendChild(style);
    body.appendChild(nav);
  }

  // Eight archived pages inject their own round "back to overview" button at
  // this corner. The new directory supersedes it (and links to the old
  // overview), so hide it once our nav is in place; if this script fails the
  // original button stays visible and the page still works.
  function hideLegacyHome() {
    var fab = document.getElementById('homeFab');
    if (!fab || fab.dataset.harnessReplaced) return;
    fab.dataset.harnessReplaced = '1';
    fab.style.display = 'none';
    fab.setAttribute('aria-hidden', 'true');
    fab.setAttribute('tabindex', '-1');
  }

  function start() {
    mount();
    hideLegacyHome();
    // The archived pages create #homeFab on DOMContentLoaded, which may run
    // after this deferred script; watch briefly for a late insertion.
    if (document.body) {
      var observer = new MutationObserver(hideLegacyHome);
      observer.observe(document.body, { childList: true });
      setTimeout(function () {
        observer.disconnect();
      }, 4000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
