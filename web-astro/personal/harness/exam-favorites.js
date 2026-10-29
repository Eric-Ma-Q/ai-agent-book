/* Exam favorites for the question banks (requirements 007 / 010).
   personal/harness/static.mjs injects this file into the exam page responses;
   the archive HTML itself is never modified. It relies on the page globals that
   already exist: QMAP, renderPaper, showReport, renderIntro and toast. */
(function () {
  'use strict';

  if (window.__examFavoritesLoaded) return;
  window.__examFavoritesLoaded = true;

  var config = document.querySelector('script[data-exam-favorites]');
  var EXAM = config && config.dataset ? config.dataset.exam : '';
  if (!EXAM) return;

  var API = '/__personal/exam-favorites';
  var FAVORITES_HREF =
    (config && config.dataset && config.dataset.favoritesHref) ||
    '../favorites/';
  var all = [];
  var current = Object.create(null);
  var ready = false;
  var loadFailed = false;
  var entryLink = null;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $$(selector, root) {
    return Array.prototype.slice.call(
      (root || document).querySelectorAll(selector),
    );
  }
  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.warn('[favorites] ' + message);
  }
  function api(path, body) {
    var options = { headers: { 'x-personal-api': '1' }, cache: 'no-store' };
    if (body) {
      options.method = 'POST';
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(API + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          throw new Error('返回格式不对');
        })
        .then(function (payload) {
          if (!response.ok || !payload || payload.ok !== true)
            throw new Error(
              (payload && payload.error) || 'HTTP ' + response.status,
            );
          return payload.data;
        });
    });
  }
  function applyItems(items) {
    current = Object.create(null);
    all = Array.isArray(items) ? items : [];
    all.forEach(function (item) {
      if (item && item.exam === EXAM) current[item.id] = item.addedAt;
    });
    ready = true;
    loadFailed = false;
    refresh();
  }
  function load() {
    return api('')
      .then(function (data) {
        applyItems(data.items);
      })
      .catch(function (error) {
        loadFailed = true;
        console.warn('[favorites] load failed: ' + error.message);
        refresh();
      });
  }
  function isFavorite(id) {
    return !!current[id];
  }
  function refreshButton(button) {
    var id = button.dataset.fav;
    var on = isFavorite(id);
    button.textContent = on ? '♥ 已收藏' : '♡ 收藏';
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? '取消收藏' : '收藏这道题');
    button.title = loadFailed
      ? '收藏数据暂时读不到'
      : on
        ? '取消收藏'
        : '收藏这道题';
    button.disabled = !ready;
  }
  function refresh() {
    $$('[data-fav]').forEach(refreshButton);
    updateEntry();
  }
  function makeButton(id) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fav-btn';
    button.dataset.fav = id;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = '♡ 收藏';
    button.disabled = !ready;
    return button;
  }
  function insertStar(card) {
    if (!card || card.querySelector('[data-fav]')) return;
    var id = card.dataset.id;
    if (!id && card.id.indexOf('q-') === 0) id = card.id.slice(2);
    var number = $('.qno', card);
    if (!id && number) id = number.textContent.trim();
    if (!id) return;
    var top = $('.q-top', card);
    if (!top) return;
    var button = makeButton(id);
    var points = $('.pts', top);
    var tail = document.createElement('span');
    tail.className = 'fav-tail';
    if (points) {
      top.insertBefore(tail, points);
      tail.appendChild(points);
    } else {
      top.appendChild(tail);
    }
    tail.insertBefore(button, tail.firstChild);
    refreshButton(button);
  }
  function decoratePaper() {
    $$('#paper .q').forEach(insertStar);
  }
  function decorateReport() {
    $$('#reportView .q').forEach(insertStar);
    var actions = $('#reportView .actions');
    if (actions && !actions.querySelector('.fav-entry')) {
      var link = document.createElement('a');
      link.className = 'btn ghost fav-entry';
      link.href = FAVORITES_HREF;
      link.textContent = '我的收藏';
      actions.appendChild(link);
    }
  }
  function updateEntry() {
    if (!entryLink) return;
    entryLink.textContent = ready
      ? '我的收藏（' + all.length + '）'
      : '我的收藏';
    entryLink.title = loadFailed
      ? '收藏数据暂时读不到'
      : '查看收藏的题，换设备也能看到';
  }
  function ensureEntry() {
    var row = $('#introView .start-row');
    if (!row) return;
    var link = row.querySelector('#favEntry');
    if (!link) {
      link = document.createElement('a');
      link.id = 'favEntry';
      link.className = 'btn ghost fav-entry';
      link.href = FAVORITES_HREF;
      row.appendChild(link);
      var panel = row.parentNode;
      if (panel && !panel.querySelector('.fav-note')) {
        var note = document.createElement('p');
        note.className = 'fav-note';
        note.textContent = '收藏保存在阅读器，手机和电脑共用一份。';
        panel.appendChild(note);
      }
    }
    entryLink = link;
    updateEntry();
  }
  function wrap(name, after) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () {
      var result = original.apply(window, arguments);
      after();
      return result;
    };
  }
  function injectStyle() {
    if (document.getElementById('exam-favorites-style')) return;
    var style = document.createElement('style');
    style.id = 'exam-favorites-style';
    style.textContent = [
      '.fav-btn{border:none;background:none;cursor:pointer;font:inherit;font-size:12.5px;color:var(--ink-mute);padding:0 2px}',
      '.fav-btn.on{color:var(--accent);font-weight:600}',
      '.fav-btn[disabled]{opacity:.55;cursor:default}',
      '.fav-tail{display:inline-flex;align-items:center;gap:8px;margin-left:auto}',
      '.fav-tail .pts{margin-left:0}',
      '.fav-note{margin:10px 0 0;font-size:12.5px;color:var(--ink-mute)}',
      '.fav-entry{margin-left:0}',
    ].join('\n');
    document.head.appendChild(style);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest('[data-fav]') : null;
    if (!button) return;
    event.preventDefault();
    var id = button.dataset.fav;
    if (!ready) {
      toast(loadFailed ? '收藏数据暂时读不到' : '收藏数据还没加载好，稍后再试');
      return;
    }
    button.disabled = true;
    var next = !isFavorite(id);
    var done = function () {
      button.disabled = !ready;
      refresh();
    };
    api('/set', { exam: EXAM, id: id, favorite: next })
      .then(function (data) {
        applyItems(data.items);
        toast(next ? '已收藏，可在「我的收藏」里回看' : '已取消收藏');
      })
      .catch(function (error) {
        toast('收藏没有保存成功：' + error.message);
      })
      .then(done, done);
  });

  injectStyle();
  wrap('renderPaper', decoratePaper);
  wrap('showReport', decorateReport);
  wrap('renderIntro', ensureEntry);
  ensureEntry();
  load();
})();
