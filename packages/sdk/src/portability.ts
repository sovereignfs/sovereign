import { headers } from 'next/headers';
import { requireHost } from './host';

/** Supplied by the runtime to an export resolver — scoped to the current user. */
export interface ExportContext {
  userId: string;
  tenantId: string;
  /** User-selected export scope (RFC 0052). */
  options: ExportOptions;
}

/** User-selectable export scope, gathered by the Account Data tab. */
export interface ExportOptions {
  /** Whether to include plugin-contributed file blobs. Defaults to `true`. */
  includeFiles: boolean;
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

/** Metadata about one of the plugin's own secrets, without its plaintext value. */
export interface ExportSecretMetadata {
  /** The secret's user-facing label (e.g. "Personal API key"). */
  label: string;
  /** The secret's provider/purpose (e.g. "openai", "smtp"). */
  provider: string;
  /** Whether a value is currently stored — never the value itself. */
  exists: boolean;
}

/** One plugin's slice of a user's export. */
export interface PluginExportSection {
  /** The contributing plugin's manifest `id`. */
  pluginId: string;
  /**
   * The installed manifest `version` of the contributing plugin, for provenance.
   * A resolver may omit this — the runtime always overwrites it with the
   * installed manifest's actual `version` before writing the bundle, so a
   * plugin cannot misreport its own version.
   */
  pluginVersion?: string;
  /** The plugin's own data-format version (for forward/backward compatibility). */
  schemaVersion: number;
  /** Plugin-defined JSON payload (rows, references). */
  data: unknown;
  /** Optional binary attachments, keyed by relative path within the section. */
  blobs?: Record<string, Uint8Array>;
  /**
   * Metadata for secrets this plugin owns, scoped to the current user.
   * Plaintext secret values must never appear here or anywhere in the export.
   */
  secretMetadata?: ExportSecretMetadata[];
  /** Non-fatal notices about this section (e.g. a file that was skipped). */
  warnings?: string[];
}

/** Produces one plugin's export section for the current user. */
export type ExportResolver = (ctx: ExportContext) => Promise<PluginExportSection>;

/** Restores one plugin's export section into the importing user's account. */
export type ImportHandler = (section: PluginExportSection, ctx: ImportContext) => Promise<void>;

/** Supplied to a deletion handler — scoped to the user being deleted. */
export interface DeletionContext {
  userId: string;
  tenantId: string;
  /** The plugin's own Drizzle client (same as `sdk.db.getClient()`). */
  db: unknown;
}

/** What a deletion handler must return. */
export interface DeletionResult {
  /** Number of rows (or objects) deleted. */
  deleted: number;
  /** Non-fatal errors encountered during cleanup. */
  errors?: string[];
}

/** Cleans up one plugin's user data when a user account is deleted. */
export type DeletionHandler = (ctx: DeletionContext) => Promise<DeletionResult>;

/**
 * User data portability (RFC 0007, RFC 0052) — self-service export / restore /
 * migration.
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
 *   // only when ctx.options.includeFiles is true — large attachments should
 *   // respect the user's export scope choice:
 *   blobs: ctx.options.includeFiles ? await collectMyBlobsFor(ctx.userId) : undefined,
 *   secretMetadata: await listMySecretMetadataFor(ctx.userId), // never plaintext
 * }));
 *
 * await sdk.portability.provideImport(async (section, ctx) => {
 *   await restoreMyRowsFor(section.data, ctx); // use ctx.remapId for references
 * });
 * ```
 *
 * The platform exports/imports its own data (profile, preferences, avatar)
 * directly; plugins contribute the rest. The user drives it from the
 * Account → Data tab, including whether to include files/attachments
 * (`ctx.options.includeFiles`). A resolver that throws is excluded from the
 * bundle and recorded in the manifest's `failures` list — one plugin's failure
 * never aborts the whole export.
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

  /** Provider: register this plugin's deletion handler (RFC 0033). */
  async provideDelete(handler: DeletionHandler): Promise<void> {
    const pluginId = (await headers()).get('x-sovereign-plugin-id');
    if (!pluginId) {
      throw new Error(
        'sdk.portability.provideDelete() must be called from a plugin route context ' +
          '(x-sovereign-plugin-id header missing).',
      );
    }
    requireHost().portability.provideDelete(pluginId, handler);
  },
};
