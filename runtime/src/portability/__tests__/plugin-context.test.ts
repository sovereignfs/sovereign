import { describe, expect, it } from 'vitest';
import {
  getPortabilityPluginContext,
  getPortabilityUserContext,
  runWithPortabilityPlugin,
} from '../plugin-context';

describe('portability plugin context', () => {
  it('is undefined outside any run', () => {
    expect(getPortabilityPluginContext()).toBeUndefined();
    expect(getPortabilityUserContext()).toBeUndefined();
  });

  it('exposes the plugin id and user id set by the nearest run', async () => {
    const seen = await runWithPortabilityPlugin('fs.sovereign.healthlog', 'user-1', async () => {
      return { pluginId: getPortabilityPluginContext(), userId: getPortabilityUserContext() };
    });
    expect(seen).toEqual({ pluginId: 'fs.sovereign.healthlog', userId: 'user-1' });
    expect(getPortabilityPluginContext()).toBeUndefined();
    expect(getPortabilityUserContext()).toBeUndefined();
  });

  it('carries a null user id through when the run is given one', async () => {
    const seen = await runWithPortabilityPlugin('fs.sovereign.healthlog', null, async () => {
      return getPortabilityUserContext();
    });
    expect(seen).toBeNull();
  });

  it('does not leak across concurrent runs', async () => {
    const [a, b] = await Promise.all([
      runWithPortabilityPlugin('plugin.a', 'user-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { pluginId: getPortabilityPluginContext(), userId: getPortabilityUserContext() };
      }),
      runWithPortabilityPlugin('plugin.b', 'user-b', async () => ({
        pluginId: getPortabilityPluginContext(),
        userId: getPortabilityUserContext(),
      })),
    ]);
    expect(a).toEqual({ pluginId: 'plugin.a', userId: 'user-a' });
    expect(b).toEqual({ pluginId: 'plugin.b', userId: 'user-b' });
  });
});
