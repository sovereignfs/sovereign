import { afterEach, describe, expect, it } from 'vitest';
import { provideBridge, type BridgeImpl } from '../device-bridge';

const BRIDGE_SYMBOL = Symbol.for('@sovereignfs/sdk:bridge');

function registered(): BridgeImpl | undefined {
  return (globalThis as unknown as Record<symbol, BridgeImpl>)[BRIDGE_SYMBOL];
}

describe('provideBridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, BRIDGE_SYMBOL);
  });

  it('registers the implementation on the Symbol.for-keyed global', () => {
    const impl: BridgeImpl = {
      handshake: async () => ({
        protocolVersion: 1,
        shell: { name: 'browser', version: '', platform: 'web' },
        capabilities: [],
      }),
      invoke: async (capability) => ({ status: 'unavailable', capability }),
    };

    provideBridge(impl);

    expect(registered()).toBe(impl);
  });

  it('a later registration replaces an earlier one', () => {
    const first: BridgeImpl = {
      handshake: async () => ({
        protocolVersion: 1,
        shell: { name: 'browser', version: '', platform: 'web' },
        capabilities: [],
      }),
      invoke: async (capability) => ({ status: 'unavailable', capability }),
    };
    const second: BridgeImpl = {
      handshake: async () => ({
        protocolVersion: 1,
        shell: { name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' },
        capabilities: [{ name: 'haptics.impact', version: 1 }],
      }),
      invoke: async () => ({ status: 'ok', value: undefined }),
    };

    provideBridge(first);
    provideBridge(second);

    expect(registered()).toBe(second);
  });
});
