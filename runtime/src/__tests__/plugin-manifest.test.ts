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
  it('references all three generated PNG variants when the plugin declares icon', () => {
    const icons = buildPluginManifestIcons(tally);
    expect(icons).toEqual([
      {
        src: '/plugin-icons/fs.sovereign.tally-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/plugin-icons/fs.sovereign.tally-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/plugin-icons/fs.sovereign.tally-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });

  it('falls back to the platform default icon set when the plugin declares neither icon nor icons', () => {
    const icons = buildPluginManifestIcons(launcher);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.src?.startsWith('/icons/'))).toBe(true);
  });

  it('uses an author-supplied icons set with no icon fallback declared', () => {
    const authored: InstallablePluginInfo = {
      id: 'fs.example.scanner',
      name: 'Scanner',
      routePrefix: '/scanner',
      icons: { png192: 'a.png', png512: 'b.png', maskable512: 'c.png' },
    };
    const icons = buildPluginManifestIcons(authored);
    expect(icons).toEqual([
      {
        src: '/plugin-icons/fs.example.scanner-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/plugin-icons/fs.example.scanner-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/plugin-icons/fs.example.scanner-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });

  it('omits a variant that is neither icon-backed nor author-supplied, rather than guessing a broken path', () => {
    const partial: InstallablePluginInfo = {
      id: 'fs.example.partial',
      name: 'Partial',
      routePrefix: '/partial',
      icons: { png192: 'a.png' }, // no icon fallback, no png512/maskable512
    };
    const icons = buildPluginManifestIcons(partial);
    expect(icons).toEqual([
      {
        src: '/plugin-icons/fs.example.partial-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
    ]);
  });

  it('mixes a generated fallback with an author-supplied override for one variant', () => {
    const mixed: InstallablePluginInfo = {
      id: 'fs.example.mixed',
      name: 'Mixed',
      routePrefix: '/mixed',
      icon: 'icon.svg',
      icons: { maskable512: 'custom-mask.png' },
    };
    const icons = buildPluginManifestIcons(mixed);
    // All three variants exist (icon covers 192/512, icons.maskable512 covers
    // the third) — buildPluginManifestIcons can't tell generated from
    // author-supplied from the manifest alone, and doesn't need to; both
    // land at the same generated-directory path by design.
    expect(icons.map((i) => i.src)).toEqual([
      '/plugin-icons/fs.example.mixed-192.png',
      '/plugin-icons/fs.example.mixed-512.png',
      '/plugin-icons/fs.example.mixed-maskable-512.png',
    ]);
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
