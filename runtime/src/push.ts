/**
 * Web Push fan-out helper (RFC 0016).
 *
 * Sends a VAPID-signed push notification to every subscribed device for a
 * given user. Silently no-ops when VAPID keys are absent so deployments
 * without push configured still work — the in-app bell is the fallback.
 *
 * Stale subscriptions (HTTP 410 Gone) are pruned automatically.
 */
import webpush from 'web-push';
import {
  deletePushSubscription,
  getNotificationPrefs,
  getPushSubscriptionsByUsers,
  getPushSubscriptionsForUser,
} from '@sovereignfs/db';
import { getPlatformDb } from './db';

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  category?: string;
  icon?: string;
}

/** True when VAPID keys are present in the environment. */
export function pushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function applyVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY ?? '';
  const priv = process.env.VAPID_PRIVATE_KEY ?? '';
  webpush.setVapidDetails(process.env.VAPID_CONTACT ?? 'mailto:admin@localhost', pub, priv);
}

/**
 * Send a push notification to all subscribed devices for one user.
 * Respects the user's muted-category preference.
 */
export async function fanOutPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushEnabled()) return;

  const pdb = await getPlatformDb();

  // Skip if the user muted this category.
  const prefs = await getNotificationPrefs(pdb, userId);
  if (payload.category && prefs.mutedCategories.includes(payload.category)) return;

  const subs = await getPushSubscriptionsForUser(pdb, userId);
  if (subs.length === 0) return;

  applyVapid();
  await Promise.allSettled(
    subs.map((sub) => sendOne(pdb, sub.endpoint, { p256dh: sub.p256dh, auth: sub.auth }, payload)),
  );
}

/**
 * Broadcast push to multiple users at once (used by the admin broadcast route).
 * Does NOT respect per-user category prefs — broadcast is always delivered.
 */
export async function fanOutPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled() || userIds.length === 0) return;

  const pdb = await getPlatformDb();
  const subs = await getPushSubscriptionsByUsers(pdb, userIds);
  if (subs.length === 0) return;

  applyVapid();
  await Promise.allSettled(
    subs.map((sub) => sendOne(pdb, sub.endpoint, { p256dh: sub.p256dh, auth: sub.auth }, payload)),
  );
}

async function sendOne(
  pdb: Awaited<ReturnType<typeof getPlatformDb>>,
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  try {
    await webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload));
  } catch (err: unknown) {
    // Prune subscription that the push service reports as gone (device unregistered).
    if (isWebPushError(err) && err.statusCode === 410) {
      await deletePushSubscription(pdb, endpoint).catch(() => undefined);
    }
  }
}

function isWebPushError(err: unknown): err is { statusCode: number } {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}
