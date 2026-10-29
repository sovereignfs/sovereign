import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { signOut: vi.fn() } }));
const matrix = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrix() as unknown }));

const { default: Page } = await import('../../app/page');

beforeEach(() => {
  getSession.mockReset();
  matrix.mockReset().mockResolvedValue(DEFAULT_MATRIX);
});

describe('the home page', () => {
  async function render() {
    getSession.mockResolvedValue({
      user: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'platform:user' },
    });
    return renderToStaticMarkup(await Page());
  }

  it('says what it is, in one level-one heading, and who is signed in', async () => {
    const html = await render();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Sovereign Core');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
  });

  it('links to each of the identity pages, and only those that exist', async () => {
    const html = await render();
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(['/profile', '/security', '/preferences']);
  });

  it('links to the Console for an operator, and for nobody else', async () => {
    getSession.mockResolvedValue({
      user: { name: 'Ada', email: 'ada@example.com', role: 'platform:admin' },
    });
    expect(renderToStaticMarkup(await Page())).toContain('href="/console"');
    expect(await render()).not.toContain('/console');
    getSession.mockResolvedValue({
      user: { name: 'Ada', email: 'ada@example.com', role: 'platform:owner' },
    });
    expect(renderToStaticMarkup(await Page())).toContain('href="/console"');
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
