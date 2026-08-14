import { getMigrations } from 'better-auth/db/migration';
import { getAuthOptions } from './auth';
import { authGet, authRun, ensureAuthTables, provisionAuthStore } from './db';

/**
 * Apply better-auth's schema migrations (user/session/account/verification) and
 * create the auth server's own tables (invites, auth_settings). Both are
 * dialect-aware and idempotent — safe to run on every startup.
 *
 * `provisionAuthStore` must run first: an sqld namespace doesn't auto-vivify
 * on first query (verified live — an unprovisioned namespace 404s), and a
 * Postgres schema needs to exist before anything can be created inside it.
 */
export async function runAuthMigrations(): Promise<void> {
  await provisionAuthStore();
  const { runMigrations } = await getMigrations(getAuthOptions());
  await runMigrations();
  await ensureAuthTables();
  await grandfatherEmailVerification();
  await grandfatherVerificationLevel();
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

/**
 * One-time data migration: every account that existed before this leg
 * shipped gets `verificationLevel = 0` from the new column's default the
 * moment `runMigrations()` above adds it — including accounts that already
 * verified their email or enrolled MFA long ago. RFC 0035's "existing-user
 * migration strategy" open question picks auto-promote (strategy 1): derive
 * the level each account should already be at from signals it already has
 * (`emailVerified`, `twoFactorEnabled`, any enrolled passkey) rather than
 * dropping every pre-existing user back to Level 0 and making them re-verify.
 * Bulk SQL rather than a per-user loop — a plain floor-raise, so running it
 * against thousands of rows costs three UPDATEs, not N round-trips.
 *
 * Guarded by the same one-time `auth_settings` marker pattern as
 * `grandfatherEmailVerification` above, for the same reason: a level can
 * legitimately drop after this (MFA removal, RFC 0035 §5.4), and a marker-less
 * sweep re-running on every boot would silently re-promote it back up.
 */
async function grandfatherVerificationLevel(): Promise<void> {
  const marker = await authGet<{ value: string }>(
    "SELECT value FROM auth_settings WHERE key = 'verification_level_grandfathered'",
  );
  if (marker) return;

  await authRun(
    'UPDATE "user" SET "verificationLevel" = 1 WHERE "emailVerified" = ? AND "verificationLevel" < 1',
    [true],
  );
  await authRun(
    'UPDATE "user" SET "verificationLevel" = 2 WHERE "twoFactorEnabled" = ? AND "verificationLevel" < 2',
    [true],
  );
  await authRun(
    'UPDATE "user" SET "verificationLevel" = 2 WHERE "verificationLevel" < 2 AND id IN (SELECT DISTINCT "userId" FROM "passkey")',
  );
  await authRun(
    `INSERT INTO auth_settings (key, value, updated_at) VALUES ('verification_level_grandfathered', 'true', ?)
     ON CONFLICT (key) DO NOTHING`,
    [Math.floor(Date.now() / 1000)],
  );
}
