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
 * SRS §5. `storage:readWrite` (RFC 0044), `notifications:send` (RFC 0015),
 * `events:publish` / `events:subscribe` (RFC 0045), cross-plugin data
 * sharing (`data:provide` / `data:consume`, RFC 0002), the activity log
 * (`activity:write`, RFC 0005), and user data portability (`data:export` /
 * `data:import`, RFC 0007) are all implemented.
 */
export const permissionSchema = z.enum([
  'auth:session',
  'db:readWrite',
  'db:readOnly',
  'mailer:send',
  'mailer:sendExternal',
  'storage:readWrite',
  'notifications:send',
  'jobs:write',
  'events:publish',
  'events:subscribe',
  'data:provide',
  'data:consume',
  'data:export',
  'data:import',
  'activity:write',
  'e2ee:use',
  'crypto:use',
  'admin:*',
  'device:haptics',
  'device:notifications',
  'device:biometrics',
  'device:secureStorage',
  'handoffs:send',
  'handoffs:receive',
]);

/**
 * Surfaces a plugin can run on (RFC 0080). Mirrors the hand-declared `Surface`
 * type independently kept in sync in `runtime/src/surface.ts` and
 * `packages/sdk/src/device.ts` — each package keeps its own copy rather than
 * sharing an import, the existing convention for this exact union.
 */
export const surfaceSchema = z.enum(['browser', 'mobile', 'desktop']);

/** Validate that a string is a valid semver string (e.g. "0.6.0"). */
const semverString = (label: string) =>
  z
    .string()
    .min(1)
    .refine((v) => semver.valid(v) !== null, {
      message: `${label} must be a valid semver string (e.g. "0.6.0")`,
    });

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

/**
 * Whether a plugin's database is isolated (own dedicated store) or shared
 * (lives inside the platform database). Every `sovereign`/`community`
 * plugin is unconditionally isolated — there is no longer a per-plugin
 * choice (retired the `database.isolation`/`"shared"` manifest option).
 * `type: "platform"` plugins (`account`, `console`, `launcher`) are the one
 * exception: they administer the platform's own core data directly, the
 * same as `apps/auth`, and are never isolated.
 */
export function manifestDatabaseIsolation(type: unknown): ManifestDatabaseIsolation {
  return type === 'platform' ? 'shared' : 'isolated';
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
    type: z.enum(['platform', 'sovereign', 'community']),
    runtime: z.enum(['native']),
    routePrefix: z.string().min(1).startsWith('/', 'routePrefix must start with "/"'),
    permissions: z.array(permissionSchema),
    shell: z.enum(['default', 'minimal', 'overlay']).optional(),
    shellConfig: z
      .object({
        /** Dialog size for `shell: overlay` plugins (default `lg`). */
        overlaySize: z.enum(['sm', 'md', 'lg']).optional(),
        /** Show the mobile header for `shell: default` plugins (default `true`). */
        mobileHeader: z.boolean().optional(),
        /** Show the mobile footer for `shell: default` plugins (default `true`). */
        mobileFooter: z.boolean().optional(),
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
     * Unauthenticated machine-to-machine webhook ingress (RFC 0050) —
     * distinct from `publicRoutes` above, which is for human-facing pages.
     * Each entry is one exact endpoint, not a prefix: `path` resolves to
     * `<routePrefix><path>` and the plugin places an ordinary Next.js
     * `route.ts` there (composed the same way every other plugin route is —
     * no separate entry-file/generate-time wiring, unlike `schedules`/
     * `jobs`/`events`, since this genuinely is just an HTTP route). The
     * platform bypasses the session redirect for exactly this path+method
     * combination, applies the declared method/body-size limits before the
     * plugin's own route handler runs, and injects `x-sovereign-plugin-id`
     * — but never a user identity, since there is no user. The plugin's own
     * handler is responsible for verifying provider-specific authorization
     * (`sdk.webhooks.verifyHmac()`/`checkReplay()`) and must fail closed.
     */
    webhooks: z
      .array(
        z
          .object({
            /** Relative to routePrefix; must start with "/" and must not be "/". Exact match, not a prefix. */
            path: z
              .string()
              .min(1)
              .startsWith('/', 'webhook path must start with "/"')
              .refine((p) => p !== '/', { message: 'webhook path must not be "/"' })
              .refine((p) => !p.split('/').includes('..'), {
                message: 'webhook path must not contain ".." segments',
              })
              .refine((p) => !/[()]/.test(p), {
                message:
                  'webhook path must not contain route groups or interception markers ("(", ")")',
              }),
            /** Human-readable description shown in docs/Console. */
            description: z.string().min(1).optional(),
            /**
             * Allowed HTTP methods for this endpoint. Restricted to `POST`
             * by default; `GET` is accepted only for provider verification
             * challenges (a request with a method not in this list gets a
             * 404, not a 405 — the platform never reveals which methods a
             * declared path accepts).
             */
            methods: z
              .array(z.enum(['GET', 'POST']))
              .min(1)
              .default(['POST']),
            /**
             * Maximum request body size in bytes the platform allows before
             * the plugin's own handler runs, enforced via a `Content-Length`
             * pre-check in middleware — capped hard at 5 MiB regardless of
             * what a plugin declares. A chunked-transfer body with no
             * `Content-Length` header cannot be pre-checked this way; the
             * plugin's own handler is the backstop for that case (see
             * `docs/plugin-development.md`'s "webhooks" section).
             */
            maxBodyBytes: z
              .number()
              .int()
              .min(1)
              .max(5 * 1024 * 1024)
              .default(262144),
            /**
             * Documentation/introspection metadata only — declaring `true`
             * does not itself enforce anything; the plugin's own handler
             * must actually call `sdk.webhooks.verifyHmac()`.
             */
            requiresSignature: z.boolean().optional().default(false),
          })
          .strict(),
      )
      .min(1)
      .refine((arr) => new Set(arr.map((w) => w.path)).size === arr.length, {
        message: 'webhook paths must be unique within the plugin',
      })
      .optional(),
    /**
     * Platform-mediated flow handoffs (RFC 0053) — a signed, short-lived
     * payload that lets one plugin start or continue a user-facing flow in
     * another. `receives` declares this plugin's own handoff endpoints
     * (requires `handoffs:receive`); `sends` is optional discovery/review
     * metadata about handoffs this plugin creates for other providers
     * (requires `handoffs:send`) — unlike `receives`, nothing at runtime
     * validates `sends` entries against the named provider's actual
     * declarations; it exists for docs/Console display only.
     */
    handoffs: z
      .object({
        receives: z
          .array(
            z
              .object({
                /** Stable handoff name, unique within the plugin (lowercase kebab-case). */
                name: z
                  .string()
                  .regex(
                    /^[a-z][a-z0-9-]*$/,
                    'handoff name must start with a lowercase letter and contain only lowercase letters, digits, and hyphens',
                  ),
                /**
                 * Relative to routePrefix; must start with "/" and must not
                 * be "/". Exact match, not a prefix — mirrors `webhooks[].path`
                 * above (RFC 0050's declaration pattern), not `publicRoutes`'
                 * broader subtree match: a handoff receiver is one specific
                 * declared endpoint.
                 */
                path: z
                  .string()
                  .min(1)
                  .startsWith('/', 'handoff path must start with "/"')
                  .refine((p) => p !== '/', { message: 'handoff path must not be "/"' })
                  .refine((p) => !p.split('/').includes('..'), {
                    message: 'handoff path must not contain ".." segments',
                  })
                  .refine((p) => !/[()]/.test(p), {
                    message:
                      'handoff path must not contain route groups or interception markers ("(", ")")',
                  }),
                /** Human-readable name shown in caller-facing docs/Console. */
                title: z.string().min(1),
                description: z.string().optional(),
                /**
                 * Declarative metadata only — like `webhooks[].requiresSignature`,
                 * the platform does not validate a handoff's payload against
                 * this schema automatically (RFC 0053 lists schema validation
                 * under the *provider's* own responsibility, unlike RFC 0047's
                 * tool contracts, which validate before every call).
                 */
                inputSchema: z.record(z.string(), z.unknown()).optional(),
                /**
                 * Whether an anonymous, unauthenticated visitor may consume a
                 * handoff at this receiver. Defaults to `false` (authenticated
                 * only). Must be explicit — never inferred — per RFC 0053:
                 * "A plugin cannot accidentally receive arbitrary public
                 * payloads."
                 */
                public: z.boolean().optional().default(false),
              })
              .strict(),
          )
          .min(1)
          .refine((arr) => new Set(arr.map((r) => r.name)).size === arr.length, {
            message: 'handoff receiver names must be unique within the plugin',
          })
          .refine((arr) => new Set(arr.map((r) => r.path)).size === arr.length, {
            message: 'handoff receiver paths must be unique within the plugin',
          })
          .optional(),
        sends: z
          .array(
            z
              .object({
                /** The manifest `id` of the plugin expected to receive this handoff. */
                provider: z.string().min(1),
                /** Handoff name (should match the provider's declared receiver name). */
                name: z.string().min(1),
                /** Human-readable reason shown in docs/Console. */
                reason: z.string().optional(),
              })
              .strict(),
          )
          .min(1)
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Marks this plugin as fully public — no auth requirement at all (RFC
     * 0089), generalizing `publicRoutes` (RFC 0042) from a declared prefix to
     * the plugin's entire `routePrefix`. For plugins that are public by
     * design and have no private mode: an instance status page, a public
     * wiki, a changelog. Requires `shell: "minimal"` explicitly (a `default`
     * or `overlay` shell assumes an authenticated nav/dialog context this
     * doesn't have) and cannot combine with `adminOnly`, a paid
     * `monetization.model`, or `publicRoutes` — see the cross-field
     * `.refine()` checks below. Like `publicRoutes`, this only exempts page
     * routes from the session-redirect gate; disabled-plugin and RFC 0065
     * access-policy denial still apply, and it has no effect on `/api/*`
     * (that stays `apiProvider`'s decision).
     */
    public: z.boolean().optional(),
    /**
     * Marks this plugin's bare `routePrefix` page as its one offline-capable
     * entry point, and declares how much offline capability it needs
     * (research 0012, superseding RFC 0074/0078's plain boolean — the third
     * shape this field has taken: object → boolean → enum. See
     * `docs/upgrade.md` for the migration).
     *
     * - `'offline-first'` — the device holds a full replica of the plugin's
     *   data, kept fresh in the background; the server remains the source of
     *   truth. Works everywhere. Most offline-capable plugins want this.
     * - `'device-only'` — the data never leaves the device; there is no
     *   server copy at all. Requires a durable, encrypted, device-auth-gated
     *   store, which today only a native shell provides — see
     *   `@sovereignfs/sdk/device-client`'s `supports('secureStorage')` for
     *   the capability check. Undeclared (the default) means no offline
     *   support.
     *
     * Grants no auth exemption — it is purely a caching/rendering
     * declaration. This page must render a user-neutral shell and hydrate
     * everything else (screens, data, records) client-side rather than
     * through per-user SSR, so the platform can safely precache it without
     * risking a stale/different user's content being replayed on a shared
     * device. Which screens or data a plugin actually supports offline is
     * entirely its own client-side decision — invisible to this schema.
     * Both tiers imply local mutation, so no separate write permission is
     * needed (RFC 0074's open question 1) — the tier value itself is the
     * install-review signal.
     */
    offline: z.enum(['offline-first', 'device-only']).optional(),
    /**
     * When `true`, this plugin gets its own web app manifest at
     * `/api/manifest/<id>`, scoped to its `routePrefix`, so a browser can
     * install it as its own home-screen app rather than the whole instance
     * (RFC 0081). Deliberately separate from `offline` — installability and
     * offline support answer different questions (a plugin can be
     * installable without being offline-capable, or vice versa, as Launcher
     * already is); deriving one from the other would couple two independent
     * product decisions. Absent/`false` means today's behavior — the plugin
     * has no manifest of its own and is only reachable inside the whole
     * Sovereign PWA.
     */
    installable: z.boolean().optional(),
    /**
     * Surfaces this plugin is available on (RFC 0080). Absent means available
     * everywhere — today's behavior for every existing plugin, so this is a
     * purely additive declaration. The platform uses it to filter Launcher,
     * sidebar, and mobile-drawer presentation only — it is **not** a security
     * boundary. Direct navigation to an unavailable plugin renders a "not
     * available on this surface" page rather than being blocked outright,
     * the deliberate RFC 0080/0082 asymmetry with the RFC 0082 route lock:
     * `surfaces` filters presentation and is bypassable by anyone who edits
     * their User-Agent, which is fine because nothing behind it is a secret.
     */
    surfaces: z
      .array(surfaceSchema)
      .min(1)
      .refine((arr) => new Set(arr).size === arr.length, {
        message: 'surfaces must be unique within the plugin',
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
    /**
     * An author-supplied raster icon set (RFC 0081), for a plugin whose
     * glyph rasterizes poorly from `icon` alone — a maskable icon in
     * particular needs safe-area padding and usually a background plate an
     * SVG glyph doesn't have. Each path is relative to the plugin root, the
     * same convention `icon` uses. Optional even when `installable: true`:
     * the build step generates a full set from `icon` automatically when
     * this is absent (`scripts/generate-registry.ts`), so most plugins
     * never need to declare it. `installable: true` requires `icon` or
     * `icons` — see the cross-field check below.
     */
    icons: z
      .object({
        png192: z.string().optional(),
        png512: z.string().optional(),
        maskable512: z.string().optional(),
      })
      .strict()
      .optional(),
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
     * Background job types (RFC 0046). Each entry names a server-side handler
     * module inside the plugin's `app/` directory whose **default export** is
     * a `JobHandler` (`@sovereignfs/sdk`) — invoked by the platform's job
     * worker when a `sdk.jobs.enqueue()`/`sdk.jobs.schedule()` call for that
     * `type` becomes due.
     *
     * Distinct from `schedules` above (RFC 0046's earlier Phase 1 subset —
     * simple manifest-declared intervals, no persistence/retries): `jobs` is
     * the general queued/scheduled/retried mechanism plugins call into
     * dynamically. The two mechanisms coexist; `schedules` is not deprecated.
     *
     * Use an underscore-prefixed directory (e.g. `app/_jobs/`) so the module
     * composes into the runtime route tree without becoming a route.
     */
    jobs: z
      .array(
        z
          .object({
            /** Plugin-local job type name, unique within the plugin (e.g. `"sync.remote"`). */
            type: z
              .string()
              .regex(
                /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/,
                'job type must be lowercase dot-separated segments (e.g. "sync.remote")',
              ),
            /**
             * Handler module path relative to the plugin root, inside `app/`
             * (e.g. `"app/_jobs/sync-remote.ts"`). Must be a `.ts` module and
             * must not traverse outside the plugin (`..` is rejected).
             */
            entry: z
              .string()
              .startsWith('app/', "entry must be a path inside the plugin's app/ directory")
              .endsWith('.ts', 'entry must be a .ts module')
              .refine((p) => !p.split('/').includes('..'), {
                message: 'entry must not contain ".." path segments',
              }),
            /** Default max attempts when a caller's enqueue/schedule call does not specify one. */
            maxAttempts: z.number().int().min(1).optional(),
            description: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .refine((arr) => new Set(arr.map((j) => j.type)).size === arr.length, {
        message: 'job types must be unique within the plugin',
      })
      .optional(),
    /**
     * Channel authorization declarations for `sdk.events` (RFC 0045). Each
     * entry names a server-side handler module inside the plugin's `app/`
     * directory whose **default export** is an `EventChannelAuthorizer`
     * (`@sovereignfs/sdk`) — invoked to decide whether a given user may
     * subscribe to a channel matching `pattern`. Wired the same way as
     * `schedules`/`jobs` above (manifest entry + generate-time static
     * import), not a runtime `register()` call — for the same reason: there
     * is no reliable moment for plugin code to register a callback before
     * the first subscribe request needs it. A channel with no matching
     * pattern declaration fails closed (subscription denied).
     */
    events: z
      .array(
        z
          .object({
            /**
             * Plugin-local channel pattern this handler authorizes — lowercase
             * colon-separated segments, optionally ending in a `:*` wildcard
             * segment (e.g. `"list:*"` or an exact `"list:overview"`).
             */
            pattern: z
              .string()
              .regex(
                /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*(?::\*)?$/,
                'channel pattern must be lowercase colon-separated segments, optionally ending in ":*"',
              ),
            /**
             * Handler module path relative to the plugin root, inside `app/`
             * (e.g. `"app/_events/authorize-list.ts"`). Must be a `.ts`
             * module and must not traverse outside the plugin.
             */
            entry: z
              .string()
              .startsWith('app/', "entry must be a path inside the plugin's app/ directory")
              .endsWith('.ts', 'entry must be a .ts module')
              .refine((p) => !p.split('/').includes('..'), {
                message: 'entry must not contain ".." path segments',
              }),
            description: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .refine((arr) => new Set(arr.map((e) => e.pattern)).size === arr.length, {
        message: 'event channel patterns must be unique within the plugin',
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
  .refine(
    (m) =>
      m.shellConfig?.mobileHeader === undefined || m.shell === undefined || m.shell === 'default',
    {
      message: 'shellConfig.mobileHeader is only valid when shell is "default"',
      path: ['shellConfig', 'mobileHeader'],
    },
  )
  .refine(
    (m) =>
      m.shellConfig?.mobileFooter === undefined || m.shell === undefined || m.shell === 'default',
    {
      message: 'shellConfig.mobileFooter is only valid when shell is "default"',
      path: ['shellConfig', 'mobileFooter'],
    },
  )
  .refine((m) => m.type !== 'platform' || m.monetization === undefined, {
    message: 'platform plugins cannot declare monetization — they are always free',
    path: ['monetization'],
  })
  .refine((m) => m.public !== true || m.shell === 'minimal', {
    message: 'public: true requires shell to be explicitly "minimal" (RFC 0089)',
    path: ['public'],
  })
  .refine((m) => m.public !== true || m.adminOnly !== true, {
    message: 'public: true cannot combine with adminOnly: true (RFC 0089)',
    path: ['public'],
  })
  .refine((m) => m.public !== true || m.publicRoutes === undefined, {
    message:
      'public: true cannot combine with publicRoutes — declares whole-plugin exposure already (RFC 0089)',
    path: ['public'],
  })
  .refine(
    (m) => m.public !== true || m.monetization === undefined || m.monetization.model === 'free',
    {
      message: 'public: true cannot combine with a paid monetization model (RFC 0089)',
      path: ['public'],
    },
  )
  .refine((m) => m.installable !== true || m.icon !== undefined || m.icons !== undefined, {
    message:
      'installable: true requires an icon (auto-rasterized) or an author-supplied icons set (RFC 0081)',
    path: ['installable'],
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
