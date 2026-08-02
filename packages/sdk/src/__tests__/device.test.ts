import { describe, expect, it, vi } from 'vitest';

function mockHeaders(values: Record<string, string>): void {
  vi.doMock('next/headers', () => ({
    headers: async () => new Headers(values),
  }));
}

describe('device', () => {
  it('getSurface() returns the injected surface', async () => {
    vi.resetModules();
    mockHeaders({ 'x-sovereign-surface': 'mobile' });
    const { device } = await import('../device');

    expect(await device.getSurface()).toBe('mobile');
  });

  it('getSurface() returns browser when the header is absent', async () => {
    vi.resetModules();
    mockHeaders({});
    const { device } = await import('../device');

    expect(await device.getSurface()).toBe('browser');
  });

  it('getSurface() returns browser for an unrecognized value, never throws', async () => {
    vi.resetModules();
    mockHeaders({ 'x-sovereign-surface': 'toaster' });
    const { device } = await import('../device');

    expect(await device.getSurface()).toBe('browser');
  });

  it('getShellVersion() returns the injected version, or null when absent', async () => {
    vi.resetModules();
    mockHeaders({ 'x-sovereign-shell-version': '1.2.3' });
    const { device } = await import('../device');

    expect(await device.getShellVersion()).toBe('1.2.3');

    vi.resetModules();
    mockHeaders({});
    const { device: deviceNoVersion } = await import('../device');

    expect(await deviceNoVersion.getShellVersion()).toBeNull();
  });

  it('isNativeShell() is true for mobile/desktop, false for browser', async () => {
    vi.resetModules();
    mockHeaders({ 'x-sovereign-surface': 'desktop' });
    const { device: desktopDevice } = await import('../device');
    expect(await desktopDevice.isNativeShell()).toBe(true);

    vi.resetModules();
    mockHeaders({});
    const { device: browserDevice } = await import('../device');
    expect(await browserDevice.isNativeShell()).toBe(false);
  });
});
