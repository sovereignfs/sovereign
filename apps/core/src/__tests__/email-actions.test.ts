import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../auth/authorize';

const session = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => session() as unknown }));
vi.mock('../roles/matrix', async () => {
  const { DEFAULT_MATRIX } = await import('../roles/capabilities');
  return { getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const service = { apps: vi.fn(), setEnabled: vi.fn() };
vi.mock('../mail', () => ({ getMailForAppsService: () => Promise.resolve(service) }));

const actions = await import('../../app/preferences/email-actions');

beforeEach(() => {
  session.mockReset().mockResolvedValue(null);
  for (const fn of Object.values(service)) fn.mockReset();
  service.apps.mockResolvedValue([]);
});

describe('the email switch in Preferences', () => {
  it('needs a signed-in person, first', async () => {
    await expect(actions.setAppEmailAction('app', false)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(service.setEnabled).not.toHaveBeenCalled();
  });

  it('switches an app that can email the person, for the session’s account', async () => {
    session.mockResolvedValue({ user: { id: 'ada', role: 'platform:user' } });
    service.apps.mockResolvedValue([{ clientId: 'app', name: 'Reminders', enabled: true }]);
    expect(await actions.setAppEmailAction('app', false)).toEqual({ ok: true, message: 'Off.' });
    expect(service.apps).toHaveBeenCalledWith('ada');
    expect(service.setEnabled).toHaveBeenCalledWith('ada', 'app', false);
  });

  it('will not make a switch for an app that cannot email them', async () => {
    session.mockResolvedValue({ user: { id: 'ada', role: 'platform:user' } });
    expect(await actions.setAppEmailAction('someone-elses', true)).toMatchObject({ ok: false });
    expect(service.setEnabled).not.toHaveBeenCalled();
  });
});
