import { NextResponse } from 'next/server';
import { getPlatformSetting, sendNotification, setPlatformSetting } from '@sovereignfs/db';
import { randomUUID } from 'node:crypto';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/** Minimum seconds between admin broadcasts (rate-limit guard). */
const BROADCAST_COOLDOWN_SECS = 60;

/**
 * POST /api/admin/broadcast — send a notification to all users.
 *
 * Rate-limited to once per 60 seconds. Requires the admin API key.
 * Body: `{ recipientUserIds: string[], title: string, body?: string, url?: string, category?: string }`
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    recipientUserIds: string[];
    title: string;
    body?: string;
    url?: string;
    category?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!Array.isArray(body.recipientUserIds) || body.recipientUserIds.length === 0) {
    return NextResponse.json(
      { error: 'recipientUserIds must be a non-empty array' },
      { status: 400 },
    );
  }
  if (body.recipientUserIds.length > 1000) {
    return NextResponse.json(
      { error: 'recipientUserIds may not exceed 1000 per broadcast' },
      { status: 400 },
    );
  }

  const pdb = await getPlatformDb();

  // Rate-limit check.
  const lastBroadcast = await getPlatformSetting(pdb, 'last_broadcast_at');
  if (lastBroadcast) {
    const elapsed = Math.floor(Date.now() / 1000) - Number(lastBroadcast);
    if (elapsed < BROADCAST_COOLDOWN_SECS) {
      return NextResponse.json(
        { error: `rate limited — next broadcast allowed in ${BROADCAST_COOLDOWN_SECS - elapsed}s` },
        { status: 429 },
      );
    }
  }

  await setPlatformSetting(pdb, 'last_broadcast_at', String(Math.floor(Date.now() / 1000)));

  // Send one notification per recipient. Fire-and-forget style — we don't wait
  // for every insert to finish before responding, but we do await the batch.
  await Promise.all(
    body.recipientUserIds.map((userId) =>
      sendNotification(pdb, {
        id: randomUUID(),
        recipientUserId: userId,
        source: 'admin',
        sourceType: 'admin',
        title: body.title,
        body: body.body,
        url: body.url,
        category: body.category ?? 'announcement',
      }),
    ),
  );

  return NextResponse.json({ ok: true, sent: body.recipientUserIds.length });
}
