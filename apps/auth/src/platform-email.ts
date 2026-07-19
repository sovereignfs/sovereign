import { createHash, randomUUID } from 'node:crypto';
import { createMailer } from '@sovereignfs/mailer';
import { authRun } from './db';
import { getEnv } from './env';

type EmailDeliveryClass = 'authentication' | 'security' | 'administrative' | 'communication';

interface AuthPlatformEmailInput {
  templateId: string;
  deliveryClass: EmailDeliveryClass;
  toUserId?: string | null;
  toEmail: string;
  actorUserId?: string | null;
  subject: string;
  html?: string;
  text?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

const mailer = createMailer();

/** Whether SMTP is configured (directly, or the dev-only Mailpit fallback). */
export function isMailerConfigured(): boolean {
  return mailer.configured;
}

function recipientHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code.slice(0, 120);
  }
  return error instanceof Error && error.name ? error.name.slice(0, 120) : 'EMAIL_SEND_FAILED';
}

async function recordAuthEmailDelivery(
  input: AuthPlatformEmailInput,
  status: 'skipped' | 'sent' | 'failed',
  code?: string,
): Promise<void> {
  await authRun(
    `INSERT INTO auth_email_delivery_log
      (id, created_at, delivery_class, template_id, source, recipient_user_id,
       recipient_email_hash, actor_user_id, status, provider_message_id, error_code, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      Math.floor(Date.now() / 1000),
      input.deliveryClass,
      input.templateId,
      'auth',
      input.toUserId ?? null,
      recipientHash(input.toEmail),
      input.actorUserId ?? null,
      status,
      null,
      code ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

/**
 * Fire-and-forget report of a non-'sent' delivery outcome to the runtime's
 * platform activity log — apps/auth has no direct access to it (separate app,
 * separate database), so this crosses the process boundary over HTTP. Never
 * throws or delays the caller; a failure here must never affect the auth flow.
 */
function reportDeliveryOutcomeToActivityLog(
  input: AuthPlatformEmailInput,
  status: 'skipped' | 'failed',
  code: string,
): void {
  const env = getEnv();
  void fetch(`${env.runtimeUrl}/api/admin/activity`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.adminKey}`,
    },
    body: JSON.stringify({
      actorType: 'system',
      action: 'email.delivery_failed',
      subjectUserId: input.toUserId ?? null,
      visibility: input.toUserId ? 'user' : 'admin',
      summary: `${status === 'skipped' ? 'Skipped' : 'Failed to send'} "${input.templateId}" email (${input.deliveryClass})`,
      metadata: {
        templateId: input.templateId,
        deliveryClass: input.deliveryClass,
        status,
        errorCode: code,
      },
    }),
  }).catch(() => {
    // Intentionally silent — the runtime may be starting up, unreachable, or
    // misconfigured; the low-level auth_email_delivery_log row above already
    // captured the outcome, so this is a best-effort secondary signal.
  });
}

export async function sendAuthPlatformEmail(input: AuthPlatformEmailInput): Promise<void> {
  if (!mailer.configured) {
    await recordAuthEmailDelivery(input, 'skipped', 'SMTP_NOT_CONFIGURED');
    reportDeliveryOutcomeToActivityLog(input, 'skipped', 'SMTP_NOT_CONFIGURED');
    if (input.deliveryClass === 'authentication') {
      throw new Error('SMTP_NOT_CONFIGURED');
    }
    return;
  }

  try {
    await mailer.send({
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    await recordAuthEmailDelivery(input, 'sent');
  } catch (err) {
    const code = errorCode(err);
    await recordAuthEmailDelivery(input, 'failed', code);
    reportDeliveryOutcomeToActivityLog(input, 'failed', code);
    if (input.deliveryClass === 'authentication') throw err;
  }
}
