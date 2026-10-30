import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../auth/authorize';

const session = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => session() as unknown }));
vi.mock('../roles/matrix', async () => {
  const { DEFAULT_MATRIX } = await import('../roles/capabilities');
  return { getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const service = {
  list: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  dismiss: vi.fn(),
  markAllRead: vi.fn(),
  dismissAll: vi.fn(),
  apps: vi.fn(),
  setEnabled: vi.fn(),
  clearAll: vi.fn(),
};
vi.mock('../notifications', () => ({ getNotificationService: () => Promise.resolve(service) }));

const authorize = vi.hoisted(() => ({ sameOrigin: vi.fn() }));
vi.mock('../auth/authorize', async (original) => ({
  ...(await original<typeof import('../auth/authorize')>()),
  requireSameOrigin: (request: Request) => authorize.sameOrigin(request) as unknown,
}));

const { GET, POST } = await import('../../app/api/notifications/route');
const actions = await import('../../app/preferences/notification-actions');

const signedIn = () => session.mockResolvedValue({ user: { id: 'ada', role: 'platform:user' } });
const post = (body: unknown) =>
  POST(
    new Request('http://localhost:3000/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  session.mockReset().mockResolvedValue(null);
  authorize.sameOrigin.mockReset();
  for (const fn of Object.values(service)) fn.mockReset();
  service.list.mockResolvedValue([]);
  service.unreadCount.mockResolvedValue(0);
  service.apps.mockResolvedValue([]);
});

describe('core’s own route for the panel', () => {
  it('answers nobody who is not signed in', async () => {
    expect((await GET()).status).toBe(401);
    expect((await post({ action: 'read-all' })).status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.markAllRead).not.toHaveBeenCalled();
  });

  it('gives the signed-in person’s own notifications and how many are unread, and never caches them', async () => {
    signedIn();
    service.list.mockResolvedValue([{ id: 'n1' }]);
    service.unreadCount.mockResolvedValue(4);
    const reply = await GET();
    expect(await reply.json()).toEqual({ unread: 4, notifications: [{ id: 'n1' }] });
    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(service.list).toHaveBeenCalledWith('ada', { limit: 50 });
    expect(service.unreadCount).toHaveBeenCalledWith('ada');
  });

  it('acts on the session’s account, whatever the request says', async () => {
    signedIn();
    await post({ action: 'read', id: 'n1', userId: 'bo' });
    await post({ action: 'dismiss', id: 'n2' });
    await post({ action: 'read-all' });
    await post({ action: 'dismiss-all' });
    expect(service.markRead).toHaveBeenCalledWith('ada', 'n1');
    expect(service.dismiss).toHaveBeenCalledWith('ada', 'n2');
    expect(service.markAllRead).toHaveBeenCalledWith('ada');
    expect(service.dismissAll).toHaveBeenCalledWith('ada');
  });

  it.each([
    ['not JSON', 'nope'],
    ['an action it does not have', { action: 'delete-everything' }],
    ['a read with no id', { action: 'read' }],
    ['a dismiss with an id that is not text', { action: 'dismiss', id: 5 }],
  ])('refuses %s', async (_name, body) => {
    signedIn();
    expect((await post(body)).status).toBe(400);
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it('checks where the request came from before anything else', async () => {
    signedIn();
    authorize.sameOrigin.mockImplementation(() => {
      throw new AuthorizationError('forbidden');
    });
    expect((await post({ action: 'read-all' })).status).toBe(403);
    expect(service.markAllRead).not.toHaveBeenCalled();
  });
});

describe('the Preferences actions', () => {
  it('need a signed-in person, first', async () => {
    await expect(actions.clearNotificationsAction()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(actions.setAppNotificationsAction('app', false)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(service.setEnabled).not.toHaveBeenCalled();
  });

  it('switch an app that can write to the person, for the session’s account', async () => {
    signedIn();
    service.apps.mockResolvedValue([{ clientId: 'app', name: 'Reminders', enabled: true }]);
    expect(await actions.setAppNotificationsAction('app', false)).toEqual({
      ok: true,
      message: 'Off.',
    });
    expect(service.setEnabled).toHaveBeenCalledWith('ada', 'app', false);
  });

  it('will not make a switch for an app that cannot write to them', async () => {
    signedIn();
    expect(await actions.setAppNotificationsAction('someone-elses', true)).toMatchObject({
      ok: false,
    });
    expect(service.setEnabled).not.toHaveBeenCalled();
  });

  it('clear everything the session’s account has', async () => {
    signedIn();
    service.clearAll.mockResolvedValue(3);
    expect(await actions.clearNotificationsAction()).toEqual({
      ok: true,
      message: 'Your notifications are cleared.',
    });
    expect(service.clearAll).toHaveBeenCalledWith('ada');
    service.clearAll.mockResolvedValue(0);
    expect(await actions.clearNotificationsAction()).toMatchObject({
      message: 'There was nothing to clear.',
    });
  });
});
