import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../../../src/auth/session';
import { safeReturnTo } from '../../../src/auth/return-to';
import { getInstanceIdentity } from '../../../src/instance/service';
import { AuthCard } from '../auth-card';
import { SignInForm, type SignInNotice } from './sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getInstanceIdentity();
  return { title: `Sign in to ${name}` };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    error?: string | string[];
    reset?: string;
    deleted?: string;
    signedout?: string;
    /** Present when an app sent the person here: the provider's signed request. */
    sig?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  // Someone already signed in is sent on, unless an app asked for a fresh sign-in (`prompt=login`).
  if (query.sig === undefined && (await getSession())) redirect(returnTo);

  const { name } = await getInstanceIdentity();

  return (
    <AuthCard title={`Sign in to ${name}`}>
      <SignInForm returnTo={returnTo} notice={noticeFor(query)} instanceName={name} />
    </AuthCard>
  );
}

/** What the address says happened: they signed out, a reset just finished, or a link from an email did not work. */
function noticeFor(query: {
  error?: string | string[];
  reset?: string;
  deleted?: string;
  signedout?: string;
}): SignInNotice | undefined {
  if (query.signedout === '1') return 'signed-out';
  if (query.reset === '1') return 'password-changed';
  if (query.deleted === '1') return 'account-deleted';
  if (query.error !== undefined) return 'link-invalid';
  return undefined;
}
