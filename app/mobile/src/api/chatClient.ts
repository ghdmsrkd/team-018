// Contract types come straight from the shared package (packages/schema/src/api.ts) through
// the tsconfig path alias. Imports here must stay `import type`: they are erased at build
// time, so Metro never has to resolve the package from outside app/mobile.
import type {
  ApiError,
  ChatRequest,
  ChatResponse,
  HealthResponse,
  PlacesProvider,
} from '@haru/schema';
import { NativeModules, Platform } from 'react-native';

type ConfigNative = { getApiConfig(): Promise<{ apiUrl: string | null }> };

const native: ConfigNative | undefined =
  Platform.OS === 'ios' && NativeModules.VisitMonitorModule?.getApiConfig
    ? NativeModules.VisitMonitorModule
    : undefined;

let cached: Promise<string | null> | null = null;

/**
 * Lambda Function URL injected at build time from an untracked .env (see
 * ios/scripts/inject-api-url.sh). Never hard-coded. null when not configured.
 */
export function getApiUrl(): Promise<string | null> {
  if (!cached) {
    cached = native
      ? native
          .getApiConfig()
          .then(c => c.apiUrl ?? null)
          .catch(() => null)
      : Promise.resolve(null);
  }
  return cached;
}

/**
 * Sending questions stays off. The relay itself works (Haiku 4.5 with tool_use, per
 * docs/app-handoff.md), but the app has no on-device memory.db and no read-only query_sql
 * tool loop yet, and this build has no deployed URL configured. Without the tool the model
 * would answer without the user's records.
 */
export const CHAT_SEND_ENABLED = false;

export type Health =
  | { state: 'unconfigured' }
  | { state: 'ok'; model: string | null; placesProvider: PlacesProvider | null }
  | { state: 'error'; detail: string };

const join = (base: string, path: string) =>
  `${base.replace(/\/+$/, '')}${path}`;

async function withTimeout<T>(
  p: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/** GET /health. Sends nothing but the request itself. */
export async function checkHealth(
  url?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Health> {
  const base = url === undefined ? await getApiUrl() : url;
  if (!base) {
    return { state: 'unconfigured' };
  }
  try {
    const res = await withTimeout(
      signal => fetchImpl(join(base, '/health'), { method: 'GET', signal }),
      8000,
    );
    const body = (await res
      .json()
      .catch(() => ({}))) as Partial<HealthResponse>;
    const provider = body.placesProvider;
    return res.ok && body.ok
      ? {
          state: 'ok',
          model: body.model ?? null,
          placesProvider:
            provider === 'google' || provider === 'kakao' ? provider : null,
        }
      : { state: 'error', detail: `HTTP ${res.status}` };
  } catch (e: any) {
    return {
      state: 'error',
      detail: String(e?.name === 'AbortError' ? '시간 초과' : e?.message ?? e),
    };
  }
}

/** Only contract fields; never model ids, maxTokens, raw coordinates or raw.db rows. */
export function buildChatRequest(
  system: string,
  messages: ChatRequest['messages'],
  tools?: NonNullable<ChatRequest['toolConfig']>['tools'],
): ChatRequest {
  const req: ChatRequest = { system: [{ text: system }], messages };
  if (tools && tools.length > 0) {
    req.toolConfig = { tools };
  }
  return req;
}

/** POST /chat. Callers must check CHAT_SEND_ENABLED first. */
export async function postChat(
  req: ChatRequest,
  url?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResponse> {
  const base = url === undefined ? await getApiUrl() : url;
  if (!base) {
    throw new Error('물어보기 서버 주소가 설정되지 않았어요.');
  }
  const res = await withTimeout(
    signal =>
      fetchImpl(join(base, '/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      }),
    60000,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as ApiError;
    throw new Error(
      err.detail
        ? `${err.error}: ${err.detail}`
        : err.error ?? `HTTP ${res.status}`,
    );
  }
  return body as ChatResponse;
}
