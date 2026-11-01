import { ConfigError, integer, oneOf, secret, string, url } from '@sovereignfs/config';
import type { ConfigValues, Problem, Secret } from '@sovereignfs/config';

export const DIALECTS = ['sqld', 'sqlite', 'postgres'] as const;
export type Dialect = (typeof DIALECTS)[number];

/**
 * The database variables of contracts/env.md, to spread into an app's `defineConfig`:
 *
 *   defineConfig({ prefix: 'SV', variables: { url: …, ...databaseVariables } })
 *
 * Every one is optional here. Which are needed depends on the dialect, and whether the
 * database is required at all is the app's decision, so both are checked by
 * `resolveDatabase`, which reports a problem per variable.
 */
export const databaseVariables = {
  dbDialect: oneOf(DIALECTS, {
    name: 'DB_DIALECT',
    description: 'Which database: sqld, sqlite or postgres. Nothing infers it from a URL',
  }),
  sqldUrl: url({
    name: 'SQLD_URL',
    protocols: ['http:', 'https:'],
    description: "An sqld server's address, when DB_DIALECT is sqld",
  }),
  sqldAdminUrl: url({
    name: 'SQLD_ADMIN_URL',
    protocols: ['http:', 'https:'],
    description: "sqld's admin address, used to create the namespace when it does not exist",
  }),
  sqldNamespace: string({
    name: 'SQLD_NAMESPACE',
    default: 'default',
    description: 'The sqld namespace this app uses, so apps can share one sqld server',
  }),
  sqliteUrl: string({
    name: 'SQLITE_URL',
    description: 'A SQLite database file as a file: URL, when DB_DIALECT is sqlite',
  }),
  postgresUrl: secret({
    name: 'POSTGRES_URL',
    url: { protocols: ['postgres:', 'postgresql:'] },
    description: 'A PostgreSQL address, which can carry a password, when DB_DIALECT is postgres',
  }),
  postgresPoolMax: integer({
    name: 'POSTGRES_POOL_MAX',
    default: 10,
    min: 2,
    max: 100,
    description: 'Connections in the PostgreSQL pool. At least 2: one holds the migration lock',
  }),
};

export type DatabaseSettings = ConfigValues<typeof databaseVariables>;

export type ResolvedDatabase =
  | { dialect: 'sqld'; url: string; adminUrl: string | undefined; namespace: string }
  | { dialect: 'sqlite'; url: string; path: string }
  | { dialect: 'postgres'; url: Secret; poolMax: number };

/** Namespace names sqld accepts that are also safe to put in a URL path. */
const NAMESPACE = /^[a-z][a-z0-9_]{0,62}$/;

export type ResolveOptions = {
  /** The app's prefix, so a problem names the real variable (`SV_SQLD_URL`). */
  prefix: string;
  /** The app cannot run without a database. When it is not required and no dialect is set, the result is `undefined`. */
  required?: boolean;
};

/**
 * Settles which database the app uses from its settings, and checks what the dialect needs:
 * the URL that fits it, and no URL that belongs to another dialect's setting being
 * mistaken for it. Every problem is reported at once, none shows a value.
 */
export function resolveDatabase(
  settings: DatabaseSettings,
  options: ResolveOptions & { required: true },
): ResolvedDatabase;
export function resolveDatabase(
  settings: DatabaseSettings,
  options: ResolveOptions,
): ResolvedDatabase | undefined;
export function resolveDatabase(
  settings: DatabaseSettings,
  { prefix, required = false }: ResolveOptions,
): ResolvedDatabase | undefined {
  const name = (variable: string) => `${prefix}_${variable}`;
  const problems: Problem[] = [];
  const need = (variable: string, message: string) =>
    problems.push({ variable: name(variable), message });

  const dialect = settings.dbDialect;
  if (dialect === undefined) {
    if (required) {
      need('DB_DIALECT', `is required but not set (one of: ${DIALECTS.join(', ')})`);
      throw new ConfigError(problems);
    }
    return undefined;
  }

  let resolved: ResolvedDatabase | undefined;
  switch (dialect) {
    case 'sqld': {
      if (settings.sqldUrl === undefined) need('SQLD_URL', 'is required when DB_DIALECT is sqld');
      if (!NAMESPACE.test(settings.sqldNamespace)) {
        need(
          'SQLD_NAMESPACE',
          'must be lower-case letters, digits and underscores, starting with a letter, at most 63 characters',
        );
      }
      if (settings.sqldUrl !== undefined) {
        resolved = {
          dialect,
          url: settings.sqldUrl,
          adminUrl: settings.sqldAdminUrl,
          namespace: settings.sqldNamespace,
        };
      }
      break;
    }
    case 'sqlite': {
      const value = settings.sqliteUrl;
      if (value === undefined) need('SQLITE_URL', 'is required when DB_DIALECT is sqlite');
      else if (!value.startsWith('file:') || value.slice('file:'.length).trim() === '') {
        need('SQLITE_URL', 'must be a file: URL, such as file:./data/core.db');
      } else resolved = { dialect, url: value, path: value.slice('file:'.length) };
      break;
    }
    case 'postgres': {
      if (settings.postgresUrl === undefined) {
        need('POSTGRES_URL', 'is required when DB_DIALECT is postgres (or set POSTGRES_URL_FILE)');
      } else resolved = { dialect, url: settings.postgresUrl, poolMax: settings.postgresPoolMax };
      break;
    }
  }

  if (problems.length > 0 || resolved === undefined) throw new ConfigError(problems);
  return resolved;
}
