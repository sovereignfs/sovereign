// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ago } from '../../app/notifications-bell';

const { NotificationsBell } = await import('../../app/notifications-bell');

const NOW = 1_800_000_000_000;
const item = (extra: Record<string, unknown> = {}) => ({
  id: 'n1',
  appName: 'Reminders',
  title: 'Due today',
  body: null,
  url: 'https://reminders.sovereign.local/tasks/3',
  category: 'info',
  createdAt: Date.now() - 5 * 60_000,
  readAt: null,
  ...extra,
});

const fetchMock = vi.fn();
const answer = (body: unknown, ok = true) =>
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'POST'
        ? new Response(JSON.stringify({ ok: true }))
        : new Response(JSON.stringify(body), { status: ok ? 200 : 401 }),
    ),
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const open = async () => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
};

describe('how long ago', () => {
  it('says it in a person’s words', () => {
    expect(ago(NOW - 5_000, NOW)).toBe('Just now');
    expect(ago(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(ago(NOW - 30 * 3_600_000, NOW)).toBe('Yesterday');
    expect(ago(NOW - 4 * 86_400_000, NOW)).toBe('4 days ago');
    expect(ago(NOW + 10_000, NOW)).toBe('Just now');
  });
});

describe('the bell', () => {
  it('asks when the page loads, and shows how many are unread', async () => {
    answer({ unread: 3, notifications: [item()] });
    render(<NotificationsBell />);
    expect(await screen.findByRole('button', { name: 'Notifications (3 unread)' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications', { cache: 'no-store' });
  });

  it('shows each as the app and what it said, as text, with a link to where it goes', async () => {
    answer({
      unread: 1,
      notifications: [item({ title: '<b>Due</b> today', body: 'Water the plants' })],
    });
    render(<NotificationsBell />);
    await open();
    const link = await screen.findByRole('link', {
      name: /Reminders: <b>Due<\/b> today\. Water the plants/,
    });
    expect(link.getAttribute('href')).toBe('https://reminders.sovereign.local/tasks/3');
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('5 min ago')).toBeDefined();
  });

  it('does not follow a link that is not a web address', async () => {
    answer({ unread: 1, notifications: [item({ url: 'javascript:alert(1)' })] });
    render(<NotificationsBell />);
    await open();
    await screen.findByText(/Reminders: Due today/);
    expect(screen.queryByRole('link', { name: /Due today/ })).toBeNull();
  });

  it('marks one read when it is opened, and dismisses it when told to', async () => {
    answer({ unread: 1, notifications: [item()] });
    render(<NotificationsBell />);
    await open();
    fireEvent.click(await screen.findByRole('link', { name: /Due today/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'read', id: 'n1' }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss: / }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({ body: JSON.stringify({ action: 'dismiss', id: 'n1' }) }),
      ),
    );
  });

  it('marks all read and clears all', async () => {
    answer({ unread: 2, notifications: [item(), item({ id: 'n2' })] });
    render(<NotificationsBell />);
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => {
      const bodies = fetchMock.mock.calls.map((call) => (call[1] as RequestInit | undefined)?.body);
      expect(bodies).toContain(JSON.stringify({ action: 'read-all' }));
      expect(bodies).toContain(JSON.stringify({ action: 'dismiss-all' }));
    });
  });

  it('asks again every minute while the page is visible, and not while it is hidden', async () => {
    vi.useFakeTimers();
    answer({ unread: 0, notifications: [] });
    render(<NotificationsBell />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock.mock.calls.length).toBe(first + 1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchMock.mock.calls.length).toBe(first + 1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('shows nothing wrong when core cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<NotificationsBell />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeDefined();
  });
});
