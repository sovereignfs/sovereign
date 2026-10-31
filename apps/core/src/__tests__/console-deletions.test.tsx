import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../auth/authorize';
import { ROLE_ADMIN, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({ run: vi.fn() }) }));
const listUndelivered = vi.fn();
const resolveNotice = vi.fn();
vi.mock('../accounts/deletion-delivery', async (original) => ({
  ...(await original<typeof import('../accounts/deletion-delivery')>()),
  listUndelivered: (...args: unknown[]) => listUndelivered(...args) as unknown,
  resolveNotice: (...args: unknown[]) => resolveNotice(...args) as unknown,
}));

const { default: DeletionsPage, failureText } = await import('../../app/console/deletions/page');
const actions = await import('../../app/console/deletions/actions');

const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'x', role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};
const visible = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ');
const NOTICE = {
  id: 'n1',
  clientId: 'c1',
  appName: 'Reminders',
  subStart: 'abcd1234',
  deletedAt: Date.UTC(2026, 9, 30, 9, 0),
  state: 'pending' as const,
  attempts: 3,
  nextAttemptAt: Date.UTC(2026, 9, 31, 9, 0),
  lastFailure: 'http_503',
};

beforeEach(() => {
  getSession.mockReset();
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  listUndelivered.mockReset().mockResolvedValue({ notices: [NOTICE], givenUp: 0 });
  resolveNotice.mockReset();
});

describe('the Deletions page', () => {
  it('is not there for someone who cannot manage apps, and is for an admin', async () => {
    as(ROLE_USER);
    expect((await failure(() => DeletionsPage()))?.digest).toContain('404');
    expect(listUndelivered).not.toHaveBeenCalled();
    as(ROLE_ADMIN);
    expect(visible(renderToStaticMarkup(await DeletionsPage()))).toContain('Deletions');
  });

  it('lists each notice with the app, the start of the ID, the state, the tries and the problem in words', async () => {
    as(ROLE_ADMIN);
    const text = visible(renderToStaticMarkup(await DeletionsPage()));
    expect(text).toContain('Reminders');
    expect(text).toContain('abcd1234…');
    expect(text).toContain('Next try');
    expect(text).toContain('The app answered 503');
    expect(text).not.toContain('http_503');
  });

  it('says so, with an invitation to nothing, when nothing is waiting', async () => {
    as(ROLE_ADMIN);
    listUndelivered.mockResolvedValue({ notices: [], givenUp: 0 });
    expect(visible(renderToStaticMarkup(await DeletionsPage()))).toContain('Nothing waiting');
  });

  it('warns when notices were given up, so an app that never answers is not only in a log', async () => {
    as(ROLE_ADMIN);
    listUndelivered.mockResolvedValue({
      notices: [{ ...NOTICE, state: 'given_up', nextAttemptAt: null }],
      givenUp: 1,
    });
    const text = visible(renderToStaticMarkup(await DeletionsPage()));
    expect(text).toContain('One notice was given up after 30 days');
    expect(text).toContain('Given up');
  });

  it('puts the failure kinds into words', () => {
    expect(failureText(null)).toBe('Not tried yet');
    expect(failureText('timeout')).toBe('No answer in five seconds');
    expect(failureText('network')).toBe('Could not reach the app');
    expect(failureText('no_address')).toContain('no longer has');
    expect(failureText('http_500')).toBe('The app answered 500');
    expect(failureText('something')).toBe('Failed');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as(ROLE_ADMIN);
    expect(renderToStaticMarkup(await DeletionsPage())).not.toMatch(/<script|<style|style="/);
  });
});

describe('marking a notice done', () => {
  it('needs someone who can manage apps, first', async () => {
    as(ROLE_USER);
    await expect(actions.resolveNoticeAction('n1')).rejects.toBeInstanceOf(AuthorizationError);
    expect(resolveNotice).not.toHaveBeenCalled();
  });

  it('marks the notice by its id, and says when it was already done', async () => {
    as(ROLE_ADMIN);
    resolveNotice.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await actions.resolveNoticeAction('n1')).toEqual({
      ok: true,
      message: 'Marked as done.',
    });
    expect(resolveNotice).toHaveBeenCalledWith(expect.anything(), 'n1');
    expect(await actions.resolveNoticeAction('n1')).toMatchObject({ ok: false });
  });
});
