import { getMigrations } from 'better-auth/db/migration';
import { getAuthOptions } from './auth';
import { authGet, authRun, ensureAuthTables } from './db';

/**
 * Apply better-auth's schema migrations (user/session/account/verification) and
 * create the auth server's own tables (invites, auth_settings). Both are
 * dialect-aware and idempotent — safe to run on every startup.
 */
export async function runAuthMigrations(): Promise<void> {
  const { runMigrations } = await getMigrations(getAuthOptions());
  await runMigrations();
  await ensureAuthTables();
  await grandfatherEmailVerification();
}

/**
 * One-time data migration: every account created before email verification
 * enforcement shipped has `emailVerified = false` (the field has always
 * existed but was never set). Marking every such account verified avoids
 * locking operators and their existing users out of an instance they
 * already run the moment they upgrade — only new registrations after this
 * point go through the email flow.
 *
 * Guarded by an `auth_settings` marker (not a plain "WHERE emailVerified =
 * false" sweep) so it runs exactly once, ever — a blanket sweep would
 * silently re-verify every subsequent legitimately-unverified new signup on
 * every server restart, defeating the feature it's meant to grandfather
 * around.
 */
async function grandfatherEmailVerification(): Promise<void> {
  const marker = await authGet<{ value: string }>(
    "SELECT value FROM auth_settings WHERE key = 'email_verification_grandfathered'",
  );
  if (marker) return;

  await authRun('UPDATE "user" SET "emailVerified" = ? WHERE "emailVerified" = ?', [true, false]);
  await authRun(
    `INSERT INTO auth_settings (key, value, updated_at) VALUES ('email_verification_grandfathered', 'true', ?)
     ON CONFLICT (key) DO NOTHING`,
    [Math.floor(Date.now() / 1000)],
  );
}
