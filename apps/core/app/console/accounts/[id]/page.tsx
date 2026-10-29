import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, Card, CopyButton, StatusBadge } from '@sovereignfs/ui';
import { getAccount } from '../../../../src/accounts';
import { isRole, ROLE_OWNER } from '../../../../src/auth/roles';
import { requireConsole } from '../../../../src/console/guard';
import { getDatabase } from '../../../../src/database';
import { can } from '../../../../src/roles/capabilities';
import { getCapabilityMatrix } from '../../../../src/roles/matrix';
import { mayActOn } from '../../../../src/roles/people';
import { formatTime, roleLabel } from '../format';
import styles from '../accounts.module.css';
import { AccountActions } from './account-actions';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await requireConsole('user:view', { returnTo: `/console/accounts/${id}` });
  const account = await getAccount(await getDatabase(), id);
  if (!account) notFound();

  const matrix = await getCapabilityMatrix();
  const self = session.user.id === account.id;
  const manage =
    !self &&
    can(session.user.role, 'user:manage', matrix) &&
    isRole(account.role) &&
    mayActOn(session.user.role, account.role);
  const assignRole =
    !self && account.role !== ROLE_OWNER && can(session.user.role, 'role:assign', matrix);
  const operator = !self && !manage && account.role !== 'platform:user';

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/console/accounts">
        ‹ Accounts
      </Link>
      <div className={styles.summary}>
        <Avatar name={account.name} size="lg" />
        <div>
          <h1 className={styles.heading}>{account.name}</h1>
          <p className={styles.lead}>{account.email}</p>
        </div>
        {account.deactivatedAt === undefined ? (
          <StatusBadge status="synced">Active</StatusBadge>
        ) : (
          <StatusBadge status="warning">Deactivated</StatusBadge>
        )}
      </div>

      <Card padding="lg">
        <dl className={styles.facts}>
          <dt>Account ID</dt>
          <dd>
            <span className={styles.id}>
              <span className={styles.code}>{account.id}</span>
              <CopyButton text={account.id} label="Copy" />
            </span>
          </dd>
          <dt>Role</dt>
          <dd>{roleLabel(account.role)}</dd>
          <dt>Email address</dt>
          <dd>{account.emailVerified ? 'Verified' : 'Not verified'}</dd>
          <dt>Two-factor sign-in</dt>
          <dd>{account.twoFactorEnabled ? 'On' : 'Off'}</dd>
          <dt>Passkeys</dt>
          <dd>{account.passkeys}</dd>
          <dt>Signed in on</dt>
          <dd>{account.sessions === 1 ? '1 device' : `${account.sessions} devices`}</dd>
          <dt>Created</dt>
          <dd>{formatTime(account.createdAt)}</dd>
          {account.deactivatedAt === undefined ? null : (
            <>
              <dt>Deactivated</dt>
              <dd>{formatTime(account.deactivatedAt)}</dd>
            </>
          )}
          {account.timezone ? (
            <>
              <dt>Time zone</dt>
              <dd>{account.timezone}</dd>
            </>
          ) : null}
          {account.locale ? (
            <>
              <dt>Language</dt>
              <dd>{account.locale}</dd>
            </>
          ) : null}
        </dl>
      </Card>

      {manage || assignRole ? (
        <Card padding="lg">
          <h2 className={styles.subheading}>Manage</h2>
          <AccountActions
            id={account.id}
            name={account.name}
            currentRole={account.role}
            deactivated={account.deactivatedAt !== undefined}
            may={{
              manage,
              assignRole,
              resetMfa: account.twoFactorEnabled || account.passkeys > 0,
            }}
          />
        </Card>
      ) : null}
      {operator ? (
        <p className={styles.lead}>Only the owner can manage an operator account.</p>
      ) : null}
      {self ? (
        <p className={styles.lead}>This is your own account. Manage it from your account pages.</p>
      ) : null}
    </div>
  );
}
