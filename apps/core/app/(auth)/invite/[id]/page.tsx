import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@sovereignfs/ui';
import { getSession } from '../../../../src/auth/session';
import { getDatabase } from '../../../../src/database';
import { lookupInvite } from '../../../../src/invites/manage';
import { AuthCard } from '../../auth-card';
import styles from '../../auth.module.css';
import { SignOutToUse } from './sign-out-to-use';

export const metadata: Metadata = { title: 'Invitation' };

/**
 * Where an invitation link lands. A link that can still be used goes on to sign-up with the invitation
 * carried along; every other link (unknown, expired, cancelled, used) shows the same page, so it says
 * nothing about invitations other people hold (core-app §3.3.1). Someone already signed in who opens a link
 * that can be used is told whose account they are in and whom the invitation is for, and may sign out to use
 * it, rather than being bounced to the launcher without a word.
 */
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await lookupInvite(await getDatabase(), id, Date.now());
  if (found.state === 'valid') {
    const session = await getSession();
    if (!session) redirect(`/sign-up?invite=${encodeURIComponent(id)}`);
    return (
      <AuthCard
        title="You’re already signed in"
        lead={`You’re signed in as ${session.user.email}. This invitation is for ${found.email}: to create that account, sign out first.`}
        legal={false}
      >
        <div className={styles.form}>
          <ButtonLink href="/" className={styles.wide}>
            Continue
          </ButtonLink>
          <SignOutToUse inviteId={id} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="This invitation link does not work"
      lead="It may have expired, been cancelled or already been used. Ask whoever invited you to send a new one."
      legal={false}
    >
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link className={styles.link} href="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
