import { Pool } from 'pg';
import { required } from './config';

let pool: Pool | undefined;

/** The app's own database, as its own role. One pool for the process, made when it is first used so that building needs none. */
export function db(): Pool {
  pool ??= new Pool({ connectionString: required('__PREFIX___POSTGRES_URL'), max: 10 });
  return pool;
}
