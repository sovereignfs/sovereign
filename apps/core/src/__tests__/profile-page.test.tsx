import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { updateUser: vi.fn() } }));

const { default: ProfilePage } = await import('../../app/profile/page');

beforeEach(() => getSession.mockReset().mockResolvedValue(null));

describe('the profile page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    await expect(ProfilePage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fprofile'),
    });
  });

  it('shows the name, the email address and the picture of the person signed in', async () => {
    getSession.mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@sovereign.local',
        image: '/api/avatars/u1?v=abc',
      },
    });
    const html = renderToStaticMarkup(await ProfilePage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('ada@sovereign.local');
    expect(html).toContain('value="Ada Lovelace"');
    expect(html).toContain('src="/api/avatars/u1?v=abc"');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    getSession.mockResolvedValue({
      user: { id: 'u1', name: 'Ada', email: 'a@sovereign.local', image: null },
    });
    expect(renderToStaticMarkup(await ProfilePage())).not.toMatch(/<script|<style|style="/);
  });
});
