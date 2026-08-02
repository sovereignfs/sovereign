// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEnvironment } from '../device-client';
import { provideBridge, type BridgeImpl } from '../device-bridge';

function stubUserAgent(value: string): void {
  vi.stubGlobal('navigator', { userAgent: value });
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches } as MediaQueryList));
}

describe('readEnvironment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects the mobile shell token', () => {
    stubUserAgent('Mozilla/5.0 (iPhone) Sovereign-Shell/mobile-ios 1.0.0');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'mobile', installed: false });
  });

  it('detects the desktop shell token', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh) Sovereign-Shell/desktop-macos 2.0.0');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'desktop', installed: false });
  });

  it('falls back to browser for an ordinary User-Agent', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    stubMatchMedia(false);

    expect(readEnvironment()).toEqual({ surface: 'browser', installed: false });
  });

  it('reports installed when running as a standalone PWA', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    stubMatchMedia(true);

    expect(readEnvironment()).toEqual({ surface: 'browser', installed: true });
  });
});

const BRIDGE_SYMBOL = Symbol.for('@sovereignfs/sdk:bridge');

function nativeImpl(overrides: Partial<BridgeImpl> = {}): BridgeImpl {
  return {
    handshake: async () => ({
      protocolVersion: 1,
      shell: { name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' },
      capabilities: [{ name: 'haptics.impact', version: 1 }],
    }),
    invoke: async (capability) => ({ status: 'unavailable', capability }),
    ...overrides,
  };
}

describe('supports / getTransport / getShellInfo', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns the safe defaults before any bridge is registered', async () => {
    vi.resetModules();
    const deviceClient = await import('../device-client');

    expect(deviceClient.supports('haptics.impact')).toBe(false);
    expect(deviceClient.getTransport()).toBe('web');
    expect(deviceClient.getShellInfo()).toBeNull();
  });

  it('resolves supports()/getTransport()/getShellInfo() once the handshake settles', async () => {
    provideBridge(nativeImpl());
    vi.resetModules();
    const deviceClient = await import('../device-client');

    // First call starts the (async) handshake and reads the not-yet-ready default.
    expect(deviceClient.supports('haptics.impact')).toBe(false);
    await Promise.resolve(); // let the handshake's .then() microtask run
    await Promise.resolve();

    expect(deviceClient.supports('haptics.impact')).toBe(true);
    expect(deviceClient.supports('haptics.impact', 2)).toBe(false);
    expect(deviceClient.supports('notifications.native')).toBe(false);
    expect(deviceClient.getTransport()).toBe('capacitor');
    expect(deviceClient.getShellInfo()).toEqual({
      name: 'sovereign-mobile',
      version: '1.0.0',
      platform: 'ios',
    });
  });

  it('maps desktop platforms to the tauri transport', async () => {
    provideBridge(
      nativeImpl({
        handshake: async () => ({
          protocolVersion: 1,
          shell: { name: 'sovereign-desktop', version: '1.0.0', platform: 'macos' },
          capabilities: [],
        }),
      }),
    );
    vi.resetModules();
    const deviceClient = await import('../device-client');
    deviceClient.supports('x');
    await Promise.resolve();
    await Promise.resolve();

    expect(deviceClient.getTransport()).toBe('tauri');
  });
});

describe('haptics.impact', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('uses the native bridge when it answers with something other than unavailable', async () => {
    provideBridge(nativeImpl({ invoke: async () => ({ status: 'ok', value: undefined }) }));
    vi.resetModules();
    const { haptics } = await import('../device-client');

    expect(await haptics.impact('light')).toEqual({ status: 'ok', value: undefined });
  });

  it('falls back to the Vibration API on the web transport', async () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    vi.resetModules();
    const { haptics } = await import('../device-client');

    expect(await haptics.impact('heavy')).toEqual({ status: 'ok', value: undefined });
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('reports unavailable with no bridge and no Vibration API', async () => {
    vi.stubGlobal('navigator', {});
    vi.resetModules();
    const { haptics } = await import('../device-client');

    expect(await haptics.impact()).toEqual({ status: 'unavailable', capability: 'haptics.impact' });
  });
});

describe('nativeNotifications', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('getPermission() reports unsupported when the Notification API is absent', async () => {
    vi.stubGlobal('Notification', undefined);
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    expect(await nativeNotifications.getPermission()).toBe('unsupported');
  });

  it('getPermission() maps the browser "default" value to "prompt"', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    expect(await nativeNotifications.getPermission()).toBe('prompt');
  });

  it('requestPermission() records a grant and asks the browser', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    const result = await nativeNotifications.requestPermission('fs.example.tally');

    expect(result).toEqual({ status: 'ok', value: 'granted' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/device-grants',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pluginId: 'fs.example.tally', capability: 'notifications.native' }),
      }),
    );
    expect(requestPermission).toHaveBeenCalled();
  });

  it('requestPermission() short-circuits to denied without prompting again', async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    expect(await nativeNotifications.requestPermission('fs.example.tally')).toEqual({
      status: 'denied',
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('requestPermission() tolerates a grant-bookkeeping network failure', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    expect(await nativeNotifications.requestPermission('fs.example.tally')).toEqual({
      status: 'ok',
      value: 'granted',
    });
  });

  const nativeNotificationsBridge = (): BridgeImpl =>
    nativeImpl({
      handshake: async () => ({
        protocolVersion: 1,
        shell: { name: 'sovereign-desktop', version: '1.0.0', platform: 'macos' },
        capabilities: [{ name: 'notifications.native', version: 1 }],
      }),
    });

  it('getPermission() reports granted on the native bridge transport', async () => {
    vi.stubGlobal('Notification', undefined);
    provideBridge(nativeNotificationsBridge());
    vi.resetModules();
    const deviceClient = await import('../device-client');

    // First call starts the (async) handshake; supports() needs it settled.
    deviceClient.supports('notifications.native');
    await Promise.resolve();
    await Promise.resolve();

    expect(await deviceClient.nativeNotifications.getPermission()).toBe('granted');
  });

  it('requestPermission() reports granted on the native bridge transport without touching the Notification API', async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    provideBridge(nativeNotificationsBridge());
    vi.resetModules();
    const deviceClient = await import('../device-client');

    deviceClient.supports('notifications.native');
    await Promise.resolve();
    await Promise.resolve();

    const result = await deviceClient.nativeNotifications.requestPermission('fs.example.tally');

    expect(result).toEqual({ status: 'ok', value: 'granted' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/device-grants',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pluginId: 'fs.example.tally', capability: 'notifications.native' }),
      }),
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('show() refuses when permission is not granted', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    expect(await nativeNotifications.show({ title: 'Hi' })).toEqual({
      status: 'unavailable',
      capability: 'notifications.native',
    });
  });

  it('show() constructs a Notification when permission is already granted', async () => {
    const NotificationMock = vi.fn().mockImplementation(function (
      this: { onclick: unknown },
      _title: string,
    ) {
      this.onclick = null;
    });
    Object.assign(NotificationMock, { permission: 'granted' });
    vi.stubGlobal('Notification', NotificationMock);
    vi.resetModules();
    const { nativeNotifications } = await import('../device-client');

    const result = await nativeNotifications.show({ title: 'Hi', body: 'there' });

    expect(result).toEqual({ status: 'ok', value: undefined });
    expect(NotificationMock).toHaveBeenCalledWith('Hi', { body: 'there' });
  });
});
