import { createHash, randomUUID } from 'node:crypto';
import { isSignInValue } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

/** Where the sign-in page sends a password to move (RFC 0007 amendment 1 A1, auth.md §8.1), under the app's `/api/auth`. */
export const MOVE_PASSWORD_PATH = '/sv/move-password';

/** The longest value a page may send as what it used to send. A password longer than this was never accepted. */
const MOST = 256;

/** Tries an address is given in an hour, as signing in counts them (Shopper's rule): five. */
const PER_ADDRESS = { max: 5, windowMs: 60 * 60 * 1000 };

/**
 * Counts a try for an address, in better-auth's own rate limit table, under a hash of the address so the table holds none. Whether the
 * try may go on: false once the address had its five this hour, whoever asks.
 */
async function takeTry(database: Database, address: string, now: number): Promise<boolean> {
  const key = `sv-move-password:${createHash('sha256').update(address).digest('base64url')}`;
  return database.transaction(async (tx) => {
    const { rows } = await tx.run('select count, last_request from rate_limits where key = ?', [
      key,
    ]);
    const row = rows[0];
    if (!row || now - Number(row.last_request) >= PER_ADDRESS.windowMs) {
      if (row)
        await tx.run('update rate_limits set count = 1, last_request = ? where key = ?', [
          now,
          key,
        ]);
      else
        await tx.run('insert into rate_limits (id, key, count, last_request) values (?, ?, 1, ?)', [
          randomUUID(),
          key,
          now,
        ]);
      return true;
    }
    if (Number(row.count) >= PER_ADDRESS.max) return false;
    await tx.run('update rate_limits set count = count + 1 where key = ?', [key]);
    return true;
  });
}

/** A hash the route compares against when there is nothing to compare, so an answer takes as long whichever way it goes. */
let fixed: Promise<string> | undefined;
const fixedHash = () => (fixed ??= hashPassword('nothing is stored under this'));

/** Whether any password marked when the app moved onto the package can still be moved: the salt document says so (`moving`). */
export async function passwordsMoving(
  database: Database,
  now: number = Date.now(),
): Promise<boolean> {
  const { rows } = await database.run(
    'select 1 as open from sv_legacy_passwords where until > ? limit 1',
    [now],
  );
  return rows.length > 0;
}

/**
 * The route that moves a password an app stored before the package (auth.md §8.1): `POST /api/auth/sv/move-password` with the address,
 * what the app's page used to send in the password's place (`previous`: the password itself for most apps, a value of the app's own
 * where it derived one) and the sign-in value. A marked account whose mark has time left and whose stored hash opens `previous` gets the
 * sign-in value's hash and loses its mark; nothing else happens to anything. **It opens no session:** the page signs in with the
 * sign-in value afterwards, through every rule a sign-in passes, and that says whether it worked. The answer is the same whatever
 * happened, takes as long, is limited by asking address and by account (five an hour) and refuses another origin. `previous` is compared once and kept nowhere.
 *
 * For an app moving onto the package; core never adds it. It is gone in effect once no mark has time left.
 */
export function movePasswords({
  database,
  now = Date.now,
}: {
  database: Database;
  now?: () => number;
}) {
  return {
    id: 'sv-move-passwords',
    rateLimit: [{ pathMatcher: (path: string) => path === MOVE_PASSWORD_PATH, window: 60, max: 5 }],
    endpoints: {
      movePassword: createAuthEndpoint(
        MOVE_PASSWORD_PATH,
        { method: 'POST', metadata: { isAction: false } },
        async (ctx) => {
          const origin = ctx.request?.headers.get('origin');
          const allowed = [
            new URL(ctx.context.baseURL).origin,
            ...(ctx.context.trustedOrigins ?? []),
          ];
          if (!origin || !allowed.includes(origin))
            throw new APIError('FORBIDDEN', { message: 'Not from this app.' });
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const { email, previous, signIn } = body;
          const fair =
            typeof email === 'string' &&
            typeof previous === 'string' &&
            previous !== '' &&
            previous.length <= MOST &&
            !isSignInValue(previous) &&
            isSignInValue(signIn);
          const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
          // Counted by address as well as by the asking address's IP (better-auth's limit above), so guessing at one account from many
          // places is held to five an hour; past that the route compares nothing that could move, and answers the same.
          const counted = fair && (await takeTry(database, address, now()));
          const { rows } = counted
            ? await database.run(
                `select a.id, a.password, m.until from users u
                   join accounts a on a.user_id = u.id and a.provider_id = 'credential'
                   join sv_legacy_passwords m on m.user_id = u.id
                  where lower(u.email) = ?`,
                [address],
              )
            : { rows: [] };
          const found = rows[0];
          const open =
            found !== undefined &&
            Number(found.until) > now() &&
            typeof found.password === 'string';
          // Compared every time, against the fixed hash when there is nothing to move, so the time says nothing.
          const matches = await verifyPassword({
            hash: open ? String(found.password) : await fixedHash(),
            password: counted ? String(previous) : 'nothing',
          });
          if (counted && open && matches) {
            await database.transaction(async (tx) => {
              const { rowsAffected } = await tx.run(
                'delete from sv_legacy_passwords where user_id in (select user_id from accounts where id = ?) and until > ?',
                [found.id, now()],
              );
              // Only while the mark was there, so two requests at once move it once.
              if (rowsAffected > 0)
                await tx.run('update accounts set password = ?, updated_at = ? where id = ?', [
                  await hashPassword(String(signIn)),
                  database.family === 'postgres' ? new Date(now()) : now(),
                  found.id,
                ]);
            });
          }
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
