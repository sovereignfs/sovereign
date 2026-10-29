import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert, Card, PageContainer } from '@sovereignfs/ui';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuthSettings } from '../../../src/auth/settings';
import { getRegistrationMode } from '../../../src/auth/mode';
import { safeReturnTo } from '../../../src/auth/return-to';
import { getSession } from '../../../src/auth/session';
import { getDatabase } from '../../../src/database';
import { lookupInvite } from '../../../src/invites/manage';
import styles from '../auth.module.css';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; invite?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await getSession()) redirect(returnTo);
  const mode = await getRegistrationMode();
  // An invitation link carries its id; the address it was sent to is filled in. The server still decides
  // at sign-up, so a made-up or stale value here only leaves the field empty.
  const invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const invited = invite ? await lookupInvite(await getDatabase(), invite, Date.now()) : undefined;

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Create an account</h1>
          {mode === 'first-account' ? (
            <Alert variant="info">
              This instance has no accounts yet. The account you create now is its owner.
            </Alert>
          ) : null}
          {mode === 'invite-only' ? (
            <Alert variant="info">
              Sign-up here is by invitation. Use the email address your invitation was sent to.
            </Alert>
          ) : null}
          <SignUpForm
            returnTo={returnTo}
            invitedEmail={invited?.state === 'valid' ? invited.email : undefined}
            passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
          />
        </div>
      </Card>
    </PageContainer>
  );
}
