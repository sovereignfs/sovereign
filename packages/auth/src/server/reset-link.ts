/** Where better-auth keeps a reset token: a verification row under this identifier, holding the account's id. */
const identifierOf = (token: string) => `reset-password:${token}`;

/** How long a link made here works: the same hour as one sent by mail. */
const ONE_HOUR_MS = 60 * 60 * 1000;

/** What of a better-auth instance making a link needs: its context, for the verification store and the users. */
export type ResetLinkAuth = {
  $context: Promise<{
    generateId?: (options: { model: string; size?: number }) => string | false;
    internalAdapter: {
      findUserByEmail(email: string): Promise<{ user: { id: string } } | null>;
      createVerificationValue(data: {
        value: string;
        identifier: string;
        expiresAt: Date;
      }): Promise<unknown>;
    };
  }>;
};

/**
 * A reset link for an account, made the way better-auth makes the one it mails, for an operator to hand over where the app sends no mail
 * (RFC 0007 amendment 1 A1, auth.md §8.1): after the period in which a password the app stored before the package can be moved, this is
 * how a person whose password was not moved signs in again. It works once, for an hour, and completing it ends every session, as a mailed
 * one does; the page it opens is the app's reset page (`/reset-password?token=…`). `undefined` when there is no such account. An app
 * exposes it through a command of its own, run on the server, never a route.
 */
export async function resetLink(
  auth: ResetLinkAuth,
  email: string,
  baseUrl: string,
  { now = Date.now(), page = '/reset-password' }: { now?: number; page?: string } = {},
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
  return `${new URL(baseUrl).origin}${page}?token=${encodeURIComponent(token)}`;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Buffer.from(bytes).toString('base64url');
}
