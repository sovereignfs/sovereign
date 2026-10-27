import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { signOut: vi.fn() } }));

const { default: Page } = await import('../../app/page');

beforeEach(() => getSession.mockReset());

describe('the home page', () => {
  async function render() {
    getSession.mockResolvedValue({ user: { name: 'Ada Lovelace', email: 'ada@example.com' } });
    return renderToStaticMarkup(await Page());
  }

  it('says what it is, in one level-one heading, and who is signed in', async () => {
    const html = await render();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Sovereign Core');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
  });

  it('offers to sign out', async () => {
    expect(await render()).toContain('Sign out');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    expect(await render()).not.toMatch(/<script|<style|style="/);
  });

  it('sends a visitor with no valid session to sign-in, whatever the proxy let through', async () => {
    getSession.mockResolvedValue(null);
    await expect(Page()).rejects.toMatchObject({ digest: expect.stringContaining('/sign-in') });
  });
});
