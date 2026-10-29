import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@sovereignfs/ui';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { listTransferTargets } from '../../../src/roles/ownership';
import styles from './ownership.module.css';
import { TransferForm } from './transfer-form';

export const metadata: Metadata = { title: 'Ownership' };

export default async function OwnershipPage() {
  const { session } = await requireConsole('ownership:transfer', {
    returnTo: '/console/ownership',
  });
  const targets = await listTransferTargets(await getDatabase(), session.user.id);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Ownership</h1>
      <p className={styles.lead}>
        You own this instance. You can hand it to one of its admins, who then owns it in your place.
        There is always exactly one owner.
      </p>
      {targets.length === 0 ? (
        <EmptyState
          icon="users"
          heading="There is no admin to hand it to"
          description="Ownership goes to an admin. Make someone an admin from their page in Accounts first."
          action={<Link href="/console/accounts">Go to accounts</Link>}
        />
      ) : (
        <TransferForm targets={targets} />
      )}
    </div>
  );
}
