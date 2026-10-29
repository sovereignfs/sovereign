import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeReturnTo } from '../../../../src/auth/return-to';
import { getSession } from '../../../../src/auth/session';
import { AuthCard } from '../../auth-card';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Two-factor verification' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; sig?: string | string[] }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  if (query.sig === undefined && (await getSession())) redirect(returnTo);

  return (
    <AuthCard title="Two-factor verification" legal={false}>
      <TwoFactorForm returnTo={returnTo} />
    </AuthCard>
  );
}
