// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotificationsPage from '../page';

const PREFS = { mutedCategories: ['announcement'], pollIntervalSecs: 30 };
const PUSH = { pushEnabled: false, subscribed: false, publicKey: null };

function mockFetch(overrides?: { patchPrefs?: Record<string, unknown> }) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/notification-prefs') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as Partial<typeof PREFS>;
      const merged = { ...PREFS, ...overrides?.patchPrefs, ...body };
      return Promise.resolve(new Response(JSON.stringify({ prefs: merged }), { status: 200 }));
    }
    if (url.includes('/notification-prefs')) {
      return Promise.resolve(new Response(JSON.stringify({ prefs: PREFS }), { status: 200 }));
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
