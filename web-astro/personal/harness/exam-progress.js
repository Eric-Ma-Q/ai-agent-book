/* Exam progress sync for the question banks (requirements 008 / 010).
   static.mjs injects this file into the exam page responses; the archive HTML
   is never modified. The server store is the source of truth for draft,
   attempts and mistakes; localStorage stays as a cache and offline fallback.

   The pure model functions are exposed as window.ExamProgress so Node tests can
   exercise merge/normalize without a DOM. */
(function (root) {
  'use strict';

  var MAX_ATTEMPTS = 30;
  var MAX_STORE_BYTES = 2 * 1024 * 1024;
  var PUSH_DELAY = 1500;
  var RETRY_DELAY = 5000;
  var GATE_TIMEOUT = 5000;

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value === undefined ? {} : value));
    } catch (error) {
      return {};
    }
  }
  function normalizeStore(value) {
    var source = clone(value);
    if (!isObject(source)) source = {};
    return {
      schema: 1,
      draft: isObject(source.draft) ? source.draft : null,
      attempts: Array.isArray(source.attempts)
        ? source.attempts.slice(-MAX_ATTEMPTS)
        : [],
      mistakes: isObject(source.mistakes) ? source.mistakes : {},
    };
  }
  function mergeStores(server, local) {
    var base = normalizeStore(server);
    var mine = normalizeStore(local);
    var attempts = [];
    var seen = Object.create(null);
    [base, mine].forEach(function (store) {
      store.attempts.forEach(function (attempt) {
        if (
          !isObject(attempt) ||
          typeof attempt.id !== 'string' ||
          seen[attempt.id]
        )
          return;
        seen[attempt.id] = true;
        attempts.push(attempt);
      });
    });
    attempts.sort(function (a, b) {
      return (a.submittedAt || 0) - (b.submittedAt || 0);
    });
    attempts = attempts.slice(-MAX_ATTEMPTS);

    var mistakes = {};
    Object.keys(base.mistakes).forEach(function (id) {
      mistakes[id] = base.mistakes[id];
    });
    Object.keys(mine.mistakes).forEach(function (id) {
      var current = mistakes[id];
      var candidate = mine.mistakes[id];
      if (!current) {
        mistakes[id] = candidate;
        return;
      }
      if ((candidate.lastWrong || 0) > (current.lastWrong || 0))
        mistakes[id] = candidate;
    });

    var draft = base.draft;
    if (!draft) draft = mine.draft;
    else if (mine.draft && (mine.draft.startedAt || 0) > (draft.startedAt || 0))
      draft = mine.draft;
    return { schema: 1, draft: draft, attempts: attempts, mistakes: mistakes };
  }
  function hasData(store) {
    return Boolean(
      store &&
      (store.draft ||
        (Array.isArray(store.attempts) && store.attempts.length > 0) ||
        (isObject(store.mistakes) && Object.keys(store.mistakes).length > 0)),
    );
  }

  root.ExamProgress = {
    normalizeStore: normalizeStore,
    mergeStores: mergeStores,
    hasData: hasData,
  };

  if (typeof document === 'undefined') return;

  var config = document.querySelector('script[data-exam-progress]');
  var EXAM = config && config.dataset ? config.dataset.exam : '';
  if (!EXAM) return;

  var originalSaveStore = root.saveStore;
  var originalRenderIntro = root.renderIntro;
  var originalEmptyStore = root.emptyStore;
  if (
    typeof originalSaveStore !== 'function' ||
    typeof originalRenderIntro !== 'function' ||
    typeof originalEmptyStore !== 'function'
  )
    return;

  var API = '/__personal/exam-progress';
  var STORE_KEY =
    root.STORE_KEY || (EXAM === 'ai-pm' ? 'ai-pm-exam:v1' : 'harness-exam:v1');
  var SYNC_KEY = STORE_KEY + ':sync:v1';
  var settled = false;
  var uncertain = false;
  var loading = false;
  var pushing = false;
  var again = false;
  var revision = 0;
  var meta = { dirty: false, serverUpdatedAt: null };
  var statusText = '正在读取服务器进度…';
  var statusKind = 'loading';
  var gateTimer = null;
  var pushTimer = null;
  var retryTimer = null;
  var loadRetryTimer = null;
  var failureToastShown = false;
  var startButton = null;
  var resumeButton = null;

  function toast(message) {
    if (typeof root.toast === 'function') root.toast(message);
    else console.warn('[progress] ' + message);
  }
  function readMeta() {
    try {
      var raw = localStorage.getItem(SYNC_KEY);
      var value = raw ? JSON.parse(raw) : null;
      if (!isObject(value)) return { dirty: false, serverUpdatedAt: null };
      return {
        dirty: value.dirty === true,
        serverUpdatedAt:
          typeof value.serverUpdatedAt === 'string'
            ? value.serverUpdatedAt
            : null,
      };
    } catch (error) {
      return { dirty: false, serverUpdatedAt: null };
    }
  }
  function writeMeta(next) {
    meta = {
      dirty: next.dirty === true,
      serverUpdatedAt: next.serverUpdatedAt || null,
    };
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
    } catch (error) {
      /* localStorage is only a cache; the server copy still matters. */
    }
  }
  function api(method, path, body) {
    var options = {
      method: method,
      headers: { 'x-personal-api': '1' },
      cache: 'no-store',
    };
    var controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, 15000);
    }
    if (body) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    var clear = function () {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return fetch(API + path, options).then(
      function (response) {
        clear();
        return response
          .json()
          .catch(function () {
            throw new Error('返回格式不对');
          })
          .then(function (payload) {
            if (!response.ok || !payload || payload.ok !== true) {
              var error = new Error(
                (payload && payload.error) || 'HTTP ' + response.status,
              );
              error.status = response.status;
              throw error;
            }
            return payload.data;
          });
      },
      function (error) {
        clear();
        throw error;
      },
    );
  }
  function storeSnapshot() {
    var snapshot = normalizeStore(root.store);
    if (root.S) {
      try {
        snapshot.draft = JSON.parse(JSON.stringify(root.S));
      } catch (error) {
        /* keep the cached draft */
      }
    }
    return snapshot;
  }
  function byteLength(text) {
    try {
      return new TextEncoder().encode(text).length;
    } catch (error) {
      return text.length * 2;
    }
  }
  function timeLabel(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  function ensureNote() {
    if (typeof document === 'undefined') return null;
    var note = document.getElementById('examProgressNote');
    if (note) return note;
    var row = document.querySelector('#introView .start-row');
    if (!row || !row.parentNode) return null;
    note = document.createElement('p');
    note.id = 'examProgressNote';
    note.className = 'progress-note';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    row.parentNode.appendChild(note);
    return note;
  }
  function renderStatus() {
    var note = ensureNote();
    if (!note) return;
    note.textContent = statusText;
    note.dataset.kind = statusKind;
  }
  function setStatus(text, kind) {
    statusText = text;
    statusKind = kind || '';
    renderStatus();
  }
  function ensureCopy() {
    var notes = document.querySelectorAll('#introView .panel p');
    for (var i = 0; i < notes.length; i += 1) {
      if (notes[i].textContent.indexOf('只保存在') >= 0) {
        notes[i].innerHTML =
          '作答进度、历次成绩与错题本保存在<b>阅读器服务器</b>，本机只保留缓存；换设备或清理缓存后仍可继续。可导出 JSON 备份。';
        break;
      }
    }
    var footer = document.querySelector('footer p');
    if (footer && footer.textContent.indexOf('记录仅存于本机') >= 0)
      footer.textContent = footer.textContent.replace(
        '记录仅存于本机',
        '记录保存在阅读器服务器',
      );
    var resumeNote = document.querySelector('#resumeNote');
    if (resumeNote && resumeNote.textContent.indexOf('禁用了本地存储') >= 0)
      resumeNote.textContent =
        '当前浏览器禁用了本地缓存：可以正常答题，进度会保存到阅读器服务器。';
  }
  function ensureButtons() {
    startButton = document.querySelector('#btnStart');
    resumeButton = document.querySelector('#btnResume');
  }
  function gate() {
    ensureButtons();
    if (startButton) startButton.disabled = true;
    if (resumeButton) resumeButton.disabled = true;
    var intro = document.querySelector('#introView');
    if (intro) intro.setAttribute('aria-busy', 'true');
    gateTimer = setTimeout(function () {
      if (settled) return;
      uncertain = true;
      settle('服务器响应慢，先按本机进度；后台会继续读取', 'warn');
      scheduleRetryLoad();
    }, GATE_TIMEOUT);
  }
  function settle(text, kind) {
    if (!settled) {
      settled = true;
      if (gateTimer) {
        clearTimeout(gateTimer);
        gateTimer = null;
      }
      if (startButton) startButton.disabled = false;
      if (resumeButton) resumeButton.disabled = false;
      var intro = document.querySelector('#introView');
      if (intro) intro.removeAttribute('aria-busy');
    }
    if (text) setStatus(text, kind);
  }
  function applyStore(store) {
    var next = normalizeStore(store);
    if (root.S) next.draft = clone(root.S);
    root.store = next;
    try {
      originalSaveStore();
    } catch (error) {
      /* cache write may fail; the server copy is still authoritative */
    }
    try {
      originalRenderIntro();
    } catch (error) {
      /* keep the page usable */
    }
  }
  function scheduleRetryLoad() {
    if (loadRetryTimer || document.hidden) return;
    loadRetryTimer = setTimeout(function () {
      loadRetryTimer = null;
      if (uncertain) load();
    }, RETRY_DELAY);
  }
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushCurrent();
    }, PUSH_DELAY);
  }
  function retryPushLater() {
    if (retryTimer || document.hidden) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      pushCurrent();
    }, RETRY_DELAY);
  }
  function pushCurrent() {
    if (!settled || uncertain || pushing) {
      if (uncertain) scheduleRetryLoad();
      return;
    }
    if (!meta.dirty) return;
    push(storeSnapshot(), '');
  }
  function push(store, message) {
    var snapshot = normalizeStore(store);
    var json;
    try {
      json = JSON.stringify(snapshot);
    } catch (error) {
      setStatus('进度序列化失败，未同步', 'error');
      return;
    }
    if (byteLength(json) > MAX_STORE_BYTES) {
      writeMeta({ dirty: true, serverUpdatedAt: meta.serverUpdatedAt });
      settle('进度太大（超过 2 MB），未同步；请导出并清理旧成绩', 'error');
      if (!failureToastShown) {
        failureToastShown = true;
        toast('进度太大，未同步到服务器');
      }
      return;
    }
    if (pushing) {
      again = true;
      return;
    }
    pushing = true;
    var pushRevision = revision;
    api('POST', '/save', { exam: EXAM, store: snapshot })
      .then(function (data) {
        pushing = false;
        failureToastShown = false;
        var dirty = revision !== pushRevision;
        writeMeta({ dirty: dirty, serverUpdatedAt: data.updatedAt });
        var time = timeLabel(data.updatedAt);
        var label = message
          ? message + (time ? ' · ' + time : '')
          : '已同步到服务器' + (time ? ' · ' + time : '');
        settle(label, 'ok');
        if (again || dirty) {
          again = false;
          schedulePush();
        }
      })
      .catch(function (error) {
        pushing = false;
        writeMeta({ dirty: true, serverUpdatedAt: meta.serverUpdatedAt });
        settle('未同步到服务器：' + error.message, 'error');
        if (!failureToastShown) {
          failureToastShown = true;
          toast('进度未同步：' + error.message);
        }
        // 4xx means the store will keep failing validation; do not hammer the server.
        if (!(error.status >= 400 && error.status < 500)) retryPushLater();
        if (again) {
          again = false;
          schedulePush();
        }
      });
  }
  function handleServer(data) {
    meta = readMeta();
    var local = storeSnapshot();
    var server = data.exists ? normalizeStore(data.store) : null;
    if (!data.exists) {
      if (hasData(local)) push(local, '已把本机进度迁移到服务器');
      else settle('服务器还没有记录', 'ok');
      return;
    }
    if (meta.dirty) {
      var merged = mergeStores(server, local);
      applyStore(merged);
      push(merged, '本机有未同步进度，已合并到服务器');
      return;
    }
    if (!meta.serverUpdatedAt && data.clearedAt) {
      applyStore(server);
      writeMeta({ dirty: false, serverUpdatedAt: data.updatedAt });
      settle('服务器记录已清空', 'ok');
      return;
    }
    if (!meta.serverUpdatedAt && hasData(local)) {
      var first = mergeStores(server, local);
      applyStore(first);
      push(first, '已合并本机旧记录');
      return;
    }
    applyStore(server);
    writeMeta({ dirty: false, serverUpdatedAt: data.updatedAt });
    settle('已从服务器读取进度 · ' + timeLabel(data.updatedAt), 'ok');
  }
  function load() {
    if (loading) return;
    loading = true;
    api('GET', '?exam=' + encodeURIComponent(EXAM))
      .then(function (data) {
        loading = false;
        uncertain = false;
        handleServer(data);
      })
      .catch(function (error) {
        loading = false;
        uncertain = true;
        settle('服务器不可用，先按本机缓存继续；恢复后自动同步', 'warn');
        scheduleRetryLoad();
        if (failureToastShown) return;
        failureToastShown = true;
        console.warn('[progress] load failed: ' + error.message);
      });
  }
  function ensureWipe() {
    var button = document.querySelector('#btnWipe');
    if (!button || button.dataset.progressWrapped === '1') {
      if (button && !button._armed) button.textContent = '清空全部记录';
      return;
    }
    button.dataset.progressWrapped = '1';
    button.textContent = '清空全部记录';
    button.onclick = function () {
      if (!settled) {
        toast('正在读取服务器进度，稍后再清空');
        return;
      }
      if (!button._armed) {
        button._armed = true;
        button.textContent = '再点一次确认清空';
        setTimeout(function () {
          button._armed = false;
          button.textContent = '清空全部记录';
        }, 3500);
        return;
      }
      button._armed = false;
      button.disabled = true;
      button.textContent = '正在清空…';
      var empty = originalEmptyStore();
      api('POST', '/save', { exam: EXAM, store: empty, cleared: true })
        .then(function (data) {
          root.store = empty;
          try {
            originalSaveStore();
          } catch (error) {
            /* cache is optional */
          }
          writeMeta({ dirty: false, serverUpdatedAt: data.updatedAt });
          failureToastShown = false;
          originalRenderIntro();
          button.disabled = false;
          button.textContent = '清空全部记录';
          settle('已清空服务器与本机记录', 'ok');
          toast('已清空服务器与本机记录');
        })
        .catch(function (error) {
          button.disabled = false;
          button.textContent = '清空全部记录';
          setStatus('清空失败：' + error.message, 'error');
          toast('清空失败：' + error.message);
        });
    };
  }
  function ensureImport() {
    var button = document.querySelector('#btnImport');
    if (!button || button.dataset.progressWrapped === '1') return;
    var original = button.onclick;
    button.dataset.progressWrapped = '1';
    button.onclick = function () {
      if (!settled) {
        toast('正在读取服务器进度，稍后再导入');
        return;
      }
      if (typeof original === 'function')
        return original.apply(button, arguments);
    };
  }
  function injectStyle() {
    if (document.getElementById('exam-progress-style')) return;
    var style = document.createElement('style');
    style.id = 'exam-progress-style';
    style.textContent = [
      '.progress-note{margin:10px 0 0;font-size:12.5px;color:var(--ink-mute)}',
      '.progress-note[data-kind="ok"]{color:var(--good)}',
      '.progress-note[data-kind="warn"]{color:var(--warn)}',
      '.progress-note[data-kind="error"]{color:var(--bad)}',
    ].join('\n');
    document.head.appendChild(style);
  }
  function flush() {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (root.S) {
      root.store.draft = clone(root.S);
      try {
        originalSaveStore();
      } catch (error) {
        /* cache is optional */
      }
      revision += 1;
      writeMeta({ dirty: true, serverUpdatedAt: meta.serverUpdatedAt });
    }
    if (!settled || uncertain || pushing || !meta.dirty) return;
    push(storeSnapshot(), '');
  }

  root.saveStore = function () {
    originalSaveStore.apply(root, arguments);
    revision += 1;
    writeMeta({ dirty: true, serverUpdatedAt: meta.serverUpdatedAt });
    if (uncertain) {
      scheduleRetryLoad();
      return;
    }
    if (settled) schedulePush();
  };
  root.renderIntro = function () {
    originalRenderIntro.apply(root, arguments);
    ensureCopy();
    ensureWipe();
    ensureImport();
    renderStatus();
  };

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      flush();
    } else if (uncertain) {
      load();
    }
  });
  root.addEventListener('pagehide', flush);

  injectStyle();
  meta = readMeta();
  ensureCopy();
  ensureWipe();
  ensureImport();
  ensureNote();
  renderStatus();
  gate();
  load();
})(typeof window !== 'undefined' ? window : globalThis);
