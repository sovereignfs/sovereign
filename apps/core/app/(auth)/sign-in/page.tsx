import type { Metadata } from 'next';
import { ButtonLink } from '@sovereignfs/ui';
import { sendOnIfSignedIn } from '../../../src/auth/require-signed-in';
import { signInReturnTo } from '../../../src/auth/return-to';
import { getSession } from '../../../src/auth/session';
import { getInstanceIdentity } from '../../../src/instance/service';
import { AuthCard } from '../auth-card';
import { AuthNotice } from '../auth-notice';
import styles from '../auth.module.css';
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
    [parameter: string]: string | string[] | undefined;
  }>;
}) {
  const query = await searchParams;
  // When an app sent the person here, the way back into its sign-in, so that creating an account or
  // resetting a password on the way still ends in the app (`resumeAddress`).
  const returnTo = signInReturnTo(query);
  // An emailed link that did not work comes here with `error` (better-auth sends success and failure to one address, which is
  // why the link stops here at all). Someone already signed in is told, then goes on, rather than being sent on as if the
  // link had worked (core-app §3.3.3).
  if (query.error !== undefined && query.sig === undefined && (await getSession())) {
    return (
      <AuthCard title="That link did not work" legal={false}>
        <AuthNotice tone="warning">That link has expired or was already used.</AuthNotice>
        <ButtonLink href={returnTo} className={styles.wide}>
          Continue
        </ButtonLink>
      </AuthCard>
    );
  }
  // Someone already signed in is sent on, unless an app asked for a fresh sign-in (`prompt=login`).
  await sendOnIfSignedIn(returnTo, query);

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
