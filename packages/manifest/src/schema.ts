import semver from 'semver';
import { z } from 'zod';

/**
 * The manifest format version this platform understands. Manifests with a
 * higher `schemaVersion` are rejected at build/install time — the platform
 * must be upgraded to handle them. Manifests with a lower version are accepted
 * for backward compatibility as the format evolves.
 */
export const CURRENT_MANIFEST_SCHEMA_VERSION = 1;

/**
 * SDK capabilities a plugin may declare. Mirrors the `Permission` union in
 * SRS §5. Several are reserved for post-v1 (storage, notifications, events,
 * cross-plugin data sharing — `data:provide` / `data:consume`, RFC 0002 — and
 * the activity log — `activity:write`, RFC 0005).
 */
export const permissionSchema = z.enum([
  'auth:session',
  'db:readWrite',
  'db:readOnly',
  'mailer:send',
  'storage:readWrite',
  'notifications:send',
  'events:publish',
  'events:subscribe',
  'data:provide',
  'data:consume',
  'activity:write',
  'admin:*',
]);

/** Validate that a string is a valid semver string (e.g. "0.6.0"). */
const semverString = (label: string) =>
  z
    .string()
    .min(1)
    .refine((v) => semver.valid(v) !== null, {
      message: `${label} must be a valid semver string (e.g. "0.6.0")`,
    });

/**
 * The plugin manifest schema — the single source of truth for both runtime
 * validation and the exported TypeScript types (see ./types). Mirrors
 * SRS §5 Plugin Manifest Reference.
 *
 * `.strict()` rejects unknown keys so manifest typos fail the build rather than
 * being silently ignored. Forward compatibility is handled by `schemaVersion`.
 */
const manifestObjectSchema = z
  .object({
    schemaVersion: z
      .number()
      .int()
      .positive()
      .max(
        CURRENT_MANIFEST_SCHEMA_VERSION,
        `schemaVersion must be ≤ ${CURRENT_MANIFEST_SCHEMA_VERSION} (this platform's maximum). Upgrade the platform to use a newer manifest format.`,
      ),
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    database: z.enum(['shared', 'isolated']).optional(),
    type: z.enum(['platform', 'sovereign', 'community']),
    runtime: z.enum(['native', 'static', 'iframe-local', 'iframe-remote', 'external']),
    routePrefix: z.string().min(1).startsWith('/', 'routePrefix must start with "/"'),
    permissions: z.array(permissionSchema),
    shell: z.enum(['default', 'minimal', 'overlay']).optional(),
    shellConfig: z
      .object({
        /** Dialog size for `shell: overlay` plugins (default `lg`). */
        overlaySize: z.enum(['sm', 'md', 'lg']).optional(),
      })
      .strict()
      .optional(),
    adminOnly: z.boolean().optional(),
    apiProvider: z.boolean().optional(),
    icon: z.string().optional(),
    compatibility: z
      .object({
        /** Minimum platform version this plugin requires (semver). Hard-enforced at install/build/boot. */
        minPlatformVersion: semverString('minPlatformVersion'),
        /**
         * Maximum platform version this plugin has been tested against (semver). Advisory only —
         * the plugin still loads on a newer platform but surfaces a warning in Console/health.
         */
        maxPlatformVersion: semverString('maxPlatformVersion').optional(),
      })
      .strict(),
    repository: z.string().url().optional(),
  })
  .strict();

export const manifestSchema = manifestObjectSchema
  .refine((m) => m.type === 'platform' || m.repository !== undefined, {
    message: 'repository is required when type is "sovereign" or "community"',
    path: ['repository'],
  })
  .refine((m) => m.shellConfig?.overlaySize === undefined || m.shell === 'overlay', {
    message: 'shellConfig.overlaySize is only valid when shell is "overlay"',
    path: ['shellConfig', 'overlaySize'],
  });

/**
 * Manifest field names, sourced from the schema so docs and tooling share one
 * source of truth (e.g. the docs-parity test that asserts every field is
 * documented in `docs/plugin-development.md`). Order matches the schema.
 */
export const manifestFieldNames: string[] = Object.keys(manifestObjectSchema.shape);

/**
 * A registry entry — one record in the public plugin index
 * (`registry/plugins.json`). Deliberately a **thin pointer**, not a copy of the
 * manifest: it carries the source location plus display/attribution metadata,
 * and the authoritative manifest is fetched from the source
 * (`scripts/install-plugins.ts` / `sv plugin add`). Keeping it thin avoids the
 * manifest drifting between the plugin's own repo and the registry.
 *
 * `repository.type` is the **source kind** (`git` clone URL, optionally pinned
 * to a `ref`; or a `path` for a local/first-party source) — not the manifest's
 * plugin `type`.
 */
const registrySourceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('git'),
      url: z.string().url(),
      /** Optional tag/branch/commit to pin; defaults to the repo's default branch. */
      ref: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal('path'), url: z.string().min(1) }).strict(),
]);

const registryAuthorSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  })
  .strict();

/**
 * Provenance written by the registry validation script (`scripts/validate-registry.ts`)
 * and re-verified in CI: the resolved commit the plugin was validated at, and a
 * content hash over the plugin's source tree at that commit. Optional in the
 * schema (a hand-written entry has none until the script runs); the validation
 * script's `--check` mode requires it present and matching.
 */
const registryProvenanceSchema = z
  .object({
    commit: z.string().min(1),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/, 'must be "sha256:<64 hex chars>"'),
    validatedAt: z.string().min(1),
  })
  .strict();

export const registryEntrySchema = z
  .object({
    id: z.string().min(1),
    repository: registrySourceSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    author: registryAuthorSchema,
    homepage: z.string().url().optional(),
    /** SPDX licence identifier, e.g. "MIT" or "AGPL-3.0-or-later". */
    license: z.string().min(1),
    keywords: z.array(z.string().min(1)).optional(),
    provenance: registryProvenanceSchema.optional(),
  })
  .strict();

/** Registry-entry field names, sourced from the schema (parity with docs/tooling). */
export const registryEntryFieldNames: string[] = Object.keys(registryEntrySchema.shape);
