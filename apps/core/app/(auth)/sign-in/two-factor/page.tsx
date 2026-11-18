import type { Metadata } from 'next';
import { signInReturnTo } from '../../../../src/auth/return-to';
import { sendOnIfSignedIn } from '../../../../src/auth/require-signed-in';
import { AuthCard } from '../../auth-card';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Two-factor verification' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    sig?: string | string[];
    [parameter: string]: string | string[] | undefined;
  }>;
}) {
  const query = await searchParams;
  const returnTo = signInReturnTo(query);
  await sendOnIfSignedIn(returnTo, query);

  return (
    <AuthCard title="Two-factor verification" legal={false}>
      <TwoFactorForm returnTo={returnTo} />
    </AuthCard>
  );
}
