import { createHash, randomUUID } from 'node:crypto';
import { createMailer } from '@sovereignfs/mailer';
import { authRun } from './db';

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

export async function sendAuthPlatformEmail(input: AuthPlatformEmailInput): Promise<void> {
  if (!mailer.configured) {
    await recordAuthEmailDelivery(input, 'skipped', 'SMTP_NOT_CONFIGURED');
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
    await recordAuthEmailDelivery(input, 'failed', errorCode(err));
    if (input.deliveryClass === 'authentication') throw err;
  }
}
