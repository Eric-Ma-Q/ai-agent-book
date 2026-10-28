// Client for the agent-lab service behind the dev proxy (/__lab/* → :4330).
// Every response is {success, data, error}; FastAPI's own 404 for an unknown
// route ({detail: "Not Found"}) means the backend feature is not built yet.
import type { LabEvent } from './types.ts';

export const LAB_API = '/__lab';
const EVENT_TYPES = ['run_start', 'llm_request', 'llm_response', 'tool_call', 'gate', 'info', 'run_end'];

export class LabError extends Error {
  readonly status: number;
  readonly notReady: boolean;

  constructor(message: string, status: number, notReady = false) {
    super(message);
    this.status = status;
    this.notReady = notReady;
  }
}

type ValidationItem = { loc?: (string | number)[]; msg?: string };

/** FastAPI puts request validation errors in `detail` as a list. */
export function describeDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return (detail as ValidationItem[])
      .map((item) => `${(item.loc ?? []).filter((part) => part !== 'body').join('.')}：${item.msg ?? ''}`)
      .join('；');
  }
  return JSON.stringify(detail ?? '');
}

export async function labApi<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LAB_API}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
    throw new LabError('无法连接阅读器的实验台代理', 0);
  }
  let payload: { success?: boolean; data?: T; error?: string | null; detail?: unknown } = {};
  try {
    payload = await response.json();
  } catch {
    throw new LabError(`实验台服务返回了无法解析的响应（HTTP ${response.status}）`, response.status);
  }
  if (response.ok && payload.success !== false) return payload.data as T;
  const notReady = response.status === 404 && payload.success === undefined;
  const detail = describeDetail(payload.detail);
  throw new LabError(payload.error ?? (notReady ? '该功能的服务尚未就绪' : response.status === 422 ? `请求参数不合法：${detail}` : `HTTP ${response.status}：${detail}`), response.status, notReady);
}

/**
 * Follow a run's events over SSE. The server closes the stream after run_end;
 * we close the EventSource then too, so it does not reconnect forever.
 */
export function streamRun(
  runId: string,
  onEvent: (event: LabEvent) => void,
  onError?: (message: string) => void,
  after = 0,
) {
  const source = new EventSource(`${LAB_API}/runs/${encodeURIComponent(runId)}/events?after=${after}`);
  let finished = false;
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as LabEvent;
        onEvent(event);
        if (event.type === 'run_end') {
          finished = true;
          source.close();
        }
      } catch {
        onError?.('收到无法解析的事件');
      }
    });
  }
  source.onerror = () => {
    if (!finished && source.readyState === EventSource.CLOSED) onError?.('事件流已断开，刷新页面可以重新加载');
  };
  return () => source.close();
}
