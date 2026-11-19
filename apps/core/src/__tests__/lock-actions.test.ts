import { beforeEach, describe, expect, it, vi } from 'vitest';

// The lock's actions (RFC 0006 B1, B4). Who is signed in, the password and passkey checks and the store are stubbed; which session each
// reads, and what it unlocks or turns on, is under test. The passkey check itself is tested with a software authenticator in
// passkey.suite.ts, and the store on a database in lock.suite.ts.
const requireSession = vi.fn();
const requireCapability = vi.fn();
const confirmPassword = vi.fn();
const checkPasskey = vi.fn();
const passkeyChallenge = vi.fn();
const unlockSession = vi.fn();
const deviceLock = vi.fn();
const setDeviceLock = vi.fn();
const removeDeviceLock = vi.fn();
const setCookie = vi.fn();
let cookie = '';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers(cookie ? { cookie } : {})),
  cookies: () => Promise.resolve({ set: setCookie }),
}));
vi.mock('../auth', () => ({ getAuth: () => Promise.resolve({}) }));
vi.mock('../auth/settings', () => ({
  getAuthSettings: () => ({
    secureCookies: false,
    webauthn: { rpId: 'localhost', origins: ['http://localhost:3000'] },
  }),
}));
vi.mock('../auth/authorize', () => ({
  requireSession: (...args: unknown[]) => requireSession(...args) as unknown,
  requireCapability: (...args: unknown[]) => requireCapability(...args) as unknown,
}));
vi.mock('../auth/confirm-password', () => ({
  confirmPassword: (...args: unknown[]) => confirmPassword(...args) as unknown,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
vi.mock('../lock/passkey', () => ({
  checkPasskey: (...args: unknown[]) => checkPasskey(...args) as unknown,
  passkeyChallenge: (...args: unknown[]) => passkeyChallenge(...args) as unknown,
}));
vi.mock('../lock/store', () => ({
  unlockSession: (...args: unknown[]) => unlockSession(...args) as unknown,
  deviceLock: (...args: unknown[]) => deviceLock(...args) as unknown,
  setDeviceLock: (...args: unknown[]) => setDeviceLock(...args) as unknown,
  removeDeviceLock: (...args: unknown[]) => removeDeviceLock(...args) as unknown,
}));

import {
  unlockChallenge,
  unlockWithPasskey,
  unlockWithPassword,
} from '../../app/(auth)/lock/actions';
import { lockChallenge, removeLock, saveLock } from '../../app/security/lock-actions';

const ADA = { session: { id: 's-ada' }, user: { id: 'ada' } };
const WHO = { sessionId: 's-ada', userId: 'ada' };
const DEVICE = 'device-id-0123456789';

beforeEach(() => {
  cookie = '';
  for (const mock of [
    requireSession,
    requireCapability,
    confirmPassword,
    checkPasskey,
    passkeyChallenge,
    unlockSession,
    deviceLock,
    setDeviceLock,
    removeDeviceLock,
    setCookie,
  ]) {
    mock.mockReset();
  }
  requireSession.mockResolvedValue(ADA);
  requireCapability.mockResolvedValue(ADA);
  deviceLock.mockResolvedValue(undefined);
});

describe('unlocking with the password', () => {
  it('reads the session even though it is locked, and unlocks it on the right password', async () => {
    confirmPassword.mockResolvedValue('ok');
    expect(await unlockWithPassword('value')).toEqual({ ok: true });
    expect(requireSession).toHaveBeenCalledWith({ evenIfLocked: true });
    expect(confirmPassword).toHaveBeenCalledWith({}, {}, 'ada', 'value');
    expect(unlockSession).toHaveBeenCalledWith({}, 's-ada');
  });

  it('leaves it locked on a wrong password, and says when there have been too many', async () => {
    confirmPassword.mockResolvedValue('wrong');
    expect(await unlockWithPassword('value')).toEqual({ ok: false, reason: 'wrong' });
    confirmPassword.mockResolvedValue('limited');
    expect(await unlockWithPassword('value')).toEqual({ ok: false, reason: 'limited' });
    expect(unlockSession).not.toHaveBeenCalled();
  });

  it('is refused with no session at all', async () => {
    requireSession.mockRejectedValue(new Error('unauthenticated'));
    await expect(unlockWithPassword('value')).rejects.toThrow('unauthenticated');
    expect(confirmPassword).not.toHaveBeenCalled();
  });
});

describe('unlocking with a passkey', () => {
  it('asks for a challenge for the locked session itself', async () => {
    passkeyChallenge.mockResolvedValue({ challenge: 'c', rpId: 'localhost', credentialIds: ['p'] });
    expect(await unlockChallenge()).toEqual({
      challenge: 'c',
      rpId: 'localhost',
      credentialIds: ['p'],
    });
    expect(requireSession).toHaveBeenCalledWith({ evenIfLocked: true });
    expect(passkeyChallenge).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ rpId: 'localhost' }),
      WHO,
    );
  });

  it('unlocks that same session, opening no other, when the passkey holds', async () => {
    checkPasskey.mockResolvedValue(true);
    expect(await unlockWithPasskey({ id: 'answer' })).toEqual({ ok: true });
    expect(checkPasskey).toHaveBeenCalledWith({}, expect.anything(), WHO, { id: 'answer' });
    expect(unlockSession).toHaveBeenCalledWith({}, 's-ada');
  });

  it('leaves it locked when it does not', async () => {
    checkPasskey.mockResolvedValue(false);
    expect(await unlockWithPasskey({ id: 'answer' })).toEqual({ ok: false, reason: 'wrong' });
    expect(unlockSession).not.toHaveBeenCalled();
  });
});

describe('turning the lock on, changing it and turning it off', () => {
  it('needs the person’s own capability for each, never only a session', async () => {
    requireCapability.mockRejectedValue(new Error('forbidden'));
    await expect(lockChallenge()).rejects.toThrow('forbidden');
    await expect(saveLock({ idleMinutes: 15, onLeave: false })).rejects.toThrow('forbidden');
    await expect(removeLock()).rejects.toThrow('forbidden');
    expect(requireCapability).toHaveBeenCalledWith('profile:manage');
    expect(setDeviceLock).not.toHaveBeenCalled();
  });

  it('turns it on only with a passkey answered on this device, and names the device', async () => {
    checkPasskey.mockResolvedValue(false);
    expect(await saveLock({ idleMinutes: 15, onLeave: false, passkey: { id: 'x' } })).toEqual({
      ok: false,
      reason: 'passkey',
    });
    expect(setDeviceLock).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();

    checkPasskey.mockResolvedValue(true);
    expect(await saveLock({ idleMinutes: 15, onLeave: true, passkey: { id: 'x' } })).toEqual({
      ok: true,
    });
    expect(checkPasskey).toHaveBeenLastCalledWith({}, expect.anything(), WHO, { id: 'x' });
    const [name, id, options] = setCookie.mock.calls[0] as [string, string, object];
    expect(name).toBe('sv_device');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(setDeviceLock).toHaveBeenCalledWith({}, 'ada', id, { idleMinutes: 15, onLeave: true });
  });

  it('changes it where it is on without asking for the passkey again, on the same device', async () => {
    cookie = `sv_device=${DEVICE}`;
    deviceLock.mockResolvedValue({ idleSeconds: 900, onLeave: false });
    expect(await saveLock({ idleMinutes: 1, onLeave: true })).toEqual({ ok: true });
    expect(checkPasskey).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    expect(setDeviceLock).toHaveBeenCalledWith({}, 'ada', DEVICE, {
      idleMinutes: 1,
      onLeave: true,
    });
  });

  it('takes only the offered idle times and a yes or no', async () => {
    for (const input of [
      { idleMinutes: 2, onLeave: false },
      { idleMinutes: '15', onLeave: false },
      { idleMinutes: 15, onLeave: 'yes' },
    ]) {
      expect(await saveLock(input)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(setDeviceLock).not.toHaveBeenCalled();
  });

  it('turns it off for this device only', async () => {
    cookie = `sv_device=${DEVICE}`;
    expect(await removeLock()).toEqual({ ok: true });
    expect(removeDeviceLock).toHaveBeenCalledWith({}, 'ada', DEVICE);
  });
});
