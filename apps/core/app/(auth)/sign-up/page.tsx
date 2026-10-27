import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuthSettings } from '../../../src/auth';
import { safeReturnTo } from '../../../src/auth/return-to';
import { getSession } from '../../../src/auth/session';
import styles from '../auth.module.css';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({
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
          <h1 className={styles.title}>Create an account</h1>
          <SignUpForm
            returnTo={returnTo}
            passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
          />
        </div>
      </Card>
    </PageContainer>
  );
}
