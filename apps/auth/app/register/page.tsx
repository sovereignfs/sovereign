import { authGet } from '@/src/db';
import { runtimePublicUrl } from '@/src/runtime-url';
import { RegisterForm } from './register-form';
import styles from '../auth.module.css';

interface InviteRow {
  email: string;
  invited_by_name: string | null;
  consumed_at: number | null;
  expires_at: number | null;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const runtimeUrl = runtimePublicUrl();
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';

  if (token) {
    const now = Math.floor(Date.now() / 1000);
    const invite = await authGet<InviteRow>(
      'SELECT email, invited_by_name, consumed_at, expires_at FROM invites WHERE token = ?',
      [token],
    );

    const invalid =
      !invite ||
      invite.consumed_at != null ||
      (invite.expires_at != null && invite.expires_at <= now);

    if (invalid) {
      return (
        <main className={styles.page}>
          <div className={styles.card}>
            <h1 className={styles.title}>Invite link invalid</h1>
            <p className={styles.error}>This invite link is invalid or has already been used.</p>
            <p className={styles.attribution}>Powered by Sovereign</p>
          </div>
        </main>
      );
    }

    return (
      <RegisterForm
        runtimeUrl={runtimeUrl}
        instanceName={instanceName}
        instanceInitial={instanceInitial}
        invitedEmail={invite.email}
        invitedBy={invite.invited_by_name ?? undefined}
      />
    );
  }

  return (
    <RegisterForm
      runtimeUrl={runtimeUrl}
      instanceName={instanceName}
      instanceInitial={instanceInitial}
    />
  );
}
