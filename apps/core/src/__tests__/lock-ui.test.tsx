// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The lock's two pieces in a page (RFC 0006 B1, B2): the setting on the Security page, and the watcher on every signed-in page of a
// device with a lock. The server's side is tested in lock-actions.test.ts and lock-session.test.ts.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const lockChallenge = vi.fn();
const saveLock = vi.fn();
const removeLock = vi.fn();
vi.mock('../../app/security/lock-actions', () => ({
  lockChallenge: () => lockChallenge() as unknown,
  saveLock: (input: unknown) => saveLock(input) as unknown,
  removeLock: () => removeLock() as unknown,
}));
const askForPasskey = vi.fn();
vi.mock('../lock/ceremony', () => ({
  askForPasskey: (request: unknown) => askForPasskey(request) as unknown,
}));

import { LockPanel } from '../../app/security/lock-panel';
import { LockWatcher } from '../../app/lock-watcher';

afterEach(cleanup);

describe('the lock setting', () => {
  beforeEach(() => {
    for (const mock of [refresh, lockChallenge, saveLock, removeLock, askForPasskey])
      mock.mockReset();
  });

  it('asks for a passkey first when the account has none', () => {
    render(<LockPanel lock={undefined} hasPasskey={false} />);
    expect(screen.getByText(/It needs a passkey first/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add a passkey' }).getAttribute('href')).toBe(
      '/security/passkeys',
    );
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });

  it('turns on with 15 minutes unless another time is chosen, after the passkey answers', async () => {
    lockChallenge.mockResolvedValue({ challenge: 'c', rpId: 'localhost', credentialIds: ['p'] });
    askForPasskey.mockResolvedValue({ answer: { id: 'p' }, credentialId: 'p', output: undefined });
    saveLock.mockResolvedValue({ ok: true });
    render(<LockPanel lock={undefined} hasPasskey />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('15');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(saveLock).toHaveBeenCalledWith({
      idleMinutes: 15,
      onLeave: false,
      passkey: { id: 'p' },
    });
  });

  it('stays off when the passkey does not answer, and says so', async () => {
    lockChallenge.mockResolvedValue({ challenge: 'c', rpId: 'localhost', credentialIds: ['p'] });
    askForPasskey.mockResolvedValue(undefined);
    render(<LockPanel lock={undefined} hasPasskey />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(saveLock).not.toHaveBeenCalled();
  });

  it('when on, says how, changes without a passkey, and turns off, even with no passkey left', async () => {
    saveLock.mockResolvedValue({ ok: true });
    removeLock.mockResolvedValue({ ok: true });
    render(<LockPanel lock={{ idleMinutes: 5, onLeave: true }} hasPasskey={false} />);
    expect(
      screen.getByText(/locks after 5 minutes without use, and when you leave the app/),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saveLock).toHaveBeenCalledWith({ idleMinutes: 60, onLeave: true, passkey: undefined }),
    );
    expect(lockChallenge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(removeLock).toHaveBeenCalled());
  });
});

describe('the watcher', () => {
  const assign = vi.fn();
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  let hidden = false;

  beforeEach(() => {
    vi.useFakeTimers();
    assign.mockReset();
    fetchMock.mockClear();
    hidden = false;
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/security', search: '?tab=1', assign },
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const toLock = `/lock?returnTo=${encodeURIComponent('/security?tab=1')}`;

  it('shows the lock page once the idle time passes with nothing done', () => {
    render(<LockWatcher idleSeconds={60} onLeave={false} />);
    act(() => vi.advanceTimersByTime(55_000));
    expect(assign).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10_000));
    expect(assign).toHaveBeenCalledWith(toLock);
  });

  it('starts the time again on use, and tells core at most each half minute', () => {
    render(<LockWatcher idleSeconds={60} onLeave={false} />);
    act(() => vi.advanceTimersByTime(40_000));
    fireEvent.keyDown(window);
    fireEvent.pointerDown(window);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/lock/activity', {
      method: 'POST',
      keepalive: true,
    });
    act(() => vi.advanceTimersByTime(40_000));
    expect(assign).not.toHaveBeenCalled();
  });

  it('locks on leaving the app only when asked, and shows the lock page on coming back', () => {
    const { unmount } = render(<LockWatcher idleSeconds={900} onLeave={false} />);
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    unmount();

    render(<LockWatcher idleSeconds={900} onLeave />);
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledWith('/api/lock/leave', { method: 'POST', keepalive: true });
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(assign).toHaveBeenCalledWith(toLock);
  });
});
