import { headers } from 'next/headers';
import { getEnv } from '@/src/env';
import { ConsentForm } from './consent-form';

/**
 * OAuth 2.0 / OIDC consent page for external clients (RFC 0072). Reached only
 * after `@better-auth/oauth-provider`'s /oauth2/authorize redirects an
 * already-authenticated user here with a signed query string it re-verifies
 * on /oauth2/consent — this page never re-derives or trusts the query itself,
 * it just displays it and forwards it back verbatim.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const scopeParam = typeof params.scope === 'string' ? params.scope : '';
  const scopes = scopeParam.split(' ').filter(Boolean);

  let clientName = clientId ?? 'An external application';
  if (clientId) {
    try {
      const reqHeaders = await headers();
      const baseUrl = getEnv().baseUrl;
      const res = await fetch(
        `${baseUrl}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
        { headers: { cookie: reqHeaders.get('cookie') ?? '' } },
      );
      if (res.ok) {
        const client = (await res.json()) as { client_name?: unknown };
        if (typeof client.client_name === 'string' && client.client_name) {
          clientName = client.client_name;
        }
      }
    } catch {
      // Fall back to the raw client_id — the user can still decide, and the
      // consent POST re-verifies the signed query regardless of this lookup.
    }
  }

  return <ConsentForm clientName={clientName} scopes={scopes} />;
}
