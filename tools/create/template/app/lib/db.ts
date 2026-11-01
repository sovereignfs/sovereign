import { Pool } from 'pg';
import { required } from './config';

let pool: Pool | undefined;

/** How many connections the pool may hold: what the instance gives it, whose limit for the app's role is set from the same number, or 10. */
function poolMax(): number {
  const given = Number(process.env.__PREFIX___POSTGRES_POOL_MAX);
  return Number.isInteger(given) && given >= 2 ? given : 10;
}

/** The app's own database, as its own role. One pool for the process, made when it is first used so that building needs none. */
export function db(): Pool {
  pool ??= new Pool({ connectionString: required('__PREFIX___POSTGRES_URL'), max: poolMax() });
  return pool;
}
