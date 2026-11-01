import type { Host } from './host.js';
import { psql } from './docker.js';

/** What the database server's connections are, as `sv status` and `sv doctor` show them (operator-cli §6.4.4). */
export type Connections = {
  /** The server's `max_connections`. */
  max: number;
  /** What PostgreSQL keeps for the superuser, which `sv apply` and backups connect as. */
  reserved: number;
  /** Open now, not counting the question that counted them. */
  total: number;
  /** The roles that have a limit, which are the ones `sv apply` made, and what each holds. */
  roles: { role: string; used: number; limit: number }[];
};

/**
 * One question to the database server, asked as the superuser inside its container, so no password is used or leaves the server. The
 * roles listed are those with a limit: core's and each app's. The superuser has none and is in the total.
 */
export const CONNECTIONS_SQL = `SELECT json_build_object(
  'max', current_setting('max_connections')::int,
  'reserved', current_setting('superuser_reserved_connections')::int,
  'total', (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()),
  'roles', COALESCE((
    SELECT json_agg(json_build_object('role', r.rolname, 'used', COALESCE(c.n, 0)::int, 'limit', r.rolconnlimit) ORDER BY r.rolname)
    FROM pg_roles r
    LEFT JOIN (
      SELECT usename, count(*) AS n FROM pg_stat_activity
      WHERE backend_type = 'client backend' AND pid <> pg_backend_pid() GROUP BY usename
    ) c ON c.usename = r.rolname
    WHERE r.rolconnlimit >= 0
  ), '[]'::json)
);`;

/** The connections now, or nothing when the database server cannot be asked (not running, or not there yet). */
export async function readConnections(host: Host): Promise<Connections | null> {
  try {
    const found = JSON.parse(
      await psql(host, 'Counting the connections', CONNECTIONS_SQL),
    ) as Connections;
    return typeof found.max === 'number' && Array.isArray(found.roles) ? found : null;
  } catch {
    return null;
  }
}
