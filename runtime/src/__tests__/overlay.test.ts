import { describe, expect, it } from 'vitest';
import type { SovereignManifest } from '@sovereignfs/manifest';
import {
  DEFAULT_OVERLAY_SIZE,
  overlaySizeForSegment,
  routeSegmentFromInterception,
} from '../overlay';

const plugin = (over: Partial<SovereignManifest>): SovereignManifest =>
  ({
    schemaVersion: 1,
    id: 'fs.sovereign.test',
    name: 'Test',
    version: '0.1.0',
    type: 'platform',
    runtime: 'native',
    routePrefix: '/test',
    permissions: [],
    compatibility: { minPlatformVersion: '0.4.0' },
    ...over,
  }) as SovereignManifest;

describe('routeSegmentFromInterception', () => {
  it('strips the (.) interception marker', () => {
    expect(routeSegmentFromInterception('(.)console')).toBe('console');
  });

  it('leaves a plain segment untouched', () => {
    expect(routeSegmentFromInterception('console')).toBe('console');
  });
});

describe('overlaySizeForSegment', () => {
  const plugins = [
    plugin({ routePrefix: '/console', shell: 'overlay', shellConfig: { overlaySize: 'sm' } }),
    plugin({ routePrefix: '/account', shell: 'overlay' }), // no declared size
    plugin({ routePrefix: '/launcher', shell: 'default' }),
  ];

  it('returns the plugin-declared size for its interception segment', () => {
    expect(overlaySizeForSegment('(.)console', plugins)).toBe('sm');
  });

  it('defaults to lg when the plugin omits overlaySize', () => {
    expect(overlaySizeForSegment('(.)account', plugins)).toBe(DEFAULT_OVERLAY_SIZE);
  });

  it('defaults to lg for the slot default / null segment', () => {
    expect(overlaySizeForSegment(null, plugins)).toBe('lg');
    expect(overlaySizeForSegment('__DEFAULT__', plugins)).toBe('lg');
  });

  it('defaults to lg for an unknown segment', () => {
    expect(overlaySizeForSegment('(.)nope', plugins)).toBe('lg');
  });
});
