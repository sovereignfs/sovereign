import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { signJWT } from 'better-auth/plugins/jwt';
import type { BetterAuthPlugin } from 'better-auth';
import { getEnv } from './env';

/**
 * Offline session assertion (research 0012, epic task 1.21).
 *
 * ## Why this exists
 *
 * When the device is offline the platform's service worker serves a cached
 * document from Cache Storage and **no server code runs at all** — not this
 * app, not the runtime middleware, not `/api/verify`. So the "is this session
 * still valid?" question has to be answerable by the service worker alone,
 * from something already on the device.
 *
 * `session.cookieCache` cannot serve that purpose. It is HMAC-signed with
 * `AUTH_SECRET`, and verifying an HMAC requires the secret — which must never
 * reach the browser. Its 300s `maxAge` is also deliberately short: it bounds
 * how stale a role change or deactivation can be for *online* requests, and
 * stretching it to cover offline use would widen that window for every request,
 * online or not.
 *
 * This endpoint issues a separate, **asymmetrically signed** assertion instead.
 * It is signed with the same keypair better-auth's `jwt()` plugin already uses
 * (enabled for RFC 0072), whose public half is already published at
 * `/.well-known/jwks.json` — so the service worker can verify it with WebCrypto
 * and no shared secret. No new key material is introduced.
 *
 * ## Threat model — read this before changing anything here
 *
 * Signing does **not** stop an attacker who has the device from replaying their
 * own still-valid assertion. It cannot: the cached shell those bytes unlock is
 * sitting in Cache Storage right next to them. Anyone able to read the
 * assertion can already read what it protects.
 *
 * What signing does buy, and the only two properties anything should rely on:
 *
 * 1. **The offline window cannot be extended past what the server granted.**
 *    Editing `exp` invalidates the signature.
 * 2. **The assertion cannot be re-pointed at a different user.** Editing `sub`
 *    invalidates the signature.
 *
 * Property 2 is load-bearing for per-user cache partitioning (epic task 2.31):
 * the partition key is derived from `sub`, so if `sub` were forgeable an
 * attacker could name another user and be served that user's cached shell on a
 * shared device. That is the exact failure the partitioning exists to prevent.
 *
 * The assertion carries **no capabilities and no role**. It answers one
 * question — "which user was signed in here, and until when" — and must never
 * grow into a bearer token for server-side authorization. Server-side
 * authorization always goes through the session cookie, which this does not
 * replace.
 */

/** JWT `typ` claim, so this assertion can never be mistaken for an OIDC token. */
const OFFLINE_ASSERTION_TYPE = 'sovereign-offline-session+jwt';

export interface OfflineSessionAssertion {
  /** The signed compact JWS. */
  token: string;
  /** Seconds until expiry, mirrored outside the token for convenient client scheduling. */
  expiresInSeconds: number;
}

/**
 * A minimal better-auth plugin exposing `GET /api/auth/offline-session`.
 *
 * Deliberately its own endpoint rather than reusing the `jwt()` plugin's
 * `/token`: that route's payload, subject, and expiry are shared configuration
 * driving RFC 0072's OIDC ID tokens, and changing them to suit offline use
 * would silently alter every token those clients receive.
 */
export function offlineSession(): BetterAuthPlugin {
  return {
    id: 'sovereign-offline-session',
    endpoints: {
      getOfflineSession: createAuthEndpoint(
        '/offline-session',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const ttl = getEnv().offlineSessionTtlSeconds;
          const nowSeconds = Math.floor(Date.now() / 1000);
          const sessionExpiresAt = Math.floor(
            new Date(ctx.context.session.session.expiresAt).getTime() / 1000,
          );

          // Never outlive the session itself. Without this, a long offline TTL
          // would let a device keep rendering its cached shell past the point
          // the session would have expired anyway — granting more offline
          // reach than the user's actual session ever had.
          const expiresAt = Math.min(nowSeconds + ttl, sessionExpiresAt);
          const expiresInSeconds = Math.max(expiresAt - nowSeconds, 0);

          // An already-expired session yields no assertion rather than one
          // that is dead on arrival, so the caller's "no assertion" path runs.
          if (expiresInSeconds === 0) {
            return ctx.json({ token: null, expiresInSeconds: 0 });
          }

          const token = await signJWT(ctx, {
            payload: {
              sub: ctx.context.session.user.id,
              exp: expiresAt,
              iat: nowSeconds,
              typ: OFFLINE_ASSERTION_TYPE,
            },
          });

          return ctx.json({ token, expiresInSeconds } satisfies OfflineSessionAssertion);
        },
      ),
    },
  };
}

export { OFFLINE_ASSERTION_TYPE };
