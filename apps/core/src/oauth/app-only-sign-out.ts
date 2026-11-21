import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { parseMetadata } from './client-metadata';

/** What the check needs of better-auth's request: what was asked, and the provider's stored apps. */
type EndSessionRequest = {
  query?: unknown;
  body?: unknown;
  context: {
    adapter: {
      findOne<T>(input: {
        model: string;
        where: { field: string; value: string }[];
      }): Promise<T | null>;
    };
  };
};

type AppRow = {
  disabled?: boolean | null;
  enableEndSession?: boolean | null;
  postLogoutRedirectUris?: string[] | string | null;
  metadata?: unknown;
};

/** A hint is accepted however long ago it was issued, as RP-Initiated Logout asks: only its signature and issuer matter. */
const ANY_AGE_SECONDS = 100 * 365 * 24 * 60 * 60;

const list = (value: AppRow['postLogoutRedirectUris']): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

/**
 * Signing out of an app whose setting keeps the person's core session (core-app §3.6.5, task 6.5): where to send the person instead of
 * ending anything, or `undefined` to leave the request to the provider, which ends core's session as it always has.
 *
 * Only an `id_token_hint` core signed, for an app that exists, is enabled, may use end-session and has the setting off, is answered
 * here; everything else (no hint, a hint core did not sign, an unknown or disabled app) falls through, so the provider keeps its own
 * refusals and its confirmation page. The person goes to the app's registered post-logout address, matched exactly, with the app's
 * `state`; with none, or one not registered, to core's own page, still signed in to core.
 */
export async function appOnlySignOut(
  ctx: EndSessionRequest,
  jwks: () => Promise<JSONWebKeySet>,
  issuer: string,
): Promise<string | undefined> {
  const asked = {
    ...(ctx.query as Record<string, unknown> | undefined),
    ...(ctx.body as Record<string, unknown> | undefined),
  };
  const hint = asked.id_token_hint;
  if (typeof hint !== 'string' || hint === '') return undefined;
  let audience: string | undefined;
  try {
    const { payload } = await jwtVerify(hint, createLocalJWKSet(await jwks()), {
      issuer,
      algorithms: ['EdDSA', 'RS256'],
      clockTolerance: ANY_AGE_SECONDS,
    });
    audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  } catch {
    return undefined;
  }
  if (!audience) return undefined;
  if (typeof asked.client_id === 'string' && asked.client_id !== audience) return undefined;
  const app = await ctx.context.adapter.findOne<AppRow>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: audience }],
  });
  if (!app || app.disabled === true || app.enableEndSession !== true) return undefined;
  if (parseMetadata(app.metadata).keepCoreSession !== true) return undefined;
  const back = asked.post_logout_redirect_uri;
  if (typeof back !== 'string' || !list(app.postLogoutRedirectUris).includes(back)) return '/';
  if (typeof asked.state !== 'string' || asked.state === '') return back;
  const url = new URL(back);
  url.searchParams.set('state', asked.state);
  return url.href;
}
