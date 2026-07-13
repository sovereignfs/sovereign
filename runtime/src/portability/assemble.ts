import type { ExportOptions, PluginExportSection } from '@sovereignfs/sdk';
import {
  type BundleManifest,
  type BundleSectionMeta,
  EXPORT_FORMAT_VERSION,
  PLATFORM_SECTION_ID,
  buildZip,
  jsonToU8,
  sha256,
} from './bundle';
import { getExporter } from './registry';

/**
 * Client-side encryption material (RFC 0060) included in a platform export.
 * Wrapped ciphertext and non-sensitive algorithm/KDF metadata only — the same
 * "opaque to the server" shapes `sdk.e2ee` already persists. `null` when the
 * user has no encryption profile set up.
 */
export interface PlatformE2eeExportData {
  profile: { status: string; cmkAlgorithm: string };
  recoveryWrapper: {
    wrappedCmk: string;
    kdfAlgorithm: string;
    kdfParams: string;
    kdfSalt: string;
    algorithmVersion: string;
  } | null;
  /** Active (non-revoked) device enrollments only — a revoked device has no recovery value. */
  deviceEnrollments: {
    deviceId: string;
    deviceLabel: string | null;
    wrappedCmk: string;
    algorithmVersion: string;
  }[];
}

/** The platform-owned slice of a user's data (not contributed by a plugin). */
export interface PlatformExportData {
  name: string | null;
  email: string | null;
  /** Servable avatar URL stored on the user record, if any. */
  image: string | null;
  timezone: string;
  theme: string;
  /** Metadata-only plugin vault entries. Plaintext secret values are never exported. */
  vaultSecrets: {
    id: string;
    pluginId: string;
    scope: 'user';
    label: string;
    metadata: Record<string, unknown> | null;
    createdAt: number;
    updatedAt: number;
    lastUsedAt: number | null;
  }[];
  /** The avatar file bytes + extension, read from disk by the caller. */
  avatar: { ext: string; bytes: Uint8Array } | null;
  e2ee: PlatformE2eeExportData | null;
}

export interface AssembleArgs {
  userId: string;
  tenantId: string;
  platform: PlatformExportData;
  platformVersion: string;
  /** Public instance URL recorded for provenance (cross-instance migration). */
  sourceInstance: string | null;
  /**
   * Ids of installed, enabled plugins that declare the `data:export` permission,
   * mapped to their installed manifest `version`. The caller computes this from
   * the registry + plugin status + manifests; the assembler only invokes an
   * exporter for an id in this allow-list, and always trusts this map's version
   * over anything a resolver returns.
   */
  exportPlugins: Record<string, string>;
  /** User-selected export scope (RFC 0052). Defaults to including files. */
  options?: ExportOptions;
}

/**
 * Assemble a user's export into a versioned ZIP (RFC 0007 / RFC 0052). Writes
 * the platform slice directly, then invokes each eligible plugin's registered
 * export resolver (scoped to the user). A plugin in `exportPlugins` with no
 * registered resolver is simply absent from the bundle. A resolver that throws
 * is recorded in the manifest's `failures` and excluded from the bundle —
 * one plugin's failure never aborts the whole export.
 */
export async function assembleExport(args: AssembleArgs): Promise<Uint8Array> {
  const options: ExportOptions = args.options ?? { includeFiles: true };
  const files: Record<string, Uint8Array> = {};
  const sections: BundleSectionMeta[] = [];
  const failures: { pluginId: string; error: string }[] = [];

  // Platform section: profile + preferences (+ avatar blob).
  const accountJson = jsonToU8({
    profile: { name: args.platform.name, email: args.platform.email, image: args.platform.image },
    preferences: { timezone: args.platform.timezone, theme: args.platform.theme },
    vaultSecrets: args.platform.vaultSecrets,
    e2ee: args.platform.e2ee,
  });
  files['platform/account.json'] = accountJson;
  sections.push({ pluginId: PLATFORM_SECTION_ID, schemaVersion: 1, checksum: sha256(accountJson) });
  if (options.includeFiles && args.platform.avatar) {
    files[`platform/avatar.${args.platform.avatar.ext}`] = args.platform.avatar.bytes;
  }

  // Plugin sections: each eligible, opted-in plugin contributes its own slice.
  for (const [pluginId, pluginVersion] of Object.entries(args.exportPlugins)) {
    const exporter = getExporter(pluginId);
    if (!exporter) continue;

    let section: PluginExportSection;
    try {
      section = await exporter({ userId: args.userId, tenantId: args.tenantId, options });
    } catch (e) {
      failures.push({ pluginId, error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const dataJson = jsonToU8(section.data);
    files[`plugins/${section.pluginId}/data.json`] = dataJson;
    sections.push({
      pluginId: section.pluginId,
      pluginVersion,
      schemaVersion: section.schemaVersion,
      checksum: sha256(dataJson),
      secretMetadata: section.secretMetadata,
      warnings: section.warnings,
    });
    if (options.includeFiles) {
      for (const [path, bytes] of Object.entries(section.blobs ?? {})) {
        files[`plugins/${section.pluginId}/blobs/${path}`] = bytes;
      }
    }
  }

  const manifest: BundleManifest = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { instance: args.sourceInstance, platformVersion: args.platformVersion },
    subject: { userId: args.userId, email: args.platform.email },
    sections,
    failures: failures.length > 0 ? failures : undefined,
  };
  files['manifest.json'] = jsonToU8(manifest);

  return buildZip(files);
}
