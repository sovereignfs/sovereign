import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Avatar,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@sovereignfs/ui';
import { listAccounts } from '../../../src/accounts';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { AccountsPagination } from './accounts-pagination';
import { formatTime, roleLabel } from './format';
import { SearchForm } from './search-form';
import styles from './accounts.module.css';

export const metadata: Metadata = { title: 'Accounts' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireConsole('user:view', { returnTo: '/console/accounts' });
  const params = await searchParams;
  const query = (first(params.q) ?? '').trim().slice(0, 100);
  const requested = Number(first(params.page));
  const result = await listAccounts(await getDatabase(), {
    query,
    ...(Number.isFinite(requested) ? { page: requested } : {}),
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Accounts</h1>
      <SearchForm query={query} />
      {result.accounts.length === 0 ? (
        <EmptyState
          icon="users"
          heading={query === '' ? 'There are no accounts yet' : 'No account matches that'}
          description={
            query === ''
              ? undefined
              : 'Try part of a name or an email address, or clear the search.'
          }
        />
      ) : (
        <>
          <p className={styles.lead}>
            {result.total === 1 ? '1 account' : `${result.total} accounts`}
            {query === '' ? '' : ` matching “${query}”`}
          </p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email address</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <span className={styles.who}>
                      <Avatar name={account.name} size="sm" />
                      <Link className={styles.name} href={`/console/accounts/${account.id}`}>
                        {account.name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell>{account.email}</TableCell>
                  <TableCell>{roleLabel(account.role)}</TableCell>
                  <TableCell>
                    {account.deactivatedAt === undefined ? (
                      <StatusBadge status="synced">Active</StatusBadge>
                    ) : (
                      <StatusBadge status="warning">Deactivated</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={styles.muted}>{formatTime(account.createdAt)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.pages > 1 ? (
            <div className={styles.pager}>
              <AccountsPagination page={result.page} pages={result.pages} query={query} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
