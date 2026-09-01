/**
 * Server-side-only client for `apps/harness`'s internal chat API (RFC 0063
 * §4, epic task 22.3). The browser never talks to `apps/harness` directly —
 * only this module and the route handler that calls it do. Matches the
 * `SOVEREIGN_AUTH_URL` pattern `plugins/account/app/actions.ts` already
 * uses for its own internal service address.
 */

const HARNESS_URL =
  process.env.SOVEREIGN_HARNESS_URL ?? `http://localhost:${process.env.HARNESS_PORT ?? '3003'}`;

// A health check should be near-instant when the service is actually up —
// far shorter than `model-discovery.ts`'s 8s model-list timeout. Without
// this, an `apps/harness` that's enabled but stalled or dropping packets
// (rather than cleanly refusing the connection) hangs `checkHarnessHealth()`
// indefinitely, since `fetch()` has no default timeout of its own — blocking
// every `discoverModels()` call, and therefore the whole Warden page, behind
// it (found live investigating slow Warden page loads).
const HARNESS_HEALTH_TIMEOUT_MS = 3000;

/** OpenAI-compatible multimodal content part — only ever appears in the
 *  current turn's outgoing message (an attached image), never in history
 *  loaded from `warden_messages` (always plain strings there) or sent to
 *  `apps/harness` (text-only, gated before it would ever receive one). */
export interface ChatMessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ChatMessageContentPart[];
}

export type HarnessChatResult =
  | { kind: 'stream'; response: Response }
  | { kind: 'unavailable'; message: string }
  | { kind: 'model_not_ready'; message: string; modelStatus: string }
  | { kind: 'rate_limited'; message: string; retryAfterSeconds: number }
  | { kind: 'error'; message: string };

// Stateless/self-verifying (apps/harness/src/enrollment.ts) — no expiry, so
// caching for the process lifetime is correct, not just an optimization.
// Cleared and re-fetched on a 401 (e.g. the operator rotated
// SOVEREIGN_HARNESS_ENROLLMENT_SECRET on the harness side).
let cachedToken: string | null = null;

/** @internal test-only reset. */
export function resetHarnessClientForTests(): void {
  cachedToken = null;
}

async function enroll(): Promise<{ token: string } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(`${HARNESS_URL}/api/enroll`, { method: 'POST' });
  } catch {
    return { error: 'apps/harness is unreachable.' };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'enrollment failed' }));
    return { error: body.message ?? 'apps/harness enrollment failed.' };
  }
  const body = (await response.json()) as { instanceKey: string };
  return { token: body.instanceKey };
}

async function getToken(): Promise<{ token: string } | { error: string }> {
  if (cachedToken) return { token: cachedToken };
  const result = await enroll();
  if ('token' in result) cachedToken = result.token;
  return result;
}

async function postChat(token: string, messages: ChatMessage[], maxTokens?: number) {
  return fetch(`${HARNESS_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, ...(maxTokens ? { maxTokens } : {}) }),
  });
}

export type HarnessHealth =
  { kind: 'ready' } | { kind: 'not_ready'; modelStatus: string } | { kind: 'unreachable' };

/**
 * Checks whether the local `apps/harness` engine is reachable and has a
 * model ready to serve (epic task 22.4) — used to fold a "local" entry into
 * Warden's merged model list. Calls `apps/harness`'s existing, deliberately
 * unauthenticated `GET /api/health` (RFC 0063 §4/§7) directly; no enrollment
 * token needed, and no change to `apps/harness` itself. Never throws — an
 * unreachable local engine is a normal, expected state (it's entirely
 * optional infrastructure), not an error to propagate.
 */
export async function checkHarnessHealth(): Promise<HarnessHealth> {
  let response: Response;
  try {
    response = await fetch(`${HARNESS_URL}/api/health`, {
      signal: AbortSignal.timeout(HARNESS_HEALTH_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unreachable' };
  }
  if (!response.ok) return { kind: 'unreachable' };
  const body = await response.json().catch(() => null);
  if (body?.modelStatus === 'ready') return { kind: 'ready' };
  return { kind: 'not_ready', modelStatus: body?.modelStatus ?? 'unknown' };
}

/**
 * Requests a chat completion from `apps/harness`. On success, returns the
 * raw streaming `Response` for the caller (the route handler) to proxy
 * straight through — `apps/harness`'s own SSE frame shape
 * (`{type: 'token'|'done'|'error', ...}`) is not reframed here. Every
 * failure mode maps to one of RFC 0063 §6's states.
 */
export async function requestHarnessChat(
  messages: ChatMessage[],
  maxTokens?: number,
): Promise<HarnessChatResult> {
  const tokenResult = await getToken();
  if ('error' in tokenResult) return { kind: 'unavailable', message: tokenResult.error };

  let response: Response;
  try {
    response = await postChat(tokenResult.token, messages, maxTokens);
  } catch {
    return { kind: 'unavailable', message: 'apps/harness is unreachable.' };
  }

  if (response.status === 401) {
    // Cached token rejected (secret rotated) — re-enroll once and retry.
    cachedToken = null;
    const retryToken = await getToken();
    if ('error' in retryToken) return { kind: 'unavailable', message: retryToken.error };
    try {
      response = await postChat(retryToken.token, messages, maxTokens);
    } catch {
      return { kind: 'unavailable', message: 'apps/harness is unreachable.' };
    }
    if (response.status === 401) {
      return { kind: 'unavailable', message: 'apps/harness rejected authentication.' };
    }
  }

  if (response.status === 200) return { kind: 'stream', response };

  const body = await response.json().catch(() => ({ message: 'unknown error' }));

  if (response.status === 429) {
    return {
      kind: 'rate_limited',
      message: body.message ?? 'Too many requests.',
      retryAfterSeconds: Number(response.headers.get('retry-after') ?? '5'),
    };
  }
  if (body.error === 'model_not_ready') {
    return {
      kind: 'model_not_ready',
      message: body.message ?? 'The chat model is still downloading.',
      modelStatus: body.modelStatus ?? 'not_downloaded',
    };
  }
  if (body.error === 'not_configured' || response.status === 503) {
    return { kind: 'unavailable', message: body.message ?? 'apps/harness is not available.' };
  }
  return { kind: 'error', message: body.message ?? 'The chat request failed.' };
}
