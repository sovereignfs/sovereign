import { requireHost } from './host';
import type { EmailSendResult, SendToUserEmailInput } from './types';

function getPluginId(headers?: Headers): string | null {
  return headers?.get('x-sovereign-plugin-id') ?? null;
}

/**
 * User-scoped email surface (RFC 0062) — the safer alternative to
 * `sdk.mailer.send()`. Requires the `mailer:send` manifest permission. The
 * platform resolves `recipientUserId` to an email address and applies
 * delivery policy, rate limits, and audit logging server-side — plugins
 * never see or supply a raw recipient address.
 *
 * `requestHeaders` is read by the runtime to resolve the calling plugin's ID,
 * same as `sdk.mailer.send()` — pass `await headers()` from `next/headers`.
 *
 * @example
 * ```ts
 * await sdk.email.sendToUser(
 *   {
 *     recipientUserId,
 *     templateId: 'export-ready',
 *     subject: 'Your export is ready',
 *     text: 'Your data export has finished. Download it from the app.',
 *   },
 *   await headers(),
 * );
 * ```
 */
export const email = {
  async sendToUser(
    input: SendToUserEmailInput,
    requestHeaders?: Headers,
  ): Promise<EmailSendResult> {
    return requireHost().email.sendToUser(input, getPluginId(requestHeaders));
  },
};
