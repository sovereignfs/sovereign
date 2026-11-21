'use server';

import { cookies } from 'next/headers';
import { requireCapability } from '../../src/auth/authorize';
import { currentDeviceId, currentLock } from '../../src/auth/session';
import { getAuthSettings } from '../../src/auth/settings';
import { getDatabase } from '../../src/database';
import { DEVICE_COOKIE_SECONDS, deviceCookieName, newDeviceId } from '../../src/lock/device';
import { checkPasskey, passkeyChallenge, type PasskeyRequest } from '../../src/lock/passkey';
import { removeDeviceLock, setDeviceLock } from '../../src/lock/store';

export type LockChange = { ok: true } | { ok: false; reason: 'passkey' | 'invalid' };

const isChoice = (minutes: unknown): minutes is number =>
  minutes === 1 || minutes === 5 || minutes === 15 || minutes === 60;

/** A passkey challenge for turning the lock on, after the person tapped Turn on; `undefined` when the account has no passkey. */
export async function lockChallenge(): Promise<PasskeyRequest | undefined> {
  const session = await requireCapability('profile:manage');
  return passkeyChallenge(await getDatabase(), getAuthSettings().webauthn, {
    sessionId: session.session.id,
    userId: session.user.id,
  });
}

/**
 * Turns the lock on for this device, or changes it (RFC 0006 B1). Turning it on needs one of the account's passkeys, answered on this
 * device with the person verified, checked here (`checkPasskey`): the lock is only useful where one works. Changing it, where it is on,
 * needs only the unlocked session. The device is named by a cookie made here the first time.
 */
export async function saveLock(input: {
  idleMinutes: unknown;
  onLeave: unknown;
  passkey?: unknown;
}): Promise<LockChange> {
  const session = await requireCapability('profile:manage');
  if (!isChoice(input.idleMinutes) || typeof input.onLeave !== 'boolean') {
    return { ok: false, reason: 'invalid' };
  }
  const database = await getDatabase();
  // The device is the one whose lock the session is under, when it is; otherwise this browser's, or a new one.
  const status = await currentLock(session);
  const cookieId = await currentDeviceId();
  if (!status.lock) {
    const who = { sessionId: session.session.id, userId: session.user.id };
    if (!(await checkPasskey(database, getAuthSettings().webauthn, who, input.passkey))) {
      return { ok: false, reason: 'passkey' };
    }
  }
  const deviceId = status.deviceId ?? cookieId ?? newDeviceId();
  if (cookieId !== deviceId) {
    // Made the first time, or given back to a browser that lost it, so its next session takes the setting up too.
    const secure = getAuthSettings().secureCookies;
    (await cookies()).set(deviceCookieName(secure), deviceId, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_SECONDS,
    });
  }
  await setDeviceLock(database, session.user.id, deviceId, {
    idleMinutes: input.idleMinutes,
    onLeave: input.onLeave,
  });
  return { ok: true };
}

/** Turns the lock off for this device: the one whose lock the session is under, or this browser's. */
export async function removeLock(): Promise<LockChange> {
  const session = await requireCapability('profile:manage');
  const deviceId = (await currentLock(session)).deviceId ?? (await currentDeviceId());
  if (deviceId) await removeDeviceLock(await getDatabase(), session.user.id, deviceId);
  return { ok: true };
}
