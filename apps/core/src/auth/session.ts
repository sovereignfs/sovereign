import { headers } from 'next/headers';
import { getAuth } from './index';

/**
 * The signed-in person's session for the current request, or `null`. Server components only.
 *
 * It is checked against the database every time. better-auth's signed cookie cache is off (`auth.ts`); asking it
 * not to be used here as well keeps that true for core's own pages if the cache were ever turned on, since a session
 * that has ended (a password reset, a sign-out somewhere else, a deactivation) must stop working at once.
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
