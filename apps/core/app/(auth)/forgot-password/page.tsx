import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { getSession } from '../../../src/auth/session';
import styles from '../auth.module.css';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect('/');

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Reset your password</h1>
          <p className={styles.lead}>
            Enter your email address and we will send you a link to choose a new password. The link
            works for an hour.
          </p>
          <ForgotPasswordForm />
        </div>
      </Card>
    </PageContainer>
  );
}
