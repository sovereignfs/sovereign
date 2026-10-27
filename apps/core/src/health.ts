import { getDatabase } from './database';

export type HealthReport = {
  status: 'ok' | 'error';
  app: 'up';
  database: 'up' | 'down';
};

/**
 * What the health endpoint says: whether core and its database are up, and nothing
 * else - no versions, paths, hostnames, settings or error messages. A database that is
 * not answering turns the status to `error`.
 */
export async function healthReport(): Promise<HealthReport> {
  let database: HealthReport['database'];
  try {
    await (await getDatabase()).ping(3000);
    database = 'up';
  } catch {
    database = 'down';
  }
  return { status: database === 'down' ? 'error' : 'ok', app: 'up', database };
}
