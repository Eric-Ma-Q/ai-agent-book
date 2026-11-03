// Requirement 031: a small red dot on the header settings icon when this
// repository's release is newer than the running checkout. The check runs once per
// page load at most, reuses a five-minute sessionStorage cache, and stays quiet
// on any failure so reading is never blocked by the update service.
import './update.css';

const CACHE_KEY = 'agent-book-update-badge';
const CACHE_TTL = 5 * 60 * 1000;
const ENDPOINT = '/__personal/update/status';

type BadgeCache = {
  at: number;
  updateAvailable: boolean;
  latestVersion: string | null;
};

type StatusPayload = {
  ok?: boolean;
  data?: { enabled?: boolean; updateAvailable?: boolean; latestVersion?: string | null };
};

function readCache(): BadgeCache | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BadgeCache>;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > CACHE_TTL) return null;
    return {
      at: parsed.at,
      updateAvailable: Boolean(parsed.updateAvailable),
      latestVersion: typeof parsed.latestVersion === 'string' ? parsed.latestVersion : null,
    };
  } catch {
    return null;
  }
}

function writeCache(value: { updateAvailable: boolean; latestVersion: string | null }) {
  try {
    const cache: BadgeCache = { at: Date.now(), ...value };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable; the dot still shows for this page load.
  }
}

function versionLabel(version: string | null): string {
  const text = String(version ?? '').trim();
  return text ? `v${text.replace(/^v/i, '')}` : '';
}

function markEntry(updateAvailable: boolean, latestVersion: string | null): boolean {
  if (!updateAvailable) return true;
  const entry = document.querySelector<HTMLAnchorElement>('.settings-entry');
  if (!entry) return false;
  entry.classList.add('has-update');
  const version = versionLabel(latestVersion);
  entry.setAttribute('aria-label', version ? `设置（有新版本 ${version}）` : '设置（有新版本）');
  if (!entry.querySelector('.update-dot')) {
    const dot = document.createElement('span');
    dot.className = 'update-dot';
    dot.setAttribute('aria-hidden', 'true');
    entry.append(dot);
  }
  return true;
}

/** The settings link may be created by a sibling module after this one runs, so
 *  retry once on the microtask queue instead of giving up on the dot. */
function paint(updateAvailable: boolean, latestVersion: string | null) {
  if (markEntry(updateAvailable, latestVersion)) return;
  queueMicrotask(() => markEntry(updateAvailable, latestVersion));
}

async function fetchStatus(): Promise<StatusPayload['data'] | null> {
  const response = await fetch(ENDPOINT, { headers: { 'x-personal-api': '1' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as StatusPayload;
  if (payload.ok === false) throw new Error('status request failed');
  return payload.data ?? null;
}

async function boot() {
  const cached = readCache();
  if (cached) {
    paint(cached.updateAvailable, cached.latestVersion);
    return;
  }
  try {
    const data = await fetchStatus();
    if (!data || data.enabled === false) {
      writeCache({ updateAvailable: false, latestVersion: null });
      return;
    }
    const updateAvailable = Boolean(data.updateAvailable);
    const latestVersion = typeof data.latestVersion === 'string' ? data.latestVersion : null;
    writeCache({ updateAvailable, latestVersion });
    paint(updateAvailable, latestVersion);
  } catch {
    // Silent by design: the settings page still shows the full status.
  }
}

void boot();
