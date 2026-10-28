import { randomUUID } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import type { Auth } from './auth';

/** What asking for the password again came to. */
export type PasswordCheck = 'ok' | 'wrong' | 'limited';

/** How many wrong passwords are allowed, and for how long they count. */
export const CONFIRM_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 } as const;

const keyOf = (userId: string) => `confirm-password|${userId}`;

/**
 * Asks a signed-in person for their password again, before something that cannot be undone (handing over
 * ownership, deleting the account), checked against the stored hash with better-auth's own verifier.
 *
 * It is a server-side call, so better-auth's rate limit, which guards its HTTP routes, never sees it:
 * left alone it would let anyone who has borrowed a signed-in browser guess the password without limit.
 * So wrong answers are counted per account, in the same table better-auth keeps its own counters in, and
 * after `CONFIRM_LIMIT.max` of them within the window every answer is refused as `limited`, right ones
 * included, until the window passes. A right answer clears the count.
 */
export async function confirmPassword(
  database: Database,
  auth: Pick<Auth, '$context'>,
  userId: string,
  password: unknown,
  now: number = Date.now(),
): Promise<PasswordCheck> {
  const key = keyOf(userId);
  const stored = (
    await database.run('select count, last_request from rate_limits where key = ?', [key])
  ).rows[0];
  if (
    stored &&
    Number(stored.count) >= CONFIRM_LIMIT.max &&
    now - Number(stored.last_request) < CONFIRM_LIMIT.windowMs
  ) {
    return 'limited';
  }

  if (await passwordMatches(database, auth, userId, password)) {
    await database.run('delete from rate_limits where key = ?', [key]);
    return 'ok';
  }

  // A count that has run out of its window starts again at one.
  const fresh = !stored || now - Number(stored.last_request) >= CONFIRM_LIMIT.windowMs;
  await database.run(
    `insert into rate_limits (id, key, count, last_request) values (?, ?, 1, ?)
     on conflict (key) do update set count = ?, last_request = ?`,
    [randomUUID(), key, now, fresh ? 1 : Number(stored.count) + 1, now],
  );
  return 'wrong';
}

async function passwordMatches(
  database: Database,
  auth: Pick<Auth, '$context'>,
  userId: string,
  password: unknown,
): Promise<boolean> {
  const { rows } = await database.run(
    "select password from accounts where user_id = ? and provider_id = 'credential'",
    [userId],
  );
  const hash = rows[0]?.password;
  // No password on file, or none given, is a wrong one.
  if (typeof password !== 'string' || password === '') return false;
  if (typeof hash !== 'string') return false;
  return (await auth.$context).password.verify({ hash, password });
}
