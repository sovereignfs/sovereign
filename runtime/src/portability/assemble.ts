import type { PluginExportSection } from '@sovereignfs/sdk';
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
}

export interface AssembleArgs {
  userId: string;
  tenantId: string;
  platform: PlatformExportData;
  platformVersion: string;
  /** Public instance URL recorded for provenance (cross-instance migration). */
  sourceInstance: string | null;
  /**
   * Ids of installed, enabled plugins that declare the `data:export` permission.
   * The caller computes this from the registry + plugin status + manifests; the
   * assembler only invokes an exporter for an id in this allow-list.
   */
  exportPlugins: string[];
}

/**
 * Assemble a user's export into a versioned ZIP (RFC 0007). Writes the platform
 * slice directly, then invokes each eligible plugin's registered export resolver
 * (scoped to the user). A plugin in `exportPlugins` with no registered resolver
 * is simply absent from the bundle.
 */
export async function assembleExport(args: AssembleArgs): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const sections: BundleSectionMeta[] = [];

  // Platform section: profile + preferences (+ avatar blob).
  const accountJson = jsonToU8({
    profile: { name: args.platform.name, email: args.platform.email, image: args.platform.image },
    preferences: { timezone: args.platform.timezone, theme: args.platform.theme },
    vaultSecrets: args.platform.vaultSecrets,
  });
  files['platform/account.json'] = accountJson;
  sections.push({ pluginId: PLATFORM_SECTION_ID, schemaVersion: 1, checksum: sha256(accountJson) });
  if (args.platform.avatar) {
    files[`platform/avatar.${args.platform.avatar.ext}`] = args.platform.avatar.bytes;
  }

  // Plugin sections: each eligible, opted-in plugin contributes its own slice.
  for (const pluginId of args.exportPlugins) {
    const exporter = getExporter(pluginId);
    if (!exporter) continue;
    const section: PluginExportSection = await exporter({
      userId: args.userId,
      tenantId: args.tenantId,
    });
    const dataJson = jsonToU8(section.data);
    files[`plugins/${section.pluginId}/data.json`] = dataJson;
    sections.push({
      pluginId: section.pluginId,
      schemaVersion: section.schemaVersion,
      checksum: sha256(dataJson),
    });
    for (const [path, bytes] of Object.entries(section.blobs ?? {})) {
      files[`plugins/${section.pluginId}/blobs/${path}`] = bytes;
    }
  }

  const manifest: BundleManifest = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { instance: args.sourceInstance, platformVersion: args.platformVersion },
    subject: { userId: args.userId, email: args.platform.email },
    sections,
  };
  files['manifest.json'] = jsonToU8(manifest);

  return buildZip(files);
}
