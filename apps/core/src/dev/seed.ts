import { randomUUID } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER, type Role } from '../auth/roles';

/** A person to make on a development instance. The first is the owner: the first account always is. */
export type SeedAccount = { name: string; email: string; role: Role };

/** An owner, an admin and an ordinary person, with addresses that cannot be anyone's (`.test` never resolves). */
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { name: 'Olive Owner', email: 'owner@example.test', role: ROLE_OWNER },
  { name: 'Ada Admin', email: 'admin@example.test', role: ROLE_ADMIN },
  { name: 'Pat Person', email: 'user@example.test', role: ROLE_USER },
];

/** The password every seeded account has, unless `SEED_PASSWORD` says another. It is for development only. */
export const DEFAULT_SEED_PASSWORD = 'sovereign-dev-password';

/**
 * Whether an address is one a development instance has: seeding writes accounts with a password anyone can read in
 * this file, so it is refused for anything that could be a real instance. `localhost`, `*.localhost` and a loopback
 * address are local; nothing else is.
 */
export function isLocalAddress(address: string): boolean {
  let host: string;
  try {
    host = new URL(address).hostname;
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1'
  );
}

export class SeedError extends Error {
  override name = 'SeedError';
}

export type SeedResult = { created: string[]; existing: string[] };

/**
 * Makes the accounts that are not there yet, through core's own sign-up (so passwords are hashed and every rule
 * applies) and leaves the ones that are, so it can be run again. Registration may be invite-only, so each account
 * after the first is invited first, directly; the address is marked verified, since no mail goes anywhere here. An
 * admin or ordinary account is given its role afterwards. The owner is whoever signs up first, so the owner is
 * the first account in the list and must be made on an empty instance.
 */
export async function seedAccounts(
  deps: { auth: Pick<Auth, 'api'>; database: Database; baseUrl: string },
  password: string = DEFAULT_SEED_PASSWORD,
  accounts: readonly SeedAccount[] = SEED_ACCOUNTS,
): Promise<SeedResult> {
  if (!isLocalAddress(deps.baseUrl)) {
    throw new SeedError(
      `Seeding is for a development instance on this machine, and ${deps.baseUrl} is not one.`,
    );
  }
  const created: string[] = [];
  const existing: string[] = [];
  for (const account of accounts) {
    const found = await deps.database.run('select id from users where email = ?', [account.email]);
    if (found.rows.length > 0) {
      existing.push(account.email);
      continue;
    }
    const people = Number(
      (await deps.database.run('select count(*) as n from users')).rows[0]?.n ?? 0,
    );
    if (people === 0 && account.role !== ROLE_OWNER) {
      throw new SeedError(
        'The first account on an instance is its owner, so the owner must come first.',
      );
    }
    if (people > 0) {
      await deps.database.run('insert into invites (id, email, created_at) values (?, ?, ?)', [
        randomUUID(),
        account.email,
        Date.now(),
      ]);
    }
    await deps.auth.api.signUpEmail({
      body: { name: account.name, email: account.email, password, agreedToTerms: true } as never,
      headers: new Headers({ origin: new URL(deps.baseUrl).origin }),
    });
    await deps.database.run('update users set email_verified = ? where email = ?', [
      deps.database.family === 'postgres' ? true : 1,
      account.email,
    ]);
    if (account.role !== ROLE_OWNER) {
      await deps.database.run('update users set role = ? where email = ?', [
        account.role,
        account.email,
      ]);
    }
    created.push(account.email);
  }
  return { created, existing };
}
