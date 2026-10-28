import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, PageContainer } from '@sovereignfs/ui';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuthSettings } from '../../../src/auth/settings';
import styles from '../auth.module.css';
import { ResetPasswordForm } from './reset-password-form';

// The address carries the reset token: it must not travel on in a Referer header.
export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const { token, error } = await searchParams;
  // better-auth sends a link that did not check out here with `error`, and one that did with `token`.
  const usable = typeof token === 'string' && token !== '' && error === undefined;

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Choose a new password</h1>
          {usable ? (
            <ResetPasswordForm
              token={token}
              passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
            />
          ) : (
            <>
              <Alert variant="error">
                This link has expired or was already used. A link works once, for an hour.
              </Alert>
              <p className={styles.footer}>
                <Link className={styles.link} href="/forgot-password">
                  Ask for a new link
                </Link>
              </p>
            </>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}
