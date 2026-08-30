// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
};

function mockFetch(overrides?: {
  deleteGrant?: 'ok' | 'fail' | 'reject';
  deleteDeviceGrant?: 'ok' | 'fail' | 'reject';
  deleteSecret?: 'ok' | 'fail' | 'reject';
  deleteConnection?: 'ok' | 'fail' | 'reject';
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/account/data-grants') && init?.method === 'DELETE') {
      const mode = overrides?.deleteGrant ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
      return Promise.resolve(new Response('{}', { status: mode === 'ok' ? 200 : 500 }));
    }
    if (url === '/api/account/data-grants') {
      return Promise.resolve(new Response(JSON.stringify({ grants: [GRANT] }), { status: 200 }));
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
      return Promise.resolve(new Response(JSON.stringify({ secrets: [SECRET] }), { status: 200 }));
    }
    if (url.includes('/api/account/connections') && init?.method === 'DELETE') {
      const mode = overrides?.deleteConnection ?? 'ok';
      if (mode === 'reject') return Promise.reject(new Error('network down'));
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
