import type { Metadata } from 'next';
import Link from 'next/link';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuthSettings } from '../../../src/auth/settings';
import { AuthCard } from '../auth-card';
import { AuthNotice } from '../auth-notice';
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

  if (!usable) {
    return (
      <AuthCard title="Invalid link" legal={false}>
        <AuthNotice tone="warning">
          This link has expired or was already used. A link works once, for an hour.
        </AuthNotice>
        <p className={styles.footer}>
          <Link className={styles.link} href="/forgot-password">
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" legal={false}>
      <ResetPasswordForm
        token={token}
        passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
      />
    </AuthCard>
  );
}
