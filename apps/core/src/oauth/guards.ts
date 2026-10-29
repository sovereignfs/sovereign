import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { scopesAllowedFor } from './trust';

/**
 * Keeps `roles` from an untrusted client at the very start of its request (core-app §3.6.4). The scope is
 * taken out of the authorization request before the provider reads it, so the sign-in and consent pages
 * the person is sent through, the signed request they carry and the consent that is remembered never
 * mention it: an untrusted client that keeps asking for `roles` is asked about once, not every time, and
 * never gets it. The claim itself is also withheld from an untrusted client (`provider.ts`), in case a
 * consent that names `roles` was stored some other way.
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
            if (!requested.includes('roles')) return;
            const client = await ctx.context.adapter.findOne<{ skipConsent?: boolean | null }>({
              model: 'oauthClient',
              where: [{ field: 'clientId', value: clientId }],
            });
            // An unknown client is the provider's to refuse, with its usual answer.
            if (!client) return;
            const allowed = scopesAllowedFor(client, requested);
            if (allowed.length === requested.length) return;
            return { context: { query: { ...query, scope: allowed.join(' ') } } };
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
