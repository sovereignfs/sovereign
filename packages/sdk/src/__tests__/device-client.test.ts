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

  it('isDeviceOnlyTierAvailable() reports false with no bridge registered', async () => {
    vi.resetModules();
    const deviceClient = await import('../device-client');

    expect(deviceClient.isDeviceOnlyTierAvailable()).toBe(false);
  });

  it('isDeviceOnlyTierAvailable() reports false when the bridge exists but does not advertise secureStorage', async () => {
    provideBridge(nativeImpl());
    vi.resetModules();
    const deviceClient = await import('../device-client');

    deviceClient.supports('haptics.impact'); // starts the handshake
    await Promise.resolve();
    await Promise.resolve();

    // The stub bridge above only advertises haptics.impact — no shell ships
    // secureStorage yet (epic task 20.13 is still open), so this must stay
    // false until that capability is actually advertised.
    expect(deviceClient.isDeviceOnlyTierAvailable()).toBe(false);
  });

  it('isDeviceOnlyTierAvailable() reports true once a shell advertises secureStorage', async () => {
    provideBridge(
      nativeImpl({
        handshake: async () => ({
          protocolVersion: 1,
          shell: { name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' },
          capabilities: [{ name: 'secureStorage', version: 1 }],
        }),
      }),
    );
    vi.resetModules();
    const deviceClient = await import('../device-client');

    deviceClient.supports('secureStorage'); // starts the handshake
    await Promise.resolve();
    await Promise.resolve();

    expect(deviceClient.isDeviceOnlyTierAvailable()).toBe(true);
  });

  it('isDeviceOnlyTierAvailable() reports true on plain web/PWA with WebAuthn + OPFS, no bridge needed', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {
      credentials: {},
      storage: { getDirectory: async () => ({}) },
    });
    vi.resetModules();
    const deviceClient = await import('../device-client');

    expect(deviceClient.isDeviceOnlyTierAvailable()).toBe(true);
  });

  it('isDeviceOnlyTierAvailable() reports false on web when only one of WebAuthn/OPFS is present', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: {} }); // no navigator.storage.getDirectory
    vi.resetModules();
    const deviceClient = await import('../device-client');

    expect(deviceClient.isDeviceOnlyTierAvailable()).toBe(false);
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

describe('camera.photo', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('uses the native bridge when it answers with something other than unavailable', async () => {
    provideBridge(
      nativeImpl({
        invoke: async () => ({
          status: 'ok',
          value: { dataUrl: 'data:image/jpeg;base64,AA==', mimeType: 'image/jpeg' },
        }),
      }),
    );
    vi.resetModules();
    const { camera } = await import('../device-client');

    expect(await camera.photo('camera')).toEqual({
      status: 'ok',
      value: { dataUrl: 'data:image/jpeg;base64,AA==', mimeType: 'image/jpeg' },
    });
  });

  it('records a device-consent grant before invoking the bridge', async () => {
    provideBridge(
      nativeImpl({
        invoke: async () => ({ status: 'ok', value: { dataUrl: 'x', mimeType: 'image/jpeg' } }),
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { camera } = await import('../device-client');

    await camera.photo('library', 'fs.example.tally');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/device-grants',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pluginId: 'fs.example.tally', capability: 'camera.photo' }),
      }),
    );
  });

  it('falls back to a hidden file input on the web transport', async () => {
    vi.resetModules();
    const { camera } = await import('../device-client');

    const resultPromise = camera.photo('library');
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe('image/*');

    const file = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));

    const result = await resultPromise;
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.mimeType).toBe('image/jpeg');
      expect(result.value.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    }
  });

  it('hints at the device camera via capture="environment" for source: camera', async () => {
    vi.resetModules();
    const { camera } = await import('../device-client');

    const resultPromise = camera.photo('camera');
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.capture).toBe('environment');

    // Await the pending promise (not just dispatch the event and move on) so
    // the FileReader it triggers resolves inside this test's own async
    // boundary, not as a dangling handler that fires after the test —  and
    // Vitest's module/DOM cleanup — has already moved on. Previously fired
    // fire-and-forget: harmless when it happened to resolve before the test
    // runner tore anything down, but a real jsdom FileReader completion is
    // scheduled via setImmediate, and losing that race intermittently threw
    // an unhandled "Expected an Uint8Array" from jsdom's own FileReader
    // internals deep in test-runner plumbing, unrelated to anything this
    // test itself asserts — see test above for the identical
    // File→dispatchEvent→await pattern that never had this problem.
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));

    await resultPromise;
  });
});

describe('biometrics.confirm', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('reports unavailable with no bridge — no web fallback exists', async () => {
    vi.resetModules();
    const { biometrics } = await import('../device-client');

    expect(await biometrics.confirm()).toEqual({
      status: 'unavailable',
      capability: 'biometrics.confirm',
    });
  });

  it('passes the reason through and returns the bridge result as-is', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: undefined });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { biometrics } = await import('../device-client');

    expect(await biometrics.confirm('Reveal saved password')).toEqual({
      status: 'ok',
      value: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('biometrics.confirm', { reason: 'Reveal saved password' });
  });

  it('surfaces unavailable from the bridge unchanged — e.g. no biometrics enrolled', async () => {
    provideBridge(
      nativeImpl({
        invoke: async () => ({ status: 'unavailable', capability: 'biometrics.confirm' }),
      }),
    );
    vi.resetModules();
    const { biometrics } = await import('../device-client');

    expect(await biometrics.confirm()).toEqual({
      status: 'unavailable',
      capability: 'biometrics.confirm',
    });
  });

  it('records a device-consent grant before invoking the bridge', async () => {
    provideBridge(nativeImpl({ invoke: async () => ({ status: 'ok', value: undefined }) }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { biometrics } = await import('../device-client');

    await biometrics.confirm(undefined, 'fs.example.tally');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/device-grants',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pluginId: 'fs.example.tally', capability: 'biometrics.confirm' }),
      }),
    );
  });

  it('tolerates a grant-bookkeeping network failure', async () => {
    provideBridge(nativeImpl({ invoke: async () => ({ status: 'ok', value: undefined }) }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.resetModules();
    const { biometrics } = await import('../device-client');

    expect(await biometrics.confirm(undefined, 'fs.example.tally')).toEqual({
      status: 'ok',
      value: undefined,
    });
  });
});

describe('secureStorage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('reports unavailable with no bridge on every operation — no web fallback exists', async () => {
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.get('fs.example.tally', 'k')).toEqual({
      status: 'unavailable',
      capability: 'secureStorage',
    });
    expect(await secureStorage.set('fs.example.tally', 'k', 'v')).toEqual({
      status: 'unavailable',
      capability: 'secureStorage',
    });
    expect(await secureStorage.remove('fs.example.tally', 'k')).toEqual({
      status: 'unavailable',
      capability: 'secureStorage',
    });
    expect(await secureStorage.keys('fs.example.tally')).toEqual({
      status: 'unavailable',
      capability: 'secureStorage',
    });
    expect(await secureStorage.clear('fs.example.tally')).toEqual({
      status: 'unavailable',
      capability: 'secureStorage',
    });
  });

  it('get: invokes the single secureStorage capability with op "get" and returns the bridge result as-is', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: 'stored-value' });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.get('fs.example.tally', 'balance')).toEqual({
      status: 'ok',
      value: 'stored-value',
    });
    expect(invoke).toHaveBeenCalledWith('secureStorage', {
      op: 'get',
      pluginId: 'fs.example.tally',
      key: 'balance',
    });
  });

  it('set: passes pluginId, key, and value through with op "set"', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: undefined });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.set('fs.example.tally', 'balance', 42)).toEqual({
      status: 'ok',
      value: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('secureStorage', {
      op: 'set',
      pluginId: 'fs.example.tally',
      key: 'balance',
      value: 42,
    });
  });

  it('remove: passes pluginId and key through with op "remove"', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: undefined });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.remove('fs.example.tally', 'balance')).toEqual({
      status: 'ok',
      value: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('secureStorage', {
      op: 'remove',
      pluginId: 'fs.example.tally',
      key: 'balance',
    });
  });

  it('keys: passes pluginId through with op "keys"', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: ['balance', 'note'] });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.keys('fs.example.tally')).toEqual({
      status: 'ok',
      value: ['balance', 'note'],
    });
    expect(invoke).toHaveBeenCalledWith('secureStorage', {
      op: 'keys',
      pluginId: 'fs.example.tally',
    });
  });

  it('clear: passes pluginId through with op "clear"', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'ok', value: undefined });
    provideBridge(nativeImpl({ invoke }));
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.clear('fs.example.tally')).toEqual({
      status: 'ok',
      value: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('secureStorage', {
      op: 'clear',
      pluginId: 'fs.example.tally',
    });
  });

  it('surfaces a denied/failed result from the bridge unchanged', async () => {
    provideBridge(
      nativeImpl({ invoke: async () => ({ status: 'failed', error: 'device auth cancelled' }) }),
    );
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    expect(await secureStorage.get('fs.example.tally', 'balance')).toEqual({
      status: 'failed',
      error: 'device auth cancelled',
    });
  });

  it('does not record a device-consent grant — enrollment is structural, not per-call (RFC 0093)', async () => {
    provideBridge(nativeImpl({ invoke: async () => ({ status: 'ok', value: undefined }) }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { secureStorage } = await import('../device-client');

    await secureStorage.set('fs.example.tally', 'balance', 42);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
