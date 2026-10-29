import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { getDatabase } from '../../../../src/database';
import { lookupInvite } from '../../../../src/invites/manage';
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
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>This invitation link does not work</h1>
          <p className={styles.lead}>
            It may have expired, been cancelled or already been used. Ask whoever invited you to
            send a new one.
          </p>
          <p className={styles.footer}>
            Already have an account?{' '}
            <Link className={styles.link} href="/sign-in">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
