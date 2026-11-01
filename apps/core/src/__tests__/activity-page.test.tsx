import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const service = vi.hoisted(() => ({ apps: vi.fn(), list: vi.fn() }));
vi.mock('../activity', () => ({ getActivityService: () => Promise.resolve(service) }));
vi.mock('../../app/activity/actions', () => ({
  deleteActivityAction: vi.fn(),
  deleteAllActivityAction: vi.fn(),
}));

const { default: ActivityPage } = await import('../../app/activity/page');

const APPS = [
  { clientId: 'a', name: 'Reminders', count: 2 },
  { clientId: 'b', name: 'Photos', count: 1 },
];
const ENTRY = {
  id: 'e1',
  clientId: 'a',
  appName: 'Reminders',
  summary: 'You completed <b>Water</b> the plants',
  link: 'https://reminders.sovereign.local/tasks/3',
  at: Date.UTC(2026, 9, 30, 22, 30),
};
const search = (app?: string) => Promise.resolve(app === undefined ? {} : { app });

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ user: { id: 'ada', timezone: 'Europe/Paris' } });
  service.apps.mockReset().mockResolvedValue(APPS);
  service.list.mockReset().mockResolvedValue([ENTRY]);
});

describe('the Activity page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    getSession.mockResolvedValue(null);
    await expect(ActivityPage({ searchParams: search() })).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Factivity'),
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it('reads the session’s own account, and says who can read it', async () => {
    const html = renderToStaticMarkup(await ActivityPage({ searchParams: search() }));
    expect(service.apps).toHaveBeenCalledWith('ada');
    expect(service.list).toHaveBeenCalledWith('ada', {});
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Only you can read this');
  });

  it('shows each entry with its app, its text as text, when it happened in the person’s zone, and its link', async () => {
    const html = renderToStaticMarkup(await ActivityPage({ searchParams: search() }));
    expect(html).toContain('Reminders');
    expect(html).toContain('You completed &lt;b&gt;Water&lt;/b&gt; the plants');
    expect(html).not.toContain('<b>Water</b>');
    // 22:30 UTC on 30 October 2026 is 23:30 in Paris (the clocks went back on the 25th).
    expect(html).toContain('30 Oct 2026');
    expect(html).toContain('23:30');
    expect(html).toContain('href="https://reminders.sovereign.local/tasks/3"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('limits itself to one app the person has entries from, and ignores a name it does not know', async () => {
    renderToStaticMarkup(await ActivityPage({ searchParams: search('b') }));
    expect(service.list).toHaveBeenLastCalledWith('ada', { clientId: 'b' });
    renderToStaticMarkup(await ActivityPage({ searchParams: search('someone-elses') }));
    expect(service.list).toHaveBeenLastCalledWith('ada', {});
  });

  it('offers to choose an app only when more than one has recorded something', async () => {
    expect(renderToStaticMarkup(await ActivityPage({ searchParams: search() }))).toContain(
      'All apps',
    );
    service.apps.mockResolvedValue([APPS[0]]);
    expect(renderToStaticMarkup(await ActivityPage({ searchParams: search() }))).not.toContain(
      'All apps',
    );
  });

  it('invites rather than shows an empty list when nothing is recorded', async () => {
    service.apps.mockResolvedValue([]);
    service.list.mockResolvedValue([]);
    const html = renderToStaticMarkup(await ActivityPage({ searchParams: search() }));
    expect(html).toContain('Nothing to show yet');
    expect(html).not.toContain('Delete all');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    expect(renderToStaticMarkup(await ActivityPage({ searchParams: search() }))).not.toMatch(
      /<script|<style|style="/,
    );
  });
});
