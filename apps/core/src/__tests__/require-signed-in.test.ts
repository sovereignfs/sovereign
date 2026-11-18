import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

const { requireSignedIn, sendOnIfSignedIn } = await import('../auth/require-signed-in');

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

beforeEach(() => getSession.mockReset().mockResolvedValue(null));

describe('requireSignedIn', () => {
  it('is the session when there is one', async () => {
    const session = { user: { id: 'u1' } };
    getSession.mockResolvedValue(session);
    expect(await requireSignedIn('/security')).toBe(session);
  });

  it('sends someone with no session to sign in, and back to the page', async () => {
    expect((await failure(() => requireSignedIn('/security')))?.digest).toContain(
      '/sign-in?returnTo=%2Fsecurity',
    );
  });

  it('keeps the page’s query on the way back', async () => {
    expect((await failure(() => requireSignedIn('/consent?client_id=a&b=1')))?.digest).toContain(
      `/sign-in?returnTo=${encodeURIComponent('/consent?client_id=a&b=1')}`,
    );
  });

  it('adds nothing for the launcher', async () => {
    const digest = (await failure(() => requireSignedIn('/')))?.digest ?? '';
    expect(digest).toContain(';/sign-in;');
  });
});

describe('sendOnIfSignedIn', () => {
  it('lets someone with no session see the page', async () => {
    await expect(sendOnIfSignedIn('/files')).resolves.toBeUndefined();
  });

  it('sends someone signed in on to where they were going', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    expect((await failure(() => sendOnIfSignedIn('/files')))?.digest).toContain(';/files;');
  });

  it('shows the form when an app asked for a fresh sign-in, without looking at the session', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(sendOnIfSignedIn('/', { sig: 'signature' })).resolves.toBeUndefined();
    expect(getSession).not.toHaveBeenCalled();
  });
});
