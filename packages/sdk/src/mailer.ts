import { requireHost } from './host';
import type { MailOptions } from './types';

function getPluginId(headers?: Headers): string | null {
  return headers?.get('x-sovereign-plugin-id') ?? null;
}

/**
 * Low-level, direct-recipient email send (RFC 0062). Requires the
 * `mailer:send` manifest permission, plus `mailer:sendExternal` since the
 * recipient is a raw address you supply rather than a platform-resolved
 * user. Prefer `sdk.email.sendToUser()`, which resolves the recipient
 * server-side by user ID and needs no external-recipient escape hatch.
 *
 * `requestHeaders` is read by the runtime to resolve the calling plugin's ID
 * (unlike e.g. `sdk.auth`, which reads request headers internally) — pass
 * `await headers()` from `next/headers`. Omitting it is treated as an
 * out-of-plugin-context call and rejected.
 *
 * No-ops when SMTP is unconfigured.
 */
export async function send(options: MailOptions, requestHeaders?: Headers): Promise<void> {
  await requireHost().mailer.send(options, getPluginId(requestHeaders));
}
