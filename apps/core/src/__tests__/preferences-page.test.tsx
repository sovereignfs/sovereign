import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { updateUser: vi.fn() } }));
const apps = vi.fn();
vi.mock('../notifications', () => ({
  getNotificationService: () => Promise.resolve({ apps: () => apps() as unknown }),
}));
vi.mock('../../app/preferences/notification-actions', () => ({
  setAppNotificationsAction: vi.fn(),
  clearNotificationsAction: vi.fn(),
}));

const { default: PreferencesPage } = await import('../../app/preferences/page');

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  apps.mockReset().mockResolvedValue([]);
});

const as = (user: Record<string, unknown>) =>
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ada', email: 'a@example.com', ...user },
  });

describe('the preferences page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    await expect(PreferencesPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fpreferences'),
    });
  });

  it('has one level-one heading, a time zone and a language, with the saved ones chosen', async () => {
    as({ timezone: 'Europe/Paris', locale: 'fr-FR' });
    const html = renderToStaticMarkup(await PreferencesPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Time zone');
    expect(html).toContain('Language and region');
    expect(html).toMatch(/<option value="Europe\/Paris" selected="">/);
    expect(html).toMatch(/<option value="fr-FR" selected="">/);
  });

  it('offers "Not set" and chooses it for someone who has saved nothing', async () => {
    as({ timezone: null, locale: null });
    const html = renderToStaticMarkup(await PreferencesPage());
    expect(html.match(/<option value="" selected="">Not set<\/option>/g)).toHaveLength(2);
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as({});
    expect(renderToStaticMarkup(await PreferencesPage())).not.toMatch(/<script|<style|style="/);
  });
});
