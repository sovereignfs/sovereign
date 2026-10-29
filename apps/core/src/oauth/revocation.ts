import type { Database, Executor } from '@sovereignfs/database';
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
  return { accessTokens: access.rowsAffected, refreshTokens: refresh.rowsAffected };
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
    return { consentsRemoved: consents.rowsAffected, ...revoked };
  });
}
