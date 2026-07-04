import { describe, expect, it } from 'vitest';
import { computeDisabledPluginIds, resolveExamplesEnabled } from '../plugin-status';

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
});
