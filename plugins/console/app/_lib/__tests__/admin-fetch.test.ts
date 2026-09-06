import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-sovereign-user-id': 'admin-1' })),
}));

const { adminApiBase, adminFetch } = await import('../admin-fetch');

beforeEach(() => {
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  process.env.RUNTIME_PORT = '3999';
  process.env.SOVEREIGN_AUTH_URL = 'http://auth.internal:4000';
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RUNTIME_PORT;
  delete process.env.SOVEREIGN_AUTH_URL;
});

describe('adminFetch', () => {
  it('targets the runtime by default with the admin bearer and JSON content type', async () => {
    await adminFetch('/api/admin/groups', { method: 'POST', body: '{}' });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3999/api/admin/groups',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-admin-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('targets the auth server for api: "auth"', async () => {
    await adminFetch('/api/admin/users', { api: 'auth' });
    expect(fetch).toHaveBeenCalledWith(
      'http://auth.internal:4000/api/admin/users',
      expect.anything(),
    );
  });

  it('forwards the acting admin only when asked', async () => {
    await adminFetch('/api/admin/groups');
    const [, plain] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit];
    expect((plain.headers as Record<string, string>)['x-sovereign-user-id']).toBeUndefined();

    await adminFetch('/api/admin/groups', { actor: true });
    const [, withActor] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[1] as [string, RequestInit];
    expect((withActor.headers as Record<string, string>)['x-sovereign-user-id']).toBe('admin-1');
  });

  it('lets a caller override a default header', async () => {
    await adminFetch('/api/instance/logo', { headers: { 'Content-Type': 'text/plain' } });
    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  it('adminApiBase falls back to the local auth port when SOVEREIGN_AUTH_URL is unset', () => {
    delete process.env.SOVEREIGN_AUTH_URL;
    process.env.AUTH_PORT = '3101';
    expect(adminApiBase('auth')).toBe('http://localhost:3101');
    delete process.env.AUTH_PORT;
  });
});
