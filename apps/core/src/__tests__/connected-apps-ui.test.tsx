// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedApp } from '../oauth/connected';

const remove = vi.fn();
vi.mock('../../app/connected-apps/actions', () => ({
  removeAccessAction: (...args: unknown[]) => remove(...args) as unknown,
}));
const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
const listConnectedApps = vi.fn();
vi.mock('../oauth/connected', () => ({
  listConnectedApps: (...args: unknown[]) => listConnectedApps(...args) as unknown,
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { ConnectedAppsList } = await import('../../app/connected-apps/connected-apps-list');
const { default: ConnectedAppsPage } = await import('../../app/connected-apps/page');

const app = (id: string, extra: Partial<ConnectedApp> = {}): ConnectedApp => ({
  clientId: id,
  name: `App ${id}`,
  permissions: ['See your email address'],
  since: Date.UTC(2026, 9, 1),
  ...extra,
});

beforeEach(() => {
  remove.mockReset();
  getSession.mockReset();
  listConnectedApps.mockReset().mockResolvedValue([]);
  // jsdom does not implement the dialog's showModal and close.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
});
afterEach(cleanup);

const dialog = () => {
  const open = document.querySelector('dialog[open]');
  if (!open) throw new Error('no dialog is open');
  return open as HTMLElement;
};

describe('the list of connected apps', () => {
  it('shows each app with what it was allowed, in words, and when', () => {
    render(
      <ConnectedAppsList apps={[app('1'), app('2', { permissions: [], since: undefined })]} />,
    );
    expect(screen.getByText('App 1')).toBeTruthy();
    expect(screen.getByText('See your email address')).toBeTruthy();
    expect(screen.getByText('Allowed on 1 Oct 2026.')).toBeTruthy();
    expect(screen.getByText('App 2')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Remove access' })).toHaveLength(2);
  });

  it('asks first, naming the app and what will happen, and does nothing if backed out of', () => {
    render(<ConnectedAppsList apps={[app('1')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
    expect(within(dialog()).getByText('Remove App 1’s access?')).toBeTruthy();
    expect(within(dialog()).getByText(/asks you to allow it again/)).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes that app’s access when confirmed, says so, and closes', async () => {
    remove.mockResolvedValue({
      ok: true,
      message: 'The app no longer has access to your account.',
    });
    render(<ConnectedAppsList apps={[app('1'), app('2')]} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove access' })[1] as HTMLElement);
    const asked = dialog();
    fireEvent.click(within(asked).getByRole('button', { name: 'Remove access' }));
    expect(await screen.findByText('The app no longer has access to your account.')).toBeTruthy();
    expect(remove.mock.calls[0]?.[0]).toBe('2');
    await waitFor(() => expect(asked.hasAttribute('open')).toBe(false));
  });

  it('keeps the question open to show a refusal', async () => {
    remove.mockResolvedValue({ ok: false, error: 'Something went wrong.' });
    render(<ConnectedAppsList apps={[app('1')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove access' }));
    expect(await within(dialog()).findByText('Something went wrong.')).toBeTruthy();
    expect(dialog().hasAttribute('open')).toBe(true);
  });
});

describe('the connected apps page', () => {
  it('sends someone with no session to sign in, and reads nothing', async () => {
    getSession.mockResolvedValue(null);
    await expect(ConnectedAppsPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in'),
    });
    expect(listConnectedApps).not.toHaveBeenCalled();
  });

  it('reads the apps of the signed-in person only', async () => {
    getSession.mockResolvedValue({ user: { id: 'me' } });
    renderToStaticMarkup(await ConnectedAppsPage());
    expect(listConnectedApps.mock.calls[0]?.[1]).toBe('me');
  });

  it('has one heading, and says what it means to be listed when none is', async () => {
    getSession.mockResolvedValue({ user: { id: 'me' } });
    const html = renderToStaticMarkup(await ConnectedAppsPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('No apps have asked you yet');
    expect(html).toContain('may sign you in without asking');
  });

  it('lists the apps when there are some', async () => {
    getSession.mockResolvedValue({ user: { id: 'me' } });
    listConnectedApps.mockResolvedValue([app('1')]);
    const html = renderToStaticMarkup(await ConnectedAppsPage());
    expect(html).toContain('App 1');
    expect(html).not.toContain('No apps have asked you yet');
  });
});
