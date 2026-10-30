import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { isOfferedScope } from './scopes';
import { scopesAllowedFor } from './trust';

/**
 * Cleans a request's scopes at the very start of it, before the provider reads them (core-app §3.6.2, §3.6.4):
 *
 * - **A scope core does not offer is ignored**, as OpenID Connect Core says it SHOULD be. It is taken out of an
 *   authorization request, and out of a refresh request's `scope`, so the sign-in and consent pages, the signed
 *   request they carry, the consent that is remembered and the token's `scope` never mention it. An app that asks
 *   for `groups` by default signs in with the scopes core knows.
 * - **`roles` is kept from an untrusted client**, however it asks. The sign-in and consent pages never mention it:
 *   an untrusted client that keeps asking for `roles` is asked about once, not every time, and never gets it. The
 *   claim itself is also withheld from an untrusted client (`provider.ts`), in case a consent that names `roles`
 *   was stored some other way.
 *
 * A request is rewritten only when `openid` is still in it. Without `openid` the provider would fall back to the
 * client's own scopes, which could be more than the request named, so such a request is left as it is and refused
 * as before. A scope core offers but the client is not allowed is the provider's to refuse, as before.
 */
export function oauthGuards() {
  return {
    id: 'core-oauth-guards',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/oauth2/authorize',
          handler: createAuthMiddleware(async (ctx) => {
            const query = ctx.query as Record<string, unknown> | undefined;
            const scope = typeof query?.scope === 'string' ? query.scope : undefined;
            const clientId = typeof query?.client_id === 'string' ? query.client_id : undefined;
            if (!query || !scope || !clientId) return;
            const requested = scope.split(' ').filter((name) => name !== '');
            let allowed = requested.filter(isOfferedScope);
            if (!allowed.includes('openid')) return;
            if (allowed.includes('roles')) {
              const client = await ctx.context.adapter.findOne<{ skipConsent?: boolean | null }>({
                model: 'oauthClient',
                where: [{ field: 'clientId', value: clientId }],
              });
              // An unknown client is the provider's to refuse, with its usual answer.
              if (client) allowed = scopesAllowedFor(client, allowed);
            }
            if (allowed.length === requested.length) return;
            return { context: { query: { ...query, scope: allowed.join(' ') } } };
          }),
        },
        {
          // A refresh may name the scopes it wants, which can be no more than it was given.
          matcher: (context) => context.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as Record<string, unknown> | undefined;
            const scope = typeof body?.scope === 'string' ? body.scope : undefined;
            if (!body || !scope) return;
            // An app asking for its own token names app scopes, which are not a person's to ignore: the provider checks them
            // against what the app was given and refuses the rest.
            if (body.grant_type === 'client_credentials') return;
            const requested = scope.split(' ').filter((name) => name !== '');
            const allowed = requested.filter(isOfferedScope);
            if (allowed.length === 0 || allowed.length === requested.length) return;
            return { context: { body: { ...body, scope: allowed.join(' ') } } };
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
