import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupInvite = vi.fn();
vi.mock('../invites/manage', () => ({
  lookupInvite: (...args: unknown[]) => lookupInvite(...args) as unknown,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({ marker: 'database' }) }));

const { default: InvitePage, metadata } = await import('../../app/(auth)/invite/[id]/page');

const params = (id: string) => Promise.resolve({ id });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

beforeEach(() => lookupInvite.mockReset().mockResolvedValue({ state: 'invalid' }));

describe('an invitation link', () => {
  it('goes on to sign-up, carrying the invitation, when it can still be used', async () => {
    lookupInvite.mockResolvedValue({ state: 'valid', email: 'a@example.com' });
    const error = await failure(() => InvitePage({ params: params('abc') }));
    expect(error?.digest).toContain('/sign-up?invite=abc');
    expect(lookupInvite).toHaveBeenCalledWith({ marker: 'database' }, 'abc', expect.any(Number));
  });

  it('carries an id that needs escaping without letting it change the address', async () => {
    lookupInvite.mockResolvedValue({ state: 'valid', email: 'a@example.com' });
    const error = await failure(() => InvitePage({ params: params('a&returnTo=//evil.example') }));
    expect(error?.digest).toContain('/sign-up?invite=a%26returnTo%3D%2F%2Fevil.example');
  });

  it('says the link does not work when it does not, in one level-one heading', async () => {
    const html = renderToStaticMarkup(await InvitePage({ params: params('abc') }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('This invitation link does not work');
    expect(html).toContain('expired, been cancelled or already been used');
    expect(html).toContain('href="/sign-in"');
    expect(metadata.title).toBe('Invitation link not valid');
  });

  it('shows the same page whatever made the link invalid, and never an address', async () => {
    lookupInvite.mockResolvedValue({ state: 'invalid' });
    const unknown = renderToStaticMarkup(await InvitePage({ params: params('unknown') }));
    const other = renderToStaticMarkup(await InvitePage({ params: params('another') }));
    expect(unknown).toBe(other);
    expect(unknown).not.toMatch(/@/);
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    expect(renderToStaticMarkup(await InvitePage({ params: params('abc') }))).not.toMatch(
      /<script|<style|style="/,
    );
  });
});
