import semver from 'semver';
import { CURRENT_MANIFEST_SCHEMA_VERSION } from './schema';
import type { SovereignManifest } from './types';

export interface CompatibilityResult {
  compatible: boolean;
  /** Set when `compatible` is false — human-readable reason for the refusal. */
  reason?: string;
  /** Non-blocking advisory warnings (e.g. platform exceeds `maxPlatformVersion`). */
  warnings: string[];
}

/**
 * Check whether a plugin manifest is compatible with the running platform.
 *
 * Three checks, in order:
 * 1. `schemaVersion` ≤ `CURRENT_MANIFEST_SCHEMA_VERSION` (hard — unknown format).
 * 2. `minPlatformVersion` ≤ `platformVersion` (hard — plugin needs a newer platform).
 * 3. `maxPlatformVersion` ≥ `platformVersion` (advisory — plugin untested on this version).
 *
 * Pure function — no I/O, unit-testable in isolation.
 */
export function checkCompatibility(
  manifest: SovereignManifest,
  platformVersion: string,
): CompatibilityResult {
  const warnings: string[] = [];

  if (manifest.schemaVersion > CURRENT_MANIFEST_SCHEMA_VERSION) {
    return {
      compatible: false,
      reason:
        `Manifest format version ${manifest.schemaVersion} is not understood by this platform ` +
        `(maximum: ${CURRENT_MANIFEST_SCHEMA_VERSION}). Upgrade the platform to use this plugin.`,
      warnings,
    };
  }

  const min = manifest.compatibility.minPlatformVersion;
  if (semver.gt(min, platformVersion)) {
    return {
      compatible: false,
      reason:
        `Plugin "${manifest.name}" requires platform ≥ ${min}, ` +
        `but the running platform is ${platformVersion}. Upgrade the platform.`,
      warnings,
    };
  }

  const max = manifest.compatibility.maxPlatformVersion;
  if (max && semver.gt(platformVersion, max)) {
    warnings.push(
      `Plugin "${manifest.name}" was tested up to platform ${max} and is running on ` +
        `${platformVersion}. It may still work but has not been validated on this version.`,
    );
  }

  return { compatible: true, warnings };
}
