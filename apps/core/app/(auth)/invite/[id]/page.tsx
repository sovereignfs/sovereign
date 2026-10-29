import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDatabase } from '../../../../src/database';
import { lookupInvite } from '../../../../src/invites/manage';
import { AuthCard } from '../../auth-card';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'Invitation link not valid' };

/**
 * Where an invitation link lands. A link that can still be used goes on to sign-up with the invitation
 * carried along; every other link (unknown, expired, cancelled, used) shows the same page, so it says
 * nothing about invitations other people hold (core-app §3.3.1).
 */
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await lookupInvite(await getDatabase(), id, Date.now());
  if (found.state === 'valid') redirect(`/sign-up?invite=${encodeURIComponent(id)}`);

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
