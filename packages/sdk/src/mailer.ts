import { requireHost } from './host';
import type { MailOptions } from './types';

/** Sends an email via the platform mailer. No-ops when SMTP is not configured. */
export async function send(options: MailOptions): Promise<void> {
  await requireHost().mailer.send(options);
}
