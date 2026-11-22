import { randomBytes } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';

/** Where a page of the app asks for its session's key secret (sdk §9.3, §9.5), under the app's `/api/auth`. */
export const KEY_SECRET_PATH = '/sv/key-secret';

/** The answer's headers: JSON, never kept by anything between. */
const HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;

/**
 * The session's half of what keeps a person's keys in the browser (RFC 0007 amendment 1 A4, auth.md §8.1), served at
 * `GET /api/auth/sv/key-secret` for `@sovereignfs/sdk/keys` and `localVault` (their `secretPath`), as the SDK's `nextAuth` serves it:
 * 32 random bytes, made the first time a page of this session asks and kept in `sv_key_secrets`, which ends with the session however
 * it ends; never in the session's own row, which better-auth hands to the browser. Only the app's own pages are answered (a browser
 * that says a request comes from elsewhere gets a 404), with `no-store`; with no session, a 401.
 *
 * `sub` is whom the keys are for: with `core`, a session that came through core is keyed by core's `sub` (its sign-in record), so core's
 * key release matches; any other session by the app's own user id, as `localVault` and `AppVault` key a person.
 */
export function keySecrets({ database, core = false }: { database: Database; core?: boolean }) {
  return {
    id: 'sv-key-secrets',
    endpoints: {
      keySecret: createAuthEndpoint(
        KEY_SECRET_PATH,
        { method: 'GET', metadata: { isAction: false } },
        async (ctx) => {
          const site = ctx.request?.headers.get('sec-fetch-site');
          if (site !== null && site !== undefined && site !== 'same-origin')
            return new Response(JSON.stringify({ error: 'not_found' }), {
              status: 404,
              headers: HEADERS,
            });
          const current = await getSessionFromCtx(ctx);
          if (!current)
            return new Response(JSON.stringify({ error: 'not_signed_in' }), {
              status: 401,
              headers: HEADERS,
            });
          const sessionId = current.session.id;
          let sub = current.user.id;
          if (core) {
            const { rows } = await database.run(
              'select sub from sv_core_sign_ins where session_id = ?',
              [sessionId],
            );
            if (rows[0]) sub = String(rows[0].sub);
          }
          const secret = await secretOf(database, sessionId);
          return new Response(JSON.stringify({ sub, secret }), { status: 200, headers: HEADERS });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** The session's secret, made the first time; two pages asking at once get the same one. */
async function secretOf(database: Database, sessionId: string): Promise<string> {
  const kept = await database.run('select secret from sv_key_secrets where session_id = ?', [
    sessionId,
  ]);
  if (kept.rows[0]) return String(kept.rows[0].secret);
  const made = randomBytes(32).toString('base64url');
  await database.run(
    database.family === 'postgres'
      ? 'insert into sv_key_secrets (session_id, secret, created_at) values (?, ?, ?) on conflict (session_id) do nothing'
      : 'insert or ignore into sv_key_secrets (session_id, secret, created_at) values (?, ?, ?)',
    [sessionId, made, Date.now()],
  );
  const { rows } = await database.run('select secret from sv_key_secrets where session_id = ?', [
    sessionId,
  ]);
  return String(rows[0]?.secret ?? made);
}
