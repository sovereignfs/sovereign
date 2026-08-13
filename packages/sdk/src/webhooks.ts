import { requireHost } from './host';
import type { CheckWebhookReplayInput, VerifyWebhookHmacInput } from './types';

function getPluginId(headers: Headers): string | null {
  return headers.get('x-sovereign-plugin-id');
}

/**
 * Public plugin webhook helpers (RFC 0050) — small server-side primitives
 * for a webhook route's own handler to call, not a full provider framework.
 * The manifest `webhooks` field only declares *metadata* (path, methods,
 * body-size cap); it is this handler's job to actually verify the request
 * and fail closed. See `docs/plugin-development.md`'s "webhooks" section
 * for the full pattern.
 */
export const webhooks = {
  /**
   * Verify an HMAC signature against a plugin-scoped secret (looked up by
   * `secretRef`, an id from `sdk.secrets.create()`). Returns `false` for a
   * missing/wrong-scope secret or a mismatched signature — never throws for
   * an invalid signature, so callers can respond 401/404 without leaking
   * which failure occurred.
   *
   * @example
   * ```ts
   * const bytes = new Uint8Array(await request.arrayBuffer());
   * const ok = await sdk.webhooks.verifyHmac(
   *   { body: bytes, signatureHeader: request.headers.get('x-signature') ?? '', secretRef, algorithm: 'sha256' },
   *   request.headers,
   * );
   * if (!ok) return new Response('Unauthorized', { status: 401 });
   * ```
   */
  async verifyHmac(input: VerifyWebhookHmacInput, requestHeaders: Headers): Promise<boolean> {
    const pluginId = getPluginId(requestHeaders);
    if (!pluginId) return false;
    return requireHost().webhooks.verifyHmac(input, pluginId);
  },

  /**
   * Claim `(provider, eventId)` for replay protection, scoped to the
   * calling plugin. Returns `true` the first time an event is seen (safe to
   * process) and `false` on every call within `ttlSeconds` after that (a
   * replay — return a 200 without reprocessing, most providers treat a
   * non-2xx as "retry me").
   */
  async checkReplay(input: CheckWebhookReplayInput, requestHeaders: Headers): Promise<boolean> {
    const pluginId = getPluginId(requestHeaders);
    if (!pluginId) return false;
    return requireHost().webhooks.checkReplay(input, pluginId);
  },
};
