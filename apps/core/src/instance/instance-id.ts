import { randomBytes } from 'node:crypto';
import type { Database } from '@sovereignfs/database';

/** Where it is kept: a row of `instance_settings` that no setting of §3.12 names, so the Console never shows or changes it. */
const KEY = 'instance_id';
const BYTES = 32;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

/** The instance id (core-app §5.2), base64url, or `undefined` before it is made. */
export async function readInstanceId(database: Database): Promise<string | undefined> {
  const row = (await database.run('select value from instance_settings where key = ?', [KEY]))
    .rows[0];
  const value = row?.value;
  if (value !== undefined && !isId(value)) {
    throw new Error(
      'The stored instance id is not 32 bytes of base64url. It must not be made again.',
    );
  }
  return value as string | undefined;
}

/**
 * The instance id, made once when there is none (core-app §5.2). Every sign-in value is made from it, so it is never made
 * again while one exists, and two instances starting at once keep the same one: the insert does nothing when a row is there,
 * and what is read back is what was kept.
 *
 * An instance that has accounts and no id is one upgraded from before sign-in values: its accounts' stored passwords cannot
 * sign in anyway, and each sets its password again through a reset (docs/upgrade.md). `onAccountsBefore` is told so.
 */
export async function ensureInstanceId(
  database: Database,
  onAccountsBefore: (accounts: number) => void = () => undefined,
): Promise<string> {
  const existing = await readInstanceId(database);
  if (existing) return existing;
  const accounts = Number((await database.run('select count(*) as n from users')).rows[0]?.n ?? 0);
  const id = randomBytes(BYTES).toString('base64url');
  await database.run(
    'insert into instance_settings (key, value, encrypted, updated_at) values (?, ?, 0, ?) on conflict (key) do nothing',
    [KEY, id, Date.now()],
  );
  const kept = await readInstanceId(database);
  if (!kept) throw new Error('The instance id could not be kept.');
  if (kept === id && accounts > 0) onAccountsBefore(accounts);
  return kept;
}
