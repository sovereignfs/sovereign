import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) }));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/console',
}));

const { default: ConsoleLayout } = await import('../../app/console/layout');
const { default: ConsolePage } = await import('../../app/console/page');

const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'u1', role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

beforeEach(() => getSession.mockReset().mockResolvedValue(null));

describe('the Console’s frame', () => {
  it('shows an operator the navigation beside the page', async () => {
    as(ROLE_ADMIN);
    const html = renderToStaticMarkup(await ConsoleLayout({ children: <p>the page</p> }));
    expect(html).toContain('the page');
    expect(html).toContain('aria-label="Console sections"');
    expect(html).toContain('href="/console"');
  });

  it.each([ROLE_USER, undefined, 'platform:superuser'])(
    'shows %j a page that is not there, and nothing of the Console',
    async (role) => {
      as(role);
      expect((await failure(() => ConsoleLayout({ children: <p>secret</p> })))?.digest).toBe(
        'NEXT_HTTP_ERROR_FALLBACK;404',
      );
    },
  );

  it('sends someone who is not signed in to sign in', async () => {
    expect((await failure(() => ConsoleLayout({ children: null })))?.digest).toContain('/sign-in');
  });
});

describe('the Console’s own page', () => {
  it('says what it is, in one level-one heading, and how the person manages the instance', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await ConsolePage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('You manage this instance as the owner.');
    as(ROLE_ADMIN);
    expect(renderToStaticMarkup(await ConsolePage())).toContain('as an admin.');
  });

  it('says so when there is nothing to open yet, rather than leaving an empty page', async () => {
    as(ROLE_ADMIN);
    const html = renderToStaticMarkup(await ConsolePage());
    expect(html).toContain('There is nothing to manage here yet.');
  });

  it.each([ROLE_USER, undefined])(
    'checks for itself, whatever the layout did: %j',
    async (role) => {
      as(role);
      expect((await failure(() => ConsolePage()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    },
  );

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as(ROLE_ADMIN);
    expect(renderToStaticMarkup(await ConsolePage())).not.toMatch(/<script|<style|style="/);
  });
});
