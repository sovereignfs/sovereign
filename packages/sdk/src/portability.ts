import { headers } from 'next/headers';
import { requireHost } from './host';

/** Supplied by the runtime to an export resolver — scoped to the current user. */
export interface ExportContext {
  userId: string;
  tenantId: string;
}

/** Supplied by the runtime to an import handler — scoped to the importing user. */
export interface ImportContext {
  userId: string;
  tenantId: string;
  /**
   * Maps an id from the source bundle to the id minted on this instance.
   * Stable within one import: the same `originalId` always yields the same new
   * id, so a plugin can preserve internal references (FKs) without breakage.
   */
  remapId(originalId: string): string;
}

/** One plugin's slice of a user's export. */
export interface PluginExportSection {
  /** The contributing plugin's manifest `id`. */
  pluginId: string;
  /** The plugin's own data-format version (for forward/backward compatibility). */
  schemaVersion: number;
  /** Plugin-defined JSON payload (rows, references). */
  data: unknown;
  /** Optional binary attachments, keyed by relative path within the section. */
  blobs?: Record<string, Uint8Array>;
}

/** Produces one plugin's export section for the current user. */
export type ExportResolver = (ctx: ExportContext) => Promise<PluginExportSection>;

/** Restores one plugin's export section into the importing user's account. */
export type ImportHandler = (section: PluginExportSection, ctx: ImportContext) => Promise<void>;

/**
 * User data portability (RFC 0007) — self-service export / restore / migration.
 *
 * A plugin opts in by registering an **export resolver** and an **import
 * handler** (declare `data:export` / `data:import` in the manifest `permissions`).
 * Both are runtime-mediated: the runtime supplies `ctx.userId` / `ctx.tenantId`,
 * so a plugin only ever reads or writes the **current user's own slice** — never
 * another user's, another plugin's, or another tenant's data.
 *
 * ```ts
 * // register from your plugin's server code (a route handler or server
 * // component that runs when the plugin is loaded):
 * await sdk.portability.provideExport(async (ctx) => ({
 *   pluginId: 'com.example.tasks',
 *   schemaVersion: 1,
 *   data: await collectMyRowsFor(ctx.userId),
 * }));
 *
 * await sdk.portability.provideImport(async (section, ctx) => {
 *   await restoreMyRowsFor(section.data, ctx); // use ctx.remapId for references
 * });
 * ```
 *
 * The platform exports/imports its own data (profile, preferences, avatar)
 * directly; plugins contribute the rest. The user drives it from the
 * Account → Data tab.
 *
 * Registration reads the calling plugin's id from the request context, so these
 * must run inside a plugin route (where `x-sovereign-plugin-id` is injected) —
 * hence they are async. Registrations are in-process and reset on restart.
 */
export const portability = {
  /** Provider: register this plugin's export resolver. */
  async provideExport(resolver: ExportResolver): Promise<void> {
    const pluginId = (await headers()).get('x-sovereign-plugin-id');
    if (!pluginId) {
      throw new Error(
        'sdk.portability.provideExport() must be called from a plugin route context ' +
          '(x-sovereign-plugin-id header missing).',
      );
    }
    requireHost().portability.provideExport(pluginId, resolver);
  },

  /** Provider: register this plugin's import handler. */
  async provideImport(handler: ImportHandler): Promise<void> {
    const pluginId = (await headers()).get('x-sovereign-plugin-id');
    if (!pluginId) {
      throw new Error(
        'sdk.portability.provideImport() must be called from a plugin route context ' +
          '(x-sovereign-plugin-id header missing).',
      );
    }
    requireHost().portability.provideImport(pluginId, handler);
  },
};
