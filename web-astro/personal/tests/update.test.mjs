import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalApi } from '../api.mjs';
import { createUpdateCenter, compareVersions } from '../update.mjs';
import { PersonalError } from '../paths.mjs';

function workspace({ version = '1.0.0', script = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'update-center-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'VERSION'), `${version}\n`);
  if (script) writeFileSync(join(root, 'scripts/update.sh'), '#!/usr/bin/env bash\n');
  return root;
}

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

function centerFor({ root = workspace(), env = {}, fetchImpl, spawnImpl, now } = {}) {
  const calls = [];
  const spawned = [];
  const errors = [];
  const center = createUpdateCenter({
    root,
    env: { UPDATE_REPO: 'owner/repo', UPDATE_ADMIN_TOKEN: 's3cret', ...env },
    fetchImpl:
      fetchImpl ??
      (async (url) => {
        calls.push(url);
        return response({
          tag_name: 'v2.0.0',
          body: '新增更新中心',
          html_url: 'https://example.com/releases/v2.0.0',
          published_at: '2026-10-01T00:00:00Z',
        });
      }),
    spawnImpl:
      spawnImpl ??
      ((command, args, options) => {
        spawned.push({ command, args, options });
        return { pid: 4242, unref() {} };
      }),
    now: now ?? (() => Date.now()),
    log: { error: (message) => errors.push(message), warn: () => {} },
  });
  return { center, calls, spawned, errors, root };
}

test('compares versions with a v prefix and prerelease suffixes', () => {
  assert.equal(compareVersions('1.2.3', 'v1.2.4'), -1);
  assert.equal(compareVersions('v1.2.4', '1.2.4'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3'), -1);
  assert.equal(compareVersions('1.2.3-beta.2', '1.2.3-beta.1'), 1);
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3-beta.1'), 0);
  assert.equal(compareVersions('1.2.3-alpha', '1.2.3-beta'), -1);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('falls back to 0.0.0 without a VERSION file and stays disabled without a repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'update-center-'));
  const { center } = centerFor({ root, env: { UPDATE_REPO: '' } });
  const status = center.status();
  assert.equal(status.currentVersion, '0.0.0');
  assert.equal(status.enabled, false);
  assert.equal(status.state, 'idle');
  assert.equal(status.updateAvailable, false);
});

test('check-only mode reports updates but refuses to start the script', async () => {
  const { center, spawned } = centerFor({ env: { UPDATE_CHECK_ONLY: '1' } });
  const status = await center.check({ force: true });
  assert.equal(status.checkOnly, true);
  assert.equal(status.updateAvailable, true);
  assert.throws(() => center.apply({ token: 's3cret' }), (error) => {
    assert.equal(error.status, 403);
    assert.match(error.message, /只检查更新/);
    return true;
  });
  assert.equal(spawned.length, 0);
});

test('reads the latest release and reports an available update', async () => {
  const { center, calls } = centerFor();
  const status = await center.check({ force: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/repos\/owner\/repo\/releases\/latest$/);
  assert.equal(status.latestVersion, '2.0.0');
  assert.equal(status.updateAvailable, true);
  assert.equal(status.notes, '新增更新中心');
  assert.equal(status.releaseUrl, 'https://example.com/releases/v2.0.0');
  assert.equal(status.publishedAt, '2026-10-01T00:00:00Z');
  assert.ok(status.checkedAt);
  assert.equal(status.error, null);
});

test('a fresh cache answers without another request', async () => {
  const { center, calls } = centerFor();
  await center.check({ force: true });
  const cached = await center.check();
  assert.equal(calls.length, 1);
  assert.equal(cached.latestVersion, '2.0.0');
});

test('a failed check keeps the previous cache and exposes the error', async () => {
  let fail = false;
  const { center } = centerFor({
    fetchImpl: async () => {
      if (fail) throw new Error('network down');
      return response({ tag_name: 'v2.0.0', body: 'ok' });
    },
  });
  await center.check({ force: true });
  fail = true;
  await assert.rejects(center.check({ force: true }), (error) => {
    assert.ok(error instanceof PersonalError);
    assert.equal(error.status, 502);
    assert.match(error.message, /network down/);
    return true;
  });
  const status = center.status();
  assert.equal(status.latestVersion, '2.0.0');
  assert.match(status.error, /检查更新失败/);
  assert.equal(status.updateAvailable, true);
});

test('falls back to the releases page when the GitHub API is rate limited', async () => {
  const root = workspace();
  const center = createUpdateCenter({
    root,
    env: { UPDATE_REPO: 'owner/repo', UPDATE_API_BASE: 'https://api.example' },
    fetchImpl: async (url) => {
      if (url.endsWith('/releases/latest') && url.includes('api.example')) return response({}, 403);
      if (url.endsWith('/tags')) return response({}, 403);
      return {
        ok: true,
        status: 200,
        url: 'https://github.com/owner/repo/releases/tag/v3.0.0',
        json: async () => ({}),
      };
    },
    spawnImpl: () => ({ pid: 1, unref() {} }),
  });
  const status = await center.check({ force: true });
  assert.equal(status.latestVersion, '3.0.0');
  assert.equal(status.updateAvailable, true);
  assert.equal(status.notes, '');
});

test('falls back to the tags endpoint when there is no release', async () => {
  const urls = [];
  const { center } = centerFor({
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.endsWith('/releases/latest')) return response({ message: 'Not Found' }, 404);
      return response([{ name: 'v3.1.0' }, { name: 'v3.0.0' }]);
    },
  });
  const status = await center.check({ force: true });
  assert.equal(status.latestVersion, '3.1.0');
  assert.equal(status.notes, '');
  assert.equal(status.releaseUrl, '');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /\/repos\/owner\/repo\/tags$/);
});

test('apply rejects a missing token configuration with 503', () => {
  const { center } = centerFor({ env: { UPDATE_ADMIN_TOKEN: '' } });
  assert.throws(() => center.apply({ token: 's3cret' }), (error) => {
    assert.equal(error.status, 503);
    assert.match(error.message, /未配置管理员 token/);
    return true;
  });
});

test('apply rejects a wrong token with 401', () => {
  const { center, spawned } = centerFor();
  for (const token of ['', 'wrong', 's3cret-longer']) {
    assert.throws(() => center.apply({ token }), (error) => {
      assert.equal(error.status, 401);
      return true;
    });
  }
  assert.equal(spawned.length, 0);
});

test('apply starts the script detached and records running', async () => {
  const { center, spawned, root } = centerFor();
  await center.check({ force: true });
  const result = center.apply({ token: 's3cret' });
  assert.deepEqual(result, { started: true, pid: 4242, target: 'v2.0.0' });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, 'bash');
  assert.deepEqual(spawned[0].args, [join(root, 'scripts/update.sh')]);
  assert.equal(spawned[0].options.detached, true);
  assert.equal(spawned[0].options.cwd, root);
  assert.equal(spawned[0].options.env.UPDATE_TARGET, 'v2.0.0');

  const state = JSON.parse(readFileSync(join(root, 'personal/update/status.json'), 'utf8'));
  assert.equal(state.state, 'running');
  assert.equal(state.from, '1.0.0');
  assert.equal(state.pid, null);
  assert.equal(state.target, 'v2.0.0');
  assert.equal(center.status().state, 'running');
});

test('apply accepts a token read from personal/update/token', () => {
  const root = workspace();
  mkdirSync(join(root, 'personal/update'), { recursive: true });
  writeFileSync(join(root, 'personal/update/token'), 'file-token\n');
  const { center, spawned } = centerFor({ root, env: { UPDATE_ADMIN_TOKEN: '' } });
  assert.equal(center.apply({ token: 'file-token' }).started, true);
  assert.equal(spawned.length, 1);
});

test('apply returns 409 while a fresh update is running', () => {
  const root = workspace();
  mkdirSync(join(root, 'personal/update'), { recursive: true });
  writeFileSync(
    join(root, 'personal/update/status.json'),
    JSON.stringify({
      state: 'running',
      from: '1.0.0',
      to: 'v2.0.0',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      pid: 1,
    }),
  );
  const { center, spawned } = centerFor({ root });
  assert.throws(() => center.apply({ token: 's3cret' }), (error) => {
    assert.equal(error.status, 409);
    return true;
  });
  assert.equal(spawned.length, 0);
});

test('a running status without a heartbeat for 30 minutes counts as failed', () => {
  const root = workspace();
  mkdirSync(join(root, 'personal/update'), { recursive: true });
  writeFileSync(
    join(root, 'personal/update/status.json'),
    JSON.stringify({
      state: 'running',
      from: '1.0.0',
      to: 'v2.0.0',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      pid: 1,
    }),
  );
  const later = Date.now() + 31 * 60 * 1000;
  const { center, spawned } = centerFor({ root, now: () => later });
  const status = center.status();
  assert.equal(status.state, 'failed');
  assert.match(status.error, /30 分钟/);
  assert.equal(center.apply({ token: 's3cret' }).started, true);
  assert.equal(spawned.length, 1);
});

test('apply returns 500 when the update script is missing', () => {
  const { center, spawned } = centerFor({ root: workspace({ script: false }) });
  assert.throws(() => center.apply({ token: 's3cret' }), (error) => {
    assert.equal(error.status, 500);
    assert.match(error.message, /scripts\/update\.sh/);
    return true;
  });
  assert.equal(spawned.length, 0);
});

test('status returns the last 40 log lines within 8000 characters', () => {
  const root = workspace();
  mkdirSync(join(root, 'run-logs'), { recursive: true });
  const lines = Array.from({ length: 60 }, (_value, index) => `第 ${index} 行日志`);
  writeFileSync(join(root, 'run-logs/update.log'), `${lines.join('\n')}\n`);
  const { center } = centerFor({ root });
  const status = center.status();
  const tail = status.logTail.split('\n');
  assert.equal(tail.length, 40);
  assert.equal(tail[0], '第 20 行日志');
  assert.equal(tail[39], '第 59 行日志');
  assert.ok(status.logTail.length <= 8000);

  writeFileSync(join(root, 'run-logs/update.log'), 'x'.repeat(9000));
  assert.equal(center.status().logTail.length, 8000);
});

test('corrupt status and cache files degrade to an idle empty status', () => {
  const root = workspace();
  mkdirSync(join(root, 'personal/update'), { recursive: true });
  writeFileSync(join(root, 'personal/update/status.json'), '{oops');
  writeFileSync(join(root, 'personal/update/cache.json'), 'not json');
  const { center } = centerFor({ root });
  const status = center.status();
  assert.equal(status.state, 'idle');
  assert.equal(status.latestVersion, '');
  assert.equal(status.error, null);
});

test('the HTTP API exposes status, check and a 202 apply with the token header', async () => {
  const seen = [];
  const update = {
    status: () => ({ enabled: true, state: 'idle' }),
    check: async ({ force }) => {
      seen.push(force);
      return { checked: true };
    },
    apply: ({ token }) => {
      if (token !== 'abc') throw new PersonalError(401, '管理员 token 不正确');
      return { started: true };
    },
  };
  const api = createPersonalApi({
    root: mkdtempSync(join(tmpdir(), 'update-api-')),
    render: async () => '',
    update,
    log: { error: () => {} },
  });
  const server = createServer((req, res) => api(req, res, () => res.end('next')));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/__personal`;
  const headers = { 'x-personal-api': '1', 'content-type': 'application/json' };
  try {
    const status = await fetch(`${base}/update/status`, { headers });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).data.enabled, true);

    const check = await fetch(`${base}/update/check`, { method: 'POST', headers, body: '{}' });
    assert.equal(check.status, 200);
    assert.deepEqual(seen, [true]);

    const denied = await fetch(`${base}/update/apply`, { method: 'POST', headers, body: '{}' });
    assert.equal(denied.status, 401);

    const applied = await fetch(`${base}/update/apply`, {
      method: 'POST',
      headers: { ...headers, 'x-update-token': 'abc' },
      body: '{}',
    });
    assert.equal(applied.status, 202);
    assert.deepEqual(await applied.json(), { ok: true, data: { started: true } });
  } finally {
    server.close();
  }
});
