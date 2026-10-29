import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, LegalLinks, PageContainer } from '@sovereignfs/ui';
import { getSession } from '../../../src/auth/session';
import { safeReturnTo } from '../../../src/auth/return-to';
import { InstanceLogo } from '../../instance-logo';
import styles from '../auth.module.css';
import { SignInForm, type SignInNotice } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    error?: string | string[];
    reset?: string;
    /** Present when an app sent the person here: the provider's signed request. */
    sig?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  // Someone already signed in is sent on, unless an app asked for a fresh sign-in (`prompt=login`).
  if (query.sig === undefined && (await getSession())) redirect(returnTo);

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <InstanceLogo />
          <h1 className={styles.title}>Sign in</h1>
          <SignInForm returnTo={returnTo} notice={noticeFor(query)} />
        </div>
      </Card>
      <div className={styles.legal}>
        <LegalLinks />
      </div>
    </PageContainer>
  );
}

/** What the address says happened: a reset just finished, or a link from an email did not work. */
function noticeFor(query: { error?: string | string[]; reset?: string }): SignInNotice | undefined {
  if (query.reset === '1') return 'password-changed';
  if (query.error !== undefined) return 'link-invalid';
  return undefined;
}
