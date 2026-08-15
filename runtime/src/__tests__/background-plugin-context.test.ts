import { describe, expect, it } from 'vitest';
import { getBackgroundPluginContext, runWithBackgroundPlugin } from '../background-plugin-context';

describe('background plugin context', () => {
  it('is undefined outside any run', () => {
    expect(getBackgroundPluginContext()).toBeUndefined();
  });

  it('exposes the plugin id set by the nearest run', async () => {
    const seen = await runWithBackgroundPlugin('fs.sovereign.tasks', async () => {
      return getBackgroundPluginContext();
    });
    expect(seen).toBe('fs.sovereign.tasks');
    expect(getBackgroundPluginContext()).toBeUndefined();
  });

  it('does not leak across concurrent runs', async () => {
    const [a, b] = await Promise.all([
      runWithBackgroundPlugin('plugin.a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getBackgroundPluginContext();
      }),
      runWithBackgroundPlugin('plugin.b', async () => getBackgroundPluginContext()),
    ]);
    expect(a).toBe('plugin.a');
    expect(b).toBe('plugin.b');
  });
});
