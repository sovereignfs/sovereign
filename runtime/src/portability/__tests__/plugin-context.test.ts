import { describe, expect, it } from 'vitest';
import { getPortabilityPluginContext, runWithPortabilityPlugin } from '../plugin-context';

describe('portability plugin context', () => {
  it('is undefined outside any run', () => {
    expect(getPortabilityPluginContext()).toBeUndefined();
  });

  it('exposes the plugin id set by the nearest run', async () => {
    const seen = await runWithPortabilityPlugin('fs.sovereign.healthlog', async () => {
      return getPortabilityPluginContext();
    });
    expect(seen).toBe('fs.sovereign.healthlog');
    expect(getPortabilityPluginContext()).toBeUndefined();
  });

  it('does not leak across concurrent runs', async () => {
    const [a, b] = await Promise.all([
      runWithPortabilityPlugin('plugin.a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getPortabilityPluginContext();
      }),
      runWithPortabilityPlugin('plugin.b', async () => getPortabilityPluginContext()),
    ]);
    expect(a).toBe('plugin.a');
    expect(b).toBe('plugin.b');
  });
});
