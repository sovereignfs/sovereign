import { jsonResponse } from '../../../../../src/api/errors';
import { answer } from '../../../../../src/directory/service';
import { getNotificationService } from '../../../../../src/notifications';
import { notificationsGuard } from '../../../../../src/notifications/api';

export const dynamic = 'force-dynamic';

/** `dismissAllNotifications` in the Core API contract (core-app §4.1): all of the calling app's notifications for the signed-in person. */
export async function POST(request: Request): Promise<Response> {
  return answer(async () => {
    const principal = await notificationsGuard(request, 'read');
    const count = await (
      await getNotificationService()
    ).dismissAll(principal.userId, principal.clientId);
    return jsonResponse({ count });
  });
}
