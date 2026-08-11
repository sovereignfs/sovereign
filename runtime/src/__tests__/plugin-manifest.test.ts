import { describe, expect, it } from 'vitest';
import {
  buildPluginManifest,
  buildPluginManifestIcons,
  findInstallablePlugin,
  type InstallablePluginInfo,
} from '../plugin-manifest';

const tally: InstallablePluginInfo = {
  id: 'fs.sovereign.tally',
  name: 'Tally',
  description: 'Shared expense tracking and debt settlement.',
  routePrefix: '/tally',
  icon: 'icon.svg',
  installable: true,
};
const launcher: InstallablePluginInfo = {
  id: 'fs.sovereign.launcher',
  name: 'Launcher',
  routePrefix: '/launcher',
};
const plugins = [tally, launcher];
const none = new Set<string>();

describe('findInstallablePlugin', () => {
  it('finds an installable plugin', () => {
    expect(findInstallablePlugin('fs.sovereign.tally', plugins, none)).toBe(tally);
  });

  it('returns null for an unknown plugin id', () => {
    expect(findInstallablePlugin('fs.sovereign.nope', plugins, none)).toBeNull();
  });

  it('returns null for a plugin that does not declare installable', () => {
    expect(findInstallablePlugin('fs.sovereign.launcher', plugins, none)).toBeNull();
  });

  it('returns null for a disabled installable plugin', () => {
    const disabled = new Set(['fs.sovereign.tally']);
    expect(findInstallablePlugin('fs.sovereign.tally', plugins, disabled)).toBeNull();
  });

  it('returns null for a plugin explicitly declaring installable: false', () => {
    const notInstallable: InstallablePluginInfo = { ...tally, installable: false };
    expect(findInstallablePlugin('fs.sovereign.tally', [notInstallable], none)).toBeNull();
  });
});

describe('buildPluginManifestIcons', () => {
  it("uses the plugin's own icon when declared", () => {
    const icons = buildPluginManifestIcons(tally);
    expect(icons).toEqual([
      { src: '/plugin-icons/fs.sovereign.tally.svg', sizes: 'any', type: 'image/svg+xml' },
    ]);
  });

  it('falls back to the platform default icon set when the plugin declares none', () => {
    const icons = buildPluginManifestIcons(launcher);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.src?.startsWith('/icons/'))).toBe(true);
  });
});

describe('buildPluginManifest', () => {
  it("uses the plugin's own name and description verbatim, not prefixed by an instance name", () => {
    const manifest = buildPluginManifest(tally, '#09090b', '#09090b');
    expect(manifest.name).toBe('Tally');
    expect(manifest.short_name).toBe('Tally');
    expect(manifest.description).toBe('Shared expense tracking and debt settlement.');
  });

  it('sets start_url, scope, and id all to the routePrefix', () => {
    const manifest = buildPluginManifest(tally, '#09090b', '#09090b');
    expect(manifest.start_url).toBe('/tally');
    expect(manifest.scope).toBe('/tally');
    expect(manifest.id).toBe('/tally');
  });

  it('defaults description to an empty string when the plugin declares none', () => {
    const manifest = buildPluginManifest(launcher, '#09090b', '#09090b');
    expect(manifest.description).toBe('');
  });

  it('inherits theme_color and background_color from the caller', () => {
    const manifest = buildPluginManifest(tally, '#123456', '#654321');
    expect(manifest.theme_color).toBe('#123456');
    expect(manifest.background_color).toBe('#654321');
  });

  it('is standalone display with the standard display_override fallback chain', () => {
    const manifest = buildPluginManifest(tally, '#09090b', '#09090b');
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui']);
  });
});
