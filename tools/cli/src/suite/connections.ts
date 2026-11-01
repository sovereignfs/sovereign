import { isExternal, type Suite } from './types.js';

/** PostgreSQL's own `max_connections`. The server is given the setting only when the operator asks for another (contracts/suite.md §1.3). */
export const DEFAULT_MAX_CONNECTIONS = 100;
/** What PostgreSQL keeps for the superuser, which `sv apply` and backups connect as. */
export const SUPERUSER_RESERVE = 3;
/** The pool size core and the app template have, so a file that says nothing changes nothing. */
export const DEFAULT_POOL = 10;
/** What a role may hold above its pool, so a connection left by a killed container does not keep its replacement out. */
export const ROLE_HEADROOM = 2;

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
};

/**
 * The connections the limits add up to against what the server allows (operator-cli §6.4.4). `hasDatabase` says which hosted apps have
 * a role: only those do, and only the manifest knows.
 */
export function connectionBudget(suite: Suite, hasDatabase: (name: string) => boolean): Budget {
  const roles = [{ name: 'core', limit: roleLimit(corePool(suite)) }];
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (!isExternal(app) && hasDatabase(name))
      roles.push({ name, limit: roleLimit(appPool(suite, name)) });
  }
  const used = roles.reduce((sum, role) => sum + role.limit, 0);
  const available = maxConnectionsOf(suite) - SUPERUSER_RESERVE;
  return { used, available, roles, exceeded: used > available, explicit: setsConnections(suite) };
}

/** The sentence that says how the connections are spread, for a refusal and a warning. */
export function describeBudget(budget: Budget, maxConnections: number): string {
  const share = budget.roles.map((role) => `${role.name} ${role.limit}`).join(', ');
  return `The connection limits add up to ${budget.used} (${share}), and the server allows ${budget.available} (max_connections ${maxConnections}, less ${SUPERUSER_RESERVE} kept for the superuser).`;
}
