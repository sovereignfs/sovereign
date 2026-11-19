import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderServer } from './render-server';

const lookupInvite = vi.fn();
// The pages draw the instance's mark, which reads its settings; what it draws is tested with it (instance-identity.test.tsx).
vi.mock('../instance/service', () => ({
  getInstanceIdentity: () =>
    Promise.resolve({ name: 'Acme', logoLight: undefined, logoDark: undefined }),
}));
vi.mock('../invites/manage', () => ({
  lookupInvite: (...args: unknown[]) => lookupInvite(...args) as unknown,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({ marker: 'database' }) }));
const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({
  authClient: { signOut: () => Promise.resolve({ error: null }) },
}));
vi.mock('../keys/session', () => ({ forgetKeys: () => Promise.resolve() }));

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

beforeEach(() => {
  lookupInvite.mockReset().mockResolvedValue({ state: 'invalid' });
  getSession.mockReset().mockResolvedValue(null);
});

describe('an invitation link', () => {
  it('goes on to sign-up, carrying the invitation, when it can still be used', async () => {
    lookupInvite.mockResolvedValue({ state: 'valid', email: 'a@sovereign.local' });
    const error = await failure(() => InvitePage({ params: params('abc') }));
    expect(error?.digest).toContain('/sign-up?invite=abc');
    expect(lookupInvite).toHaveBeenCalledWith({ marker: 'database' }, 'abc', expect.any(Number));
  });

  it('carries an id that needs escaping without letting it change the address', async () => {
    lookupInvite.mockResolvedValue({ state: 'valid', email: 'a@sovereign.local' });
    const error = await failure(() => InvitePage({ params: params('a&returnTo=//evil.example') }));
    expect(error?.digest).toContain('/sign-up?invite=a%26returnTo%3D%2F%2Fevil.example');
  });

  it('says the link does not work when it does not, in one level-one heading', async () => {
    const html = await renderServer(await InvitePage({ params: params('abc') }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('This invitation link does not work');
    expect(html).toContain('expired, been cancelled or already been used');
    expect(html).toContain('href="/sign-in"');
    expect(metadata.title).toBe('Invitation');
  });

  it('shows the same page whatever made the link invalid, and never an address', async () => {
    lookupInvite.mockResolvedValue({ state: 'invalid' });
    const unknown = await renderServer(await InvitePage({ params: params('unknown') }));
    const other = await renderServer(await InvitePage({ params: params('another') }));
    expect(unknown).toBe(other);
    expect(unknown).not.toMatch(/@/);
  });

  it('tells someone already signed in whose account they are in and whom it is for, and offers both ways on', async () => {
    lookupInvite.mockResolvedValue({ state: 'valid', email: 'new@sovereign.local' });
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'ada@sovereign.local' } });
    const html = await renderServer(await InvitePage({ params: params('abc') }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('already signed in');
    expect(html).toContain('ada@sovereign.local');
    expect(html).toContain('new@sovereign.local');
    expect(html).toContain('href="/"');
    expect(html).toContain('Sign out and use the invitation');
  });

  it('shows someone signed in the same page as anyone for a link that does not work', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'ada@sovereign.local' } });
    const html = await renderServer(await InvitePage({ params: params('abc') }));
    expect(html).toContain('This invitation link does not work');
    expect(html).not.toContain('ada@sovereign.local');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    expect(await renderServer(await InvitePage({ params: params('abc') }))).not.toMatch(
      /<script|<style|style="/,
    );
  });
});
