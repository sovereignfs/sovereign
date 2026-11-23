import type { Database } from '@sovereignfs/database';
import { ApiError } from '../api/errors';
import { countCall } from '../api/rate-limit';
import { authenticate, type Principal } from '../api/token';
import { getDatabase } from '../database';
import { getTokenDeps } from '../directory/service';
import { can, type Matrix } from '../roles/capabilities';
import type { LauncherApp } from './launcher';

/**
 * The Core API's list of the apps a person can open (`listMyApps`, core-app §3.8): the launcher's own list, for an app's header.
 * Any of the person's tokens will do: it asks for `openid`, which every one carries, and no scope of its own, since the launcher
 * shows every signed-in person every listed app and is not access control.
 */
export const APPS_SCOPE = 'openid';

/** An app's header asks when it opens, and keeps the answer on the device: a few calls a minute is plenty. */
const LIMITS = { perClient: 600, perAccount: 60, windowMs: 60_000 };

/** The check the call makes first: a person's good token, then the call counted for the app and the person. */
export async function appsGuard(request: Request): Promise<Principal> {
  const principal = await authenticate(await getTokenDeps(), request, APPS_SCOPE);
  const database = await getDatabase();
  for (const [key, limit] of [
    [`api:apps:client:${principal.clientId}`, LIMITS.perClient],
    [`api:apps:account:${principal.userId}`, LIMITS.perAccount],
  ] as const) {
    const counted = await countCall(database, key, limit, LIMITS.windowMs);
    if (!counted.allowed) {
      throw new ApiError(429, 'rate_limited', 'Too many calls. Wait, then try again.', {
        'retry-after': String(counted.retryAfter),
      });
    }
  }
  return principal;
}

/** The contract's tile: every field present, `null` for what an app has not set. */
export type ApiLauncherApp = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  launchUrl: string;
};

/**
 * The apps for the person the token is for: the launcher's list when their role may use the launcher in the matrix in force,
 * and nothing otherwise. The role is read from the account, never from the request.
 */
export async function myApps(
  database: Pick<Database, 'run'>,
  userId: string,
  matrix: Matrix,
  list: () => Promise<LauncherApp[]>,
): Promise<{ apps: ApiLauncherApp[] }> {
  const role = (await database.run('select role from users where id = ?', [userId])).rows[0]?.role;
  if (!can(role, 'launcher:access', matrix)) return { apps: [] };
  return {
    apps: (await list()).map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description ?? null,
      icon: app.icon ?? null,
      launchUrl: app.launchUrl,
    })),
  };
}
