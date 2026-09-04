import { NextResponse } from 'next/server';
import { getNotificationPrefs, setNotificationPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getBroker } from '@/src/notification-broker';

/**
 * GET /api/account/notification-prefs — return user's notification preferences.
 *
 * Also reports `pollingActive`: whether the server is actually delivering
 * notifications by polling right now (broker unset — covers the explicit
 * `NOTIFICATION_TRANSPORT=polling` case and sse/redis init falling back to
 * it). `pollIntervalSecs` only has an effect when this is true.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const prefs = await getNotificationPrefs(pdb, userId);
  return NextResponse.json({ prefs, pollingActive: getBroker() === null });
}

/** PATCH /api/account/notification-prefs — update user's notification preferences. */
export async function PATCH(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as {
    mutedCategories?: string[];
    pollIntervalSecs?: number;
    communicationEmail?: boolean;
  };

  const pdb = await getPlatformDb();
  const updated = await setNotificationPrefs(pdb, userId, {
    mutedCategories: body.mutedCategories,
    pollIntervalSecs: body.pollIntervalSecs,
    communicationEmail: body.communicationEmail,
  });
  return NextResponse.json({ prefs: updated });
}
