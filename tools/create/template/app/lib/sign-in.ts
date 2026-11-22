import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import {
  coreSignInMigrations,
  CORE_SIGN_IN_MIGRATIONS_TABLE,
  sovereignSignIn,
} from '@sovereignfs/auth/core';
import {
  ACCOUNT_MIGRATIONS_TABLE,
  accountMigrations,
  accountTables,
  createAuthPreset,
  keySecrets,
  resolveAuthSettings,
  resolveWaysIn,
  runMigrations,
  signUpPolicy,
} from '@sovereignfs/auth/server';
import { AppVault, VAULT_MIGRATIONS_TABLE, vaultMigrations } from '@sovereignfs/sdk/vault';
import { required, setting } from './config';
import type { Database } from '@sovereignfs/auth/database';
import { database as appDatabase } from './db';
import { sovereign } from './sovereign';

/** How this app signs people in (`@sovereignfs/auth`, auth.md §5): accounts of its own, core, or both, from its settings. */
export function waysIn() {
  return resolveWaysIn({
    local: setting('__PREFIX___AUTH_LOCAL'),
    signUp: setting('__PREFIX___AUTH_SIGNUP'),
    coreUrl: setting('__PREFIX___CORE_URL'),
  });
}

/** The password policy and the rest of the sign-in's settings, read with the app's prefix (auth.md §5). */
export function signInSettings() {
  const list = (name: string) =>
    (setting(name) ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  const number = (name: string, fallback: number) => Number(setting(name) ?? fallback) || fallback;
  return resolveAuthSettings(
    {
      url: required('__PREFIX___URL'),
      authSecret: { reveal: () => required('__PREFIX___AUTH_SECRET') },
      authTrustedOrigins: list('__PREFIX___AUTH_TRUSTED_ORIGINS'),
      authTrustedProxies: list('__PREFIX___AUTH_TRUSTED_PROXIES'),
      authCookieDomain: undefined,
      authPasswordMinLength: number('__PREFIX___AUTH_PASSWORD_MIN_LENGTH', 8),
      authPasswordRequireUppercase: false,
      authPasswordRequireLowercase: false,
      authPasswordRequireNumber: false,
      authPasswordRequireSymbol: false,
      authRequireEmailVerification: false,
      authWebauthnRpId: undefined,
      authWebauthnRpName: '__TITLE__',
      authWebauthnOrigin: [],
    },
    { prefix: '__PREFIX__', appName: '__TITLE__' },
  );
}

async function make() {
  // The app's own database, on the form its settings name: the sign-in's tables live in it beside the app's.
  const database = await appDatabase();
  const ways = waysIn();
  const settings = signInSettings();
  const auth = betterAuth(
    createAuthPreset({
      appName: '__TITLE__',
      database,
      tables: accountTables(database.family),
      settings,
      // This app sends no mail, so it cannot verify an address or send a reset link, and says so before anything is looked up.
      mail: {
        unavailable: () => Promise.resolve('This app does not send mail.'),
        verification: () => Promise.resolve(),
        passwordReset: () => Promise.resolve(),
        accountCreated: () => Promise.resolve(),
      },
      registration: signUpPolicy(database, ways.signUp === 'open' ? 'open' : 'closed'),
      localAccounts: ways.local,
      plugins: [
        ...(ways.core ? [sovereignSignIn({ sovereign: sovereign(), database })] : []),
        // The session's key secret for the pages that keep a person's keys (auth.md §8.1): made only when a page asks.
        keySecrets({ database, core: Boolean(ways.core) }),
        // Last: it turns the cookies a server action sets into the response's.
        nextCookies(),
      ],
    }),
  );
  return { auth, database, ways, vault: new AppVault(database) };
}

let made: ReturnType<typeof make> | undefined;

/** The app's sign-in for this process: its better-auth on the package's preset, its database, its ways in and its vault. */
export function signIn(): ReturnType<typeof make> {
  made ??= make().catch((error: unknown) => {
    made = undefined;
    throw error;
  });
  return made;
}

/**
 * The sign-in's tables, under their own histories (auth.md §10), after the app's own migrations, on the database `lib/migrate.ts` gives:
 * the direct address on PostgreSQL, where the migrations' lock holds.
 */
export async function migrateSignIn(database: Database): Promise<void> {
  const ways = waysIn();
  await runMigrations(database, accountMigrations(database.family), {
    table: ACCOUNT_MIGRATIONS_TABLE,
  });
  if (ways.core) {
    await runMigrations(database, coreSignInMigrations(database.family), {
      table: CORE_SIGN_IN_MIGRATIONS_TABLE,
    });
  }
  // The vault id is the salt of the sign-in value (sdk §9.5): the same one the app's vault uses if it adds encryption.
  await runMigrations(database, vaultMigrations(database.family), {
    table: VAULT_MIGRATIONS_TABLE,
  });
}
