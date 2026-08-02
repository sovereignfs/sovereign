// @vitest-environment jsdom
import type { BridgeImpl } from '@sovereignfs/sdk/device-bridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWebBridge } from '../index';
import { BRIDGE_GLOBAL_KEY, PROTOCOL_VERSION } from '../protocol';
import { installBridge } from '../shell';

// `provideBridge()`'s Symbol.for-keyed global is the intended, documented
// way to read back a registration — the same technique `@sovereignfs/sdk`
// itself uses internally (`packages/sdk/src/device-bridge.ts`). Leg 1 has
// no plugin-facing consumer of the registration yet (that's leg 2), so
// there's no `sdk.device.*` call to round-trip through instead.
const BRIDGE_SYMBOL = Symbol.for('@sovereignfs/sdk:bridge');

function registeredImpl(): BridgeImpl {
  const impl = (globalThis as unknown as Record<symbol, BridgeImpl>)[BRIDGE_SYMBOL];
  if (!impl) throw new Error('installWebBridge() did not register an implementation');
  return impl;
}

describe('installWebBridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, BRIDGE_GLOBAL_KEY);
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
    vi.restoreAllMocks();
  });

  it('degrades to the web transport when no native shell has installed a bridge', async () => {
    installWebBridge();

    const handshake = await registeredImpl().handshake();
    expect(handshake).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      shell: { name: 'browser', version: '', platform: 'web' },
      capabilities: [],
    });

    const result = await registeredImpl().invoke('haptics.impact', {});
    expect(result).toEqual({ status: 'unavailable', capability: 'haptics.impact' });
  });

  it('passes through a native shell handshake and delegates invoke() when the protocol version matches', async () => {
    const invoke = vi.fn(async () => ({ status: 'ok' as const, value: undefined }));
    installBridge({
      shell: { name: 'sovereign-mobile', version: '1.2.3', platform: 'ios' },
      capabilities: [{ name: 'haptics.impact', version: 1 }],
      invoke,
    });
    installWebBridge();

    const handshake = await registeredImpl().handshake();
    expect(handshake).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      shell: { name: 'sovereign-mobile', version: '1.2.3', platform: 'ios' },
      capabilities: [{ name: 'haptics.impact', version: 1 }],
    });

    const result = await registeredImpl().invoke('haptics.impact', { style: 'light' });
    expect(result).toEqual({ status: 'ok', value: undefined });
    expect(invoke).toHaveBeenCalledWith('haptics.impact', { style: 'light' });
  });

  it('degrades to the web transport and warns when the native shell speaks a different protocol version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as Record<string, unknown>)[BRIDGE_GLOBAL_KEY] = {
      protocolVersion: PROTOCOL_VERSION + 1,
      shell: { name: 'sovereign-desktop', version: '9.9.9', platform: 'macos' },
      capabilities: [{ name: 'haptics.impact', version: 1 }],
      invoke: async () => ({ status: 'ok', value: undefined }),
    };
    installWebBridge();

    const handshake = await registeredImpl().handshake();
    expect(handshake).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      shell: { name: 'browser', version: '', platform: 'web' },
      capabilities: [],
    });
    expect(warn).toHaveBeenCalledOnce();

    const result = await registeredImpl().invoke('haptics.impact', {});
    expect(result).toEqual({ status: 'unavailable', capability: 'haptics.impact' });
  });
});
