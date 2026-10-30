import { createHash } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { resolveSigningKey, signJWT } from 'better-auth/plugins';
import type { JwtOptions } from 'better-auth/plugins/jwt';
import { decodeJwt } from 'jose';
import type { Auth } from '../auth/auth';
import { parseMetadata } from './client-metadata';
import { jwksOptions } from './keys';

type EndpointContext = Parameters<typeof resolveSigningKey>[0];
type KeyContext = EndpointContext['context'];

/** How an app's ID tokens are signed (core-app §3.7.1): EdDSA, or RS256 for an app that cannot verify it. */
export type IdTokenAlgorithm = 'EdDSA' | 'RS256';

/** What an app's stored metadata says. Anything but an explicit RS256 is the default. */
export function idTokenAlgorithmOf(metadata: unknown): IdTokenAlgorithm {
  return parseMetadata(metadata).idTokenAlgorithm === 'RS256' ? 'RS256' : 'EdDSA';
}

/**
 * `at_hash` for an RS256 token (OpenID Connect Core §3.1.3.6): the left half of the SHA-256 of the access token,
 * base64url. The provider computed its own for the primary algorithm, so one re-signed here needs this one.
 */
export function rs256AccessTokenHash(accessToken: string): string {
  const digest = createHash('sha256').update(accessToken, 'ascii').digest();
  return digest.subarray(0, digest.length / 2).toString('base64url');
}

/**
 * Makes the RS256 key if there is no live one, so the key set holds an RSA key before any token does. An app that can
 * only verify RS256 reads the key set when sign-in starts, before it has been given a token, and with no key there it
 * stops with a vague error. The key rotates like the primary one: when it expires, this makes the next.
 */
export async function ensureRs256Key(
  context: KeyContext | Awaited<Auth['$context']>,
): Promise<void> {
  // better-auth's own context (`auth.$context`) and an endpoint's differ only in fields the key code never reads.
  await resolveSigningKey(
    { context } as unknown as EndpointContext,
    { jwks: jwksOptions },
    {
      signingAlgorithm: 'RS256',
    },
  );
}

/**
 * Signs an app's ID tokens as RS256 when an operator set it so (core-app §3.6.1).
 *
 * The provider signs every ID token with the primary key, whoever asks, and has no per-app choice. So after the token
 * endpoint answers, an app set to RS256 gets the same token again, claims unchanged, signed with the RS256 key and with
 * an `at_hash` for that algorithm. This covers the authorization-code and refresh grants, which are the endpoint's
 * only two. Every other app's answer, and every refusal, is left exactly as the provider made it.
 */
export function idTokenAlgorithm(options: JwtOptions) {
  return {
    id: 'core-id-token-algorithm',
    hooks: {
      before: [
        {
          // The key set is where an RS256-only app finds the RSA key, so it is made here if an app needs it and it
          // is gone: after the old one expired, or a restore from before the app was set.
          matcher: (context) => context.path === '/jwks',
          handler: createAuthMiddleware(async (ctx) => {
            const clients = await ctx.context.adapter.findMany<{ metadata?: unknown }>({
              model: 'oauthClient',
            });
            if (clients.some((client) => idTokenAlgorithmOf(client.metadata) === 'RS256')) {
              await ensureRs256Key(ctx.context);
            }
          }),
        },
      ],
      after: [
        {
          // better-auth gives every key without a curve of its own the primary key's, so an RSA key is published with
          // `crv: "Ed25519"`, which no RSA key has. It is taken off, so the key set is what a relying party expects.
          matcher: (context) => context.path === '/jwks',
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned as
              { keys?: Record<string, unknown>[] } | undefined;
            if (!returned || !Array.isArray(returned.keys)) return;
            if (!returned.keys.some((key) => key.kty === 'RSA' && 'crv' in key)) return;
            return ctx.json({
              ...returned,
              keys: returned.keys.map((key) => {
                if (key.kty !== 'RSA') return key;
                const { crv: _curve, ...rsa } = key;
                return rsa;
              }),
            });
          }),
        },
        {
          matcher: (context) => context.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned as Record<string, unknown> | undefined;
            const idToken =
              returned && typeof returned === 'object' ? returned.id_token : undefined;
            if (typeof idToken !== 'string') return;

            const claims = decodeJwt(idToken);
            const clientId = typeof claims.aud === 'string' ? claims.aud : undefined;
            if (!clientId) return;
            const client = await ctx.context.adapter.findOne<{ metadata?: unknown }>({
              model: 'oauthClient',
              where: [{ field: 'clientId', value: clientId }],
            });
            if (!client || idTokenAlgorithmOf(client.metadata) !== 'RS256') return;

            const accessToken = returned?.access_token;
            const payload = { ...claims };
            if (payload.at_hash !== undefined && typeof accessToken === 'string') {
              payload.at_hash = rs256AccessTokenHash(accessToken);
            }
            const signed = await signJWT(ctx, {
              options,
              payload,
              signingAlgorithm: 'RS256',
            });
            return ctx.json({ ...returned, id_token: signed });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
