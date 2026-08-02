// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BRIDGE_GLOBAL_KEY, readInstalledBridge, type InstalledBridge } from '../protocol';

function installed(overrides: Partial<InstalledBridge> = {}): InstalledBridge {
  return {
    protocolVersion: 1,
    shell: { name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' },
    capabilities: [],
    invoke: async () => ({ status: 'unavailable', capability: 'test' }),
    ...overrides,
  };
}

describe('readInstalledBridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, BRIDGE_GLOBAL_KEY);
  });

  it('returns null when no shell has installed a bridge', () => {
    expect(readInstalledBridge()).toBeNull();
  });

  it('returns exactly what was installed on window', () => {
    const bridge = installed();
    (window as unknown as Record<string, unknown>)[BRIDGE_GLOBAL_KEY] = bridge;

    expect(readInstalledBridge()).toBe(bridge);
  });
});
