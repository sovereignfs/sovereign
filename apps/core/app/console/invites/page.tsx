import type { Metadata } from 'next';
import {
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@sovereignfs/ui';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { listInvites } from '../../../src/invites/manage';
import { inviteLink } from '../../../src/invites/service';
import { getMailService } from '../../../src/mail';
import { formatTime } from '../accounts/format';
import { CopyButton } from '../accounts/[id]/copy-button';
import { CancelButton } from './cancel-button';
import { InviteForm } from './invite-form';
import styles from './invites.module.css';

export const metadata: Metadata = { title: 'Invites' };

export default async function InvitesPage() {
  await requireConsole('user:manage', { returnTo: '/console/invites' });
  const [invites, mail] = await Promise.all([
    getDatabase().then(listInvites),
    getMailService().then((service) => service.status()),
  ]);
  const now = Date.now();
  const rows = await Promise.all(
    invites.map(async (invite) => ({ invite, link: await inviteLink(invite.id) })),
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Invites</h1>
      <p className={styles.lead}>
        Invite someone by email address. They sign up with the address you invited, from the link we
        send them.
      </p>
      <InviteForm mailReady={mail.state === 'configured'} />
      <h2 className={styles.subheading}>Waiting to be used</h2>
      {rows.length === 0 ? (
        <EmptyState
          icon="mail"
          heading="No invitations are waiting"
          description="When you invite someone, their invitation is listed here until they sign up."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Email address</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Invited by</TableHeaderCell>
              <TableHeaderCell>Sent</TableHeaderCell>
              <TableHeaderCell>
                <span className={styles.hidden}>Actions</span>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ invite, link }) => {
              const expired = invite.expiresAt !== undefined && invite.expiresAt <= now;
              return (
                <TableRow key={invite.id}>
                  <TableCell>{invite.email}</TableCell>
                  <TableCell>
                    {expired ? (
                      <StatusBadge status="warning">
                        Expired {formatTime(invite.expiresAt as number)}
                      </StatusBadge>
                    ) : (
                      <StatusBadge status="synced">
                        {invite.expiresAt === undefined
                          ? 'Does not expire'
                          : `Expires ${formatTime(invite.expiresAt)}`}
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={styles.muted}>{invite.invitedBy ?? 'Account removed'}</span>
                  </TableCell>
                  <TableCell>
                    <span className={styles.muted}>{formatTime(invite.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    <span className={styles.rowActions}>
                      {expired ? null : <CopyButton text={link} label="Copy link" />}
                      <CancelButton id={invite.id} email={invite.email} />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
