import type { Metadata } from 'next';
import Link from 'next/link';
import { describePasswordPolicy } from '../../../src/auth/password-policy';
import { getAuth } from '../../../src/auth';
import { resetLinkAddress } from '../../../src/auth/reset-link';
import { safeReturnTo, withReturnTo } from '../../../src/auth/return-to';
import { getAuthSettings } from '../../../src/auth/settings';
import { getDatabase } from '../../../src/database';
import { addressHasKeys } from '../../../src/keys/vault';
import { AuthCard } from '../auth-card';
import { AuthNotice } from '../auth-notice';
import styles from '../auth.module.css';
import { ResetPasswordForm } from './reset-password-form';

// The address carries the reset token: it must not travel on in a Referer header.
export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const { token, error, returnTo: asked } = await searchParams;
  // Where signing in goes once the password is set: an app's sign-in, when one led here.
  const returnTo = safeReturnTo(asked);
  // better-auth sends a link that did not check out here with `error`, and one that did with `token`.
  const usable = typeof token === 'string' && token !== '' && error === undefined;
  // The account the link belongs to: shown, and the new sign-in value is made from it (core-app §5.2). A link that does not
  // work names no one.
  const address = usable ? await resetLinkAddress(await getAuth(), token) : undefined;

  if (!usable || address === undefined) {
    return (
      <AuthCard title="Invalid link" legal={false}>
        <AuthNotice tone="warning">
          This link has expired or was already used. A link works once, for an hour.
        </AuthNotice>
        <p className={styles.footer}>
          <Link className={styles.link} href={withReturnTo('/forgot-password', returnTo)}>
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" legal={false}>
      <p className={styles.footer}>For {address}</p>
      {(await addressHasKeys(await getDatabase(), address)) ? (
        <AuthNotice tone="warning">
          What apps keep encrypted for you stays locked after a reset. It opens again with a passkey
          that unlocks, or with your recovery kit.
        </AuthNotice>
      ) : null}
      <ResetPasswordForm
        token={token}
        address={address}
        passwordHint={describePasswordPolicy(getAuthSettings().passwordPolicy)}
        policy={getAuthSettings().passwordPolicy}
        returnTo={returnTo}
      />
    </AuthCard>
  );
}
