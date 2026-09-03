// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DataPage from '../page';

// jsdom doesn't implement <dialog>'s showModal()/close() — DataPage always
// mounts DeleteAccountSection's ConfirmDialog (visibility is a prop, not
// conditional rendering), so this must exist before anything in this file
// renders the page.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

const GRANT = {
  id: 'grant-1',
  consumerId: 'fs.sovereign.tasks',
  providerId: 'fs.sovereign.docs',
  contract: 'docs.read',
  version: 1,
  grantedAt: 1700000000,
};

const DEVICE_GRANT = {
  userId: 'user-1',
  pluginId: 'fs.sovereign.tasks',
  capability: 'notifications.native',
  grantedAt: 1700000000,
};

const SECRET = {
  id: 'secret-1',
  pluginId: 'fs.sovereign.tasks',
  scope: 'user' as const,
  label: 'API key',
  createdAt: 1700000000,
  updatedAt: 1700000000,
  lastUsedAt: null,
};

const CONNECTION = {
  id: 'conn-1',
  pluginId: 'fs.sovereign.tasks',
  scope: 'user' as const,
  provider: 'google',
  label: 'Google Calendar',
  status: 'connected' as const,
  updatedAt: 1700000000,
  lastUsedAt: null,
  metadata: { baseUrl: 'https://example-provider.test/api/v1' },
};

const PENDING_REQUEST = {
  consumerId: 'fs.sovereign.ledger',
  consumerName: 'Ledger',
  providerId: 'fs.sovereign.docs',
  providerName: 'Docs',
  contract: 'docs.read',
  version: 1,
  description: 'Document titles and folder structure, no file contents.',
};

function mockFetch(overrides?: {
  deleteGrant?: 'ok' | 'fail' | 'reject';
  deleteDeviceGrant?: 'ok' | 'fail' | 'reject';
  deleteSecret?: 'ok' | 'fail' | 'reject';
  deleteConnection?: 'ok' | 'fail' | 'reject';
  createGrant?: 'ok' | 'fail' | 'reject';
  pending?: (typeof PENDING_REQUEST)[];
}) {
  // Stateful, not a static response: a successful POST removes the matching
  // request from what the next GET returns, mirroring the real backend
  // (grant created → no longer pending) — needed because `allowRequest`
  // re-fetches after a successful POST, and a static mock would silently
  // re-add the row the UI just optimistically removed.
  let pending = overrides?.pending ?? [];
  // Also stateful: disconnecting CONNECTION mirrors disconnectPluginConnection's
  // real atomic side effect of deleting its linked secret server-side — a
  // successful connection DELETE removes SECRET from what the next secrets
  // GET returns, so a static mock can't silently mask a UI that never
  // re-fetches secrets after a disconnect.
  let secrets = [SECRET];
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/account/data-grants' && init?.method === 'POST') {
      const mode = overrides?.createGrant ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      if (mode === 'ok') {
        const body = JSON.parse(init.body as string) as { consumerId: string; contract: string };
        pending = pending.filter(
          (r) => !(r.consumerId === body.consumerId && r.contract === body.contract),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'grant-2' }), { status: mode === 'ok' ? 201 : 500 }),
      );
    }
    if (url.includes('/api/account/data-grants') && init?.method === 'DELETE') {
      const mode = overrides?.deleteGrant ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      return Promise.resolve(new Response('{}', { status: mode === 'ok' ? 200 : 500 }));
    }
    if (url === '/api/account/data-grants') {
      return Promise.resolve(
        new Response(JSON.stringify({ grants: [GRANT], pending }), { status: 200 }),
      );
    }
    if (url.includes('/api/account/device-grants') && init?.method === 'DELETE') {
      const mode = overrides?.deleteDeviceGrant ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      return Promise.resolve(new Response('{}', { status: mode === 'ok' ? 200 : 500 }));
    }
    if (url === '/api/account/device-grants') {
      return Promise.resolve(
        new Response(JSON.stringify({ grants: [DEVICE_GRANT] }), { status: 200 }),
      );
    }
    if (url.includes('/api/account/secrets') && init?.method === 'DELETE') {
      const mode = overrides?.deleteSecret ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      return Promise.resolve(new Response('{}', { status: mode === 'ok' ? 200 : 500 }));
    }
    if (url === '/api/account/secrets') {
      return Promise.resolve(new Response(JSON.stringify({ secrets }), { status: 200 }));
    }
    if (url.includes('/api/account/connections') && init?.method === 'DELETE') {
      const mode = overrides?.deleteConnection ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      if (mode === 'ok') {
        secrets = secrets.filter((s) => s.id !== SECRET.id);
      }
      return Promise.resolve(new Response('{}', { status: mode === 'ok' ? 200 : 500 }));
    }
    if (url === '/api/account/connections') {
      return Promise.resolve(
        new Response(JSON.stringify({ connections: [CONNECTION] }), { status: 200 }),
      );
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

describe('DataPage — data access consents error feedback', () => {
  it('shows an inline error and keeps the row when revoke fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteGrant: 'fail' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[0]);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not revoke this consent — please try again.',
    );
    expect(screen.getByText('Read docs.read')).toBeDefined();
  });

  it('catches a rejected fetch without an unhandled rejection and shows an error', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteGrant: 'reject' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[0]);

    expect((await screen.findByRole('alert')).textContent).toContain('network down');
  });
});

describe('DataPage — device app permissions error feedback', () => {
  it('shows an inline error and keeps the row when revoke fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteDeviceGrant: 'fail' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[1]);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not revoke this permission — please try again.',
    );
  });

  it('catches a rejected fetch without an unhandled rejection and shows an error', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteDeviceGrant: 'reject' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[1]);

    expect((await screen.findByRole('alert')).textContent).toContain('network down');
  });
});

describe('DataPage — connected accounts error feedback', () => {
  it('shows an inline error and keeps the row when disconnect fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteConnection: 'fail' }));
    render(<DataPage />);

    const disconnectButton = await screen.findByRole('button', { name: 'Disconnect' });
    fireEvent.click(disconnectButton);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not disconnect this account — please try again.',
    );
  });

  it('catches a rejected fetch without an unhandled rejection and shows an error', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteConnection: 'reject' }));
    render(<DataPage />);

    const disconnectButton = await screen.findByRole('button', { name: 'Disconnect' });
    fireEvent.click(disconnectButton);

    expect((await screen.findByRole('alert')).textContent).toContain('network down');
  });

  it('refreshes the saved app credentials list after a successful disconnect, since disconnectPluginConnection atomically deletes the linked secret server-side', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<DataPage />);

    await screen.findByText('Google Calendar');
    expect(screen.getByText('API key')).toBeDefined();

    const disconnectButton = screen.getByRole('button', { name: 'Disconnect' });
    fireEvent.click(disconnectButton);

    // The connection row is removed optimistically (no wait needed)...
    await waitFor(() => expect(screen.queryByText('Google Calendar')).toBeNull());
    // ...and the now-stale secret disappears too, once the follow-up
    // secrets refetch resolves — this is the regression this test guards.
    await waitFor(() => expect(screen.queryByText('API key')).toBeNull());
  });
});

describe('DataPage — saved app credentials error feedback', () => {
  it('shows an inline error and keeps the row when revoke fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteSecret: 'fail' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[revokeButtons.length - 1]);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not revoke this credential — please try again.',
    );
  });

  it('catches a rejected fetch without an unhandled rejection and shows an error', async () => {
    vi.stubGlobal('fetch', mockFetch({ deleteSecret: 'reject' }));
    render(<DataPage />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });
    fireEvent.click(revokeButtons[revokeButtons.length - 1]);

    expect((await screen.findByRole('alert')).textContent).toContain('network down');
  });
});

describe('DataPage — connected accounts metadata disclosure (GDPR-4)', () => {
  it('surfaces a connection’s plugin-disclosed metadata (e.g. the external endpoint it talks to)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<DataPage />);

    await screen.findByText('Google Calendar');
    expect(screen.getByText('baseUrl: https://example-provider.test/api/v1')).toBeDefined();
  });
});

describe('DataPage — pending data-sharing requests (GDPR-3)', () => {
  it('renders nothing for the section when there are no pending requests', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<DataPage />);

    await screen.findByText('Read docs.read');
    expect(screen.queryByText('Pending data-sharing requests')).toBeNull();
  });

  it('shows the provider-declared description, not caller-supplied copy, and removes the row on Allow', async () => {
    vi.stubGlobal('fetch', mockFetch({ pending: [PENDING_REQUEST] }));
    render(<DataPage />);

    await screen.findByText('Pending data-sharing requests');
    expect(screen.getByText(/Ledger/)).toBeDefined();
    expect(screen.getByText(/Docs/)).toBeDefined();
    expect(
      screen.getByText('Document titles and folder structure, no file contents.'),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

    // The stateful mock's next GET (triggered by allowRequest's own reload)
    // no longer returns this request, mirroring a real grant having been
    // created — the section disappearing here is the regression this
    // guards: a static-response mock would silently re-add the row after
    // the reload, since the reload's GET would still return it as pending.
    await waitFor(() => {
      expect(screen.queryByText('Pending data-sharing requests')).toBeNull();
    });
  });

  it('dismisses a request on Deny without creating a grant', async () => {
    const fetchMock = mockFetch({ pending: [PENDING_REQUEST] });
    vi.stubGlobal('fetch', fetchMock);
    render(<DataPage />);

    await screen.findByText('Pending data-sharing requests');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByText('Pending data-sharing requests')).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('shows an inline error and keeps the request when granting fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ pending: [PENDING_REQUEST], createGrant: 'fail' }));
    render(<DataPage />);

    await screen.findByText('Pending data-sharing requests');
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not grant this request — please try again.',
    );
    expect(screen.getByText('Pending data-sharing requests')).toBeDefined();
  });
});
