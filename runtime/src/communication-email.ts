import { randomUUID } from 'node:crypto';
import { getNotificationPrefs, recordEmailDelivery, type PlatformDb } from '@sovereignfs/db';
import { logger } from './logger';
import { recipientHash, sendPlatformEmail, type PlatformEmailSource } from './platform-email';

/**
 * Single funnel every Console-triggered broadcast/admin-message email send
 * goes through (RFC 0062 §6, epic task 4.5). Gates delivery on the
 * recipient's own `communicationEmail` opt-in (default `false`) — mirrors
 * `push.ts`'s `fanOutPushToUser` skip-and-log shape for `CATEGORY_MUTED`,
 * but checks a dedicated preference rather than category mutes: this
 * channel is a separate, all-or-nothing consent switch, not scoped per
 * category the way inbox/toast/push are.
 *
 * Never called from `sdk.messages.send()` (plugin-facing) or from any
 * authentication/security/administrative email path (task 1.14) — those
 * remain fully unaffected by `communicationEmail`, by construction: this
 * module is only ever imported by the two broadcast routes and
 * `sendAdminMessage()`.
 */
export interface DeliverCommunicationEmailInput {
  recipientUserId: string;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  source: PlatformEmailSource;
  /** e.g. `'broadcast'` | `'admin-message'` — distinguishes the two call sites in the delivery log. */
  templateId: string;
  actorUserId?: string;
}

export interface DeliverCommunicationEmailResult {
  status: 'skipped' | 'sent' | 'failed';
  errorCode?: string;
}

/**
 * Minimal HTML-escaping for admin-authored broadcast/message text dropped
 * into an HTML email body — title/body are free-text from a `console:access`
 * admin, not an arbitrary end user, but still land in every recipient's
 * inbox, so a compromised admin session shouldn't be able to inject markup
 * (e.g. a spoofed link) into outgoing mail.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function deliverCommunicationEmail(
  pdb: PlatformDb,
  input: DeliverCommunicationEmailInput,
): Promise<DeliverCommunicationEmailResult> {
  const prefs = await getNotificationPrefs(pdb, input.recipientUserId);
  if (!prefs.communicationEmail) {
    logger.info('communication-email: skipped — recipient has not opted in', {
      recipientUserId: input.recipientUserId,
      templateId: input.templateId,
    });
    await recordEmailDelivery(pdb, {
      id: randomUUID(),
      deliveryClass: 'communication',
      templateId: input.templateId,
      source: input.source,
      recipientUserId: input.recipientUserId,
      recipientEmailHash: recipientHash(input.recipientEmail),
      actorUserId: input.actorUserId ?? null,
      status: 'skipped',
      errorCode: 'COMMUNICATION_EMAIL_DISABLED',
    });
    return { status: 'skipped', errorCode: 'COMMUNICATION_EMAIL_DISABLED' };
  }

  return sendPlatformEmail({
    templateId: input.templateId,
    deliveryClass: 'communication',
    toUserId: input.recipientUserId,
    toEmail: input.recipientEmail,
    actorUserId: input.actorUserId,
    source: input.source,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
