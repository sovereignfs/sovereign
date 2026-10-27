export type HealthReport = {
  status: 'ok';
  app: 'up';
  database: 'not-configured';
};

/**
 * What the health endpoint says: whether core and its database are up, and nothing
 * else - no versions, paths, hostnames or settings.
 *
 * There is no database layer yet, so the database is reported as not configured. The
 * database package replaces that with a real check and a 503 when it is down.
 */
export function healthReport(): HealthReport {
  return { status: 'ok', app: 'up', database: 'not-configured' };
}
