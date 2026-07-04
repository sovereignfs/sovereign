import { redirect } from 'next/navigation';
import { readServerSession } from '@/src/server-session';
import { RegisterForm } from './register-form';
import styles from '../auth-page.module.css';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

interface InviteLookupResponse {
  valid: boolean;
  email?: string;
  invitedBy?: string | null;
}

async function lookupInvite(token: string): Promise<InviteLookupResponse | null> {
  try {
    const response = await fetch(`${AUTH_URL}/api/admin/invites/lookup`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;
    return (await response.json()) as InviteLookupResponse;
  } catch {
    return null;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';

  // Already signed in? Send them to the app rather than showing the form.
  // (Skipped for invite-token links, handled below.) See readServerSession.
  if (!token && (await readServerSession())) redirect('/');

  if (token) {
    const invite = await lookupInvite(token);
    if (!invite?.valid || !invite.email) {
      return (
        <main className={styles.page}>
          <div className={styles.card}>
            <h1 className={styles.title}>Invite link invalid</h1>
            <p className={styles.error}>This invite link is invalid or has already been used.</p>
          </div>
        </main>
      );
    }

    return (
      <RegisterForm
        instanceName={instanceName}
        instanceInitial={instanceInitial}
        invitedEmail={invite.email}
        invitedBy={invite.invitedBy ?? undefined}
      />
    );
  }

  return <RegisterForm instanceInitial={instanceInitial} />;
}
