import { sdk } from '@sovereignfs/sdk';
import { EmptyState } from '@sovereignfs/ui';
import { OAuthClientsClient } from './OAuthClientsClient';

/**
 * Console "External clients" section (RFC 0072, epic task 1.18) — lets a
 * platform admin/owner register, revoke, and rotate secrets for external
 * OAuth 2.0 clients (standalone apps that want "log in with Sovereign"
 * without joining the plugin system).
 *
 * All CRUD happens client-side against `/api/auth/oauth2/*` — those routes
 * are mounted by `@better-auth/oauth-provider` on the auth server and
 * reached here via the runtime's existing generic `/api/auth/*` → auth
 * server proxy (`runtime/app/api/auth/[...path]/route.ts`), which forwards
 * the browser's real session cookie. The plugin's own `clientPrivileges`
 * hook (apps/auth/src/auth.ts) re-checks the caller's role server-side on
 * every request — this page's gate is a UX convenience, not the security
 * boundary.
 *
 * The selection (`?client=`) is read here, like Users/Groups, and handed to
 * the client component that owns the (browser-session-fetched) list.
 */
export default async function OAuthClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: selectedClientId } = await searchParams;
  const session = await sdk.auth.getSession();
  const canManage = sdk.auth.hasCapability(session, 'instance:configure');

  if (!canManage) {
    return (
      <EmptyState
        heading="Admin access required"
        description="Only an instance owner or admin can register or manage external clients."
      />
    );
  }

  return <OAuthClientsClient selectedClientId={selectedClientId ?? null} />;
}
