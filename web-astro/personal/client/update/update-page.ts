// Requirement 031: "project update" card on the settings page. The card reads
// the local update service (another agent owns it), forces a check on demand
// and starts the one-click update after an admin token is supplied. Release
// notes are Markdown: they go through the shared safe renderer (HTML escaped
// first, links limited to http(s) and site paths), never through raw HTML from
// GitHub. The update log always uses textContent, so a git remote cannot inject
// markup either way.
import { button, el } from '../dom';
import { renderMarkdown } from '../lab/markdown';

export const UPDATE_TOKEN_KEY = 'agent-book-update-token';

const API = '/__personal/update';
const POLL_MS = 2000;
const RELOAD_DELAY_MS = 3000;

type UpdateState = 'idle' | 'running' | 'done' | 'failed';

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  notes: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  enabled: boolean;
  checkOnly: boolean;
  state: UpdateState;
  error: string | null;
  logTail: string | null;
};

const STATE_LABELS: Record<UpdateState, string> = {
  idle: '空闲',
  running: '更新中',
  done: '已完成',
  failed: '失败',
};

const EMPTY_INFO: UpdateInfo = {
  currentVersion: '',
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: null,
  notes: null,
  publishedAt: null,
  checkedAt: null,
  enabled: true,
  checkOnly: false,
  state: 'idle',
  error: null,
  logTail: null,
};

class UpdateRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function normalize(raw: Partial<UpdateInfo> | null | undefined): UpdateInfo {
  const state = raw?.state;
  return {
    currentVersion: raw?.currentVersion ?? '',
    latestVersion: raw?.latestVersion ?? null,
    updateAvailable: Boolean(raw?.updateAvailable),
    releaseUrl: raw?.releaseUrl ?? null,
    notes: raw?.notes ?? null,
    publishedAt: raw?.publishedAt ?? null,
    checkedAt: raw?.checkedAt ?? null,
    enabled: raw?.enabled !== false,
    checkOnly: Boolean(raw?.checkOnly),
    state: state === 'running' || state === 'done' || state === 'failed' ? state : 'idle',
    error: raw?.error ?? null,
    logTail: raw?.logTail ?? null,
  };
}

function defaultError(status: number): string {
  if (status === 401) return '管理员 token 不正确';
  if (status === 409) return '更新已经在运行，请等待当前任务结束';
  if (status === 503) return '更新未启用：部署时未配置 UPDATE_REPO';
  return `更新服务返回 HTTP ${status}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Envelope = { ok?: boolean; data?: Partial<UpdateInfo>; error?: string };

async function call(path: string, options: { method?: 'GET' | 'POST'; token?: string } = {}): Promise<Partial<UpdateInfo>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'x-personal-api': '1' };
  if (method === 'POST') headers['content-type'] = 'application/json';
  if (options.token) headers['x-update-token'] = options.token;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: method === 'POST' ? '{}' : undefined,
    });
  } catch {
    throw new UpdateRequestError('无法连接更新服务，请确认阅读器正在运行', 0);
  }

  let payload: Envelope = {};
  try {
    payload = (await response.json()) as Envelope;
  } catch {
    throw new UpdateRequestError(`更新服务返回了无法解析的响应（HTTP ${response.status}）`, response.status);
  }
  if (response.ok && payload.ok !== false) return payload.data ?? {};
  throw new UpdateRequestError(payload.error || defaultError(response.status), response.status);
}

function versionLabel(version: string | null | undefined): string {
  const text = String(version ?? '').trim();
  return text ? `v${text.replace(/^v/i, '')}` : '—';
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/** Release notes as safe markdown HTML. Bare URLs become links because GitHub
 *  writes them that way ("Full Changelog: https://…"). */
export function notesHtml(text: string): string {
  return renderMarkdown(text, { autolink: true });
}

function readToken(): string | null {
  try {
    const value = window.localStorage.getItem(UPDATE_TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function storeToken(value: string) {
  try {
    window.localStorage.setItem(UPDATE_TOKEN_KEY, value);
  } catch {
    // Private mode or a full quota: the token still works for this page.
  }
}

function forgetToken() {
  try {
    window.localStorage.removeItem(UPDATE_TOKEN_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

let activeCleanup: (() => void) | undefined;

/** Clears the polling and reload timers of the mounted card, if any. */
export function dispose(): void {
  activeCleanup?.();
  activeCleanup = undefined;
}

export function mountUpdateSettings(host: HTMLElement) {
  host.replaceChildren();

  let info: UpdateInfo = { ...EMPTY_INFO };
  let token = readToken();
  let pollTimer: number | undefined;
  let reloadTimer: number | undefined;
  let disposed = false;
  let polling = false;
  let checking = false;

  const title = el('h2', 'lab-h2 update-title', '项目更新');
  const badge = el('span', 'update-badge', '读取中');
  badge.dataset.tone = 'muted';

  const currentValue = el('dd', '', '—');
  const latestValue = el('dd', '', '—');
  const publishedValue = el('dd', '', '—');
  const checkedValue = el('dd', '', '—');
  const stateValue = el('dd', '', '—');
  const metaRow = (label: string, value: HTMLElement) => el('div', 'update-meta-row', el('dt', '', label), value);
  const publishedRow = metaRow('发布时间', publishedValue);
  publishedRow.hidden = true;
  const meta = el(
    'dl',
    'update-meta',
    metaRow('当前版本', currentValue),
    metaRow('最新版本', latestValue),
    publishedRow,
    metaRow('上次检查', checkedValue),
    metaRow('状态', stateValue),
  );

  const notesBody = el('div', 'update-notes-body');
  const notesBlock = el('div', 'update-notes', el('h3', 'lab-h3 update-notes-title', '更新说明'), notesBody);
  notesBlock.hidden = true;

  const tokenInput = el('input', 'lab-input');
  tokenInput.id = 'update-token-input';
  tokenInput.type = 'password';
  tokenInput.autocomplete = 'new-password';
  tokenInput.placeholder = '粘贴服务器上的管理员 token';
  const tokenLabel = el('label', 'lab-field-label', '管理员 token');
  tokenLabel.htmlFor = tokenInput.id;
  const tokenSubmit = el('button', 'lab-btn lab-btn--primary', '保存并更新');
  tokenSubmit.type = 'submit';
  const tokenForm = el(
    'form',
    'update-token',
    tokenLabel,
    el(
      'p',
      'update-hint',
      '首次一键更新需要服务器上的管理员 token（环境变量 UPDATE_ADMIN_TOKEN，或 personal/update/token 文件）。',
    ),
    el('div', 'update-token-row', tokenInput, tokenSubmit, button('取消', 'lab-btn', () => hideTokenForm())),
  );
  tokenForm.hidden = true;

  const checkButton = button('检查更新', 'lab-btn', () => void check());
  const applyButton = button('一键更新', 'lab-btn lab-btn--primary', () => void apply());
  const releaseLink = el('a', 'update-link', '查看发布页');
  releaseLink.target = '_blank';
  releaseLink.rel = 'noreferrer noopener';
  releaseLink.hidden = true;
  const actions = el('div', 'update-actions', checkButton, applyButton, releaseLink);

  const message = el('p', 'update-message');
  message.hidden = true;
  const log = el('pre', 'update-log');
  log.hidden = true;

  host.append(
    el(
      'article',
      'update-card',
      el('header', 'update-card-head', title, badge),
      el(
        'p',
        'update-hint',
        '阅读器会检查本仓库的 GitHub 发布版本；一键更新只更新代码与依赖，不改 personal/ 下的阅读数据。',
      ),
      meta,
      notesBlock,
      tokenForm,
      actions,
      message,
      log,
    ),
  );

  function setMessage(text: string, tone: 'muted' | 'ok' | 'warn' | 'bad' = 'muted') {
    message.hidden = !text;
    message.textContent = text;
    message.dataset.tone = tone;
  }

  function showTokenForm() {
    tokenForm.hidden = false;
    tokenInput.focus();
  }

  function hideTokenForm() {
    tokenForm.hidden = true;
    tokenInput.value = '';
  }

  function stopPolling() {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function startPolling() {
    if (disposed || pollTimer !== undefined) return;
    pollTimer = window.setInterval(() => void poll(), POLL_MS);
    void poll();
  }

  function scheduleReload() {
    if (reloadTimer !== undefined) return;
    reloadTimer = window.setTimeout(() => location.reload(), RELOAD_DELAY_MS);
  }

  async function poll() {
    if (disposed || polling) return;
    polling = true;
    try {
      info = normalize(await call('/status'));
      render();
    } catch (error) {
      setMessage(`读取更新进度失败：${describeError(error)}`, 'bad');
    } finally {
      polling = false;
    }
  }

  function render() {
    const available = info.updateAvailable && Boolean(info.latestVersion);
    const running = info.state === 'running';
    const done = info.state === 'done';

    currentValue.textContent = versionLabel(info.currentVersion);
    latestValue.textContent = versionLabel(info.latestVersion);
    publishedValue.textContent = timeLabel(info.publishedAt);
    checkedValue.textContent = timeLabel(info.checkedAt);
    stateValue.textContent = STATE_LABELS[info.state];
    publishedRow.hidden = !(available && info.publishedAt);

    if (!info.enabled) {
      badge.textContent = '未启用';
      badge.dataset.tone = 'muted';
      notesBlock.hidden = true;
      actions.hidden = true;
      tokenForm.hidden = true;
      log.hidden = true;
      log.textContent = '';
      setMessage('未启用：部署时未配置 UPDATE_REPO', 'muted');
      stopPolling();
      return;
    }

    badge.textContent = info.state === 'failed'
      ? '更新失败'
      : running
        ? '更新中'
        : done
          ? '已更新'
          : available
            ? '有新版本'
            : '已是最新';
    badge.dataset.tone = info.state === 'failed'
      ? 'bad'
      : running
        ? 'warn'
        : done
          ? 'ok'
          : available
            ? 'warn'
            : 'ok';

    if (info.notes) {
      notesBody.innerHTML = notesHtml(String(info.notes));
      notesBlock.hidden = false;
    } else {
      notesBlock.hidden = true;
      notesBody.replaceChildren();
    }

    actions.hidden = false;
    checkButton.hidden = running;
    checkButton.disabled = checking;
    applyButton.hidden = info.checkOnly || !available || running || done;
    applyButton.disabled = false;

    const releaseUrl = isHttpUrl(info.releaseUrl) ? info.releaseUrl : '';
    releaseLink.hidden = !(available && releaseUrl);
    if (releaseUrl) releaseLink.href = releaseUrl;

    if (running) {
      tokenForm.hidden = true;
      log.textContent = info.logTail ?? '';
      log.hidden = !info.logTail;
      setMessage('正在更新…', 'warn');
      startPolling();
      return;
    }
    stopPolling();

    if (done) {
      tokenForm.hidden = true;
      const targetVersion = info.latestVersion || info.currentVersion;
      setMessage(`已更新到 ${versionLabel(targetVersion)}，页面将在 3 秒后刷新`, 'ok');
      scheduleReload();
      return;
    }

    log.textContent = info.logTail ?? '';
    log.hidden = !(info.state === 'failed' && info.logTail);
    if (info.state === 'failed') {
      setMessage(`更新失败：${info.error ?? '未知原因'}`, 'bad');
      return;
    }
    if (info.checkOnly) {
      tokenForm.hidden = true;
      log.hidden = true;
      setMessage(
        available
          ? `有新版本 ${versionLabel(info.latestVersion)}；当前部署只检查，不执行一键更新`
          : '当前部署只检查更新，不执行一键更新',
        available ? 'warn' : 'muted',
      );
      return;
    }
    // idle: keep whatever the last check said (success or readable error).
  }

  async function load() {
    try {
      info = normalize(await call('/status'));
      render();
      if (info.state === 'idle' && info.updateAvailable) {
        setMessage(`有新版本 ${versionLabel(info.latestVersion)} 可用`, 'warn');
      }
    } catch (error) {
      badge.textContent = '状态未知';
      badge.dataset.tone = 'muted';
      setMessage(`读取更新状态失败：${describeError(error)}`, 'bad');
    }
  }

  async function check() {
    if (checking) return;
    checking = true;
    checkButton.disabled = true;
    setMessage('正在检查更新……');
    try {
      info = normalize(await call('/check', { method: 'POST' }));
      render();
      if (info.state === 'idle') {
        setMessage(
          info.updateAvailable ? `发现新版本 ${versionLabel(info.latestVersion)}` : '已是最新版本',
          info.updateAvailable ? 'warn' : 'ok',
        );
      }
    } catch (error) {
      // Keep the previously known versions and timestamps on screen.
      setMessage(`检查更新失败：${describeError(error)}`, 'bad');
    } finally {
      checking = false;
      checkButton.disabled = false;
    }
  }

  async function apply() {
    if (info.checkOnly) {
      tokenForm.hidden = true;
      log.hidden = true;
      setMessage('当前部署只检查更新，不执行一键更新', 'muted');
      return;
    }
    if (!token) {
      showTokenForm();
      return;
    }
    applyButton.disabled = true;
    setMessage('正在启动更新……');
    try {
      await call('/apply', { method: 'POST', token });
      storeToken(token);
      hideTokenForm();
      setMessage('正在更新…', 'warn');
      startPolling();
    } catch (error) {
      const status = error instanceof UpdateRequestError ? error.status : 0;
      if (status === 401) {
        forgetToken();
        token = null;
        showTokenForm();
        setMessage('管理员 token 不正确，请重新输入', 'bad');
        applyButton.disabled = false;
        return;
      }
      if (status === 409) {
        setMessage('更新已经在运行，正在等待进度…', 'warn');
        startPolling();
        return;
      }
      applyButton.disabled = false;
      setMessage(`启动更新失败：${describeError(error)}`, 'bad');
    }
  }

  tokenForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = tokenInput.value.trim();
    if (!value) {
      setMessage('请先填写管理员 token', 'bad');
      tokenInput.focus();
      return;
    }
    token = value;
    tokenInput.value = '';
    void apply();
  });

  function onVisibility() {
    if (document.hidden) stopPolling();
  }

  function cleanup() {
    disposed = true;
    stopPolling();
    if (reloadTimer !== undefined) {
      window.clearTimeout(reloadTimer);
      reloadTimer = undefined;
    }
    window.removeEventListener('pagehide', cleanup);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  activeCleanup = cleanup;
  window.addEventListener('pagehide', cleanup);
  document.addEventListener('visibilitychange', onVisibility);

  void load();
}
