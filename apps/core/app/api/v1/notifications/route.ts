import { invalidRequest, jsonResponse } from '../../../../src/api/errors';
import { answer } from '../../../../src/directory/service';
import { getNotificationService } from '../../../../src/notifications';
import type { SendInput } from '../../../../src/notifications/service';
import {
  apiErrorOf,
  bodyOf,
  notificationJson,
  notificationsGuard,
} from '../../../../src/notifications/api';

export const dynamic = 'force-dynamic';

const FIELDS = ['to', 'title', 'body', 'url', 'category', 'expiresAt', 'key'] as const;

/**
 * Tells a person something (`sendNotification` in the Core API contract, core-app §4.1). Made with an app's own token. The answer
 * is `202` with an id whether or not the person may receive it, so it says nothing of the person.
 */
export async function POST(request: Request): Promise<Response> {
  return answer(async () => {
    const app = await notificationsGuard(request, 'send');
    const body = await bodyOf(request, FIELDS);
    try {
      const sent = await (await getNotificationService()).send(app.clientId, body as SendInput);
      return Response.json(sent, {
        status: 202,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    } catch (error) {
      throw apiErrorOf(error);
    }
  });
}

/** The calling app's own notifications for the signed-in person (`listNotifications`), newest first. */
export async function GET(request: Request): Promise<Response> {
  return answer(async () => {
    const principal = await notificationsGuard(request, 'read');
    const params = new URL(request.url).searchParams;
    const unread = params.get('unread');
    if (unread !== null && unread !== 'true' && unread !== 'false')
      throw invalidRequest('unread is true or false.');
    const limitText = params.get('limit');
    const limit = limitText === null ? undefined : Number(limitText);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw invalidRequest('limit is a whole number from 1 to 100.');
    }
    const items = await (
      await getNotificationService()
    ).list(principal.userId, {
      clientId: principal.clientId,
      unreadOnly: unread === 'true',
      ...(limit === undefined ? {} : { limit }),
    });
    return jsonResponse({ notifications: items.map(notificationJson) });
  });
}
