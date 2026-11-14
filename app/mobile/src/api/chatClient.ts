import type { ApiError, ChatRequest, ChatResponse } from './contract';

/**
 * Lambda Function URL for /chat. Deliberately not configured in this build: the URL lives in
 * an untracked env file per backend/README.md and is not set up here.
 */
export const API_URL: string | null = null;

/**
 * The agent loop needs a local read-only `query_sql` tool over memory.db (system design
 * ch. 3–4), which the app does not have yet. Without it the model would answer without the
 * user's data, so asking stays disabled even if a URL is set.
 */
export const LOCAL_QUERY_TOOL_READY = false;

export const askAvailable = () => API_URL != null && LOCAL_QUERY_TOOL_READY;

/** Only the contract fields; never model ids, maxTokens or raw coordinates. */
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

export async function postChat(
  req: ChatRequest,
  url: string | null = API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResponse> {
  if (!url) {
    throw new Error('물어보기 서버 주소가 설정되지 않았어요.');
  }
  const res = await fetchImpl(`${url.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const body = await res.json();
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
