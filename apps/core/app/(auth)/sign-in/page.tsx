import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { getSession } from '../../../src/auth/session';
import { safeReturnTo } from '../../../src/auth/return-to';
import styles from '../auth.module.css';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  if (await getSession()) redirect(returnTo);

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Sign in</h1>
          <SignInForm returnTo={returnTo} />
        </div>
      </Card>
    </PageContainer>
  );
}
