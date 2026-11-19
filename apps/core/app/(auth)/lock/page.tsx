import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeReturnTo, withReturnTo } from '../../../src/auth/return-to';
import { currentLock, getSessionEvenIfLocked } from '../../../src/auth/session';
import { AuthCard } from '../auth-card';
import { LockForm } from './lock-form';

export const metadata: Metadata = { title: 'Unlock' };

/**
 * The lock page (RFC 0006 B4): what a locked session is sent to, and the only page it is shown. Someone with no session goes to sign in;
 * one whose session is not locked goes on to where they were going.
 */
export default async function LockPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const session = await getSessionEvenIfLocked();
  if (!session) redirect(withReturnTo('/sign-in', returnTo));
  if (!(await currentLock(session)).locked) redirect(returnTo);

  return (
    <AuthCard title="Unlock" lead={`Signed in as ${session.user.email}.`} legal={false}>
      <LockForm returnTo={returnTo} email={session.user.email} />
    </AuthCard>
  );
}
