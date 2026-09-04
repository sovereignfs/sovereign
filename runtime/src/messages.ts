import { randomUUID } from 'node:crypto';
import { sendMessage, type PlatformDb } from '@sovereignfs/db';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { deliverCommunicationEmail, escapeHtml } from './communication-email';
import { DIRECTORY_MAX_LIMIT } from './directory';
import {
  checkMessageRateLimit,
  requireMessagePluginContext,
  type MessagePermissionManifest,
} from './message-permissions';
import { deliverNotification } from './notification-delivery';

/**
 * Orchestration for `sdk.messages.send()` (plugin sends) and Console's admin
 * message compose (RFC 0048). Kept as its own module, separate from
 * `sdk-host.ts`'s `provideHost()` closure, so `sendAdminMessage()` is
 * reusable from a plain runtime API route (Console's admin compose has no
 * plugin identity to route through the SDK host object) without needing to
 * fake one.
 *
 * Recipient resolution is injected (`resolveRecipients`) rather than this
 * module importing `sdk-host.ts`'s `fetchDirectoryUsers` directly — that
 * would create a circular import (`sdk-host.ts` imports `sendPluginMessage`
 * from here). Injection also keeps this module network-free and
 * independently unit-testable with a fake resolver, matching
 * `message-permissions.ts`'s/`plugin-mailer.ts`'s "no DB, no registry"
 * design goal.
 */
export type DirectoryUserResolver = (ids: string[]) => Promise<DirectoryUser[]>;

export interface SendMessageResult {
  messageId: string;
  sentTo: string[];
  skipped: { userId: string; reason: 'RECIPIENT_NOT_FOUND' }[];
}

function normalizeRecipientIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

async function resolveValidRecipients(
  recipientUserIds: string[],
  resolveRecipients: DirectoryUserResolver,
): Promise<{
  validRecipientUserIds: string[];
  /** Full resolved users for the valid subset — lets a caller reach `.email` without a second directory lookup. */
  validRecipients: DirectoryUser[];
  skipped: SendMessageResult['skipped'];
}> {
  const resolvedUsers = await resolveRecipients(recipientUserIds);
  const requestedIds = new Set(recipientUserIds);
  // Guard against a resolver returning a user nobody asked for.
  const validRecipients = resolvedUsers.filter((u) => requestedIds.has(u.id));
  const resolvedIds = new Set(validRecipients.map((u) => u.id));
  return {
    validRecipientUserIds: recipientUserIds.filter((id) => resolvedIds.has(id)),
    validRecipients,
    skipped: recipientUserIds
      .filter((id) => !resolvedIds.has(id))
      .map((userId) => ({ userId, reason: 'RECIPIENT_NOT_FOUND' as const })),
  };
}

/** Notification created alongside a message send — RFC 0048 §3's `dedupeKey: message:<id>` link. */
function messageNotificationInput(
  messageId: string,
  subject: string,
  source: string,
  sourceType: 'plugin' | 'admin',
  recipientUserId: string,
) {
  return {
    recipientUserId,
    source,
    sourceType,
    title: 'New message',
    summary: subject,
    actionUrl: `/inbox/messages/${messageId}`,
    category: 'message',
    dedupeKey: `message:${messageId}`,
  };
}

export interface SendPluginMessageInput {
  recipientUserIds: string[];
  subject: string;
  body: string;
  bodyFormat?: string;
  /** Defaults to `true` — set `false` to create the message without an accompanying notification. */
  notify?: boolean;
  sourceRef?: { type: string; id: string };
}

export interface MessageSenderManifest extends MessagePermissionManifest {
  name?: string;
}

/**
 * `sdk.messages.send()`'s implementation — permission + rate-limit gated,
 * recipients validated against the directory, capped at `DIRECTORY_MAX_LIMIT`
 * per call (RFC 0048 §7). Recipients that fail directory validation are
 * skipped, not fatal, unless every recipient fails.
 */
export async function sendPluginMessage(
  pdb: PlatformDb,
  input: SendPluginMessageInput,
  pluginIdInput: string | null,
  manifest: MessageSenderManifest | undefined,
  resolveRecipients: DirectoryUserResolver,
): Promise<SendMessageResult> {
  const { pluginId } = requireMessagePluginContext(pluginIdInput, manifest);

  const recipientUserIds = normalizeRecipientIds(input.recipientUserIds);
  if (recipientUserIds.length === 0) {
    throw new Error('recipientUserIds must include at least one user id.');
  }
  if (recipientUserIds.length > DIRECTORY_MAX_LIMIT) {
    throw new Error(
      `recipientUserIds is limited to ${String(DIRECTORY_MAX_LIMIT)} users per call.`,
    );
  }

  for (const recipientUserId of recipientUserIds) {
    const limited = checkMessageRateLimit(pluginId, recipientUserId);
    if (!limited.allowed) {
      throw new Error(
        `Plugin message rate limit exceeded (${String(limited.scope)}). ` +
          `Retry after ${String(limited.retryAfterSeconds ?? 60)} seconds.`,
      );
    }
  }

  const { validRecipientUserIds, skipped } = await resolveValidRecipients(
    recipientUserIds,
    resolveRecipients,
  );
  if (validRecipientUserIds.length === 0) {
    throw new Error('No valid recipients — every recipientUserId failed directory validation.');
  }

  const messageId = randomUUID();
  await sendMessage(pdb, {
    id: messageId,
    recipientUserIds: validRecipientUserIds,
    senderType: 'plugin',
    senderId: pluginId,
    senderDisplay: manifest?.name,
    subject: input.subject,
    body: input.body,
    bodyFormat: input.bodyFormat ?? 'plain',
    sourcePluginId: pluginId,
    sourceRefType: input.sourceRef?.type,
    sourceRefId: input.sourceRef?.id,
  });

  if (input.notify !== false) {
    await Promise.all(
      validRecipientUserIds.map((recipientUserId) =>
        deliverNotification(
          pdb,
          messageNotificationInput(messageId, input.subject, pluginId, 'plugin', recipientUserId),
        ),
      ),
    );
  }

  return { messageId, sentTo: validRecipientUserIds, skipped };
}

const ADMIN_MESSAGE_MAX_RECIPIENTS = 1000;

export interface SendAdminMessageInput {
  recipientUserIds: string[];
  subject: string;
  body: string;
  bodyFormat?: string;
  /** Defaults to `true` — set `false` to create the message without an accompanying notification. */
  notify?: boolean;
  /** Also send email to recipients who have opted into communication email (RFC 0062 §6). Off by default. */
  sendEmail?: boolean;
}

/**
 * Console's admin message compose — an internal helper, not reachable via
 * the plugin SDK (RFC 0048 §7: "platform internal helpers can bypass
 * plugin manifest permissions but must stamp sender_type as platform or
 * admin, never plugin"). No manifest/permission check; capped at 1000
 * recipients, matching the existing admin broadcast routes' own cap rather
 * than the narrower per-call plugin limit.
 */
export async function sendAdminMessage(
  pdb: PlatformDb,
  input: SendAdminMessageInput,
  actorUserId: string,
  resolveRecipients: DirectoryUserResolver,
): Promise<SendMessageResult> {
  const recipientUserIds = normalizeRecipientIds(input.recipientUserIds);
  if (recipientUserIds.length === 0) {
    throw new Error('recipientUserIds must include at least one user id.');
  }
  if (recipientUserIds.length > ADMIN_MESSAGE_MAX_RECIPIENTS) {
    throw new Error(
      `recipientUserIds is limited to ${String(ADMIN_MESSAGE_MAX_RECIPIENTS)} users per send.`,
    );
  }

  const { validRecipientUserIds, validRecipients, skipped } = await resolveValidRecipients(
    recipientUserIds,
    resolveRecipients,
  );
  if (validRecipientUserIds.length === 0) {
    throw new Error('No valid recipients — every recipientUserId failed directory validation.');
  }

  const messageId = randomUUID();
  await sendMessage(pdb, {
    id: messageId,
    recipientUserIds: validRecipientUserIds,
    senderType: 'admin',
    senderId: actorUserId,
    subject: input.subject,
    body: input.body,
    bodyFormat: input.bodyFormat ?? 'plain',
  });

  if (input.notify !== false) {
    await Promise.all(
      validRecipientUserIds.map((recipientUserId) =>
        deliverNotification(
          pdb,
          messageNotificationInput(messageId, input.subject, 'admin', 'admin', recipientUserId),
        ),
      ),
    );
  }

  // Optional communication-class email (RFC 0062 §6) — off by default;
  // deliverCommunicationEmail() itself re-checks each recipient's own
  // communicationEmail opt-in.
  if (input.sendEmail) {
    const text = `${input.subject}\n\n${input.body}`;
    const html = `<p><strong>${escapeHtml(input.subject)}</strong></p><p>${escapeHtml(input.body)}</p>`;
    await Promise.all(
      validRecipients.map((recipient) =>
        deliverCommunicationEmail(pdb, {
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          subject: input.subject,
          text,
          html,
          source: 'console',
          templateId: 'admin-message',
          actorUserId,
        }),
      ),
    );
  }

  return { messageId, sentTo: validRecipientUserIds, skipped };
}
