// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotificationsPage from '../page';

const PREFS = {
  mutedCategories: ['announcement'],
  pollIntervalSecs: 30,
  communicationEmail: false,
};
const PUSH = { pushEnabled: false, subscribed: false, publicKey: null };

function mockFetch(overrides?: {
  patchPrefs?: Record<string, unknown>;
  pollingActive?: boolean;
  initialPrefs?: Record<string, unknown>;
}) {
  const pollingActive = overrides?.pollingActive ?? true;
  const initialPrefs = { ...PREFS, ...overrides?.initialPrefs };
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/notification-prefs') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as Partial<typeof PREFS>;
      const merged = { ...initialPrefs, ...overrides?.patchPrefs, ...body };
      return Promise.resolve(
        new Response(JSON.stringify({ prefs: merged, pollingActive }), { status: 200 }),
      );
    }
    if (url.includes('/notification-prefs')) {
      return Promise.resolve(
        new Response(JSON.stringify({ prefs: initialPrefs, pollingActive }), { status: 200 }),
      );
    }
    if (url.includes('/push-subscription')) {
      return Promise.resolve(new Response(JSON.stringify(PUSH), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotificationsPage — preference update behavior', () => {
  it('loads and reflects the current muted-category state', async () => {
    render(<NotificationsPage />);

    const checkbox = await screen.findByRole('checkbox', { name: /Announcements/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    const infoCheckbox = screen.getByRole('checkbox', { name: /^Info$/ });
    expect((infoCheckbox as HTMLInputElement).checked).toBe(false);
  });

  it('un-mutes a category and PATCHes the new mutedCategories list', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<NotificationsPage />);

    const checkbox = await screen.findByRole('checkbox', { name: /Announcements/ });
    fireEvent.click(checkbox);

    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
        mutedCategories: [],
      });
    });
  });

  it('mutes a previously-unmuted category and PATCHes the addition', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<NotificationsPage />);

    const infoCheckbox = await screen.findByRole('checkbox', { name: /^Info$/ });
    fireEvent.click(infoCheckbox);

    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
        mutedCategories: ['announcement', 'info'],
      });
    });
  });
});

describe('NotificationsPage — communication email preference (RFC 0062 §6)', () => {
  it('loads unchecked by default', async () => {
    render(<NotificationsPage />);

    const checkbox = await screen.findByRole('checkbox', {
      name: /Email me about broadcasts and admin messages/,
    });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('reflects an already-opted-in preference on load', async () => {
    vi.stubGlobal('fetch', mockFetch({ initialPrefs: { communicationEmail: true } }));
    render(<NotificationsPage />);

    const checkbox = await screen.findByRole('checkbox', {
      name: /Email me about broadcasts and admin messages/,
    });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('PATCHes communicationEmail: true when toggled on', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<NotificationsPage />);

    const checkbox = await screen.findByRole('checkbox', {
      name: /Email me about broadcasts and admin messages/,
    });
    fireEvent.click(checkbox);

    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
        communicationEmail: true,
      });
    });
  });
});

describe('NotificationsPage — poll interval visibility', () => {
  it('shows the poll interval control when the server is actually polling', async () => {
    vi.stubGlobal('fetch', mockFetch({ pollingActive: true }));
    render(<NotificationsPage />);

    expect(await screen.findByLabelText('Notification poll interval')).toBeDefined();
  });

  it('hides the poll interval control when notifications are pushed (sse/redis)', async () => {
    vi.stubGlobal('fetch', mockFetch({ pollingActive: false }));
    render(<NotificationsPage />);

    await screen.findByRole('checkbox', { name: /Announcements/ });
    expect(screen.queryByLabelText('Notification poll interval')).toBeNull();
  });
});
