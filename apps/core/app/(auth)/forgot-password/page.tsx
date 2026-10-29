import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../../../src/auth/session';
import { AuthCard } from '../auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect('/');

  return (
    <AuthCard
      title="Reset password"
      lead="Enter your account email and we’ll send a link to reset your password. The link works for an hour."
      legal={false}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
