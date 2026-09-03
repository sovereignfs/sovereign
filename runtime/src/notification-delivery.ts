import { randomUUID } from 'node:crypto';
import {
  dismissNotification,
  getNotificationPrefs,
  sendNotification,
  type PlatformDb,
  type SendNotificationInput,
} from '@sovereignfs/db';
import { getBroker } from './notification-broker';
import { fanOutPushToUser } from './push';

/**
 * Single funnel every notification send path goes through (plugin sends,
 * admin/broadcast sends, message-generated notifications) — implements the
 * mute-policy matrix RFC 0048 §6 describes in prose, replacing the old
 * inline insert+broker+push sequence that ignored mute prefs entirely (the
 * RFC's own Current State section calls this out: "the existing
 * implementation still writes inbox rows and unread counts for muted
 * categories").
 *
 * Policy (keyed on `sourceType`, since in the current model `security`/
 * `announcement` are only ever platform/admin-sourced and `info` is only
 * ever plugin-sourced — this is an interpretation of the RFC's prose, not
 * verbatim text; see workstream 0018 leg 1's plan file for the flag):
 *
 *   - `category === 'security'`         → always deliver (mute ignored)
 *   - muted && sourceType === 'plugin'  → drop entirely (no DB row at all)
 *   - muted && sourceType !== 'plugin'  → store silently (row exists, for
 *                                          audit, pre-marked read+dismissed
 *                                          — no unread count/toast/push)
 *   - not muted                          → deliver (insert + broker + push)
 */
export type NotificationDeliveryOutcome = 'delivered' | 'stored-silent' | 'dropped';

export interface DeliverNotificationResult {
  id: string | null;
  outcome: NotificationDeliveryOutcome;
}

/** Same shape as `SendNotificationInput`, but `id` is optional — `deliverNotification` generates one when omitted. */
export type DeliverNotificationInput = Omit<SendNotificationInput, 'id'> & { id?: string };

export async function deliverNotification(
  pdb: PlatformDb,
  input: DeliverNotificationInput,
): Promise<DeliverNotificationResult> {
  const category = input.category ?? 'info';
  const prefs = await getNotificationPrefs(pdb, input.recipientUserId);
  const muted = category !== 'security' && prefs.mutedCategories.includes(category);

  if (muted && input.sourceType === 'plugin') {
    return { id: null, outcome: 'dropped' };
  }

  const id = input.id ?? randomUUID();
  await sendNotification(pdb, { ...input, id });

  if (muted) {
    // Platform/admin-sourced, muted: keep the row for audit, but silence it
    // — no unread count, no toast, no push.
    await dismissNotification(pdb, id, input.recipientUserId);
    return { id, outcome: 'stored-silent' };
  }

  // Broker publish for SSE/Redis transport (no-op in polling mode).
  const broker = getBroker();
  if (broker) {
    void broker.publish(input.recipientUserId, {
      notificationId: id,
      userId: input.recipientUserId,
      title: input.title,
      body: input.body ?? undefined,
      url: input.actionUrl ?? input.url ?? undefined,
      category,
      source: input.source,
    });
  }

  // Fire-and-forget push fan-out — respects per-user muted-category prefs
  // itself too (defense in depth; this call site only reaches here when
  // `category` is already known not-muted, per the check above).
  void fanOutPushToUser(input.recipientUserId, {
    title: input.title,
    body: input.body,
    url: input.actionUrl ?? input.url,
    category,
    icon: input.icon,
    source: input.source,
  });

  return { id, outcome: 'delivered' };
}
