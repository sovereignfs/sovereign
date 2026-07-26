/**
 * Web Push fan-out helper (RFC 0016).
 *
 * Sends a VAPID-signed push notification to every subscribed device for a
 * given user. Silently no-ops when VAPID keys are absent so deployments
 * without push configured still work — the in-app bell is the fallback.
 *
 * Stale subscriptions (HTTP 410 Gone) are pruned automatically.
 */
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import {
  deletePushSubscription,
  getNotificationPrefs,
  getPushSubscriptionsByUsers,
  getPushSubscriptionsForUser,
  recordPushDelivery,
  type PushDeliveryStatus,
} from '@sovereignfs/db';
import { logActivity } from './activity';
import { getPlatformDb } from './db';
import { logger } from './logger';

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  category?: string;
  /** URL to an image, shown as the OS push notification's icon. Defaults to
   *  the sending plugin's own `/plugin-icons/<source>.svg` (see `source`
   *  below) when unset. */
  icon?: string;
  /**
   * The sending plugin's id — used only server-side to compute `icon`'s
   * default; never included in the payload actually delivered to the
   * device (see `resolvePayload`). Omit for non-plugin sources (admin
   * broadcasts have no per-plugin icon to fall back to).
   */
  source?: string;
}

/** Resolves the wire payload actually sent to the push service: defaults
 *  `icon` to the sending plugin's own icon when unset, and strips the
 *  server-only `source` field (the Push API has no use for it). */
function resolvePayload(payload: PushPayload): Omit<PushPayload, 'source'> {
  const { source, icon, ...rest } = payload;
  return { ...rest, icon: icon ?? (source ? `/plugin-icons/${source}.svg` : undefined) };
}

/** True when VAPID keys are present in the environment. */
export function pushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Warn about an APNs-incompatible VAPID subject only once per process. */
let warnedSubject = false;

/** @internal test-only reset. */
export function resetSubjectWarning(): void {
  warnedSubject = false;
}

function applyVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY ?? '';
  const priv = process.env.VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.VAPID_CONTACT ?? 'mailto:admin@localhost';
  // Apple's push service (web.push.apple.com — every iOS/Safari subscription)
  // validates the VAPID JWT `sub` claim and rejects localhost/invalid subjects
  // with 403 BadJwtToken. Chrome's FCM accepts nearly anything, so a bad
  // subject looks like "push works everywhere except iOS". Warn loudly instead
  // of failing: non-Apple endpoints still deliver, and self-hosters without
  // iOS devices shouldn't be forced to configure a contact.
  if (!warnedSubject && (!process.env.VAPID_CONTACT || subject.includes('localhost'))) {
    warnedSubject = true;
    logger.warn(
      'push: VAPID_CONTACT is unset or points at localhost — Apple Push (iOS/Safari) rejects ' +
        'such subjects with 403, so pushes to iOS devices will silently fail. Set ' +
        'VAPID_CONTACT to a real mailto: address you monitor.',
      { subject },
    );
  }
  webpush.setVapidDetails(subject, pub, priv);
}

/**
 * Send a push notification to all subscribed devices for one user.
 * Respects the user's muted-category preference.
 */
export async function fanOutPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // Every early exit below logs at info level and records a push_delivery_log
  // row (+ activity log entry). Push delivery is fire-and-forget with no
  // user-visible error surface, so when someone asks "why did no push
  // arrive?" the answer must be reconstructable from Account/Console
  // Activities or LOG_LEVEL=info logs alone — a silent return here is
  // indistinguishable from a delivery failure.
  const pdb = await getPlatformDb();

  if (!pushEnabled()) {
    logger.info('push: skipped — VAPID keys not configured', { userId });
    await recordDelivery(pdb, {
      userId,
      status: 'skipped',
      errorCode: 'VAPID_NOT_CONFIGURED',
      category: payload.category ?? null,
      source: payload.source ?? null,
    });
    return;
  }

  // Skip if the user muted this category.
  const prefs = await getNotificationPrefs(pdb, userId);
  if (payload.category && prefs.mutedCategories.includes(payload.category)) {
    logger.info('push: skipped — category muted by user', {
      userId,
      category: payload.category,
    });
    await recordDelivery(pdb, {
      userId,
      status: 'skipped',
      errorCode: 'CATEGORY_MUTED',
      category: payload.category,
      source: payload.source ?? null,
    });
    return;
  }

  const subs = await getPushSubscriptionsForUser(pdb, userId);
  if (subs.length === 0) {
    logger.info('push: skipped — user has no push subscriptions (no device ever enabled push)', {
      userId,
    });
    await recordDelivery(pdb, {
      userId,
      status: 'skipped',
      errorCode: 'NO_SUBSCRIPTIONS',
      category: payload.category ?? null,
      source: payload.source ?? null,
    });
    return;
  }

  applyVapid();
  const resolved = resolvePayload(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendOne(
        pdb,
        sub.userId,
        sub.endpoint,
        { p256dh: sub.p256dh, auth: sub.auth },
        resolved,
        payload.category,
        payload.source,
      ),
    ),
  );
  logger.info('push: fan-out complete', {
    userId,
    devices: subs.length,
    delivered: results.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length,
    pushServices: [...new Set(subs.map((s) => safeHost(s.endpoint)))],
  });
}

/**
 * Broadcast push to multiple users at once (used by the admin broadcast route).
 * Does NOT respect per-user category prefs — broadcast is always delivered.
 */
export async function fanOutPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled() || userIds.length === 0) {
    logger.info('push: broadcast skipped — VAPID keys not configured or empty audience', {
      recipients: userIds.length,
    });
    return;
  }

  const pdb = await getPlatformDb();
  const subs = await getPushSubscriptionsByUsers(pdb, userIds);
  if (subs.length === 0) {
    logger.info('push: broadcast skipped — no subscribed devices in audience', {
      recipients: userIds.length,
    });
    return;
  }

  applyVapid();
  const resolved = resolvePayload(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendOne(
        pdb,
        sub.userId,
        sub.endpoint,
        { p256dh: sub.p256dh, auth: sub.auth },
        resolved,
        payload.category,
        payload.source,
      ),
    ),
  );
  logger.info('push: broadcast fan-out complete', {
    recipients: userIds.length,
    devices: subs.length,
    delivered: results.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length,
  });
}

async function sendOne(
  pdb: Awaited<ReturnType<typeof getPlatformDb>>,
  userId: string,
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: Omit<PushPayload, 'source'>,
  category?: string,
  source?: string,
): Promise<'sent' | 'pruned' | 'failed'> {
  try {
    await webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload));
    await recordDelivery(pdb, {
      userId,
      status: 'sent',
      category: category ?? null,
      source: source ?? null,
      pushService: safeHost(endpoint),
    });
    return 'sent';
  } catch (err: unknown) {
    // Prune a subscription the push service reports as gone (device
    // unregistered). 410 is the spec status; some services return 404 for the
    // same condition (RFC 0016 names both). Logged at info (not warn): pruning
    // is routine hygiene, but an operator tracing a missing push needs to see
    // that the device's subscription just ceased to exist.
    if (isWebPushError(err) && (err.statusCode === 410 || err.statusCode === 404)) {
      await deletePushSubscription(pdb, endpoint).catch(() => undefined);
      logger.info('push: pruned dead subscription', {
        statusCode: err.statusCode,
        pushService: safeHost(endpoint),
      });
      await recordDelivery(pdb, {
        userId,
        status: 'pruned',
        errorCode: String(err.statusCode),
        category: category ?? null,
        source: source ?? null,
        pushService: safeHost(endpoint),
      });
      return 'pruned';
    }
    // Anything else is a real delivery failure (403 bad VAPID JWT, 401, 413
    // payload too large, network error…). These used to be swallowed
    // silently, which made "no push on iOS" undiagnosable — log the status
    // and the push-service host (never the full endpoint: the path segment
    // is a per-device capability URL).
    logger.warn('push: send failed', {
      statusCode: isWebPushError(err) ? err.statusCode : undefined,
      pushService: safeHost(endpoint),
      body: isWebPushError(err) ? err.body : undefined,
      err: err instanceof Error ? err.message : String(err),
    });
    await recordDelivery(pdb, {
      userId,
      status: 'failed',
      errorCode: isWebPushError(err) ? String(err.statusCode) : errorMessage(err),
      category: category ?? null,
      source: source ?? null,
      pushService: safeHost(endpoint),
    });
    return 'failed';
  }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 120);
}

function describeOutcome(status: PushDeliveryStatus, errorCode: string | null): string {
  switch (status) {
    case 'skipped':
      switch (errorCode) {
        case 'VAPID_NOT_CONFIGURED':
          return 'Push notification skipped — push is not configured on this instance';
        case 'CATEGORY_MUTED':
          return 'Push notification skipped — category muted';
        case 'NO_SUBSCRIPTIONS':
          return 'Push notification skipped — no device is subscribed to push';
        default:
          return 'Push notification skipped';
      }
    case 'pruned':
      return 'Push subscription removed — the device unsubscribed or the browser revoked it';
    case 'failed':
    default:
      return 'Push notification failed to deliver';
  }
}

/**
 * Records one push delivery outcome to `push_delivery_log` (RFC 0016, epic
 * task 4.6), and — for every non-`sent` outcome — mirrors it into the
 * activity log via `logActivity`, matching `logDeliveryOutcome` in
 * `./platform-email.ts`. This is what makes "why didn't I get a push?"
 * answerable from Account/Console Activities instead of only server logs.
 */
async function recordDelivery(
  pdb: Awaited<ReturnType<typeof getPlatformDb>>,
  input: {
    userId: string;
    status: PushDeliveryStatus;
    errorCode?: string | null;
    category?: string | null;
    source?: string | null;
    pushService?: string | null;
  },
): Promise<void> {
  await recordPushDelivery(pdb, { id: randomUUID(), ...input });
  if (input.status === 'sent') return;
  await logActivity({
    actorType: 'system',
    action: 'push.delivery_failed',
    subjectUserId: input.userId,
    visibility: 'user',
    summary: describeOutcome(input.status, input.errorCode ?? null),
    metadata: {
      status: input.status,
      errorCode: input.errorCode ?? null,
      category: input.category ?? null,
      pushService: input.pushService ?? null,
    },
  });
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid-endpoint';
  }
}

function isWebPushError(err: unknown): err is { statusCode: number; body?: string } {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}
