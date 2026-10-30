import { ApiError, invalidRequest } from '../api/errors';
import { authenticateApp, type AppPrincipal } from '../api/token';
import { getTokenDeps } from '../directory/service';
import { ActivityError } from './service';

/** What an app's own token needs to record something about a person (core-app §4.3). */
export const ACTIVITY_SCOPE = 'activity:write';

/**
 * The check the activity call makes first (core-app §4.3, §3.9): an app's own token with `activity:write`. Records are counted by
 * the service, per app and per person.
 */
export async function activityGuard(request: Request): Promise<AppPrincipal> {
  return authenticateApp(await getTokenDeps(), request, ACTIVITY_SCOPE);
}

/** A refusal of the service as the Core API answers it: what cannot be used is a 400 that says so, too many is a 429. */
export function apiErrorOf(error: unknown): unknown {
  if (!(error instanceof ActivityError)) return error;
  if (error.code === 'rate-limited') {
    return new ApiError(429, 'rate_limited', 'Too many records. Wait, then try again.', {
      'retry-after': String(error.retryAfter ?? 60),
    });
  }
  return invalidRequest(
    error.problems.length > 0
      ? error.problems.map((problem) => `${problem.field} ${problem.message}`).join('; ')
      : error.message,
  );
}
