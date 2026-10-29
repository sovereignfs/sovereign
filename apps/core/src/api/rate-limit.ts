import type { Database } from '@sovereignfs/database';

export type CallsAllowed = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Counts a call against `key` in a fixed window and says whether it may go on (core-app §3.9). Counters are kept
 * in the database's `rate_limits` table so every instance of core shares them. Each window is its own row,
 * named by the window's number, so a counter never has to be reset and a window that has passed is simply
 * never looked at again; a row from long ago is removed when a new window starts. The call is counted whether
 * or not it is allowed, so asking again while refused does not make it pass.
 */
export async function countCall(
  database: Database,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): Promise<CallsAllowed> {
  const window = Math.floor(now / windowMs);
  const row = `${key}|${window}`;
  await database.run(
    `insert into rate_limits (id, key, count, last_request) values (?, ?, 1, ?)
     on conflict (key) do update set count = rate_limits.count + 1, last_request = excluded.last_request`,
    [row, row, now],
  );
  const { rows } = await database.run('select count from rate_limits where key = ?', [row]);
  const count = Number(rows[0]?.count ?? 1);
  if (count === 1) {
    // A new window: what an earlier one left is no use to anyone.
    const before = now - 2 * windowMs;
    await database.run('delete from rate_limits where key like ? and last_request < ?', [
      `${key}|%`,
      before,
    ]);
  }
  if (count <= limit) return { allowed: true };
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000)),
  };
}
