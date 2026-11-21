import { headers } from 'next/headers';
import { checkSession, readSessionUnchecked } from '@sovereignfs/auth/server';
import { getDatabase } from '../database';
import { deviceIdFrom } from '../lock/device';
import { lockStatus } from '../lock/store';
import { getAuth } from './index';
import { getAuthSettings } from './settings';

/**
 * The signed-in person's session for the current request, or `null`. Server components only.
 *
 * It is the sign-in package's session read (auth.md §6), checked against the database every time, with core's lock as its check.
 */
export async function getSession() {
  // A locked session is no session for anything that would show or change the person's data (RFC 0006 B3): pages, server actions,
  // routes and the session's secret, which opens the person's keys (B5), all come through here. Deciding it may lock the session now,
  // if its idle time has passed. An error here is raised, never taken for "not locked".
  return checkSession(
    await getSessionEvenIfLocked(),
    async (session) => (await currentLock(session)).locked,
  );
}

/**
 * The session whether or not it is locked: for the lock page and its unlock actions alone (RFC 0006 B4), which have to know whose
 * locked session it is. Everything else uses `getSession`.
 */
export async function getSessionEvenIfLocked() {
  // The package's read: from the database every time, and none for a deactivated account (auth.md §4, rules 6 and 8).
  return readSessionUnchecked(await getAuth(), await headers());
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
