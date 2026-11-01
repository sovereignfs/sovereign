import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import type { InviteSummary } from '../invites/manage';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
const listInvites = vi.fn();
vi.mock('../invites/manage', () => ({
  listInvites: (...args: unknown[]) => listInvites(...args) as unknown,
}));
vi.mock('../invites/service', () => ({
  inviteLink: (id: string) => Promise.resolve(`http://localhost:3000/invite/${id}`),
}));
const mailStatus = vi.fn();
vi.mock('../mail', () => ({
  getMailService: () => Promise.resolve({ status: () => mailStatus() as unknown }),
}));
vi.mock('../../app/console/invites/actions', () => ({
  inviteAction: vi.fn(),
  cancelInviteAction: vi.fn(),
}));

const { default: InvitesPage } = await import('../../app/console/invites/page');

const invite = (id: string, extra: Partial<InviteSummary> = {}): InviteSummary => ({
  id,
  email: `${id}@sovereign.local`,
  invitedBy: 'Ada Admin',
  createdAt: Date.UTC(2026, 9, 1, 9, 0),
  expiresAt: undefined,
  ...extra,
});
const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'x', role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  listInvites.mockReset().mockResolvedValue([]);
  mailStatus.mockReset().mockResolvedValue({ state: 'configured' });
});

describe('the invites page', () => {
  it('is for those who manage accounts, and a page that is not there for anyone else', async () => {
    as(ROLE_USER);
    expect((await failure(() => InvitesPage()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    getSession.mockResolvedValue(null);
    expect((await failure(() => InvitesPage()))?.digest).toContain('/sign-in');
    expect(listInvites).not.toHaveBeenCalled();
  });

  it('asks for user:manage itself, not only for the Console: an operator who can view accounts but not manage them gets a 404', async () => {
    as(ROLE_ADMIN);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'console:access', 'user:view']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect((await failure(() => InvitesPage()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(listInvites).not.toHaveBeenCalled();
  });

  it('has one heading, the form to invite, and an invitation to invite when none are waiting', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await InvitesPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*name="email"/);
    expect(html).toMatch(/<input[^>]*type="number"[^>]*name="days"/);
    expect(html).toContain('No invitations are waiting');
    expect(html).not.toContain('<table');
  });

  it('lists each waiting invitation with its address, who sent it, when, and when it ends', async () => {
    as(ROLE_ADMIN);
    listInvites.mockResolvedValue([
      invite('a', { expiresAt: Date.now() + 3 * 86_400_000 }),
      invite('b'),
      invite('c', { invitedBy: undefined }),
    ]);
    const html = renderToStaticMarkup(await InvitesPage());
    for (const id of ['a', 'b', 'c']) expect(html).toContain(`${id}@sovereign.local`);
    expect(html).toContain('Ada Admin');
    expect(html).toContain('Account removed');
    expect(html).toContain('Does not expire');
    expect(html).toContain('Expires ');
    expect(html).toContain('1 Oct 2026');
  });

  it('marks an invitation past its expiry, and offers no link to pass on for it', async () => {
    as(ROLE_ADMIN);
    listInvites.mockResolvedValue([invite('old', { expiresAt: Date.now() - 86_400_000 })]);
    const html = renderToStaticMarkup(await InvitesPage());
    expect(html).toContain('Expired ');
    expect(html).not.toContain('/invite/old');
  });

  it('warns that nothing is sent when email is not set up, and not otherwise', async () => {
    as(ROLE_ADMIN);
    expect(renderToStaticMarkup(await InvitesPage())).not.toContain('Email is not set up');
    mailStatus.mockResolvedValue({ state: 'unconfigured' });
    expect(renderToStaticMarkup(await InvitesPage())).toContain('Email is not set up');
    mailStatus.mockResolvedValue({ state: 'incomplete' });
    expect(renderToStaticMarkup(await InvitesPage())).toContain('Email is not set up');
  });

  it('keeps an address out of the markup as markup', async () => {
    as(ROLE_ADMIN);
    listInvites.mockResolvedValue([invite('x', { email: '"><script>alert(1)</script>@x.io' })]);
    expect(renderToStaticMarkup(await InvitesPage())).not.toContain('<script>alert');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as(ROLE_ADMIN);
    listInvites.mockResolvedValue([invite('a')]);
    // React adds one script of its own to a page with a form that posts to the server; it is stamped with the
    // page's nonce when it is served. Nothing of ours is inline.
    const html = renderToStaticMarkup(await InvitesPage()).replace(
      /<script>addEventListener\("submit".*?<\/script>/s,
      '',
    );
    expect(html).not.toMatch(/<script|<style|style="/);
  });
});
