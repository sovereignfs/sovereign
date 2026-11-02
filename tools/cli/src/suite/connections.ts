import { isExternal, type Suite } from './types.js';

/** PostgreSQL's own `max_connections`. The server is given the setting only when the operator asks for another (contracts/suite.md §1.3). */
export const DEFAULT_MAX_CONNECTIONS = 100;
/** What PostgreSQL keeps for the superuser, which `sv apply` and backups connect as. */
export const SUPERUSER_RESERVE = 3;
/** The pool size core and the app template have, so a file that says nothing changes nothing. */
export const DEFAULT_POOL = 10;
/** What a role may hold above its pool, so a connection left by a killed container does not keep its replacement out. */
export const ROLE_HEADROOM = 2;

/** What a pooled app is left to hold on the direct address, which the app template's direct pool matches (contracts/app-manifest.md §2.2). */
export const DIRECT_POOL = 2;
/** The server connections the pooler opens for each app that goes through it, until the operator says another number. */
export const DEFAULT_POOLER_POOL = 5;
/** The connections all the pooled apps together may open to the pooler, until the operator says another number. */
export const DEFAULT_POOLER_CLIENTS = 200;

export const maxConnectionsOf = (suite: Suite): number =>
  suite.database.maxConnections ?? DEFAULT_MAX_CONNECTIONS;

/** How many connections core's pool may hold. */
export const corePool = (suite: Suite): number => suite.database.connections?.core ?? DEFAULT_POOL;

/** How many connections a hosted app's pool may hold: its own number, or the one for every app. */
export function appPool(suite: Suite, name: string): number {
  const app = suite.apps?.[name];
  const own = app && !isExternal(app) ? app.connections : undefined;
  return own ?? suite.database.connections?.app ?? DEFAULT_POOL;
}

/** The `CONNECTION LIMIT` of the role of a service whose pool is `pool`. */
export const roleLimit = (pool: number): number => pool + ROLE_HEADROOM;

/** How many server connections the pooler may open for each app that goes through it. */
export const poolerPool = (suite: Suite): number =>
  suite.database.pooler?.poolSize ?? DEFAULT_POOLER_POOL;

/** How many connections the pooled apps may open to the pooler between them. */
export const poolerClients = (suite: Suite): number =>
  suite.database.pooler?.maxClients ?? DEFAULT_POOLER_CLIENTS;

/**
 * What the role of an app holds at most: its pool, or, when it goes through the pooler, the server connections the pooler may open for it
 * (never more than its pool), plus the direct address's, plus the headroom every role has (contracts/suite.md §1.3).
 */
export function appRoleLimit(suite: Suite, name: string, pooled: boolean): number {
  const pool = appPool(suite, name);
  return pooled ? Math.min(poolerPool(suite), pool) + DIRECT_POOL + ROLE_HEADROOM : roleLimit(pool);
}

/** Whether the operator has said anything about connections. Only then is a budget that is exceeded a refusal. */
export const setsConnections = (suite: Suite): boolean =>
  suite.database.maxConnections !== undefined ||
  suite.database.connections !== undefined ||
  Object.values(suite.apps ?? {}).some((app) => !isExternal(app) && app.connections !== undefined);

export type Budget = {
  /** What the roles of core and of the apps with a database may hold between them. */
  used: number;
  /** What the server allows them: `max_connections` less the superuser's reserve. */
  available: number;
  /** Each role's limit, for saying where the connections go. */
  roles: { name: string; limit: number }[];
  exceeded: boolean;
  /** Set by the operator, so exceeding it is refused; otherwise it is only said. */
  explicit: boolean;
  /** What the pooled apps' own pools may open to the pooler, against what it takes. Absent when the pooler is off. */
  clients?: { used: number; available: number };
  /** The pooled apps' pools do not fit what the pooler takes. Always a refusal: the operator turned the pooler on. */
  clientsExceeded: boolean;
};

/**
 * The connections the limits add up to against what the server allows (operator-cli §6.4.4). `hasDatabase` says which hosted apps have
 * a role: only those do, and only the manifest knows.
 */
export function connectionBudget(
  suite: Suite,
  hasDatabase: (name: string) => boolean,
  /** Which of them go through the pooler, which is those whose manifest says they can and only when it is on. */
  pooled: (name: string) => boolean = () => false,
): Budget {
  const roles = [{ name: 'core', limit: roleLimit(corePool(suite)) }];
  let clients = 0;
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (isExternal(app) || !hasDatabase(name)) continue;
    const through = suite.database.pooler !== undefined && pooled(name);
    roles.push({ name, limit: appRoleLimit(suite, name, through) });
    if (through) clients += appPool(suite, name);
  }
  const used = roles.reduce((sum, role) => sum + role.limit, 0);
  const available = maxConnectionsOf(suite) - SUPERUSER_RESERVE;
  const pooler = suite.database.pooler !== undefined;
  return {
    used,
    available,
    roles,
    exceeded: used > available,
    explicit: setsConnections(suite) || pooler,
    ...(pooler ? { clients: { used: clients, available: poolerClients(suite) } } : {}),
    clientsExceeded: pooler && clients > poolerClients(suite),
  };
}

/** The sentence that says how the connections are spread, for a refusal and a warning. */
export function describeBudget(budget: Budget, maxConnections: number): string {
  const share = budget.roles.map((role) => `${role.name} ${role.limit}`).join(', ');
  return `The connection limits add up to ${budget.used} (${share}), and the server allows ${budget.available} (max_connections ${maxConnections}, less ${SUPERUSER_RESERVE} kept for the superuser).`;
}

/** The sentence that says the pooled apps may open more connections to the pooler than it takes. */
export function describeClients(budget: Budget): string {
  const clients = budget.clients;
  return clients
    ? `The apps that go through the pooler may open ${clients.used} connections to it, and it takes ${clients.available}.`
    : '';
}
