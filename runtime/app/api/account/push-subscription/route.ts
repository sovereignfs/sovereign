import { NextResponse } from 'next/server';
import {
  deleteUserPushSubscriptions,
  hasPushSubscription,
  savePushSubscription,
} from '@sovereignfs/db';
import { randomUUID } from 'node:crypto';
import { getPlatformDb } from '@/src/db';
import { pushEnabled } from '@/src/push';

/**
 * GET /api/account/push-subscription
 * Returns whether the platform has push configured and if this user has a
 * subscription. Used by the Account UI to show the correct state.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enabled = pushEnabled();
  if (!enabled) {
    return NextResponse.json({ pushEnabled: false, subscribed: false, publicKey: null });
  }

  const pdb = await getPlatformDb();
  const subscribed = await hasPushSubscription(pdb, userId);
  return NextResponse.json({
    pushEnabled: true,
    subscribed,
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  });
}

/**
 * POST /api/account/push-subscription
 * Body: { endpoint, keys: { p256dh, auth } }
 * Saves (or replaces) the push subscription for this user+endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (!pushEnabled()) {
    return NextResponse.json({ error: 'push not configured' }, { status: 503 });
  }

  const body = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: 'endpoint, keys.p256dh and keys.auth are required' },
      { status: 400 },
    );
  }

  const pdb = await getPlatformDb();
  await savePushSubscription(pdb, { id: randomUUID(), userId, endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/account/push-subscription
 * Removes all push subscriptions for this user (opt-out on all devices).
 */
export async function DELETE(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  await deleteUserPushSubscriptions(pdb, userId);
  return NextResponse.json({ ok: true });
}
