import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '@sovereignfs/database';
import type { Auth } from '../auth/auth';
import { passwordProblems, type PasswordPolicy } from '../auth/password-policy';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER, type Role } from '../auth/roles';
import { DEFAULT_SCOPES, type ClientRegistry, type RegisterInput } from '../clients/registry';
import type { SystemActor } from '../clients/system-actor';

/** A person to make on a development instance. The first is the owner: the first account always is. */
export type SeedAccount = { name: string; email: string; role: Role };

/** An owner, an admin and an ordinary person, with addresses that cannot be anyone's (`.test` never resolves). */
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { name: 'Olive Owner', email: 'owner@sovereign.local', role: ROLE_OWNER },
  { name: 'Ada Admin', email: 'admin@sovereign.local', role: ROLE_ADMIN },
  { name: 'Pat Person', email: 'user@sovereign.local', role: ROLE_USER },
];

/** The password every seeded account has on a development instance, unless `SEED_PASSWORD` says another. */
export const DEFAULT_SEED_PASSWORD = 'sovereign-dev-password';

/** The only instances that may be seeded (core-app §3.15.1). Production is never one of them. */
export const SEED_ENVIRONMENTS = ['development', 'staging'] as const;
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number];

/** The managed key of the sample app, which `ensure` finds it by on the next run. */
export const SEED_APP_KEY = 'seed-sample';

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

/** `passwords` holds one for each account made now, and none for one that was kept: a password is shown once. */
export type SeedResult = {
  created: string[];
  existing: string[];
  passwords: Record<string, string>;
};

/** What a seed made, and the passwords of the accounts it made (core-app §3.15.1). */
export type SeedReport = {
  environment: SeedEnvironment;
  accounts: { created: { email: string; role: Role; password: string }[]; existing: string[] };
  app: { key: string; clientId: string; redirect: string; created: boolean };
};

/** The seed is refused on anything but a development or staging instance, and the word is the instance's own. */
export function assertSeedEnvironment(environment: string): asserts environment is SeedEnvironment {
  if (!(SEED_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new SeedError(
      `Seeding is for development and staging instances, and this one is ${environment}.`,
    );
  }
}

/**
 * Refuses an instance that holds an account no seed made. The environment says what the instance is meant for; this says what it
 * has become, and a seed must not be added to people who signed up, whatever a variable says. It is a check of its own so that a mistake
 * in the other is not a way in.
 */
export async function assertOnlySeedAccounts(
  database: Database,
  accounts: readonly SeedAccount[] = SEED_ACCOUNTS,
): Promise<void> {
  const known = new Set(accounts.map((account) => account.email));
  const others = (await database.run('select email from users')).rows.filter(
    (row) => !known.has(String(row.email)),
  );
  if (others.length > 0) {
    throw new SeedError(
      `This instance has ${others.length} account${others.length === 1 ? '' : 's'} that no seed made, so it is not seeded: a seed is for an instance made to be tried.`,
    );
  }
}

/**
 * A password for a seeded account on a staging instance: random, at least 24 characters, and one the instance's own policy accepts, since
 * it is made by core's own sign-up.
 */
export function generatePassword(policy?: PasswordPolicy): string {
  const length = Math.max(24, policy?.minLength ?? 0);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = randomBytes(Math.ceil((length * 3) / 4))
      .toString('base64url')
      .slice(0, length);
    if (!policy || passwordProblems(candidate, policy).length === 0) return candidate;
  }
  throw new SeedError('A password that meets the instance’s policy could not be made.');
}

/**
 * The sample app's address for sign-in. A development instance, whose own address is `http` (core-app §3.7.1), may have an app on
 * `localhost`; any other must be sent to `https`, so the app is a name under core's own host, which nothing serves: it exists so that
 * sign-in can be tried by pointing an app at it.
 */
export function sampleRedirect(baseUrl: string): string {
  const url = new URL(baseUrl);
  return url.protocol === 'http:'
    ? 'http://localhost:3001/callback'
    : `https://sample.${url.hostname}/callback`;
}

/** What the sample app is: public, so it has no secret to leak, and out of the launcher, so no tile leads nowhere. */
export function sampleApp(baseUrl: string): RegisterInput {
  return {
    name: 'Sample app',
    type: 'public',
    redirectUris: [sampleRedirect(baseUrl)],
    postLogoutRedirectUris: [],
    backchannelLogoutUri: '',
    accountDeletedUri: '',
    scopes: [...DEFAULT_SCOPES],
    appScopes: [],
    trusted: false,
    enabled: true,
    launcher: {
      description: 'An app to try signing in from. Made by the seed.',
      icon: '',
      launchUrl: '',
      show: false,
    },
  };
}

/**
 * Makes the accounts that are not there yet, through core's own sign-up (so passwords are hashed and every rule
 * applies) and leaves the ones that are, so it can be run again. Registration may be invite-only, so each account
 * after the first is invited first, directly; the address is marked verified, since no mail goes anywhere here. An
 * admin or ordinary account is given its role afterwards. The owner is whoever signs up first, so the owner is
 * the first account in the list and must be made on an empty instance.
 */
export async function seedAccounts(
  deps: {
    auth: Pick<Auth, 'api'>;
    database: Database;
    baseUrl: string;
    /** Whether core's address must be on this machine. It is, unless the caller says it is not (a deployed instance). */
    requireLocalAddress?: boolean;
  },
  password: string | ((account: SeedAccount) => string) = DEFAULT_SEED_PASSWORD,
  accounts: readonly SeedAccount[] = SEED_ACCOUNTS,
): Promise<SeedResult> {
  if (deps.requireLocalAddress !== false && !isLocalAddress(deps.baseUrl)) {
    throw new SeedError(
      `Seeding is for a development instance on this machine, and ${deps.baseUrl} is not one.`,
    );
  }
  const created: string[] = [];
  const existing: string[] = [];
  const passwords: Record<string, string> = {};
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
    const chosen = typeof password === 'function' ? password(account) : password;
    await deps.auth.api.signUpEmail({
      body: {
        name: account.name,
        email: account.email,
        password: chosen,
        agreedToTerms: true,
      } as never,
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
    passwords[account.email] = chosen;
  }
  return { created, existing, passwords };
}

/**
 * Seeds an instance (core-app §3.15.1): the accounts, then the sample app. It is refused, making nothing, unless the environment is
 * development or staging, and unless no account that a seed did not make is there. On development every account has the one documented
 * password; on staging, which may be reachable from anywhere, each has a random one, returned here and never kept.
 */
export async function seedInstance(deps: {
  auth: Pick<Auth, 'api'>;
  database: Database;
  baseUrl: string;
  environment: string;
  registry: Pick<ClientRegistry, 'ensure'>;
  actor: SystemActor;
  /** The password policy the instance enforces, which a generated password must meet. */
  passwordPolicy?: PasswordPolicy;
  /** Development's password, when `SEED_PASSWORD` names one. Staging never uses it. */
  password?: string | undefined;
  /** Also requires core's address to be on this machine, as `pnpm seed` does. */
  local: boolean;
}): Promise<SeedReport> {
  assertSeedEnvironment(deps.environment);
  await assertOnlySeedAccounts(deps.database);
  const staging = deps.environment === 'staging';
  const made = await seedAccounts(
    {
      auth: deps.auth,
      database: deps.database,
      baseUrl: deps.baseUrl,
      requireLocalAddress: deps.local,
    },
    staging ? () => generatePassword(deps.passwordPolicy) : deps.password || DEFAULT_SEED_PASSWORD,
  );
  const { client, created } = await deps.registry.ensure(
    deps.actor,
    SEED_APP_KEY,
    sampleApp(deps.baseUrl),
  );
  return {
    environment: deps.environment,
    accounts: {
      created: made.created.map((email) => ({
        email,
        role: (SEED_ACCOUNTS.find((account) => account.email === email) as SeedAccount).role,
        password: made.passwords[email] as string,
      })),
      existing: made.existing,
    },
    app: {
      key: SEED_APP_KEY,
      clientId: client.clientId,
      redirect: sampleRedirect(deps.baseUrl),
      created,
    },
  };
}
