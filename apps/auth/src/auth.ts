import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { authGet, authRun, getAuthDatabase } from './db';
import { getEnv } from './env';
import { readInviteOnlySetting, resolveInviteOnly } from './settings';

function buildOptions(): BetterAuthOptions {
  const env = getEnv();

  return {
    secret: env.secret,
    baseURL: env.baseUrl,
    ...(env.trustedOrigins.length > 0 && { trustedOrigins: env.trustedOrigins }),
    database: getAuthDatabase(),
    session: {
      // Disable better-auth's "fresh session" gate. By default sensitive
      // endpoints guarded by freshSessionMiddleware (e.g. GET /list-sessions,
      // used by sdk.auth.listSessions / the Account Security tab) return
      // 403 SESSION_NOT_FRESH once a session is older than freshAge (default
      // 1 day). In a self-hosted workspace users stay signed in for weeks, so
      // viewing/managing your own sessions must not require recent re-auth.
      freshAge: 0,
      // Sign a short-lived snapshot of the session+user into a `session_data`
      // cookie so the runtime middleware can verify requests locally (HMAC,
      // shared secret) without a /api/verify round-trip per request (SRS
      // AUTH-05). maxAge bounds how stale a role change / deactivation can be
      // before the runtime falls back to /api/verify.
      cookieCache: { enabled: true, maxAge: 300 },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        // Platform role. Not user-settable; assigned by the create hook below.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'platform:user',
          input: false,
        },
        // Whether the account is active. Admins can deactivate/reactivate via Console.
        active: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const countRow = await authGet<{ c: number | string }>(
              'SELECT COUNT(*) AS c FROM "user"',
            );
            // COUNT is a number on SQLite, a bigint-as-string on Postgres.
            const isFirst = Number(countRow?.c ?? 0) === 0;

            // Invite-only gate (first user bootstraps and is exempt). The
            // Console toggle (stored setting) overrides the env default, so
            // this is resolved per registration — no restart needed (CON-10).
            const inviteOnly = resolveInviteOnly(await readInviteOnlySetting(), env.inviteOnly);
            if (!isFirst && inviteOnly) {
              const now = Math.floor(Date.now() / 1000);
              const invite = await authGet(
                'SELECT token FROM invites WHERE email = ? AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)',
                [user.email, now],
              );
              if (!invite) {
                throw new APIError('FORBIDDEN', {
                  message: 'Registration is invite-only; no valid invite was found for this email.',
                });
              }
              await authRun('UPDATE invites SET consumed_at = ? WHERE email = ?', [
                now,
                user.email,
              ]);
            }

            // First user becomes the platform admin.
            return { data: { ...user, role: isFirst ? 'platform:admin' : 'platform:user' } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  };
}

let options: BetterAuthOptions | undefined;
let instance: ReturnType<typeof betterAuth> | undefined;

/** The resolved better-auth options (also used by the migration runner). */
export function getAuthOptions(): BetterAuthOptions {
  options ??= buildOptions();
  return options;
}

/** The better-auth instance, created lazily on first use (runtime, not build). */
export function getAuth(): ReturnType<typeof betterAuth> {
  instance ??= betterAuth(getAuthOptions());
  return instance;
}
