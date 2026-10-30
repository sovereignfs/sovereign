import type { Database } from '@sovereignfs/database';
import { stamp } from '../oauth/revocation';
import { NAMES } from '../oauth/schema-names';

/** The instance setting that holds the time of the last restore (core-app §4.4), in milliseconds since the epoch. */
export const RESTORED_AT_KEY = 'instance.restored_at';

/** When the instance was last restored from a backup, or undefined if it never was. */
export async function restoredAt(database: Pick<Database, 'run'>): Promise<number | undefined> {
  const { rows } = await database.run('select value from instance_settings where key = ?', [
    RESTORED_AT_KEY,
  ]);
  const at = Number(rows[0]?.value);
  return rows[0] !== undefined && Number.isFinite(at) ? at : undefined;
}

/**
 * Whether something issued at `issuedAtSeconds` (a token's `iat`) was issued before the instance was restored, or in the same second
 * as the restore, which counts as before: the doubt goes against the token, as it does for any revocation (`isTokenRevoked`).
 */
export function issuedBeforeRestore(
  restored: number | undefined,
  issuedAtSeconds: number,
): boolean {
  return restored !== undefined && issuedAtSeconds <= Math.floor(restored / 1000);
}

/** The same for something issued at a time in milliseconds, such as a session's creation. */
export function openedBeforeRestore(restored: number | undefined, openedAtMs: number): boolean {
  return restored !== undefined && openedAtMs <= restored;
}

export type Restored = { at: number; moved: boolean };

/**
 * Records that the instance was restored from a backup, and ends what the backup brought back to life (core-app §4.4): a session,
 * a consent or a token that was ended after the backup was taken is in the database again, so every session is ended and every
 * token the provider keeps a row for is revoked, in one transaction with the marker. A signed access token and an app's own token leave
 * no row, so the Core API refuses those by the marker (`issuedBeforeRestore`). Consents stay: people sign in again, and the apps
 * they allowed are still allowed.
 *
 * The marker only ever moves forward. A time at or before the one recorded changes nothing and ends nothing, so running a restore's
 * last step twice does not end the sessions of people who signed in between.
 */
export async function recordRestore(
  database: Database,
  now: number = Date.now(),
): Promise<Restored> {
  return database.transaction(async (tx) => {
    const before = await restoredAt(tx);
    if (before !== undefined && now <= before) return { at: before, moved: false };
    await tx.run(
      `insert into instance_settings (key, value, encrypted, updated_at, updated_by) values (?, ?, 0, ?, null)
       on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
      [RESTORED_AT_KEY, String(now), now],
    );
    await tx.run('delete from sessions');
    const revoked = stamp(database, now);
    await tx.run(
      `update ${NAMES.accessTokens} set ${NAMES.access.revoked} = ? where ${NAMES.access.revoked} is null`,
      [revoked],
    );
    await tx.run(
      `update ${NAMES.refreshTokens} set ${NAMES.refresh.revoked} = ? where ${NAMES.refresh.revoked} is null`,
      [revoked],
    );
    return { at: now, moved: true };
  });
}
