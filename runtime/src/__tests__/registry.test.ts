import type { SovereignManifest } from '@sovereignfs/manifest';
import { describe, expect, it } from 'vitest';
import {
  getDevelopmentPluginIds,
  getExamplePluginIds,
  getMobileChromeConfig,
  getOfflineRoutePrefixes,
} from '../registry';

function manifest(id: string, example?: boolean, development?: boolean): SovereignManifest {
  return { id, example, development } as unknown as SovereignManifest;
}

function manifestWithShellConfig(
  id: string,
  routePrefix: string,
  shellConfig?: { mobileHeader?: boolean; mobileFooter?: boolean },
): SovereignManifest {
  return { id, routePrefix, shellConfig } as unknown as SovereignManifest;
}

function manifestWithOffline(
  id: string,
  routePrefix: string,
  offline?: 'offline-first' | 'device-only',
): SovereignManifest {
  return { id, routePrefix, offline } as unknown as SovereignManifest;
}

describe('getExamplePluginIds', () => {
  it('returns only ids of plugins marked example: true', () => {
    const plugins = [
      manifest('fs.sovereign.console'),
      manifest('fs.sovereign.example-basic', true),
      manifest('fs.sovereign.example-api', true),
      manifest('fs.sovereign.launcher', false),
    ];
    expect(getExamplePluginIds(plugins)).toEqual([
      'fs.sovereign.example-basic',
      'fs.sovereign.example-api',
    ]);
  });

  it('returns an empty array when no plugin is an example', () => {
    expect(getExamplePluginIds([manifest('a'), manifest('b', false)])).toEqual([]);
  });
});

describe('getDevelopmentPluginIds', () => {
  it('returns only ids of plugins marked development: true', () => {
    const plugins = [
      manifest('fs.sovereign.console'),
      manifest('fs.sovereign.tritext', false, true),
      manifest('fs.sovereign.ledger', false, true),
      manifest('fs.sovereign.tasks', false, false),
    ];
    expect(getDevelopmentPluginIds(plugins)).toEqual([
      'fs.sovereign.tritext',
      'fs.sovereign.ledger',
    ]);
  });

  it('returns an empty array when no plugin is flagged development', () => {
    expect(getDevelopmentPluginIds([manifest('a'), manifest('b', false, false)])).toEqual([]);
  });
});

describe('getOfflineRoutePrefixes', () => {
  it('includes the bare routePrefix for a plugin declaring offline: "device-only"', () => {
    const plugins = [manifestWithOffline('fs.sovereign.wallet', '/wallet', 'device-only')];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/wallet']);
  });

  it('resolves multiple non-Launcher offline-enabled plugins, of either tier, to their own bare routePrefix', () => {
    const plugins = [
      manifestWithOffline('fs.sovereign.wallet', '/wallet', 'device-only'),
      manifestWithOffline('fs.sovereign.shopper', '/shopper', 'offline-first'),
    ];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/wallet', '/shopper']);
  });

  it('returns an empty array when no plugin declares an offline tier', () => {
    expect(
      getOfflineRoutePrefixes([manifestWithOffline('a', '/a'), manifestWithOffline('b', '/b')]),
    ).toEqual([]);
  });

  // `/` handling (research 0012 leg 2's start-url auth-bypass fix) — `/`
  // shares Launcher's neutral-shell cache only when Launcher itself is
  // offline-first, since middleware rewrites `/` to Launcher's route by
  // default and the two must get identical treatment.
  it('prepends "/" when the default root plugin (Launcher) declares offline: "offline-first"', () => {
    const plugins = [manifestWithOffline('fs.sovereign.launcher', '/launcher', 'offline-first')];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/', '/launcher']);
  });

  it('prepends "/" when Launcher declares offline: "device-only" too', () => {
    const plugins = [manifestWithOffline('fs.sovereign.launcher', '/launcher', 'device-only')];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/', '/launcher']);
  });

  it('does not include "/" when Launcher is installed but not offline-enabled', () => {
    const plugins = [
      manifestWithOffline('fs.sovereign.launcher', '/launcher'),
      manifestWithOffline('fs.sovereign.wallet', '/wallet', 'device-only'),
    ];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/wallet']);
  });

  it('does not include "/" when Launcher is not installed at all, even if another plugin is offline-enabled', () => {
    const plugins = [manifestWithOffline('fs.sovereign.wallet', '/wallet', 'device-only')];
    expect(getOfflineRoutePrefixes(plugins)).toEqual(['/wallet']);
  });
});

describe('getMobileChromeConfig', () => {
  it('omits plugins with no shellConfig or defaults-only shellConfig', () => {
    const plugins = [
      manifestWithShellConfig('fs.sovereign.tasks', '/tasks'),
      manifestWithShellConfig('fs.sovereign.wallet', '/wallet', {
        mobileHeader: true,
        mobileFooter: true,
      }),
    ];
    expect(getMobileChromeConfig(plugins)).toEqual([]);
  });

  it('includes a plugin that hides only its mobile footer, defaulting header to true', () => {
    const plugins = [
      manifestWithShellConfig('fs.sovereign.chat', '/chat', { mobileFooter: false }),
    ];
    expect(getMobileChromeConfig(plugins)).toEqual([
      { routePrefix: '/chat', mobileHeader: true, mobileFooter: false },
    ]);
  });

  it('includes a plugin that hides only its mobile header, defaulting footer to true', () => {
    const plugins = [
      manifestWithShellConfig('fs.sovereign.canvas', '/canvas', { mobileHeader: false }),
    ];
    expect(getMobileChromeConfig(plugins)).toEqual([
      { routePrefix: '/canvas', mobileHeader: false, mobileFooter: true },
    ]);
  });

  it('includes a plugin that hides both', () => {
    const plugins = [
      manifestWithShellConfig('fs.sovereign.viewer', '/viewer', {
        mobileHeader: false,
        mobileFooter: false,
      }),
    ];
    expect(getMobileChromeConfig(plugins)).toEqual([
      { routePrefix: '/viewer', mobileHeader: false, mobileFooter: false },
    ]);
  });
});
