import type { PluginExportSection } from '@sovereignfs/sdk';
import {
  type BundleManifest,
  PLATFORM_SECTION_ID,
  assertSupportedFormat,
  createRemapper,
  readZip,
  u8ToJson,
} from './bundle';
import type { PlatformE2eeExportData } from './assemble';
import { getImporter } from './registry';

/** The platform-owned slice parsed from `platform/account.json`. */
export interface PlatformAccountSection {
  profile: { name: string | null; email: string | null; image: string | null };
  preferences: { timezone: string; theme: string };
  /** Absent in bundles exported before this field existed. */
  e2ee?: PlatformE2eeExportData | null;
}

export interface ImportSectionResult {
  pluginId: string;
  status: 'imported' | 'skipped';
  warning?: string;
}

export interface ImportSummary {
  formatVersion: number;
  sourceInstance: string | null;
  sections: ImportSectionResult[];
}

export interface ApplyImportArgs {
  bytes: Uint8Array;
  userId: string;
  tenantId: string;
  /**
   * Ids of installed, enabled plugins that declare `data:import`. A bundle
   * section for any other plugin is skipped with a warning (additive, safe).
   */
  importPlugins: Set<string>;
  /** Applies the platform slice (profile/prefs/avatar) — owns auth + DB + disk. */
  platformImporter: (
    account: PlatformAccountSection,
    avatar: { ext: string; bytes: Uint8Array } | null,
  ) => Promise<void>;
}

/**
 * Validate and apply an uploaded bundle into the importing user's account
 * (RFC 0007). Additive only: the platform importer and each plugin's import
 * handler create records scoped to `userId`; nothing overwrites another user's
 * data. Unknown / disabled / un-permitted plugins are skipped with a warning.
 * IDs are remapped via a per-import remapper so internal references survive
 * without colliding with existing rows.
 */
export async function applyImport(args: ApplyImportArgs): Promise<ImportSummary> {
  const files = readZip(args.bytes);

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('Invalid bundle: manifest.json is missing.');
  const manifest = u8ToJson<BundleManifest>(manifestBytes);
  assertSupportedFormat(manifest.formatVersion);

  const remapId = createRemapper();
  const results: ImportSectionResult[] = [];

  for (const meta of manifest.sections) {
    if (meta.pluginId === PLATFORM_SECTION_ID) {
      const accountBytes = files['platform/account.json'];
      if (!accountBytes) {
        results.push({ pluginId: PLATFORM_SECTION_ID, status: 'skipped', warning: 'missing' });
        continue;
      }
      const account = u8ToJson<PlatformAccountSection>(accountBytes);
      const avatar = findAvatar(files);
      await args.platformImporter(account, avatar);
      results.push({ pluginId: PLATFORM_SECTION_ID, status: 'imported' });
      continue;
    }

    if (!args.importPlugins.has(meta.pluginId)) {
      results.push({
        pluginId: meta.pluginId,
        status: 'skipped',
        warning: 'plugin not installed, disabled, or missing the data:import permission',
      });
      continue;
    }
    const importer = getImporter(meta.pluginId);
    if (!importer) {
      results.push({
        pluginId: meta.pluginId,
        status: 'skipped',
        warning: 'no import handler registered for this plugin',
      });
      continue;
    }

    const dataBytes = files[`plugins/${meta.pluginId}/data.json`];
    if (!dataBytes) {
      results.push({ pluginId: meta.pluginId, status: 'skipped', warning: 'section data missing' });
      continue;
    }
    const section: PluginExportSection = {
      pluginId: meta.pluginId,
      pluginVersion: meta.pluginVersion,
      schemaVersion: meta.schemaVersion,
      data: u8ToJson(dataBytes),
      blobs: collectBlobs(files, meta.pluginId),
      secretMetadata: meta.secretMetadata,
      warnings: meta.warnings,
      // Passed through as inert metadata only (RFC 0051) — the import handler
      // may store them, but the platform never dereferences them here.
      references: meta.references,
    };
    await importer(section, { userId: args.userId, tenantId: args.tenantId, remapId });
    results.push({ pluginId: meta.pluginId, status: 'imported' });
  }

  return {
    formatVersion: manifest.formatVersion,
    sourceInstance: manifest.source.instance,
    sections: results,
  };
}

/** Find the single `platform/avatar.<ext>` entry, if present. */
function findAvatar(files: Record<string, Uint8Array>): { ext: string; bytes: Uint8Array } | null {
  const path = Object.keys(files).find((p) => p.startsWith('platform/avatar.'));
  if (!path) return null;
  const ext = path.slice('platform/avatar.'.length);
  return { ext, bytes: files[path] as Uint8Array };
}

/** Collect a plugin section's blobs, keyed by their relative path. */
function collectBlobs(
  files: Record<string, Uint8Array>,
  pluginId: string,
): Record<string, Uint8Array> | undefined {
  const prefix = `plugins/${pluginId}/blobs/`;
  const blobs: Record<string, Uint8Array> = {};
  let found = false;
  for (const [path, bytes] of Object.entries(files)) {
    if (path.startsWith(prefix)) {
      blobs[path.slice(prefix.length)] = bytes;
      found = true;
    }
  }
  return found ? blobs : undefined;
}
