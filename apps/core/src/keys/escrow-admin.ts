import type { Database } from '@sovereignfs/database';
import { KeyVault } from './vault';

/**
 * What `sovereign-admin` does for a recovery through escrow (core-app §5.8, operator-cli §9.5). Core opens nothing: it hands the
 * person's escrow way in to the operator, whose escrow key opens it offline, and stores the way in of the new kit made there.
 */

async function userIdOf(database: Database, email: string): Promise<string | undefined> {
  const row = (
    await database.run('select id from users where email = ?', [email.trim().toLowerCase()])
  ).rows[0];
  return row ? String(row.id) : undefined;
}

/** The account's newest escrow way in, as `{ sub, escrowKeyId, record }` JSON, or `undefined`. */
export async function escrowRecordFor(
  database: Database,
  email: string,
): Promise<string | undefined> {
  const sub = await userIdOf(database, email);
  if (!sub) return undefined;
  const escrow = (await new KeyVault(database).read(sub)).waysIn
    .filter((wayIn) => wayIn.way === 'escrow')
    .at(-1);
  if (!escrow) return undefined;
  return JSON.stringify({ sub, escrowKeyId: escrow.id, record: JSON.parse(escrow.record) });
}

/**
 * Stores a new kit's way in from `sv key escrow open`'s JSON (`{ sub, record }`) and marks the kit kept. Refused when the JSON names
 * another account than the address: a kit made for one person never reaches another's vault.
 */
export async function putKitFor(database: Database, email: string, text: string): Promise<boolean> {
  const sub = await userIdOf(database, email);
  if (!sub) return false;
  let parsed: { sub?: unknown; record?: unknown };
  try {
    parsed = JSON.parse(text) as { sub?: unknown; record?: unknown };
  } catch {
    throw new Error('That is not what sv key escrow open wrote.');
  }
  if (parsed.sub !== sub) throw new Error('That kit was made for another account.');
  const vault = new KeyVault(database);
  if (!(await vault.read(sub)).account) return false;
  await vault.confirmKit(sub, JSON.stringify(parsed.record));
  return true;
}
