import { beforeEach, describe, expect, it, vi } from 'vitest';

// What a locked session gets (RFC 0006 B3): nothing from a page, a server action or core's own routes, and the lock page from a guarded
// page. The store's decisions are tested on a database in lock.suite.ts; here it is stubbed and what the session code does with them is
// under test.
let cookie = '';
const betterAuthSession = vi.fn();
const lockStatus = vi.fn();
const noteActivity = vi.fn();
const lockSession = vi.fn();
const DEVICE = 'device-id-0123456789';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers(cookie ? { cookie } : {})),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('../auth/index', () => ({
  getAuth: () => Promise.resolve({ api: { getSession: () => betterAuthSession() as unknown } }),
}));
vi.mock('../auth/settings', () => ({
  getAuthSettings: () => ({
    secureCookies: false,
    baseUrl: 'http://localhost:3000',
    trustedOrigins: [],
  }),
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({ family: 'sqlite' }) }));
vi.mock('../lock/store', () => ({
  lockStatus: (...args: unknown[]) => lockStatus(...args) as unknown,
  noteActivity: (...args: unknown[]) => noteActivity(...args) as unknown,
  lockSession: (...args: unknown[]) => lockSession(...args) as unknown,
}));

import { requireSession } from '../auth/authorize';
import { requireSignedIn, sendOnIfSignedIn } from '../auth/require-signed-in';
import { getSession, getSessionEvenIfLocked } from '../auth/session';
import { POST } from '../../app/api/lock/[event]/route';

const ADA = { session: { id: 's-ada' }, user: { id: 'ada', deactivatedAt: null } };
const LOCK = { idleSeconds: 900, onLeave: false };

beforeEach(() => {
  cookie = `other=1; sv_device=${DEVICE}`;
  betterAuthSession.mockReset().mockResolvedValue(ADA);
  lockStatus.mockReset().mockResolvedValue({ lock: LOCK, locked: false });
  noteActivity.mockReset().mockResolvedValue(undefined);
  lockSession.mockReset().mockResolvedValue(undefined);
});

describe('a locked session', () => {
  it('is no session, while the lock page can still see whose it is', async () => {
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    expect(await getSession()).toBeNull();
    expect(await getSessionEvenIfLocked()).toBe(ADA);
    expect(lockStatus).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 's-ada',
      userId: 'ada',
      deviceId: DEVICE,
    });
  });

  it('is refused by every server action and route, except the lock page’s own', async () => {
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    await expect(requireSession()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(await requireSession({ evenIfLocked: true })).toBe(ADA);
  });

  it('is never taken for unlocked when the lock cannot be read', async () => {
    lockStatus.mockRejectedValue(new Error('database down'));
    await expect(getSession()).rejects.toThrow('database down');
  });

  it('sends a guarded page to the lock page, with the way back', async () => {
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    await expect(requireSignedIn('/security?tab=1')).rejects.toThrow(
      `redirect /lock?returnTo=${encodeURIComponent('/security?tab=1')}`,
    );
  });

  it('is sent from the pages before signing in to the lock page, except the second step', async () => {
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    await expect(sendOnIfSignedIn('/apps')).rejects.toThrow(
      `redirect /lock?returnTo=${encodeURIComponent('/apps')}`,
    );
    await expect(sendOnIfSignedIn('/apps', {}, { toLock: false })).resolves.toBeUndefined();
  });

  it('gets nothing from the lock route either', async () => {
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    const response = await post('activity');
    expect(response.status).toBe(401);
    expect(noteActivity).not.toHaveBeenCalled();
  });
});

describe('a session that is not locked', () => {
  it('is given as it is, and a page opened starts its idle time again', async () => {
    expect(await getSession()).toBe(ADA);
    expect(await requireSignedIn('/')).toBe(ADA);
    expect(noteActivity).toHaveBeenCalledWith(expect.anything(), 's-ada');
  });

  it('asks the store with no device in a browser with no device cookie, or one that does not look like one', async () => {
    for (const value of ['other=1', 'sv_device=short']) {
      cookie = value;
      lockStatus.mockClear();
      expect(await getSession()).toBe(ADA);
      expect(lockStatus).toHaveBeenCalledWith(expect.anything(), {
        sessionId: 's-ada',
        userId: 'ada',
        deviceId: undefined,
      });
    }
  });

  it('is locked with no device cookie when the store says it is under a lock', async () => {
    cookie = 'other=1';
    lockStatus.mockResolvedValue({ lock: LOCK, locked: true });
    expect(await getSession()).toBeNull();
    await expect(requireSignedIn('/')).rejects.toThrow('redirect /lock');
  });

  it('is sent to sign in when there is none at all', async () => {
    betterAuthSession.mockResolvedValue(null);
    await expect(requireSignedIn('/apps')).rejects.toThrow(
      `redirect /sign-in?returnTo=${encodeURIComponent('/apps')}`,
    );
  });
});

const post = (event: string, origin = 'http://localhost:3000') =>
  POST(
    new Request(`http://localhost:3000/api/lock/${event}`, { method: 'POST', headers: { origin } }),
    {
      params: Promise.resolve({ event }),
    },
  );

describe('the lock route', () => {
  it('notes activity', async () => {
    expect((await post('activity')).status).toBe(204);
    expect(noteActivity).toHaveBeenCalledWith(expect.anything(), 's-ada');
  });

  it('locks on leaving only when the device’s lock asks for it', async () => {
    expect((await post('leave')).status).toBe(204);
    expect(lockSession).not.toHaveBeenCalled();
    lockStatus.mockResolvedValue({ lock: { ...LOCK, onLeave: true }, locked: false });
    expect((await post('leave')).status).toBe(204);
    expect(lockSession).toHaveBeenCalledWith(expect.anything(), 's-ada');
  });

  it('does nothing on a device with no lock', async () => {
    lockStatus.mockResolvedValue({ lock: undefined, locked: false });
    expect((await post('leave')).status).toBe(204);
    expect((await post('activity')).status).toBe(204);
    expect(lockSession).not.toHaveBeenCalled();
    expect(noteActivity).not.toHaveBeenCalled();
  });

  it('knows only its two events', async () => {
    expect((await post('unlock')).status).toBe(404);
  });

  it('is refused from another site, and to someone not signed in', async () => {
    expect((await post('leave', 'https://elsewhere.example')).status).toBe(403);
    betterAuthSession.mockResolvedValue(null);
    expect((await post('leave')).status).toBe(401);
    expect(lockSession).not.toHaveBeenCalled();
  });
});
