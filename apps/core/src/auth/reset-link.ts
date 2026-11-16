import type { Auth } from './auth';

/** Where better-auth keeps a reset token: a verification row under this identifier, holding the account's id. */
const identifierOf = (token: string) => `reset-password:${token}`;

/** How long a link made here works: the same hour as one sent by email (core-app §3.3.4). */
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * The address of the account a reset link belongs to, while the link still works, or `undefined`. The reset page shows it and
 * makes the new sign-in value from it (core-app §5.2): the page holds only the token, and whoever holds the link received it at
 * that address.
 */
export async function resetLinkAddress(
  auth: Pick<Auth, '$context'>,
  token: string,
  now: number = Date.now(),
): Promise<string | undefined> {
  const context = await auth.$context;
  const verification = await context.internalAdapter.findVerificationValue(identifierOf(token));
  if (!verification || new Date(verification.expiresAt).getTime() <= now) return undefined;
  const user = await context.internalAdapter.findUserById(verification.value);
  return user?.email;
}

/**
 * A reset link for an account, made the way better-auth makes the one it mails, for an operator to hand over when mail cannot be
 * sent (`sovereign-admin accounts reset-link`). It works once, for an hour, and completing it ends every session, as a mailed one
 * does. `undefined` when there is no such account.
 */
export async function makeResetLink(
  auth: Pick<Auth, '$context'>,
  email: string,
  baseUrl: string,
  now: number = Date.now(),
): Promise<string | undefined> {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  if (!found) return undefined;
  const token = context.generateId?.({ model: 'verification', size: 24 }) || randomToken();
  await context.internalAdapter.createVerificationValue({
    value: found.user.id,
    identifier: identifierOf(token),
    expiresAt: new Date(now + ONE_HOUR_MS),
  });
  return `${new URL(baseUrl).origin}/reset-password?token=${encodeURIComponent(token)}`;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Buffer.from(bytes).toString('base64url');
}
