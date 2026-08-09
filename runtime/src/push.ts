/**
 * Push fan-out helper. Two independent delivery channels, both feeding the
 * same `Promise.allSettled` batch so one channel's failure can never affect
 * the other's delivery (RFC 0087, workstream 0005 leg 3's own gate):
 *
 * - **Web Push** (RFC 0016) — VAPID-signed, sent directly to the browser's
 *   push service. Silently no-ops when VAPID keys are absent so deployments
 *   without push configured still work — the in-app bell is the fallback.
 *   Stale subscriptions (HTTP 410/404) are pruned automatically.
 * - **Native mobile push** (RFC 0087) — end-to-end encrypted
 *   (`./push-encryption.ts`) and forwarded through `apps/relay`, which never
 *   sees plaintext. Silently no-ops per-device when the relay enrollment or
 *   send fails; a relay-reported invalid device token is pruned the same
 *   way a dead Web Push subscription is.
 */
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import {
  deletePushDeviceTokenByToken,
  deletePushSubscription,
  getNotificationPrefs,
  getPushDeviceTokensForUser,
  getPushSubscriptionsByUsers,
  getPushSubscriptionsForUser,
  recordPushDelivery,
  touchPushDeviceToken,
  type PushDeliveryStatus,
  type PushDeviceTokenRow,
} from '@sovereignfs/db';
import { logActivity } from './activity';
import { getPlatformDb } from './db';
import { logger } from './logger';
import { encryptPushPayload } from './push-encryption';
import { getInstanceKey } from './relay';

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

  // Skip if the user muted this category — applies to every channel equally,
  // checked once before any channel-specific logic (VAPID configuration,
  // below, is a Web Push-only concern and must not gate native delivery).
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

  const resolved = resolvePayload(payload);
  const sendPromises: Promise<'sent' | 'pruned' | 'failed'>[] = [];
  const pushServices = new Set<string>();

  // Web Push branch (RFC 0016) — unchanged in substance from before this
  // native branch existed, just no longer an early return for the whole
  // function (see the module doc comment above `fanOutPushToUser`).
  if (!pushEnabled()) {
    logger.info('push: skipped — VAPID keys not configured', { userId });
    await recordDelivery(pdb, {
      userId,
      status: 'skipped',
      errorCode: 'VAPID_NOT_CONFIGURED',
      category: payload.category ?? null,
      source: payload.source ?? null,
    });
  } else {
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
    } else {
      applyVapid();
      for (const sub of subs) pushServices.add(safeHost(sub.endpoint));
      sendPromises.push(
        ...subs.map((sub) =>
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
    }
  }

  // Native mobile push branch (RFC 0087, workstream 0005 leg 3) — silent
  // when the user has no registered device (the overwhelmingly common case;
  // unlike the Web Push "no subscriptions" case above, this is not worth a
  // push_delivery_log row for every user on every notification).
  const deviceTokens = await getPushDeviceTokensForUser(pdb, userId);
  if (deviceTokens.length > 0) {
    for (const token of deviceTokens) pushServices.add(safeHost(token.relayUrl));
    sendPromises.push(
      ...deviceTokens.map((token) =>
        sendOneNative(pdb, token, resolved, payload.category, payload.source),
      ),
    );
  }

  const results = await Promise.allSettled(sendPromises);
  logger.info('push: fan-out complete', {
    userId,
    devices: sendPromises.length,
    delivered: results.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length,
    pushServices: [...pushServices],
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

interface RelayPushResponse {
  result?: 'sent' | 'invalid_token' | 'failed';
}

/**
 * Deliver one notification to one registered native device via its stored
 * relay (RFC 0087). `token.relayUrl` is the relay this specific device
 * registered against — read from the row, never re-resolved from current
 * config (see `packages/db`'s device-token schema comment: a relay-URL
 * change must not silently break already-registered devices).
 */
async function sendOneNative(
  pdb: Awaited<ReturnType<typeof getPlatformDb>>,
  token: PushDeviceTokenRow,
  payload: Omit<PushPayload, 'source'>,
  category?: string,
  source?: string,
): Promise<'sent' | 'pruned' | 'failed'> {
  const pushService = safeHost(token.relayUrl);

  const instanceKey = await getInstanceKey(pdb, token.relayUrl);
  if (!instanceKey) {
    await recordDelivery(pdb, {
      userId: token.userId,
      status: 'failed',
      errorCode: 'RELAY_ENROLLMENT_FAILED',
      category: category ?? null,
      source: source ?? null,
      pushService,
    });
    return 'failed';
  }

  let encryptedPayload: string;
  try {
    encryptedPayload = encryptPushPayload(token.publicKey, payload);
  } catch (err) {
    logger.warn('push: failed to encrypt native payload', {
      pushService,
      err: err instanceof Error ? err.message : String(err),
    });
    await recordDelivery(pdb, {
      userId: token.userId,
      status: 'failed',
      errorCode: 'ENCRYPTION_FAILED',
      category: category ?? null,
      source: source ?? null,
      pushService,
    });
    return 'failed';
  }

  try {
    const res = await fetch(`${token.relayUrl}/v1/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceToken: token.deviceToken,
        platform: token.platform,
        encryptedPayload,
        instanceKey,
      }),
    });

    if (!res.ok) {
      logger.warn('push: relay request failed', { statusCode: res.status, pushService });
      await recordDelivery(pdb, {
        userId: token.userId,
        status: 'failed',
        errorCode: String(res.status),
        category: category ?? null,
        source: source ?? null,
        pushService,
      });
      return 'failed';
    }

    const body = (await res.json()) as RelayPushResponse;

    if (body.result === 'invalid_token') {
      await deletePushDeviceTokenByToken(pdb, token.deviceToken).catch(() => undefined);
      logger.info('push: pruned dead native device token', { pushService });
      await recordDelivery(pdb, {
        userId: token.userId,
        status: 'pruned',
        errorCode: 'invalid_token',
        category: category ?? null,
        source: source ?? null,
        pushService,
      });
      return 'pruned';
    }

    if (body.result === 'sent') {
      await touchPushDeviceToken(pdb, token.id).catch(() => undefined);
      await recordDelivery(pdb, {
        userId: token.userId,
        status: 'sent',
        category: category ?? null,
        source: source ?? null,
        pushService,
      });
      return 'sent';
    }

    logger.warn('push: relay reported a failed native send', { pushService });
    await recordDelivery(pdb, {
      userId: token.userId,
      status: 'failed',
      errorCode: body.result ?? 'unknown_result',
      category: category ?? null,
      source: source ?? null,
      pushService,
    });
    return 'failed';
  } catch (err) {
    logger.warn('push: relay request errored', {
      pushService,
      err: err instanceof Error ? err.message : String(err),
    });
    await recordDelivery(pdb, {
      userId: token.userId,
      status: 'failed',
      errorCode: errorMessage(err),
      category: category ?? null,
      source: source ?? null,
      pushService,
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
