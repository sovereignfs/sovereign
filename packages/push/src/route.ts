import type { PushSettings } from './settings.js';
import type { PushStore } from './store.js';
import { MAX_ENDPOINT_LENGTH, parseSubscription } from './subscription.js';

/** The most of a request's body that is read. */
export const MAX_BODY_BYTES = 4096;

export interface PushSubscriptionHandlersOptions {
  readonly store: PushStore;
  readonly settings: PushSettings | undefined;
  /** The signed-in account of a request, the app's own; `undefined` answers `401`. */
  readonly account: (request: Request) => string | undefined | Promise<string | undefined>;
  /** The app's origin (`https://app.example.com`), which a changing request's `Origin` must be. Default the request URL's own. */
  readonly origin?: string;
  /** As for `parseSubscription`. */
  readonly hosts?: readonly string[];
  readonly now?: () => number;
}

export interface PushSubscriptionHandlers {
  /** `{ available: false }`, or `{ available: true, publicKey }`. */
  GET(request: Request): Promise<Response>;
  /** Saves the device's subscription for the account: `204`; `400` for anything that is not one; `503` with no key. */
  POST(request: Request): Promise<Response>;
  /** `{ endpoint }`: removes that device for this account only. `204` whether or not it had it. */
  DELETE(request: Request): Promise<Response>;
}

const NO_STORE = { 'cache-control': 'no-store' };
const answer = (status: number, body?: unknown) =>
  body === undefined
    ? new Response(null, { status, headers: NO_STORE })
    : Response.json(body, { status, headers: NO_STORE });

/** The body as JSON, read to {@link MAX_BODY_BYTES} at most; `undefined` for more, or for anything that is not JSON. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The route a device uses (RFC 0009 §1.6), as framework-free handlers for the app to mount (the template at
 * `/api/push/subscription`). Each answer is `no-store`; a changing request is refused unless its `Origin` is the app's own.
 */
export function pushSubscriptionHandlers(
  options: PushSubscriptionHandlersOptions,
): PushSubscriptionHandlers {
  const { store, settings } = options;
  const now = options.now ?? Date.now;
  const sameOrigin = (request: Request) => {
    const origin = request.headers.get('origin');
    return origin !== null && origin === (options.origin ?? new URL(request.url).origin);
  };

  return {
    async GET(request) {
      if ((await options.account(request)) === undefined) return answer(401);
      return answer(
        200,
        settings ? { available: true, publicKey: settings.publicKey } : { available: false },
      );
    },

    async POST(request) {
      if (!sameOrigin(request)) return answer(403);
      const account = await options.account(request);
      if (account === undefined) return answer(401);
      if (!settings) return answer(503, { available: false });
      const parsed = parseSubscription(
        await readJson(request),
        options.hosts ? { hosts: options.hosts } : {},
      );
      if (!parsed.ok) return answer(400, { error: parsed.reason });
      await store.saveDevice(account, parsed.subscription, now());
      return answer(204);
    },

    async DELETE(request) {
      if (!sameOrigin(request)) return answer(403);
      const account = await options.account(request);
      if (account === undefined) return answer(401);
      const body = await readJson(request);
      const endpoint =
        typeof body === 'object' && body !== null && !Array.isArray(body)
          ? (body as Record<string, unknown>).endpoint
          : undefined;
      if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH)
        return answer(400, { error: 'endpoint is required' });
      await store.removeDevice(account, endpoint);
      return answer(204);
    },
  };
}
