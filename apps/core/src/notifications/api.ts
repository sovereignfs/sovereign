import { ApiError, invalidRequest, jsonResponse } from '../api/errors';
import { countCall } from '../api/rate-limit';
import { authenticate, authenticateApp, type AppPrincipal, type Principal } from '../api/token';
import { getDatabase } from '../database';
import { DIRECTORY_LIMITS, getTokenDeps } from '../directory/service';
import { NotificationError, type NotificationItem } from './service';

/** What a person's token needs to manage the notifications of the app it was issued to (core-app §4.1). */
export const READ_SCOPE = 'notifications';
/** What an app's own token needs to send one. */
export const SEND_SCOPE = 'notifications:send';

/**
 * The check every notification call makes first (core-app §4.1, §3.9): sending asks for an app's own token with `notifications:send`;
 * everything else asks for a person's token with `notifications`, and is counted against the app and the person like the Directory.
 * A call with a bad token is never counted. Sending is counted by the service, per app and per recipient.
 */
export async function notificationsGuard(request: Request, kind: 'send'): Promise<AppPrincipal>;
export async function notificationsGuard(request: Request, kind: 'read'): Promise<Principal>;
export async function notificationsGuard(
  request: Request,
  kind: 'send' | 'read',
): Promise<AppPrincipal | Principal> {
  const deps = await getTokenDeps();
  if (kind === 'send') return authenticateApp(deps, request, SEND_SCOPE);
  const principal = await authenticate(deps, request, READ_SCOPE);
  const database = await getDatabase();
  for (const [key, limit] of [
    [`api:notifications:client:${principal.clientId}`, DIRECTORY_LIMITS.perClient],
    [`api:notifications:account:${principal.userId}`, DIRECTORY_LIMITS.perAccount],
  ] as const) {
    const counted = await countCall(database, key, limit, DIRECTORY_LIMITS.windowMs);
    if (!counted.allowed) {
      throw new ApiError(429, 'rate_limited', 'Too many calls. Wait, then try again.', {
        'retry-after': String(counted.retryAfter),
      });
    }
  }
  return principal;
}

/** A notification as the contract has it (`Notification`): times as date-times. */
export function notificationJson(item: NotificationItem) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    url: item.url,
    category: item.category,
    createdAt: new Date(item.createdAt).toISOString(),
    readAt: item.readAt === null ? null : new Date(item.readAt).toISOString(),
    expiresAt: new Date(item.expiresAt).toISOString(),
  };
}

/** A refusal of the service as the Core API answers it: what cannot be used is a 400 that says so, too many is a 429. */
export function apiErrorOf(error: unknown): unknown {
  if (!(error instanceof NotificationError)) return error;
  if (error.code === 'rate-limited') {
    return new ApiError(429, 'rate_limited', 'Too many notifications. Wait, then try again.', {
      'retry-after': String(error.retryAfter ?? 60),
    });
  }
  return invalidRequest(
    error.problems.length > 0
      ? error.problems.map((problem) => `${problem.field} ${problem.message}`).join('; ')
      : error.message,
  );
}

export { bodyOf } from '../api/body';

export { jsonResponse };
