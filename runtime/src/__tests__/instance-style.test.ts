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
    instanceThemePreset: null,
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

describe('buildInstanceStyle — theme presets (RFC 0094/0095)', () => {
  it('emits no theme-preset lines when instanceThemePreset is unset', () => {
    expect(buildInstanceStyle(config())).toBe('');
  });

  it('emits the neobrutalism preset light tokens', () => {
    const style = buildInstanceStyle(config({ instanceThemePreset: 'neobrutalism' }));
    expect(style).toContain('--sv-radius-scale: 0;');
    expect(style).toContain('--sv-border-width-hairline: 2px;');
    expect(style).toContain('--sv-button-shadow: 4px 4px 0 0 var(--sv-color-shadow-strong);');
  });

  it("emits the neobrutalism preset dark tokens inside a [data-theme='dark'] block", () => {
    const style = buildInstanceStyle(config({ instanceThemePreset: 'neobrutalism' }));
    const darkBlockIndex = style.indexOf("[data-theme='dark']");
    expect(darkBlockIndex).toBeGreaterThan(-1);
    expect(style.slice(darkBlockIndex)).toContain('--sv-radius-scale: 0;');
  });

  it("emits no [data-theme='dark'] block for the default preset (empty overrides)", () => {
    const style = buildInstanceStyle(config({ instanceThemePreset: 'default' }));
    expect(style).toBe('');
  });

  it("lets an explicit instanceRadius override the theme preset's own --sv-radius-scale — precedence guarantee (RFC 0095)", () => {
    const style = buildInstanceStyle(
      config({ instanceThemePreset: 'neobrutalism', instanceRadius: 'l' }),
    );
    // The preset's own '0' must appear first, then the operator's explicit
    // 'l' (2.75) after it — CSS's "last declaration wins" within one :root
    // block resolves this correctly with no special-case code, but the test
    // asserts the actual resolved behaviour: the LAST --sv-radius-scale
    // declaration in the block is the operator's, not the preset's.
    const rootBlock = style.slice(0, style.indexOf("[data-theme='dark']"));
    const radiusDeclarations = [...rootBlock.matchAll(/--sv-radius-scale: ([\d.]+);/g)];
    expect(radiusDeclarations.length).toBe(2);
    expect(radiusDeclarations[0]?.[1]).toBe('0');
    expect(radiusDeclarations[1]?.[1]).toBe('2.75');
  });

  it("merges theme-preset dark lines and accent dark-hover into the same [data-theme='dark'] block", () => {
    const style = buildInstanceStyle(
      config({ instanceThemePreset: 'neobrutalism', instancePrimary: '#3b82f6' }),
    );
    const darkBlockMatches = [...style.matchAll(/\[data-theme='dark'\]/g)];
    expect(darkBlockMatches.length).toBe(1);
    const darkBlockIndex = style.indexOf("[data-theme='dark']");
    const darkBlock = style.slice(darkBlockIndex);
    expect(darkBlock).toContain('--sv-radius-scale: 0;');
    expect(darkBlock).toContain('--sv-color-accent-hover: hsl(');
  });
});
