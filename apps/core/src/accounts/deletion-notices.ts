import { randomUUID } from 'node:crypto';
import type { Executor } from '@sovereignfs/database';
import { parseMetadata } from '../oauth/client-metadata';
import { NAMES } from '../oauth/schema-names';

const DAY = 24 * 60 * 60 * 1000;
/** How long a notice that is done stays, which is how far back a restore is expected to reach (core-app §4.5). */
export const DONE_KEPT_FOR = 90 * DAY;

export type NoticeState = 'pending' | 'delivered' | 'given_up' | 'resolved';

/**
 * Records, in the transaction that deletes an account, a notice for each app that is to be told (core-app §4.5): every app the person
 * used (a consent, an access token or a refresh token of theirs, revoked or not, or the record that their access to it was removed,
 * which is all a signed access token leaves behind) that has an account-deleted address. It reads what
 * says which apps those are, so it must run before the transaction deletes the consents and tokens. An app with no address is not
 * told. A notice an app already has pending for this person is not made twice. Returns the apps it made one for.
 *
 * It keeps the `sub` and the app and nothing else of the person.
 */
export async function planDeletionNotices(
  tx: Executor,
  sub: string,
  now: number = Date.now(),
): Promise<string[]> {
  const used = await tx.run(
    `select ${NAMES.consent.clientId} as client_id from ${NAMES.consents} where ${NAMES.consent.userId} = ?
     union select ${NAMES.access.clientId} from ${NAMES.accessTokens} where ${NAMES.access.userId} = ?
     union select ${NAMES.refresh.clientId} from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ?
     union select client_id from token_revocations where user_id = ? and client_id <> ''`,
    [sub, sub, sub, sub],
  );
  const made: string[] = [];
  for (const row of used.rows) {
    const clientId = String(row.client_id);
    if (await queueDeletionNotice(tx, clientId, sub, now)) made.push(clientId);
  }
  await purgeDoneNotices(tx, now);
  return made;
}

/**
 * Makes a notice that `sub` was deleted for one app, unless the app has no account-deleted address, no longer exists, or already has
 * one pending for this person. Says whether it made one.
 */
export async function queueDeletionNotice(
  tx: Pick<Executor, 'run'>,
  clientId: string,
  sub: string,
  now: number = Date.now(),
): Promise<boolean> {
  const client = (
    await tx.run(
      `select ${NAMES.client.metadata} as metadata from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
      [clientId],
    )
  ).rows[0];
  const address = client ? parseMetadata(client.metadata).accountDeletedUri : undefined;
  if (typeof address !== 'string' || address === '') return false;
  const pending = await tx.run(
    `select 1 from account_deletion_notices where client_id = ? and sub = ? and state = 'pending' limit 1`,
    [clientId, sub],
  );
  if (pending.rows.length > 0) return false;
  await tx.run(
    `insert into account_deletion_notices (id, client_id, sub, deleted_at, state, attempts, next_attempt_at, lease_until, last_failure, done_at)
     values (?, ?, ?, ?, 'pending', 0, ?, null, null, null)`,
    [randomUUID(), clientId, sub, now, now],
  );
  return true;
}

/** Removes the notices that were done more than 90 days ago, and with them the `sub`s they held. */
export async function purgeDoneNotices(
  tx: Pick<Executor, 'run'>,
  now: number = Date.now(),
): Promise<void> {
  await tx.run(`delete from account_deletion_notices where state <> 'pending' and done_at <= ?`, [
    now - DONE_KEPT_FOR,
  ]);
}

/** Removes every notice for an app: what deleting the app ends. */
export async function removeAppDeletionNotices(
  tx: Pick<Executor, 'run'>,
  clientId: string,
): Promise<void> {
  await tx.run('delete from account_deletion_notices where client_id = ?', [clientId]);
}
