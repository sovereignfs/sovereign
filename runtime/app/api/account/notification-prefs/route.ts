import { NextResponse } from 'next/server';
import { getNotificationPrefs, setNotificationPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** GET /api/account/notification-prefs — return user's notification preferences. */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const prefs = await getNotificationPrefs(pdb, userId);
  return NextResponse.json({ prefs });
}

/** PATCH /api/account/notification-prefs — update user's notification preferences. */
export async function PATCH(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as {
    mutedCategories?: string[];
    pollIntervalSecs?: number;
  };

  const pdb = await getPlatformDb();
  const updated = await setNotificationPrefs(pdb, userId, {
    mutedCategories: body.mutedCategories,
    pollIntervalSecs: body.pollIntervalSecs,
  });
  return NextResponse.json({ prefs: updated });
}
