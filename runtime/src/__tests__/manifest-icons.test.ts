import { describe, expect, it } from 'vitest';
import type { InstanceConfig } from '@sovereignfs/db';
import { DEFAULT_MANIFEST_ICONS, buildManifestIcons, guessMimeType } from '../manifest-icons';

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

describe('guessMimeType', () => {
  it('recognises common upload extensions', () => {
    expect(guessMimeType('/api/instance/logo.png')).toBe('image/png');
    expect(guessMimeType('https://example.com/logo.svg')).toBe('image/svg+xml');
    expect(guessMimeType('https://example.com/logo.webp')).toBe('image/webp');
  });

  it('strips a query string before checking the extension', () => {
    expect(guessMimeType('https://example.com/logo.jpg?v=2')).toBe('image/jpeg');
  });

  it('defaults to image/png for an unrecognised or extensionless URL', () => {
    expect(guessMimeType('/api/instance/logo')).toBe('image/png');
    expect(guessMimeType('https://example.com/logo.bmp')).toBe('image/png');
  });
});

describe('buildManifestIcons', () => {
  it('returns the default Sovereign icon set when no instance logo is configured', () => {
    expect(buildManifestIcons(config())).toEqual(DEFAULT_MANIFEST_ICONS);
  });

  it("prepends the operator's logo, ahead of the Sovereign defaults, when configured", () => {
    const icons = buildManifestIcons(config({ instanceLogo: '/api/instance/logo' }));
    expect(icons[0]).toEqual({ src: '/api/instance/logo', sizes: 'any', type: 'image/png' });
    expect(icons.slice(1)).toEqual(DEFAULT_MANIFEST_ICONS);
  });

  it('derives the icon type from the logo URL', () => {
    const icons = buildManifestIcons(config({ instanceLogo: 'https://example.com/brand.svg' }));
    expect(icons[0]?.type).toBe('image/svg+xml');
  });
});
