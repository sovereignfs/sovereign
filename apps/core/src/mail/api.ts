import { ApiError, invalidRequest } from '../api/errors';
import { authenticateApp, type AppPrincipal } from '../api/token';
import { getTokenDeps } from '../directory/service';
import { AppMailError } from './apps';
import { getMailForAppsService } from './index';

/** What an app's own token needs to email a person (core-app §4.2). */
export const EMAIL_SCOPE = 'email:send';

/**
 * The check the email call makes first (core-app §4.2, §3.9): an app's own token with `email:send`, and then whether this instance
 * can send mail at all. Without mail the operation is not there, which is a `404` after the token is accepted (so a caller with no
 * right to ask is told nothing about the instance's mail). Sends are counted by the service, per app and per recipient.
 */
export async function emailGuard(request: Request): Promise<AppPrincipal> {
  const app = await authenticateApp(await getTokenDeps(), request, EMAIL_SCOPE);
  if (!(await (await getMailForAppsService()).available())) {
    throw new ApiError(404, 'not_found', 'This instance does not send email for apps.');
  }
  return app;
}

/** A refusal of the service as the Core API answers it: what cannot be used is a 400 that says so, too many is a 429. */
export function apiErrorOf(error: unknown): unknown {
  if (!(error instanceof AppMailError)) return error;
  if (error.code === 'unavailable') {
    return new ApiError(404, 'not_found', error.message);
  }
  if (error.code === 'rate-limited') {
    return new ApiError(429, 'rate_limited', 'Too many emails. Wait, then try again.', {
      'retry-after': String(error.retryAfter ?? 60),
    });
  }
  return invalidRequest(
    error.problems.length > 0
      ? error.problems.map((problem) => `${problem.field} ${problem.message}`).join('; ')
      : error.message,
  );
}
