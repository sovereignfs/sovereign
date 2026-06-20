import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { PasswordChangeForm } from '../_components/PasswordChangeForm';
import { SessionList } from '../_components/SessionList';
import { TotpSection } from '../_components/TotpSection';
import { PasskeySection } from '../_components/PasskeySection';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

interface Passkey {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  deviceType?: string | null;
}

export default async function SecurityPage() {
  await sdk.auth.requireSession();

  const h = await headers();
  const cookie = h.get('cookie') ?? '';

  const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
  // Browser-reachable auth URL, passed to the PasskeySection client component
  // so it can point its auth client at the right origin for WebAuthn ceremonies.
  const authPublicUrl =
    process.env.SOVEREIGN_AUTH_PUBLIC_URL || process.env.AUTH_BASE_URL || 'http://localhost:3001';

  // Fetch session with cache disabled to get the up-to-date twoFactorEnabled flag.
  // Plain get-session honours the signed cache cookie and may return stale data.
  const sessionRes = await fetch(`${AUTH_URL}/api/auth/get-session?disableCookieCache=true`, {
    headers: { cookie, origin: AUTH_URL },
  });
  const sessionData = sessionRes.ok
    ? ((await sessionRes.json()) as { user?: { twoFactorEnabled?: boolean } } | null)
    : null;
  const totpEnabled = sessionData?.user?.twoFactorEnabled ?? false;

  // Fetch registered passkeys directly from the auth server.
  const passkeysRes = await fetch(`${AUTH_URL}/api/auth/passkey/list-user-passkeys`, {
    headers: { cookie, origin: AUTH_URL },
  });
  const passkeys: Passkey[] = passkeysRes.ok ? ((await passkeysRes.json()) as Passkey[]) : [];

  const sessions = await sdk.auth.listSessions();

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Authenticator app (TOTP)</h2>
        <TotpSection enabled={totpEnabled} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Passkeys</h2>
        <PasskeySection initialPasskeys={passkeys} authPublicUrl={authPublicUrl} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Change password</h2>
        <PasswordChangeForm />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active sessions</h2>
        <SessionList sessions={sessions} />
      </section>
    </div>
  );
}
