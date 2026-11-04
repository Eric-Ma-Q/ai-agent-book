// Update center (requirement 031). `root` is the repository root; the settings
// page asks for status, triggers a GitHub check and starts scripts/update.sh.
//
// Every file read or write degrades to an empty result: a missing, corrupt or
// unwritable cache/status file must never turn the settings page into a 500.
import { spawn as nodeSpawn } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { dirname } from 'node:path';
import {
  PersonalError,
  updateCacheFile,
  updateLogFile,
  updateScriptFile,
  updateStatusFile,
  updateTokenFile,
  versionFile,
} from './paths.mjs';

const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_WEB_BASE = 'https://github.com';
const DEFAULT_CACHE_TTL_S = 6 * 60 * 60;
export const RUNNING_STALE_MS = 30 * 60 * 1000;
const LOG_TAIL_LINES = 40;
const LOG_TAIL_CHARS = 8000;
const LOG_READ_BYTES = 512 * 1024;
const MAX_NOTES_CHARS = 20000;
const USER_AGENT = 'ai-agent-book-reader-update-center';
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const STATE_NAMES = new Set(['idle', 'running', 'done', 'failed']);

export function normalizeVersion(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^[vV]/, '');
}

function parseVersion(value) {
  const text = normalizeVersion(value);
  const [core, ...rest] = text.split('-');
  const numbers = core.split('.').map((part) => {
    const number = Number.parseInt(part, 10);
    return Number.isFinite(number) ? number : 0;
  });
  return { numbers, pre: rest.length ? rest.join('-').split('.') : [] };
}

// Semver-ish comparison that accepts a `v` prefix and prerelease suffixes such
// as `1.2.3-beta.1`, which is what this repository's tags use.
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.numbers.length, b.numbers.length, 3);
  for (let index = 0; index < length; index += 1) {
    const x = a.numbers[index] ?? 0;
    const y = b.numbers[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  const preLength = Math.max(a.pre.length, b.pre.length);
  for (let index = 0; index < preLength; index += 1) {
    const x = a.pre[index];
    const y = b.pre[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumber = /^\d+$/.test(x);
    const yNumber = /^\d+$/.test(y);
    if (xNumber && yNumber) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xNumber !== yNumber) {
      return xNumber ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function tailLines(text, maxLines, maxChars) {
  if (typeof text !== 'string' || !text) return '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let tail = lines.slice(-maxLines).join('\n');
  if (tail.length > maxChars) tail = tail.slice(-maxChars);
  return tail;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createUpdateCenter({
  root,
  env = process.env,
  fetchImpl = globalThis.fetch,
  fsImpl = nodeFs,
  spawnImpl = nodeSpawn,
  now = Date.now,
  log = console,
} = {}) {
  if (!root) throw new Error('createUpdateCenter needs a repository root');

  const enabledFlag = String(env.UPDATE_ENABLED ?? '1').trim() !== '0';
  // 私人分支可以只检查公开版本，不提供一键更新：脚本会从 origin 拉代码，
  // 而私人仓库没有远端，合入公开快照会破坏本地历史。
  const checkOnly = String(env.UPDATE_CHECK_ONLY ?? '').trim() === '1';
  const repo = String(env.UPDATE_REPO ?? '').trim();
  const apiBase = String(env.UPDATE_API_BASE ?? DEFAULT_API_BASE).trim().replace(/\/+$/, '') || DEFAULT_API_BASE;
  const webBase = String(env.UPDATE_WEB_BASE ?? DEFAULT_WEB_BASE).trim().replace(/\/+$/, '') || DEFAULT_WEB_BASE;
  const configuredTtl = Number(env.UPDATE_CACHE_TTL_S);
  const cacheTtlMs =
    (Number.isFinite(configuredTtl) && configuredTtl >= 0 ? configuredTtl : DEFAULT_CACHE_TTL_S) * 1000;
  const enabled = enabledFlag && REPO_PATTERN.test(repo);

  function nowMs() {
    try {
      const value = typeof now === 'function' ? now() : now;
      const ms = value instanceof Date ? value.getTime() : Number(value);
      return Number.isFinite(ms) ? ms : Date.now();
    } catch {
      return Date.now();
    }
  }

  const iso = (ms) => new Date(ms).toISOString();

  function readText(file) {
    try {
      return fsImpl.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  }

  function readJson(file) {
    const text = readText(file);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      log.error?.(`更新中心：${file} 不是合法 JSON，已忽略。`);
      return null;
    }
  }

  function writeJson(file, value) {
    try {
      fsImpl.mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      fsImpl.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
      fsImpl.renameSync(temp, file);
      return true;
    } catch (error) {
      log.error?.(`更新中心：写入 ${file} 失败：${messageOf(error)}`);
      return false;
    }
  }

  function fileMtime(file) {
    try {
      const stat = fsImpl.statSync(file);
      return Number(stat.mtimeMs) || 0;
    } catch {
      return 0;
    }
  }

  function readLogTail() {
    const file = updateLogFile(root);
    let text = '';
    try {
      const size = Number(fsImpl.statSync(file).size) || 0;
      if (size > LOG_READ_BYTES) {
        const start = size - LOG_READ_BYTES;
        const buffer = Buffer.alloc(LOG_READ_BYTES);
        const fd = fsImpl.openSync(file, 'r');
        try {
          const read = fsImpl.readSync(fd, buffer, 0, LOG_READ_BYTES, start);
          text = buffer.subarray(0, read).toString('utf8');
        } finally {
          fsImpl.closeSync(fd);
        }
      } else {
        text = fsImpl.readFileSync(file, 'utf8');
      }
    } catch {
      return '';
    }
    return tailLines(text, LOG_TAIL_LINES, LOG_TAIL_CHARS);
  }

  function currentVersion() {
    return normalizeVersion(readText(versionFile(root)) ?? '') || '0.0.0';
  }

  function readCache() {
    const raw = readJson(updateCacheFile(root));
    if (!raw || typeof raw !== 'object') return null;
    return {
      latestVersion: normalizeVersion(typeof raw.latestVersion === 'string' ? raw.latestVersion : ''),
      latestTag: typeof raw.latestTag === 'string' ? raw.latestTag : '',
      releaseUrl: typeof raw.releaseUrl === 'string' ? raw.releaseUrl : '',
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : null,
      checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
      error: typeof raw.error === 'string' ? raw.error : null,
    };
  }

  function readStatus() {
    const raw = readJson(updateStatusFile(root));
    const fallback = {
      state: 'idle',
      from: '',
      to: '',
      target: '',
      startedAt: null,
      finishedAt: null,
      error: null,
      pid: null,
    };
    if (!raw || typeof raw !== 'object') return fallback;
    return {
      state: STATE_NAMES.has(raw.state) ? raw.state : 'idle',
      from: typeof raw.from === 'string' ? raw.from : '',
      to: typeof raw.to === 'string' ? raw.to : '',
      target: typeof raw.target === 'string' ? raw.target : '',
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
      finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
      error: typeof raw.error === 'string' ? raw.error : null,
      pid: Number.isInteger(raw.pid) ? raw.pid : null,
    };
  }

  // A running status without a heartbeat (status or log mtime) for 30 minutes
  // is treated as failed, so a crashed script cannot block apply forever.
  function effectiveStatus() {
    const status = readStatus();
    if (status.state !== 'running') return status;
    const startedMs = status.startedAt ? Date.parse(status.startedAt) : 0;
    const heartbeat = Math.max(
      fileMtime(updateStatusFile(root)),
      fileMtime(updateLogFile(root)),
      Number.isFinite(startedMs) ? startedMs : 0,
    );
    if (heartbeat && nowMs() - heartbeat > RUNNING_STALE_MS) {
      return {
        ...status,
        state: 'failed',
        error: status.error ?? '更新进程超过 30 分钟无响应，请查看日志后重试。',
      };
    }
    return status;
  }

  function status() {
    const cache = readCache();
    const state = effectiveStatus();
    const current = currentVersion();
    const latest = cache?.latestVersion ?? '';
    return {
      currentVersion: current,
      latestVersion: latest,
      updateAvailable: enabled && Boolean(latest) && compareVersions(latest, current) > 0,
      releaseUrl: cache?.releaseUrl ?? '',
      notes: cache?.notes ?? '',
      publishedAt: cache?.publishedAt ?? null,
      checkedAt: cache?.checkedAt ?? null,
      enabled,
      checkOnly: enabled && checkOnly,
      state: state.state,
      error: state.error ?? cache?.error ?? null,
      logTail: readLogTail(),
      from: state.from,
      to: state.to || cache?.latestTag || '',
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    };
  }

  async function fetchJson(url) {
    if (typeof fetchImpl !== 'function') throw new Error('当前运行环境没有 fetch');
    const response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
    });
    if (!response?.ok) {
      const status = response?.status;
      if (status === 403)
        throw new Error('GitHub API 限流（403）；未登录每小时 60 次，请稍后重试');
      throw new Error(`GitHub 返回 ${status ?? '未知状态'}`);
    }
    return response.json();
  }

  async function fetchLatestRelease() {
    const data = await fetchJson(`${apiBase}/repos/${repo}/releases/latest`);
    const tag = typeof data?.tag_name === 'string' ? data.tag_name.trim() : '';
    if (!tag) throw new Error('release 缺少 tag_name');
    return {
      tag,
      notes: typeof data.body === 'string' ? data.body.slice(0, MAX_NOTES_CHARS) : '',
      url: typeof data.html_url === 'string' ? data.html_url : '',
      publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
    };
  }

  async function fetchLatestTag() {
    const data = await fetchJson(`${apiBase}/repos/${repo}/tags`);
    const first = Array.isArray(data)
      ? data.find((item) => typeof item?.name === 'string' && item.name.trim())
      : null;
    if (!first) throw new Error('仓库没有任何 tag');
    return { tag: first.name.trim(), notes: '', url: '', publishedAt: null };
  }

  // GitHub API 未登录只有每小时 60 次；额度耗尽时 API 与 tags 都会 403。
  // `releases/latest` 页面会 302 到 tag，不占 API 额度，用它兜底拿版本号
  // （没有 Release 正文，页面上仍会显示版本）。
  async function fetchLatestRedirect() {
    const response = await fetchImpl(`${webBase}/${repo}/releases/latest`, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
    });
    if (!response?.ok) throw new Error(`GitHub 页面返回 ${response?.status ?? '未知状态'}`);
    const url = typeof response.url === 'string' ? response.url : '';
    const match = /\/releases\/tag\/([^/?#]+)/.exec(url);
    if (!match) throw new Error('GitHub 页面没有返回版本 tag');
    return {
      tag: decodeURIComponent(match[1]),
      notes: '',
      url,
      publishedAt: null,
    };
  }

  async function fetchLatest() {
    try {
      return await fetchLatestRelease();
    } catch (error) {
      try {
        return await fetchLatestTag();
      } catch (fallbackError) {
        try {
          return await fetchLatestRedirect();
        } catch (redirectError) {
          throw new Error(
            `${messageOf(error)}；tag 回退失败：${messageOf(fallbackError)}；页面回退失败：${messageOf(redirectError)}`,
          );
        }
      }
    }
  }

  async function check({ force = false } = {}) {
    if (!enabled) {
      throw new PersonalError(
        503,
        enabledFlag ? '更新未启用：未配置 UPDATE_REPO' : '更新未启用：UPDATE_ENABLED=0',
      );
    }
    const cached = readCache();
    const checkedMs = cached?.checkedAt ? Date.parse(cached.checkedAt) : Number.NaN;
    if (!force && Number.isFinite(checkedMs) && nowMs() - checkedMs < cacheTtlMs) return status();

    let release;
    try {
      release = await fetchLatest();
    } catch (error) {
      const message = `检查更新失败：${messageOf(error)}`;
      // Keep the previous versions and notes; only record why the last check
      // failed, so status still shows the last known good release.
      writeJson(updateCacheFile(root), {
        ...(cached ?? {
          latestVersion: '',
          latestTag: '',
          releaseUrl: '',
          notes: '',
          publishedAt: null,
          checkedAt: null,
        }),
        error: message,
      });
      throw new PersonalError(502, message);
    }

    const checkedAt = iso(nowMs());
    writeJson(updateCacheFile(root), {
      latestVersion: normalizeVersion(release.tag),
      latestTag: release.tag,
      releaseUrl: release.url,
      notes: release.notes,
      publishedAt: release.publishedAt,
      checkedAt,
      error: null,
    });
    return status();
  }

  function configuredToken() {
    const fromEnv = String(env.UPDATE_ADMIN_TOKEN ?? '').trim();
    if (fromEnv) return fromEnv;
    const file = updateTokenFile(root);
    const token = (readText(file) ?? '').trim();
    if (!token) return '';
    try {
      const mode = Number(fsImpl.statSync(file).mode) & 0o777;
      if (mode & 0o077) log.warn?.(`更新中心：${file} 权限为 ${mode.toString(8)}，建议 chmod 600。`);
    } catch {
      // Permission inspection is advisory only.
    }
    return token;
  }

  function tokenMatches(expected, provided) {
    if (typeof provided !== 'string' || !provided) return false;
    const left = Buffer.from(expected, 'utf8');
    const right = Buffer.from(provided, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  function isFile(file) {
    try {
      return fsImpl.statSync(file).isFile();
    } catch {
      return false;
    }
  }

  function apply({ token } = {}) {
    if (checkOnly) {
      throw new PersonalError(403, '当前部署只检查更新；私人分支请用本机提交与重启。');
    }
    const expected = configuredToken();
    if (!expected) throw new PersonalError(503, '更新未启用：未配置管理员 token');
    const provided = typeof token === 'string' ? token.trim() : '';
    if (!tokenMatches(expected, provided)) throw new PersonalError(401, '管理员 token 不正确');

    const state = effectiveStatus();
    if (state.state === 'running') throw new PersonalError(409, '更新正在进行中，请等待当前任务结束');

    const script = updateScriptFile(root);
    if (!isFile(script)) throw new PersonalError(500, '更新脚本不存在：scripts/update.sh');

    const cache = readCache();
    const target = cache?.latestTag || '';
    const from = currentVersion();
    const startedAt = iso(nowMs());
    const logFile = updateLogFile(root);

    try {
      fsImpl.mkdirSync(dirname(logFile), { recursive: true });
    } catch (error) {
      throw new PersonalError(500, `无法创建日志目录：${messageOf(error)}`);
    }

    const record = (nextState, error) => ({
      state: nextState,
      from,
      to: target,
      startedAt,
      finishedAt: nextState === 'running' ? null : iso(nowMs()),
      error: error ?? null,
      pid: null,
      target,
    });

    // The script needs the target and branch, never the admin token.
    const childEnv = {
      ...process.env,
      ...env,
      UPDATE_BRANCH: String(env.UPDATE_BRANCH ?? 'main'),
      UPDATE_TARGET: target,
    };
    delete childEnv.UPDATE_ADMIN_TOKEN;

    // Write `running` before spawning: a fast script can finish and write
    // `done` before this function returns, so a later write must not clobber it.
    if (!writeJson(updateStatusFile(root), record('running'))) {
      throw new PersonalError(500, '无法写入更新状态文件，请检查 personal/update/ 的权限');
    }

    let child;
    let fd = null;
    try {
      fd = fsImpl.openSync(logFile, 'a');
      child = spawnImpl('bash', [script], {
        cwd: root,
        detached: true,
        stdio: ['ignore', fd, fd],
        env: childEnv,
      });
      if (typeof child?.unref === 'function') child.unref();
    } catch (error) {
      writeJson(updateStatusFile(root), record('failed', `无法启动更新脚本：${messageOf(error)}`));
      throw new PersonalError(500, `无法启动更新脚本：${messageOf(error)}`);
    } finally {
      if (fd !== null) {
        try {
          fsImpl.closeSync(fd);
        } catch {
          // The child keeps its own descriptor.
        }
      }
    }

    return { started: true, pid: Number.isInteger(child?.pid) ? child.pid : null, target };
  }

  return { status, check, apply };
}
