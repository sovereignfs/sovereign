// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BRIDGE_GLOBAL_KEY, PROTOCOL_VERSION, readInstalledBridge } from '../protocol';
import { installBridge } from '../shell';

describe('installBridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, BRIDGE_GLOBAL_KEY);
  });

  it('installs the shell bridge with the current protocol version stamped on', () => {
    const invoke = async () => ({ status: 'unavailable' as const, capability: 'haptics.impact' });
    installBridge({
      shell: { name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' },
      capabilities: [{ name: 'haptics.impact', version: 1 }],
      invoke,
    });

    const bridge = readInstalledBridge();
    expect(bridge?.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(bridge?.shell).toEqual({ name: 'sovereign-mobile', version: '1.0.0', platform: 'ios' });
    expect(bridge?.capabilities).toEqual([{ name: 'haptics.impact', version: 1 }]);
    expect(bridge?.invoke).toBe(invoke);
  });
});
