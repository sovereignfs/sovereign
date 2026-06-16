import { describe, expect, it } from 'vitest';

import { checkCompatibility } from '../compatibility';
import type { SovereignManifest } from '../types';

const base: SovereignManifest = {
  schemaVersion: 1,
  id: 'fs.example.tasks',
  name: 'Tasks',
  version: '1.0.0',
  type: 'platform',
  runtime: 'native',
  routePrefix: '/tasks',
  permissions: ['auth:session'],
  compatibility: { minPlatformVersion: '0.4.0' },
};

describe('checkCompatibility', () => {
  it('returns compatible when all checks pass', () => {
    const result = checkCompatibility(base, '0.6.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('returns compatible with no warnings when platform exactly meets minPlatformVersion', () => {
    const result = checkCompatibility(base, '0.4.0');
    expect(result.compatible).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns incompatible when schemaVersion exceeds the current understood version', () => {
    const future = { ...base, schemaVersion: 999 } as unknown as SovereignManifest;
    const result = checkCompatibility(future, '99.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('999');
    expect(result.reason).toContain('not understood');
  });

  it('returns incompatible when platform is below minPlatformVersion', () => {
    const result = checkCompatibility(base, '0.3.9');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('0.4.0');
    expect(result.reason).toContain('0.3.9');
  });

  it('returns incompatible for future minPlatformVersion regardless of patch', () => {
    const strict = {
      ...base,
      compatibility: { minPlatformVersion: '1.0.0' },
    } as SovereignManifest;
    const result = checkCompatibility(strict, '0.99.99');
    expect(result.compatible).toBe(false);
  });

  it('returns compatible with advisory warning when platform exceeds maxPlatformVersion', () => {
    const capped: SovereignManifest = {
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: '0.6.0' },
    };
    const result = checkCompatibility(capped, '0.7.0');
    expect(result.compatible).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('0.6.0');
    expect(result.warnings[0]).toContain('0.7.0');
  });

  it('returns no warning when platform equals maxPlatformVersion', () => {
    const capped: SovereignManifest = {
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: '0.6.0' },
    };
    const result = checkCompatibility(capped, '0.6.0');
    expect(result.compatible).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns no warning when maxPlatformVersion is absent', () => {
    const result = checkCompatibility(base, '99.0.0');
    expect(result.compatible).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('handles pre-release semver correctly (0.10.0 > 0.9.0, not 0.1.0)', () => {
    const result = checkCompatibility(
      { ...base, compatibility: { minPlatformVersion: '0.10.0' } } as SovereignManifest,
      '0.9.0',
    );
    expect(result.compatible).toBe(false);
  });

  it('names the plugin in the incompatibility reason', () => {
    const result = checkCompatibility(base, '0.1.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Tasks');
  });
});
