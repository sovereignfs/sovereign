import { ApiError, jsonResponse } from '../../../../../../src/api/errors';
import { answer } from '../../../../../../src/directory/service';
import { getNotificationService } from '../../../../../../src/notifications';
import { notificationJson, notificationsGuard } from '../../../../../../src/notifications/api';

export const dynamic = 'force-dynamic';

/** `markNotificationRead` in the Core API contract (core-app §4.1): one of the calling app's own notifications for the signed-in person. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return answer(async () => {
    const principal = await notificationsGuard(request, 'read');
    const { id } = await context.params;
    const item = await (
      await getNotificationService()
    ).markRead(principal.userId, id, principal.clientId);
    if (!item) throw new ApiError(404, 'not_found', 'There is no such notification.');
    return jsonResponse(notificationJson(item));
  });
}
