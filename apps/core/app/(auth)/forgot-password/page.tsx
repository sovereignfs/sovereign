import type { Metadata } from 'next';
import { safeReturnTo } from '../../../src/auth/return-to';
import { sendOnIfSignedIn } from '../../../src/auth/require-signed-in';
import { AuthCard } from '../auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  // Kept through the reset, so an app's sign-in that led here carries on afterwards.
  const returnTo = safeReturnTo((await searchParams).returnTo);
  await sendOnIfSignedIn(returnTo);

  return (
    <AuthCard
      title="Reset password"
      lead="Enter your account email and we’ll send a link to reset your password. The link works for an hour."
      legal={false}
    >
      <ForgotPasswordForm returnTo={returnTo} />
    </AuthCard>
  );
}
