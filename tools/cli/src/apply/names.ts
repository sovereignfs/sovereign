/**
 * What `sv apply` calls the things it makes, in one place: a test, `sv status` and a person reading `docker ps` must all agree.
 * Nothing here is derived from a user’s input but an app’s name, which the schema has already limited to a DNS label.
 */
export const NETWORK = {
  core: 'sv-net-core',
  app: (name: string) => `sv-net-app-${name}`,
} as const;

export const CONTAINER = {
  proxy: 'sv-proxy',
  database: 'sv-database',
  core: 'sv-core',
  app: (name: string) => `sv-app-${name}`,
} as const;

export const PROJECT = {
  proxy: 'sovereign-proxy',
  database: 'sovereign-database',
  core: 'sovereign-core',
  app: (name: string) => `sovereign-app-${name}`,
} as const;

/** Where a container finds the secrets it is given, one file each (spec/env.md §3). */
export const SECRETS_IN_CONTAINER = '/run/secrets';
/** Where a container finds the proxy’s own certificate authority, with `tls.mode: internal`. */
/** The folder holding the proxy’s authority is mounted, not the file: a file mounted alone goes stale when it is replaced. */
export const CA_DIR_IN_CONTAINER = '/run/sovereign';
export const CA_IN_CONTAINER = `${CA_DIR_IN_CONTAINER}/root.crt`;

/** The database server’s administrator, which only `sv apply` uses. */
export const DATABASE_ADMIN = 'sovereign';
export const CORE_DATABASE = 'core';
export const CORE_ROLE = 'core';
