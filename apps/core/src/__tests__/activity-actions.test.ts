import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../auth/authorize';

const session = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => session() as unknown }));
vi.mock('../roles/matrix', async () => {
  const { DEFAULT_MATRIX } = await import('../roles/capabilities');
  return { getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const service = { delete: vi.fn(), deleteApp: vi.fn(), deleteAll: vi.fn() };
vi.mock('../activity', () => ({ getActivityService: () => Promise.resolve(service) }));

const actions = await import('../../app/activity/actions');

const signedIn = () => session.mockResolvedValue({ user: { id: 'ada', role: 'platform:user' } });

beforeEach(() => {
  session.mockReset().mockResolvedValue(null);
  for (const fn of Object.values(service)) fn.mockReset();
});

describe('the Activity page actions', () => {
  it('need a signed-in person, first', async () => {
    await expect(actions.deleteActivityAction('x')).rejects.toBeInstanceOf(AuthorizationError);
    await expect(actions.deleteAllActivityAction()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(actions.deleteAllActivityAction('app')).rejects.toBeInstanceOf(AuthorizationError);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('delete an entry for the session’s account, and say so when it was already gone', async () => {
    signedIn();
    service.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await actions.deleteActivityAction('e1')).toEqual({ ok: true, message: 'Deleted.' });
    expect(service.delete).toHaveBeenCalledWith('ada', 'e1');
    expect(await actions.deleteActivityAction('e1')).toMatchObject({ ok: false });
  });

  it('delete one app’s entries, or all of them, for the session’s account only', async () => {
    signedIn();
    service.deleteApp.mockResolvedValue(2);
    service.deleteAll.mockResolvedValue(0);
    expect(await actions.deleteAllActivityAction('app')).toMatchObject({ ok: true });
    expect(service.deleteApp).toHaveBeenCalledWith('ada', 'app');
    expect(await actions.deleteAllActivityAction()).toEqual({
      ok: true,
      message: 'There was nothing to delete.',
    });
    expect(service.deleteAll).toHaveBeenCalledWith('ada');
  });
});
