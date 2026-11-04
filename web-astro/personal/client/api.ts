// Must match API_PREFIX and API_HEADER in ../api.mjs.
const PREFIX = '/__personal';

export async function personalApi<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${PREFIX}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-personal-api': '1',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload: { ok: boolean; data?: T; error?: string };
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Local notes server returned HTTP ${response.status}`);
  }
  if (!payload.ok) throw new Error(payload.error ?? 'Local notes request failed');
  return payload.data as T;
}

// Binary reader for image and PDF previews. The response is the raw file, so
// errors arrive as the usual JSON envelope and are turned into Error messages.
export async function personalBlob(path: string): Promise<Blob> {
  const response = await fetch(`${PREFIX}${path}`, {
    headers: { 'x-personal-api': '1' },
  });
  if (!response.ok) {
    let message = `Local files server returned HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok && payload.error) message = payload.error;
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new Error(message);
  }
  return response.blob();
}
