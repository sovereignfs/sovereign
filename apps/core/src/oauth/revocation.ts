import type { Database, Executor } from '@sovereignfs/database';
import { removeAppMail } from '../mail/apps';
import { removeNotifications } from '../notifications/service';
import { NAMES } from './schema-names';

/** What a timestamp column takes on this dialect: a date on PostgreSQL, milliseconds on SQLite and sqld. */
export function stamp(database: Pick<Database, 'family'>, now: number = Date.now()): number | Date {
  return database.family === 'postgres' ? new Date(now) : now;
}

export type Revoked = { accessTokens: number; refreshTokens: number };

/**
 * Revokes every access token and refresh token issued for an account (core-app §3.6.3), `offline_access`
 * refresh tokens included: ending a session revokes that session's tokens and, by design of the OpenID
 * Connect logout specification, leaves those alone, so an account that must lose everything (it was
 * deactivated or deleted) needs this. It is one function for every caller that needs it, written against
 * the generated schema (`schema-names.ts`) and the data layer's own `Executor`, so it runs on the same
 * transaction as the work that makes it necessary, on every dialect.
 *
 * A revoked token is refused by the provider's own endpoints (token, introspection, userinfo): the
 * provider reads the `revoked` time on every use.
 */
export async function revokeAllTokens(
  tx: Executor,
  at: number | Date,
  userId: string,
): Promise<Revoked> {
  return revoke(tx, at, userId);
}

/** The same for one app's tokens only: what "Remove access" ends (core-app §3.6.4). */
export async function revokeClientTokens(
  tx: Executor,
  at: number | Date,
  userId: string,
  clientId: string,
): Promise<Revoked> {
  return revoke(tx, at, userId, clientId);
}

async function revoke(
  tx: Executor,
  at: number | Date,
  userId: string,
  clientId?: string,
): Promise<Revoked> {
  const scoped = (table: string, user: string, client: string, revoked: string) =>
    tx.run(
      `update ${table} set ${revoked} = ? where ${user} = ? and ${revoked} is null${
        clientId === undefined ? '' : ` and ${client} = ?`
      }`,
      clientId === undefined ? [at, userId] : [at, userId, clientId],
    );
  const access = await scoped(
    NAMES.accessTokens,
    NAMES.access.userId,
    NAMES.access.clientId,
    NAMES.access.revoked,
  );
  const refresh = await scoped(
    NAMES.refreshTokens,
    NAMES.refresh.userId,
    NAMES.refresh.clientId,
    NAMES.refresh.revoked,
  );
  // A signed JWT access token (the Core API's, core-app §3.9) leaves no row to mark, so the time is recorded:
  // everything issued up to it is no longer good (`isTokenRevoked`). The same transaction, so it is whole
  // with the rest, and only ever moves forward.
  await tx.run(
    `insert into token_revocations (user_id, client_id, revoked_before) values (?, ?, ?)
     on conflict (user_id, client_id) do update set revoked_before =
       case when excluded.revoked_before > token_revocations.revoked_before
         then excluded.revoked_before else token_revocations.revoked_before end`,
    [userId, clientId ?? '', at instanceof Date ? at.getTime() : at],
  );
  return { accessTokens: access.rowsAffected, refreshTokens: refresh.rowsAffected };
}

/**
 * Whether a token for `userId` from `clientId`, issued at `issuedAt` (the JWT's `iat`, in seconds), was revoked
 * by `revokeAllTokens` or `revokeClientTokens` (core-app §3.9). The comparison is by the second, since that is
 * all a token says of when it was issued, so a token issued in the same second as a revocation counts as
 * revoked: the doubt goes against the token, never for it.
 */
export async function isTokenRevoked(
  database: Pick<Database, 'run'>,
  userId: string,
  clientId: string,
  issuedAt: number,
): Promise<boolean> {
  const { rows } = await database.run(
    "select revoked_before from token_revocations where user_id = ? and client_id in ('', ?)",
    [userId, clientId],
  );
  const cutoff = rows.reduce((latest, row) => Math.max(latest, Number(row.revoked_before)), 0);
  return rows.length > 0 && issuedAt <= Math.floor(cutoff / 1000);
}

/**
 * Takes an app's access away from a person: deletes what they agreed to and revokes every token the app
 * holds for them, in one transaction, so the next sign-in asks again and the tokens the app already has
 * stop working. This is the only way consent is removed: the provider's own delete-consent endpoint is
 * switched off, because it removes the consent and leaves the app's refresh tokens alive.
 */
export async function removeAccess(
  database: Database,
  userId: string,
  clientId: string,
  now: number = Date.now(),
): Promise<{ consentsRemoved: number } & Revoked> {
  return database.transaction(async (tx) => {
    const consents = await tx.run(
      `delete from ${NAMES.consents} where ${NAMES.consent.userId} = ? and ${NAMES.consent.clientId} = ?`,
      [userId, clientId],
    );
    const revoked = await revokeClientTokens(tx, stamp(database, now), userId, clientId);
    // What the app told them goes with the access, and so does their switch for it (core-app §4.1).
    await removeNotifications(tx, userId, clientId);
    await removeAppMail(tx, userId, clientId);
    return { consentsRemoved: consents.rowsAffected, ...revoked };
  });
}

/**
 * Ends every token an app holds for itself (core-app §3.6.6): rotating its secret and switching it off each do this. An app token
 * leaves no row to mark, so the time is recorded and everything issued up to it is refused (`isAppTokenRevoked`). It only ever moves
 * forward, and runs on the caller's own transaction, so it is whole with the change that made it necessary.
 */
export async function revokeAppTokens(
  tx: Pick<Executor, 'run'>,
  clientId: string,
  at: number = Date.now(),
): Promise<void> {
  await tx.run(
    `insert into app_token_revocations (client_id, revoked_before) values (?, ?)
     on conflict (client_id) do update set revoked_before =
       case when excluded.revoked_before > app_token_revocations.revoked_before
         then excluded.revoked_before else app_token_revocations.revoked_before end`,
    [clientId, at],
  );
}

/** Whether an app token issued at `issuedAt` (the JWT's `iat`, in seconds) was revoked by `revokeAppTokens`; the doubt goes against the token. */
export async function isAppTokenRevoked(
  database: Pick<Database, 'run'>,
  clientId: string,
  issuedAt: number,
): Promise<boolean> {
  const { rows } = await database.run(
    'select revoked_before from app_token_revocations where client_id = ?',
    [clientId],
  );
  const row = rows[0];
  return row !== undefined && issuedAt <= Math.floor(Number(row.revoked_before) / 1000);
}
