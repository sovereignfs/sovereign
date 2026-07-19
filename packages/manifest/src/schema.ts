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
 * SRS §5. Several are reserved for post-v1 (storage, notifications, events).
 * Cross-plugin data sharing (`data:provide` / `data:consume`, RFC 0002), the
 * activity log (`activity:write`, RFC 0005), and user data portability
 * (`data:export` / `data:import`, RFC 0007) are implemented.
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
  'data:export',
  'data:import',
  'activity:write',
  'e2ee:use',
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

export const manifestDatabaseSchema = z.union([
  z.enum(['shared', 'isolated']),
  z
    .object({
      isolation: z.enum(['shared', 'isolated']).optional(),
      dialect: z.enum(['sqlite']).optional(),
    })
    .strict(),
]);

export type ManifestDatabase = z.infer<typeof manifestDatabaseSchema>;
export type ManifestDatabaseDialect = 'sqlite';
export type ManifestDatabaseIsolation = 'shared' | 'isolated';

const providerConfigFieldKeySchema = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    'provider config field keys must start with a letter and contain only letters, digits, or underscores',
  );

const providerConfigFieldSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
    env: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]*$/,
        'provider config env keys must start with a capital letter and contain only capital letters, digits, and underscores',
      )
      .optional(),
    required: z.boolean().optional(),
  })
  .strict();

export function manifestDatabaseIsolation(database: unknown): ManifestDatabaseIsolation {
  if (database === 'isolated') return 'isolated';
  if (
    typeof database === 'object' &&
    database !== null &&
    'isolation' in database &&
    database.isolation === 'isolated'
  ) {
    return 'isolated';
  }
  return 'shared';
}

export function manifestDatabaseDialect(database: unknown): ManifestDatabaseDialect | undefined {
  if (
    typeof database === 'object' &&
    database !== null &&
    'dialect' in database &&
    database.dialect === 'sqlite'
  ) {
    return 'sqlite';
  }
  return undefined;
}

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
    database: manifestDatabaseSchema.optional(),
    type: z.enum(['platform', 'sovereign', 'community']),
    runtime: z.enum(['native']),
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
    /**
     * Manifest-declared public page routes (RFC 0042). Each entry exempts a
     * path prefix — relative to this plugin's own `routePrefix` — from the
     * platform's session-redirect gate. The plugin itself is responsible for
     * authorizing every request under a public route (a token, a public
     * identifier, or an optional session fallback) and must fail closed (404)
     * for anything invalid, expired, revoked, or unknown. Disabled-plugin and
     * paywall gates still apply: a monetized plugin's public routes block
     * anonymous access by default — there is no `paywallExempt` escape hatch
     * yet (an explicit open question in the RFC).
     */
    publicRoutes: z
      .array(
        z
          .object({
            /** Relative to routePrefix; must start with "/" and must not be "/". */
            prefix: z
              .string()
              .min(1)
              .startsWith('/', 'publicRoutes prefix must start with "/"')
              .refine((p) => p !== '/', { message: 'publicRoutes prefix must not be "/"' })
              .refine((p) => !p.split('/').includes('..'), {
                message: 'publicRoutes prefix must not contain ".." segments',
              })
              .refine((p) => !/[()]/.test(p), {
                message:
                  'publicRoutes prefix must not contain route groups or interception markers ("(", ")")',
              }),
            /** Human-readable description shown in docs/Console. */
            description: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1)
      .refine((arr) => new Set(arr.map((r) => r.prefix)).size === arr.length, {
        message: 'publicRoutes prefixes must be unique within the plugin',
      })
      .optional(),
    /**
     * Marks this plugin as a bundled reference/example. Purely a classification
     * flag: the platform groups example plugins in Console and offers a bulk
     * enable/disable control for them. Has no effect on routing or permissions.
     */
    example: z.boolean().optional(),
    /**
     * Marks this plugin as still under active development — not yet ready for
     * production use. Purely informational, like `example`: surfaced as a
     * warning badge in Console's plugin catalog and on Launcher tiles. Has no
     * effect on routing, access policy, or the enable/disable default.
     */
    development: z.boolean().optional(),
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
    /**
     * Cross-plugin data sharing declarations (RFC 0002). Declare the contracts
     * this plugin exposes (`provides`) and the ones it reads from other plugins
     * (`consumes`). Both require the matching `data:provide` / `data:consume`
     * permission to be listed in `permissions`.
     */
    data: z
      .object({
        /** Contracts this plugin exposes for other plugins to read (consent-gated). */
        provides: z
          .array(
            z
              .object({
                /** Stable contract name (e.g. `"expenses"`). Should be globally unique — prefix with your plugin slug. */
                contract: z.string().min(1),
                /** Contract major version. Increment on breaking schema changes. */
                version: z.number().int().positive(),
                /** Human-readable description shown on the consent prompt. */
                description: z.string().optional(),
              })
              .strict(),
          )
          .optional(),
        /** Contracts this plugin reads from other plugins (requires user consent). */
        consumes: z
          .array(
            z
              .object({
                /** The manifest `id` of the plugin that provides the contract. */
                providerId: z.string().min(1),
                /** Contract name (must match the provider's declaration). */
                contract: z.string().min(1),
                /** Contract major version (must match the provider's declaration). */
                version: z.number().int().positive(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    repository: z.string().url().optional(),
    /**
     * Plugin-declared capabilities (RFC 0022). Each key is a local capability
     * name (lowercase kebab-case); the platform auto-namespaces it to
     * `<pluginId>:<capName>` (e.g. `com.acme.myapp:create-item`).
     *
     * `defaultGrant: 'all'` means every authenticated user receives the
     * capability automatically (injected by the middleware alongside the
     * platform-role capabilities). Omitting `defaultGrant` (or `'none'`) means
     * the plugin owns the grant logic — use `sdk.db` to store per-user grants
     * in the plugin's own table and check them with `sdk.auth.hasCapability`.
     */
    capabilities: z
      .record(
        z
          .string()
          .regex(
            /^[a-z][a-z0-9-]*$/,
            'capability name must start with a lowercase letter and contain only lowercase letters, digits, and hyphens',
          ),
        z
          .object({
            /** Human-readable description of what the capability grants. */
            description: z.string().optional(),
            /**
             * Who receives the capability by default:
             * - `'all'`  — every authenticated user (injected by the middleware).
             * - `'none'` — no one by default; the plugin manages grants itself.
             * Defaults to `'none'` when omitted.
             */
            defaultGrant: z.enum(['all', 'none']).optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * Plugin-scoped environment variables (RFC 0018). Each key must be
     * UPPER_CASE_WITH_UNDERSCORES. The platform namespaces them automatically:
     * `scope: 'runtime'` → `SV_PLUGIN_<SLUG>_<KEY>`;
     * `scope: 'build'`   → `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>`.
     */
    env: z
      .record(
        z
          .string()
          .regex(
            /^[A-Z][A-Z0-9_]*$/,
            'env key must start with a capital letter and contain only capital letters, digits, and underscores',
          ),
        z
          .object({
            /** Human-readable description shown to operators and in generated docs. */
            description: z.string().min(1),
            /** When `true`, the platform fails or warns when the var is absent. */
            required: z.boolean().optional(),
            /** When `true`, the value must never be committed or appear in generated artifacts. */
            secret: z.boolean().optional(),
            /**
             * `runtime` — server-side only; set as `SV_PLUGIN_<SLUG>_<KEY>` in the container env.
             * `build`   — inlined at `next build`; set as `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>`.
             *             Never use for secrets (the value is bundled into client code).
             */
            scope: z.enum(['build', 'runtime']),
            /**
             * Default value applied when the var is absent. Not allowed on `secret` vars
             * (a secret with a default would be committed to the manifest).
             */
            default: z.string().optional(),
          })
          .strict()
          .refine((v) => !(v.secret === true && v.default !== undefined), {
            message:
              'default is not allowed on secret env vars — a default value would be committed to the manifest',
            path: ['default'],
          })
          .refine((v) => !(v.secret === true && v.scope === 'build'), {
            message:
              'secret env vars cannot use scope "build" — NEXT_PUBLIC_ vars are bundled into client code',
            path: ['scope'],
          }),
      )
      .optional(),
    /**
     * Recurring background schedules (RFC 0046, Phase 1 subset). Each entry
     * names a server-side handler module inside the plugin's `app/` directory
     * whose **default export** is a `ScheduleHandler` (`@sovereignfs/sdk`).
     * The platform's in-process scheduler invokes it every `intervalMinutes`
     * while the plugin is installed and enabled.
     *
     * Use an underscore-prefixed directory (e.g. `app/_jobs/`) so the module
     * composes into the runtime route tree without becoming a route. Handlers
     * must be idempotent: the interval is a floor, not an exact cadence, and a
     * restarted (or multi-replica) instance may invoke a handler again sooner
     * than the interval — claim work with conditional updates before acting.
     */
    schedules: z
      .array(
        z
          .object({
            /** Stable schedule identifier, unique within the plugin (lowercase kebab-case). */
            id: z
              .string()
              .regex(
                /^[a-z][a-z0-9-]*$/,
                'schedule id must start with a lowercase letter and contain only lowercase letters, digits, and hyphens',
              ),
            /** Minimum minutes between invocations (integer ≥ 1). */
            intervalMinutes: z.number().int().min(1),
            /**
             * Handler module path relative to the plugin root, inside `app/`
             * (e.g. `"app/_jobs/due-reminders.ts"`). Must be a `.ts` module and
             * must not traverse outside the plugin (`..` is rejected).
             */
            entry: z
              .string()
              .startsWith('app/', "entry must be a path inside the plugin's app/ directory")
              .endsWith('.ts', 'entry must be a .ts module')
              .refine((p) => !p.split('/').includes('..'), {
                message: 'entry must not contain ".." path segments',
              }),
          })
          .strict(),
      )
      .min(1)
      .refine((arr) => new Set(arr.map((s) => s.id)).size === arr.length, {
        message: 'schedule ids must be unique within the plugin',
      })
      .optional(),
    /**
     * External provider connection declarations (RFC 0049). These are
     * display/validation metadata for plugin-owned OAuth or connect-account
     * flows. Callback paths resolve under the plugin route prefix.
     */
    connections: z
      .object({
        providers: z
          .array(
            z
              .object({
                id: z
                  .string()
                  .regex(
                    /^[a-z0-9][a-z0-9._-]{1,119}$/,
                    'provider id must be lowercase and may contain dots, underscores, or hyphens',
                  ),
                title: z.string().min(1),
                callbackPath: z.string().min(1).startsWith('/', 'callbackPath must start with "/"'),
                /**
                 * Provider-defined OAuth/API scope identifiers (e.g. `"repo"`,
                 * `"read:user"`, `"https://www.googleapis.com/auth/gmail.readonly"`) —
                 * free-form strings meaningful to the external provider, not the
                 * `sdk.secrets` storage-scope enum. Admins can override the
                 * effective set per connection; this is the manifest-declared
                 * default (see `runtime/src/provider-configs.ts` `parseProviderScopes`).
                 */
                scopes: z.array(z.string().min(1)).min(1),
                config: z
                  .object({
                    public: z
                      .record(providerConfigFieldKeySchema, providerConfigFieldSchema)
                      .optional(),
                    secrets: z
                      .record(providerConfigFieldKeySchema, providerConfigFieldSchema)
                      .optional(),
                  })
                  .strict()
                  .optional(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
    /**
     * Optional sibling-plugin integrations (RFC 0051) — purely informational
     * metadata for install/discovery UX (Console, Account, plugin UI hints).
     * Declaring one here does not grant anything by itself; the consumer still
     * needs the matching `data:consume` permission and user consent (RFC 0002)
     * to actually read the provider's contract, or `sdk.plugins.get()` /
     * `list()` to check availability at runtime. Never an install blocker.
     */
    integrations: z
      .object({
        optional: z
          .array(
            z
              .object({
                /** The sibling plugin's manifest `id`. */
                provider: z.string().min(1),
                /** Human-readable reason shown in install/discovery UI. */
                reason: z.string().min(1),
                /** Data contract names this integration would consume, if available. */
                contracts: z.array(z.string().min(1)).optional(),
                /** Tool names this integration would invoke (RFC 0047), if available. */
                tools: z.array(z.string().min(1)).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Plugin monetization model (RFC 0003). Optional — omitting it (or setting
     * `model: "free"`) means the plugin is free to all users. Only `sovereign` and
     * `community` plugins may declare a paid model; platform plugins are always free.
     *
     * The platform gates the plugin's `routePrefix` by entitlement. A valid signed
     * license must be present (imported via Account → Billing or a payment provider
     * checkout) for `one_time`, `recurring`, and `pay_what_you_want` models.
     */
    monetization: z
      .object({
        /**
         * `free` — default; no entitlement required.
         * `one_time` — single payment grants perpetual access.
         * `recurring` — active subscription required; billed every `interval`.
         * `pay_what_you_want` — user-chosen amount; grants access like `one_time`.
         */
        model: z.enum(['free', 'one_time', 'recurring', 'pay_what_you_want']),
        /** Required when `model` is `"recurring"`. The billing cycle length. */
        interval: z.enum(['day', 'week', 'month', 'year']).optional(),
        /**
         * Named access levels. A plugin may define multiple tiers (e.g. Basic/Pro)
         * with different prices. The active tier is recorded in the entitlement so
         * the plugin can gate features accordingly via `sdk.billing.getEntitlement()`.
         * Price `amount` is in ISO 4217 minor units (e.g. cents for USD).
         */
        tiers: z
          .array(
            z
              .object({
                /** Stable tier identifier (lowercase, no spaces). */
                id: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'tier id must be lowercase'),
                /** Human-readable tier name shown in the paywall UI. */
                name: z.string().min(1),
                /** Price for this tier. */
                price: z
                  .object({
                    /** Price in minor units (e.g. 500 = $5.00). */
                    amount: z.number().int().nonnegative(),
                    /** ISO 4217 currency code (e.g. "USD", "EUR"). */
                    currency: z
                      .string()
                      .length(3)
                      .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code'),
                  })
                  .strict(),
              })
              .strict(),
          )
          .optional(),
        /**
         * License verification public key. The author holds the private key and
         * signs entitlement tokens with it; the platform verifies offline.
         * Value is the raw 32-byte Ed25519 public key encoded as base64url.
         * Required when `model` is not `"free"`.
         */
        license: z
          .object({
            /** Base64url-encoded raw Ed25519 public key (32 bytes, 43 chars). */
            publicKey: z.string().min(43).max(44),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine((m) => m.model !== 'recurring' || m.interval !== undefined, {
        message: 'interval is required when model is "recurring"',
        path: ['interval'],
      })
      .refine((m) => m.model === 'free' || m.license !== undefined, {
        message: 'license.publicKey is required for paid monetization models',
        path: ['license'],
      })
      .optional(),
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
  })
  .refine((m) => m.type !== 'platform' || m.monetization === undefined, {
    message: 'platform plugins cannot declare monetization — they are always free',
    path: ['monetization'],
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
