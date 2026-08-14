import Link from 'next/link';
import { headers } from 'next/headers';
import { Badge, Button } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { DeviceStorageKeySection } from '../_components/DeviceStorageKeySection';
import { EncryptionSection } from '../_components/EncryptionSection';
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

const VERIFICATION_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: 'Registered',
  1: 'Email verified',
  2: 'MFA enrolled',
  3: 'Admin vouched',
};

export default async function SecurityPage() {
  const session = await sdk.auth.requireSession();

  const h = await headers();
  const cookie = h.get('cookie') ?? '';

  const AUTH_URL =
    process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

  // Fetch session with cache disabled to get the up-to-date twoFactorEnabled flag.
  const sessionRes = await fetch(`${AUTH_URL}/api/auth/get-session?disableCookieCache=true`, {
    headers: { cookie, origin: AUTH_URL },
  });
  const sessionData = sessionRes.ok
    ? ((await sessionRes.json()) as { user?: { twoFactorEnabled?: boolean } } | null)
    : null;
  const totpEnabled = sessionData?.user?.twoFactorEnabled ?? false;

  const passkeysRes = await fetch(`${AUTH_URL}/api/auth/passkey/list-user-passkeys`, {
    headers: { cookie, origin: AUTH_URL },
  });
  const passkeys: Passkey[] = passkeysRes.ok ? ((await passkeysRes.json()) as Passkey[]) : [];

  const sessions = await sdk.auth.listSessions();

  const [e2eeProfile, e2eeRecoveryWrapper, e2eeDevices] = await Promise.all([
    sdk.e2ee.getProfile(),
    sdk.e2ee.getRecoveryWrapper(),
    sdk.e2ee.listDevices(),
  ]);

  const level = session.user.verificationLevel;

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Account verification</h2>
          <p className={styles.sectionSubtitle}>
            Some plugins and features require a verified email or enrolled MFA (RFC 0035).
          </p>
        </div>
        <div className={styles.totpCard}>
          <div className={styles.totpCardInfo}>
            <span className={styles.totpCardTitle}>Verification level</span>
            <span className={styles.totpCardStatus}>
              <Badge variant="status" status={level >= 1 ? 'active' : 'pending'}>
                {VERIFICATION_LABEL[level]}
              </Badge>
            </span>
          </div>
          {level < 1 && (
            <Link href="/verify-email">
              <Button>Verify email</Button>
            </Link>
          )}
          {level === 1 && (
            <span className={styles.help}>
              Enroll TOTP or a passkey below to reach the next level.
            </span>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Client-side encryption</h2>
          <p className={styles.sectionSubtitle}>
            Protect sensitive data from the operator and runtime, not just other users.
          </p>
        </div>
        <EncryptionSection
          initialProfile={e2eeProfile}
          initialRecoveryWrapper={e2eeRecoveryWrapper}
          initialDevices={e2eeDevices}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Device Storage Key</h2>
          <p className={styles.sectionSubtitle}>
            Unlocks apps that keep their data only on this device — set up once here, used by every
            app on this device automatically.
          </p>
        </div>
        <DeviceStorageKeySection />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Two-factor authentication</h2>
          <p className={styles.sectionSubtitle}>
            Add an extra layer of security using an authenticator app.
          </p>
        </div>
        <TotpSection enabled={totpEnabled} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Passkeys</h2>
          <p className={styles.sectionSubtitle}>
            Sign in faster with biometrics or your device PIN — no password needed.
          </p>
        </div>
        <PasskeySection initialPasskeys={passkeys} />
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
