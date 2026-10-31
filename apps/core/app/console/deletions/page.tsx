import type { Metadata } from 'next';
import {
  Alert,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@sovereignfs/ui';
import { listUndelivered } from '../../../src/accounts/deletion-delivery';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { formatTime } from '../accounts/format';
import styles from '../apps/apps.module.css';
import { ResolveButton } from './resolve-button';

export const metadata: Metadata = { title: 'Deletions' };

/** What went wrong with an attempt, in words for the person who runs the instance. */
export function failureText(failure: string | null): string {
  if (failure === null) return 'Not tried yet';
  if (failure === 'timeout') return 'No answer in five seconds';
  if (failure === 'network') return 'Could not reach the app';
  if (failure === 'no_address') return 'The app no longer has an account-deleted address';
  const status = /^http_(\d{3})$/.exec(failure)?.[1];
  return status ? `The app answered ${status}` : 'Failed';
}

export default async function DeletionsPage() {
  await requireConsole('client:manage', { returnTo: '/console/deletions' });
  const { notices, givenUp } = await listUndelivered(await getDatabase());

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Deletions</h1>
      <p className={styles.lead}>
        When someone deletes their account, each app they used is told so it can delete what it
        holds of them, and core keeps trying until the app answers. Apps that have not answered yet
        are listed here. The person is shown by the first characters of their ID, which is enough
        for the app’s owner to find them and not enough to find anyone here.
      </p>
      {givenUp > 0 ? (
        <Alert variant="warning">
          {givenUp === 1
            ? 'One notice was given up after 30 days without an answer.'
            : `${givenUp} notices were given up after 30 days without an answer.`}{' '}
          Ask the app’s owner to delete what it holds, then mark it as done.
        </Alert>
      ) : null}
      {notices.length === 0 ? (
        <EmptyState
          icon="check"
          heading="Nothing waiting"
          description="Every app that was told about a deleted account has answered."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>App</TableHeaderCell>
              <TableHeaderCell>Person</TableHeaderCell>
              <TableHeaderCell>Deleted</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
              <TableHeaderCell>Tries</TableHeaderCell>
              <TableHeaderCell>Last problem</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {notices.map((notice) => (
              <TableRow key={notice.id}>
                <TableCell>{notice.appName}</TableCell>
                <TableCell>
                  <code>{notice.subStart}…</code>
                </TableCell>
                <TableCell>
                  <span className={styles.muted}>{formatTime(notice.deletedAt)}</span>
                </TableCell>
                <TableCell>
                  {notice.state === 'given_up' ? (
                    <StatusBadge status="error">Given up</StatusBadge>
                  ) : (
                    <StatusBadge status="warning">
                      {notice.nextAttemptAt
                        ? `Next try ${formatTime(notice.nextAttemptAt)}`
                        : 'Waiting'}
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell>{notice.attempts}</TableCell>
                <TableCell>
                  <span className={styles.muted}>{failureText(notice.lastFailure)}</span>
                </TableCell>
                <TableCell>
                  <ResolveButton id={notice.id} app={notice.appName} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
