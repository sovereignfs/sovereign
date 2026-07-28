import { describe, expect, it } from 'vitest';
import type { InstanceConfig } from '@sovereignfs/db';
import { buildInstanceStyle } from '../instance-style';

function config(overrides: Partial<InstanceConfig> = {}): InstanceConfig {
  return {
    instanceName: 'Sovereign',
    instanceLogo: null,
    instanceLogoDark: null,
    instanceFavicon: null,
    instancePrimary: null,
    instanceRadius: null,
    emailFromName: null,
    emailLogo: null,
    ...overrides,
  };
}

describe('buildInstanceStyle — radius (RFC 0077)', () => {
  it('emits no --sv-radius-scale line when instanceRadius is unset', () => {
    expect(buildInstanceStyle(config())).toBe('');
  });

  it('emits --sv-radius-scale: 0 for the none preset', () => {
    const style = buildInstanceStyle(config({ instanceRadius: 'none' }));
    expect(style).toContain('--sv-radius-scale: 0;');
  });

  it.each([
    ['xs', 0.35],
    ['s', 0.65],
    ['m', 1],
    ['l', 2.75],
  ] as const)('emits the correct scale factor for the %s preset', (preset, scale) => {
    const style = buildInstanceStyle(config({ instanceRadius: preset }));
    expect(style).toContain(`--sv-radius-scale: ${scale};`);
  });

  it('includes the radius line alongside logo/favicon overrides with no accent set', () => {
    const style = buildInstanceStyle(
      config({ instanceRadius: 'l', instanceLogo: 'https://example.com/logo.png' }),
    );
    expect(style).toContain('--sv-radius-scale: 2.75;');
    expect(style).toContain('--sv-instance-logo:');
  });

  it('still includes the radius line when instancePrimary is also set — regression guard for the accent early-return branch', () => {
    // buildInstanceStyle returns early from inside the `if (config.instancePrimary)`
    // branch (to append the dark-theme accent-hover block); the radius line must be
    // pushed onto `lines` before that branch runs, or it silently gets dropped
    // whenever an instance has both a radius preset AND an accent colour set.
    const style = buildInstanceStyle(config({ instanceRadius: 's', instancePrimary: '#3b82f6' }));
    expect(style).toContain('--sv-radius-scale: 0.65;');
    expect(style).toContain('--sv-color-accent: hsl(');
    expect(style).toContain("[data-theme='dark']");
  });

  it('returns an empty string when nothing is configured', () => {
    expect(buildInstanceStyle(config())).toBe('');
  });
});
