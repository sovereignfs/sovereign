import { headers } from 'next/headers';
import { getDatabase } from '../database';
import { deviceIdFrom } from '../lock/device';
import { lockStatus } from '../lock/store';
import { getAuth } from './index';
import { getAuthSettings } from './settings';

/**
 * The signed-in person's session for the current request, or `null`. Server components only.
 *
 * It is checked against the database every time. better-auth's signed cookie cache is off (`auth.ts`); asking it
 * not to be used here as well keeps that true for core's own pages if the cache were ever turned on, since a session
 * that has ended (a password reset, a sign-out somewhere else, a deactivation) must stop working at once.
 */
export async function getSession() {
  const session = await getSessionEvenIfLocked();
  if (!session) return null;
  // A locked session is no session for anything that would show or change the person's data (RFC 0006 B3): pages, server actions,
  // routes and the session's secret, which opens the person's keys (B5), all come through here. Deciding it may lock the session now,
  // if its idle time has passed. An error here is raised, never taken for "not locked".
  if ((await currentLock(session)).locked) return null;
  return session;
}

/**
 * The session whether or not it is locked: for the lock page and its unlock actions alone (RFC 0006 B4), which have to know whose
 * locked session it is. Everything else uses `getSession`.
 */
export async function getSessionEvenIfLocked() {
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

/** This browser's device id (RFC 0006 B1), from the request's cookies. */
export async function currentDeviceId(): Promise<string | undefined> {
  const cookie = (await headers()).get('cookie');
  // Most browsers have no device cookie: they cost no setting read.
  if (!cookie?.includes('sv_device')) return undefined;
  return deviceIdFrom(cookie, getAuthSettings().secureCookies);
}

/**
 * The lock on the session's device, and whether the session is locked, decided now (RFC 0006 B2). One read for a session that was never
 * under a lock; the device cookie only puts a new session under its device's lock.
 */
export async function currentLock(session: { session: { id: string }; user: { id: string } }) {
  return lockStatus(await getDatabase(), {
    sessionId: session.session.id,
    userId: session.user.id,
    deviceId: await currentDeviceId(),
  });
}
