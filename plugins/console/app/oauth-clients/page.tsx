import { sdk } from '@sovereignfs/sdk';
import styles from '../console.module.css';
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
 */
export default async function OAuthClientsPage() {
  const session = await sdk.auth.getSession();
  const canManage = sdk.auth.hasCapability(session, 'instance:configure');

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>External OAuth clients</h2>
        <p className={styles.help}>
          Let a standalone app on its own domain — not a Sovereign plugin — offer &ldquo;log in with
          Sovereign&rdquo; against this instance. Client secrets are shown exactly once and stored
          hashed; they cannot be recovered later, only rotated.
        </p>
        {canManage ? (
          <OAuthClientsClient />
        ) : (
          <p className={styles.help}>
            You need admin access to register or manage external OAuth clients.
          </p>
        )}
      </section>
    </div>
  );
}
