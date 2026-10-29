import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuthSettings } from '../../../src/auth/settings';
import { getRegistrationMode } from '../../../src/auth/mode';
import { safeReturnTo } from '../../../src/auth/return-to';
import { getSession } from '../../../src/auth/session';
import { getDatabase } from '../../../src/database';
import { lookupInvite } from '../../../src/invites/manage';
import { getInstanceIdentity } from '../../../src/instance/service';
import { AuthCard } from '../auth-card';
import { AuthNotice } from '../auth-notice';
import { SignUpForm } from './sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getInstanceIdentity();
  return { title: `Create your ${name} account` };
}

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

  const { name } = await getInstanceIdentity();

  return (
    <AuthCard title="Create your account">
      {mode === 'first-account' ? (
        <AuthNotice>
          This instance has no accounts yet. The account you create now is its owner.
        </AuthNotice>
      ) : null}
      {mode === 'invite-only' && invited?.state !== 'valid' ? (
        <AuthNotice>
          Sign-up here is by invitation. Use the email address your invitation was sent to.
        </AuthNotice>
      ) : null}
      <SignUpForm
        returnTo={returnTo}
        instanceName={name}
        invitedEmail={invited?.state === 'valid' ? invited.email : undefined}
        passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
      />
    </AuthCard>
  );
}
