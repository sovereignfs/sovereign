import { headers } from 'next/headers';
import { getAuth } from './index';

/**
 * The signed-in person's session for the current request, or `null`. Server components only.
 *
 * It is checked against the database every time, never answered from the signed cookie cache
 * (which better-auth's own session endpoint may still use for up to 300 seconds). A session that
 * has ended, because of a password reset, a sign-out somewhere else or a deactivation, must stop
 * working for what core itself guards at once, not when a copy of the cookie's cache runs out.
 */
export async function getSession() {
  const session = await (
    await getAuth()
  ).api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  // Deactivating an account ends its sessions; one opened at the same moment could slip past that,
  // so a deactivated account has no session here whatever the table says (core-app §3.3.6).
  if (session?.user.deactivatedAt) return null;
  return session;
}
