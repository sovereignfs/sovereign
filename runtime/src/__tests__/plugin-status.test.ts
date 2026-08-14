import { afterEach, describe, expect, it, vi } from 'vitest';

const { listPluginStatus, getPlatformSetting, getHardDisabledPluginIds } = vi.hoisted(() => ({
  listPluginStatus: vi.fn(async () => []),
  getPlatformSetting: vi.fn(async () => null),
  getHardDisabledPluginIds: vi.fn(() => [] as string[]),
}));
vi.mock('@sovereignfs/db', () => ({ listPluginStatus, getPlatformSetting }));
vi.mock('../registry', () => ({
  getExamplePluginIds: () => [],
  getDevelopmentPluginIds: () => [],
  getHardDisabledPluginIds,
}));

import {
  bypassPluginVisibilityInDev,
  computeDisabledPluginIds,
  getDisabledPluginIds,
  resolveExamplesEnabled,
} from '../plugin-status';

describe('bypassPluginVisibilityInDev', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false under NODE_ENV=test, so the vitest run keeps exercising real gating', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(bypassPluginVisibilityInDev()).toBe(false);
  });

  it('is true only when NODE_ENV=development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(bypassPluginVisibilityInDev()).toBe(true);
  });

  it('is false in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(bypassPluginVisibilityInDev()).toBe(false);
  });
});

describe('resolveExamplesEnabled', () => {
  it('uses the persisted setting when present, ignoring the env default', () => {
    expect(resolveExamplesEnabled('true', false)).toBe(true);
    expect(resolveExamplesEnabled('false', true)).toBe(false);
  });

  it('falls back to the env default when the setting is unset', () => {
    expect(resolveExamplesEnabled(null, true)).toBe(true);
    expect(resolveExamplesEnabled(null, false)).toBe(false);
  });

  it('treats an unrecognised setting value as unset', () => {
    expect(resolveExamplesEnabled('yes', true)).toBe(true);
    expect(resolveExamplesEnabled('', false)).toBe(false);
  });
});

const EXAMPLES = ['ex-a', 'ex-b'];

describe('computeDisabledPluginIds', () => {
  it('includes plugins explicitly disabled in plugin_status', () => {
    const disabled = computeDisabledPluginIds([{ pluginId: 'tasks', enabled: false }], [], true);
    expect(disabled).toEqual(['tasks']);
  });

  it('disables examples with no explicit row when examples are off by default', () => {
    const disabled = computeDisabledPluginIds([], EXAMPLES, false);
    expect(new Set(disabled)).toEqual(new Set(['ex-a', 'ex-b']));
  });

  it('leaves examples enabled when examples are on by default', () => {
    expect(computeDisabledPluginIds([], EXAMPLES, true)).toEqual([]);
  });

  it('lets an explicit enable row override the examples-off default', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'ex-a', enabled: true }],
      EXAMPLES,
      false,
    );
    expect(disabled).toEqual(['ex-b']);
  });

  it('keeps an explicitly disabled example disabled even when examples are on', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'ex-a', enabled: false }],
      EXAMPLES,
      true,
    );
    expect(disabled).toEqual(['ex-a']);
  });

  it('does not double-count an example that is also explicitly disabled', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'ex-a', enabled: false }],
      EXAMPLES,
      false,
    );
    expect(new Set(disabled)).toEqual(new Set(['ex-a', 'ex-b']));
    expect(disabled.filter((id) => id === 'ex-a')).toHaveLength(1);
  });

  const DEV = ['dev-a', 'dev-b'];

  it('leaves development plugins enabled when hideDevelopment is false (default)', () => {
    expect(computeDisabledPluginIds([], [], true, DEV, false)).toEqual([]);
  });

  it('disables every development plugin when hideDevelopment is true', () => {
    const disabled = computeDisabledPluginIds([], [], true, DEV, true);
    expect(new Set(disabled)).toEqual(new Set(['dev-a', 'dev-b']));
  });

  it('an explicit enable row does NOT override hideDevelopment — no per-plugin exception', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'dev-a', enabled: true }],
      [],
      true,
      DEV,
      true,
    );
    expect(new Set(disabled)).toEqual(new Set(['dev-a', 'dev-b']));
  });

  it('does not double-count a development plugin that is also explicitly disabled', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'dev-a', enabled: false }],
      [],
      true,
      DEV,
      true,
    );
    expect(disabled.filter((id) => id === 'dev-a')).toHaveLength(1);
  });

  const HARD_DISABLED = ['warden'];

  it('leaves hard-disabled plugins out when the list is empty (default)', () => {
    expect(computeDisabledPluginIds([], [], true)).toEqual([]);
  });

  it('disables every manifest hard-disabled plugin unconditionally, no flag needed', () => {
    const disabled = computeDisabledPluginIds([], [], true, [], false, HARD_DISABLED);
    expect(disabled).toEqual(['warden']);
  });

  it('an explicit enable row does NOT override a manifest hard disable', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'warden', enabled: true }],
      [],
      true,
      [],
      false,
      HARD_DISABLED,
    );
    expect(disabled).toEqual(['warden']);
  });

  it('does not double-count a hard-disabled plugin that is also explicitly disabled', () => {
    const disabled = computeDisabledPluginIds(
      [{ pluginId: 'warden', enabled: false }],
      [],
      true,
      [],
      false,
      HARD_DISABLED,
    );
    expect(disabled.filter((id) => id === 'warden')).toHaveLength(1);
  });
});

describe('getDisabledPluginIds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getHardDisabledPluginIds.mockReset();
    getHardDisabledPluginIds.mockReturnValue([]);
    listPluginStatus.mockClear();
  });

  it('includes manifest hard-disabled ids even under the dev bypass, and skips DB work entirely', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    getHardDisabledPluginIds.mockReturnValue(['warden']);
    const result = await getDisabledPluginIds({} as never);
    expect(result).toEqual(['warden']);
    expect(listPluginStatus).not.toHaveBeenCalled();
  });

  it('merges manifest hard-disabled ids with the DB-computed set outside dev', async () => {
    listPluginStatus.mockResolvedValueOnce([]);
    getHardDisabledPluginIds.mockReturnValue(['warden']);
    const result = await getDisabledPluginIds({} as never);
    expect(result).toEqual(['warden']);
  });
});
