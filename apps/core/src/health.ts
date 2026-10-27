import { getDatabase } from './database';

export type HealthReport = {
  status: 'ok' | 'error';
  app: 'up';
  database: 'not-configured' | 'up' | 'down';
};

/**
 * What the health endpoint says: whether core and its database are up, and nothing
 * else - no versions, paths, hostnames, settings or error messages. A database that is
 * configured and not answering turns the status to `error`; one that is not configured
 * does not.
 */
export async function healthReport(): Promise<HealthReport> {
  let database: HealthReport['database'];
  try {
    const db = await getDatabase();
    if (db === undefined) database = 'not-configured';
    else {
      await db.ping(3000);
      database = 'up';
    }
  } catch {
    database = 'down';
  }
  return { status: database === 'down' ? 'error' : 'ok', app: 'up', database };
}
