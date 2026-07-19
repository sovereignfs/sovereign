import { createHash, randomUUID } from 'node:crypto';
import { recordEmailDelivery, type EmailDeliveryClass } from '@sovereignfs/db';
import { createMailer, type Mailer } from '@sovereignfs/mailer';
import { logActivity } from './activity';
import { getPlatformDb } from './db';
import { resolveEffectiveMailerConfig } from './smtp-settings';

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

/**
 * Resolve a mailer fresh from the current effective config (Console-stored
 * settings override env vars, per-field) rather than memoizing one at
 * module load — a Console SMTP change must take effect immediately, without
 * a restart. `nodemailer.createTransport()` is cheap (no connection opens
 * until `sendMail()`), so this isn't worth caching for a transactional-email
 * volume path.
 */
async function getMailer(): Promise<Mailer> {
  const pdb = await getPlatformDb();
  const config = await resolveEffectiveMailerConfig(pdb);
  return createMailer(config);
}

export async function isSmtpConfigured(): Promise<boolean> {
  return (await getMailer()).configured;
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

/**
 * Records a non-'sent' delivery outcome to the activity log so it surfaces in
 * Console's platform-wide feed and, when a specific recipient user is known,
 * that user's own Account feed. No raw email address in the summary — the
 * delivery log already hashes the recipient.
 */
async function logDeliveryOutcome(
  input: PlatformEmailInput,
  status: 'skipped' | 'failed',
  errorCode: string,
): Promise<void> {
  await logActivity({
    actorType: 'system',
    action: 'email.delivery_failed',
    subjectUserId: input.toUserId ?? null,
    visibility: input.toUserId ? 'user' : 'admin',
    summary: `${status === 'skipped' ? 'Skipped' : 'Failed to send'} "${input.templateId}" email (${input.deliveryClass})`,
    metadata: {
      templateId: input.templateId,
      deliveryClass: input.deliveryClass,
      status,
      errorCode,
    },
  });
}

export async function sendPlatformEmail(input: PlatformEmailInput): Promise<PlatformEmailResult> {
  const pdb = await getPlatformDb();
  const mailer = await getMailer();
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
    await logDeliveryOutcome(input, 'skipped', 'SMTP_NOT_CONFIGURED');
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
    await logDeliveryOutcome(input, 'failed', code);
    return { status: 'failed', errorCode: code };
  }
}
