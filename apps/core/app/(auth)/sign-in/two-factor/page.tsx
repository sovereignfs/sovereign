import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { safeReturnTo } from '../../../../src/auth/return-to';
import { getSession } from '../../../../src/auth/session';
import styles from '../../auth.module.css';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Confirm it is you' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; sig?: string | string[] }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  if (query.sig === undefined && (await getSession())) redirect(returnTo);

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.form}>
          <h1 className={styles.title}>Confirm it is you</h1>
          <TwoFactorForm returnTo={returnTo} />
        </div>
      </Card>
    </PageContainer>
  );
}
