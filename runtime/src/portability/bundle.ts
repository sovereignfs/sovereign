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

/**
 * Bumped on a breaking change to the bundle layout itself, or (v2, RFC 0068)
 * when a new top-level `BundleManifest` field is added that older readers
 * should know to expect explicitly rather than infer forward-compatibility.
 */
export const EXPORT_FORMAT_VERSION = 2;

/** Reserved section id for the platform-owned slice (profile/prefs/avatar). */
export const PLATFORM_SECTION_ID = 'platform';

export interface BundleSectionMeta {
  /** `PLATFORM_SECTION_ID` for the platform slice, otherwise a plugin id. */
  pluginId: string;
  /** The installed manifest version of the contributing plugin, if known. */
  pluginVersion?: string;
  /** The section's own data-format version. */
  schemaVersion: number;
  /** sha256 (hex) of the section's `data.json` bytes — detects tampering/corruption. */
  checksum: string;
  /** Metadata for secrets this section's plugin owns — never plaintext values. */
  secretMetadata?: { label: string; provider: string; exists: boolean }[];
  /** Non-fatal notices surfaced from assembling this section. */
  warnings?: string[];
  /**
   * Opaque cross-plugin references this section holds (RFC 0051), carried as
   * inert metadata only — never dereferenced or used to grant access.
   */
  references?: {
    providerId: string;
    resourceType: string;
    resourceId: string;
    contract?: string;
    version?: number;
    labelSnapshot?: string;
    metadata?: unknown;
    linkedAt: string;
  }[];
}

/**
 * Every plugin installed for the exporting user's tenant, regardless of
 * whether it participated in this export (RFC 0068). Populated independently
 * of `exportPlugins`/`sections` so a user can distinguish "no data" from
 * "this plugin doesn't support export."
 */
export interface InstalledPluginRosterEntry {
  pluginId: string;
  pluginVersion: string;
  enabled: boolean;
  participatesExport: boolean;
  participatesImport: boolean;
}

/**
 * A plugin that was eligible to export (installed, enabled, declares
 * `data:export`) but contributed nothing because no exporter is registered
 * for it — recorded instead of silently omitted (RFC 0068).
 */
export interface NotExportedEntry {
  pluginId: string;
  reason: 'no-export-hook' | 'disabled';
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
  /**
   * Plugins whose exporter threw and were excluded from the bundle entirely
   * (RFC 0052 — one plugin's failure must not abort the whole export).
   */
  failures?: { pluginId: string; error: string }[];
  /** RFC 0068 — every plugin installed for this tenant, participation flags included. */
  installedPlugins: InstalledPluginRosterEntry[];
  /** RFC 0068 — plugins eligible to export but with no registered exporter. */
  notExported: NotExportedEntry[];
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
