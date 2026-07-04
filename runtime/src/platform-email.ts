import { createHash, randomUUID } from 'node:crypto';
import { recordEmailDelivery, type EmailDeliveryClass } from '@sovereignfs/db';
import { createMailer } from '@sovereignfs/mailer';
import { getPlatformDb } from './db';

export type PlatformEmailSource = 'auth' | 'runtime' | 'console' | 'account' | 'plugin';

export interface PlatformEmailInput {
  templateId: string;
  deliveryClass: EmailDeliveryClass;
  toUserId?: string | null;
  toEmail: string;
  actorUserId?: string | null;
  source: PlatformEmailSource;
  subject: string;
  html?: string;
  text?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PlatformEmailResult {
  status: 'skipped' | 'sent' | 'failed';
  errorCode?: string;
}

const mailer = createMailer();

export function isSmtpConfigured(): boolean {
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

export async function sendPlatformEmail(input: PlatformEmailInput): Promise<PlatformEmailResult> {
  const pdb = await getPlatformDb();
  const baseLog = {
    id: randomUUID(),
    deliveryClass: input.deliveryClass,
    templateId: input.templateId,
    source: input.source,
    recipientUserId: input.toUserId ?? null,
    recipientEmailHash: recipientHash(input.toEmail),
    actorUserId: input.actorUserId ?? null,
    metadata: input.metadata ?? null,
  };

  if (!mailer.configured) {
    await recordEmailDelivery(pdb, {
      ...baseLog,
      status: 'skipped',
      errorCode: 'SMTP_NOT_CONFIGURED',
    });
    return { status: 'skipped', errorCode: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    await mailer.send({
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    await recordEmailDelivery(pdb, { ...baseLog, status: 'sent' });
    return { status: 'sent' };
  } catch (err) {
    const code = errorCode(err);
    await recordEmailDelivery(pdb, { ...baseLog, status: 'failed', errorCode: code });
    return { status: 'failed', errorCode: code };
  }
}
