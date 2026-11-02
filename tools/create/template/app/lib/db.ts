import { Pool } from 'pg';
import { required, setting } from './config';

let pool: Pool | undefined;
let direct: Pool | undefined;

/** What of the pool goes to `directDb()`: a lock held across a call needs a connection of its own, and it counts against the same limit. */
const DIRECT_MAX = 2;

/** How many connections the app may hold in all: what the instance gives it, whose limit for the app's database role is set from the same number, or 10. */
function poolMax(): number {
  const given = Number(process.env.__PREFIX___POSTGRES_POOL_MAX);
  return Number.isInteger(given) && given >= 2 ? given : 10;
}

/**
 * The app's own database, as its own role, for everything that is safe when each statement may run on a different server connection: this
 * is the address an instance may put behind a transaction pooler (`database.pooling` in the manifest). One pool for the process, made when
 * it is first used so that building needs none.
 */
export function db(): Pool {
  pool ??= new Pool({
    connectionString: required('__PREFIX___POSTGRES_URL'),
    max: Math.max(poolMax() - DIRECT_MAX, 2),
  });
  return pool;
}

/**
 * The same database on the server itself, never through a pooler, for what needs one connection throughout: the advisory locks of the
 * migrations and of the token refresh. An instance made before the direct address existed does not give it, and has no pooler, so the
 * pooled address is the server and is used instead.
 */
export function directDb(): Pool {
  direct ??= new Pool({
    connectionString:
      setting('__PREFIX___POSTGRES_DIRECT_URL') ?? required('__PREFIX___POSTGRES_URL'),
    max: DIRECT_MAX,
  });
  return direct;
}
