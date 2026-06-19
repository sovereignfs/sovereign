import { createHash, randomUUID } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Versioned-ZIP bundle helpers for user data portability (RFC 0007). Pure
 * functions (no I/O beyond in-memory zip/hash) so they unit-test in isolation.
 *
 * Bundle layout:
 *   manifest.json                      — BundleManifest (this file's shape)
 *   platform/account.json              — profile + preferences
 *   platform/avatar.<ext>              — avatar file, if any
 *   plugins/<pluginId>/data.json       — a plugin's PluginExportSection.data
 *   plugins/<pluginId>/blobs/<path>    — a plugin's binary attachments
 */

/** Bumped only on a breaking change to the bundle layout itself. */
export const EXPORT_FORMAT_VERSION = 1;

/** Reserved section id for the platform-owned slice (profile/prefs/avatar). */
export const PLATFORM_SECTION_ID = 'platform';

export interface BundleSectionMeta {
  /** `PLATFORM_SECTION_ID` for the platform slice, otherwise a plugin id. */
  pluginId: string;
  /** The section's own data-format version. */
  schemaVersion: number;
  /** sha256 (hex) of the section's `data.json` bytes — detects tampering/corruption. */
  checksum: string;
}

export interface BundleManifest {
  formatVersion: number;
  /** ISO-8601 timestamp. */
  exportedAt: string;
  source: {
    /** Public URL of the instance that produced the bundle, for provenance. */
    instance: string | null;
    platformVersion: string;
  };
  subject: {
    userId: string;
    email: string | null;
  };
  sections: BundleSectionMeta[];
}

/** sha256 hex digest of bytes. */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Serialise a value to pretty JSON bytes. */
export function jsonToU8(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

/** Parse JSON bytes back to a value. */
export function u8ToJson<T>(bytes: Uint8Array): T {
  return JSON.parse(strFromU8(bytes)) as T;
}

/** Zip a flat path→bytes map (deflate level 6). */
export function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 });
}

/** Unzip to a flat path→bytes map. Throws on a corrupt archive. */
export function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

/**
 * A stable id remapper for one import: the same source id always yields the same
 * freshly-minted id, so a plugin can preserve internal references (FKs) while
 * never colliding with existing rows on this instance.
 */
export function createRemapper(): (originalId: string) => string {
  const map = new Map<string, string>();
  return (originalId: string): string => {
    let mapped = map.get(originalId);
    if (mapped === undefined) {
      mapped = randomUUID();
      map.set(originalId, mapped);
    }
    return mapped;
  };
}

/** Reject a bundle whose overall format is newer than this instance understands. */
export function assertSupportedFormat(formatVersion: number): void {
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    throw new Error(`Invalid export formatVersion: ${String(formatVersion)}.`);
  }
  if (formatVersion > EXPORT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported export formatVersion ${formatVersion}; this instance supports up to ${EXPORT_FORMAT_VERSION}. Upgrade before importing.`,
    );
  }
}
