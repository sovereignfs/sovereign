# Epic: Plugins Runtime

> The full plugin lifecycle — manifest schema, generate script, SDK contract, install/remove tooling, environment isolation, compatibility gating, and the public registry.

## Status

⏳ In Progress

## Overview

This epic owns everything that makes plugins a first-class concept in Sovereign:
the typed manifest schema, the generate script that composes plugin routes into
the runtime, the `@sovereignfs/sdk` contract that plugin code calls,
environment variable namespacing, per-plugin database isolation, compatibility
versioning, the plugin registry, and the `sv` CLI. The remaining planned work
mostly extends plugin runtime surfaces and hardens the generate/SDK boundaries.

**Prioritized:** Task 3.28 (plugin catalog and install-time activation, RFC 0065) is a
higher-priority near-term item, sequenced ahead of other non-prioritised tasks in this epic. It
depends on Task 2.21's `access_policy` schema landing first (see Task 3.28's "Ordering note")
and is in turn the foundation for Console's catalog browser (Task 13.8).

## Tasks

#### ✅ 3.1 — `packages/manifest` — schema and validation

**Goal:** Manifest schema package providing TypeScript types and a validation function.

**Deliverables:**

- `packages/manifest/` with:
  - `src/types.ts` — full `SovereignManifest` interface and `Permission` type as defined in SRS section 5
  - `src/validate.ts` — `validateManifest(json): ValidationResult` — checks required fields, valid enum values, `repository` required when type is `sovereign` or `community`
  - `src/index.ts` — barrel export
- Unit tests covering: valid manifest passes, missing required field fails, invalid enum value fails, missing repository on sovereign type fails
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish

**SRS reference:** 3.8 Manifest System, Section 5 Plugin Manifest Reference

**Review checklist:**

- All fields from SRS Section 5 present in the TypeScript interface
- `shell`, `database`, `runtime`, `type` fields all typed correctly with correct enum values
- Validation tests pass

---

#### ✅ 3.2 — `packages/sdk` — interface definitions

**Goal:** SDK package with full interface definitions for v1 surface. Implementations are stubs at this stage — real implementations come in later tasks.

**Deliverables:**

- `packages/sdk/` with:
  - `src/types.ts` — `Session`, `PlatformConfig`, `MailOptions`, `DrizzleClient` types
  - `src/auth.ts` — `getSession()`, `requireSession()` — stubs throwing `NotImplementedError`
  - `src/db.ts` — `getClient()` — stub
  - `src/mailer.ts` — `send()` — stub
  - `src/platform.ts` — `getConfig()` — stub
  - `src/unimplemented.ts` — `storage`, `notifications`, `events` stubs throwing `NotImplementedError` with message indicating v1 non-implementation
  - `src/index.ts` — barrel export as `sdk.*`

Note: the `no-restricted-imports` ESLint boundary rule blocking `runtime/src`
imports in `plugins/*` is configured in Task 0.3.03 (code quality tooling),
not here. By the time this task runs it is already active. This task only
verifies it catches a violation.

**Build:** `tsup` — ESM only, TypeScript declarations. Published to npm as
`@sovereignfs/sdk`; `package.json` must include `exports`, `main`, `types`,
and `files` fields pointing to `dist/`.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish
  - `files` must include `dist/` for the npm package

**SRS reference:** 3.6 SDK, NFR-06

**Review checklist:**

- All SDK methods from SRS 3.6 present
- Unimplemented stubs throw `NotImplementedError` with a clear message
- ESLint import boundary rule catches a `runtime/src` import in a test plugin
  file (rule was established in Task 0.3.03)

---

#### ✅ 3.3 — `scripts/install-plugins.ts` — plugin install script

**Goal:** Full implementation of the install script stubbed in Task 0.3.01.

**Deliverables:**

- `sovereign.plugins.json` at repo root — config file declaring which sovereign/community plugins to install:
  ```json
  {
    "plugins": [
      {
        "id": "fs.sovereign.tasks",
        "repository": "https://github.com/sovereignfs/sovereign-plugin-tasks"
      },
      {
        "id": "io.example.plugin",
        "repository": "https://github.com/example/sovereign-plugin-example"
      }
    ]
  }
  ```
- `scripts/install-plugins.ts` — reads `sovereign.plugins.json`, clones each repository into `plugins/[id]/` if not already present, skips if directory exists, runs `pnpm generate` after all plugins are installed
- `package.json` script: `"install:plugins": "tsx scripts/install-plugins.ts"`

**SRS reference:** 2.3 Monorepo Structure, 3.5 Plugin System

**Review checklist:**

- Running script clones declared plugins into correct directories
- Already-cloned plugins are skipped without error
- `pnpm generate` runs automatically after install
- Script fails clearly if a repository URL is unreachable

---

#### ✅ 3.4 — `sv` CLI — core commands

**Goal:** `sv` CLI with essential commands for managing a Sovereign deployment.

**Deliverables:**

- `bin/sv` — TypeScript entry point, executed via `tsx` (no separate compile
  step; consistent with the `scripts/` pattern)
- Commands:
  - `sv install` — runs install script, clones sovereign/community plugins defined in config
  - `sv generate` — runs generate script
  - `sv build` — runs generate then pnpm build
  - `sv dev` — starts runtime and auth server in dev mode
  - `sv serve` — starts production server via direct node. PM2 is supported as
    an optional non-Docker deployment path — documented in `docs/self-hosting.md`
    but not the canonical production approach. Docker is canonical.
  - `sv plugin add <repository>` — clones a plugin, runs generate
  - `sv plugin remove <id>` — removes plugin directory, runs generate

**Technology:** `citty` (command framework) + `consola` (terminal output) —
both TypeScript-first, lightweight, from the UnJS ecosystem. `citty` handles
nested subcommands (`sv plugin add/remove`) cleanly. `consola` provides
consistent info/success/warn/error formatting. CLI is monorepo-internal in v1
— no global npm install path. See SRS §2.2 and decision log.

**SRS reference:** 2.4 Phased Roadmap v0.5, 2.2 Tech Stack

**Review checklist:**

- `sv dev` starts both services correctly
- `sv plugin add` clones and wires a plugin end-to-end
- `sv plugin remove` cleans up symlinks/copies and updates registry
- `sv --help` and `sv plugin --help` output accurate, well-formatted help text
- No compiled output — CLI runs directly via `tsx`

---

#### ✅ 3.5 — Test organization

**Goal:** Apply the boundary-based test layout from RFC 0010. Mechanical; one pass.

**Deliverables:**

- Move flat-co-located test files into per-directory `__tests__/` folders within their packages
- Add root `/__tests__/{integration,e2e}` scaffolding (README); reserve `/__tests__/visual`
- Update `vitest.config.ts` `include` globs (`**/__tests__/**/*.test.{ts,tsx}` + root `__tests__/**`); keep `classNameStrategy` + jsdom pragma
- Filename-suffix conventions (`*.integration.test.ts`, `*.visual.test.tsx`, `*.e2e.ts`) + `test:*` scripts
- Update CLAUDE.md ("co-located `*.test.ts`") + the CONTRIBUTING testing section

**Dependencies:** none (mechanical)

**SRS reference:** RFC 0010

**Review checklist:**

- `pnpm test` discovers all relocated tests; `*.pg.test.ts`, docs-parity, and schema-parity stay package-local and still run/skip as before
- The suite is never left half-moved (single PR)

---

#### ✅ 3.6 — Icon system

**Goal:** Adopt Lucide as the icon language per RFC 0011, via a generated zero-dependency SVG set behind a Sovereign `<Icon>`.

**Deliverables:**

- A name list + generation script emitting curated Lucide icons as inline RSC-safe SVG components into the design system; `lucide` as a **devDependency only** (no runtime/peer dep); ISC `NOTICE`
- `<Icon>` component (typed `name` union, size/color bound to `--sv-` tokens, a11y) exported from the design system
- Replace the chrome monograms/`⚙` emoji with `<Icon>`; render plugin manifest `icon.svg` in `PluginTile`/sidebar safely (`<img>`/sanitized, monogram fallback)
- Docs: `docs/design-system.md` (Icon) + `docs/plugin-development.md`

**Dependencies:** Task 0.4.06 (chrome/Account), Task 0.4.05 (Launcher tiles)

**SRS reference:** RFC 0011

**Review checklist:**

- The published design system carries no runtime/peer icon dependency; icons recolor via `currentColor`/tokens and theme correctly
- Adding an icon is "add a name + regenerate"; plugin SVGs are never injected as raw HTML

---

#### ✅ 3.7 — Registry contribution process

**Goal:** Define and document the process for submitting a community plugin to `registry/plugins.json`.

**Deliverables:**

- `registry/plugins.json` — initial structure (`{ registryVersion, plugins[] }`); each entry is a **thin record** `{ id, repository: { type, url, ref? }, name, description, author, license, homepage?, keywords?, provenance? }`, **not** a copy of the manifest (the manifest is fetched from the source). Lists only third-party plugins (built-in platform plugins are never registered — they ship in-repo); the array starts empty and grows by submission
- A `registryEntrySchema` + `validateRegistryEntry` in `@sovereignfs/manifest` (reused by the registry test, the validation script, and future tooling — `generate-registry` filters, `sv plugin add <id>`)
- `scripts/validate-registry.ts` (`pnpm registry:validate` / `registry:check`): clones each entry's source at its pinned ref, validates the source manifest + LICENSE, computes a sha256 content-hash over the source tree, and records `provenance` (resolved commit + hash + timestamp); `--check` mode verifies the committed provenance without writing
- A `.github/workflows/registry-validate.yml` CI job gated by `paths: ['registry/**']` — runs `pnpm registry:check` only when the registry changes
- `registry/CONTRIBUTING.md` — submission requirements: valid registry entry, valid manifest at the (public) source, LICENSE file, compatible platform version, unique id, fresh provenance
- PR template for registry submissions
- `docs/plugin-development.md` updated with registry submission section

**SRS reference:** 2.7 Open Source Strategy, 3.8 Manifest System

**Review checklist:**

- Registry entries validate against the registry-entry schema (`registry/__tests__`, fails CI on an invalid entry)
- `pnpm registry:validate` fetches the source, validates the manifest + LICENSE, and pins a content hash; `registry:check` (CI, on `registry/` changes only) fails on a missing/stale hash
- Submission requirements are clear and enforceable

---

#### ✅ 3.8 — Stable SDK and semver commitment

**Goal:** SDK API review, cleanup, and semver commitment documented.

**Deliverables:**

- SDK API review — remove anything experimental or inconsistent
- `packages/sdk/CHANGELOG.md` — initial entry marking v1.0.0 as stable
- `docs/sdk-stability.md` — documents what stable means: patch = no breaking changes, minor = additive only, major = breaking with migration guide
- SDK package version bumped to `1.0.0`

**SRS reference:** NFR-04

**Review checklist:**

- No stub implementations remain in the v1 SDK surface
- All unimplemented stubs (storage, notifications, events) clearly marked as unstable/experimental
- Semver policy documented and linked from README

---

#### ✅ 3.9 — SDK distribution & plugin isolation boundary

**Goal:** Decide and implement the published-SDK model. Plugins are host-composed fragments with no standalone runtime and the SDK is in-process host glue, so publish `@sovereignfs/sdk` as a **types-first contract** (host-provided/guarded impls, no `db`/`mailer` dependency) — which also dissolves the private-deps blocker — or drop the "published" designation if isolated authoring isn't pursued.

**Deliverables:**

- Restructure `packages/sdk`: published artifact is the typed API surface; implementations are host-provided and throw a clear "runs inside the Sovereign runtime" error outside it; `@sovereignfs/db`/`@sovereignfs/mailer` stay `private` (no bundling)
- `publish.yml` `sdk-v*` path works against the restructured package; the SRS decision-log "no runtime dependencies" claim becomes literally true
- Document the plugin **isolation boundary** (author/typecheck ✅, build-as-app/run ❌) in `docs/plugin-development.md`; rewrite the CLAUDE.md caveat; drop the `noExternal`-bundle plan

**Dependencies:** pairs with Task 0.5.19 (stable SDK); unblocks Task 0.5.27

**SRS reference:** RFC 0023; supersedes the SDK-publish prerequisite in RFC 0017

**Review checklist:**

- A standalone plugin repo type-checks against the published SDK with no `db`/`mailer` install
- The published SDK has zero runtime dependencies; impls fail clearly if executed outside the runtime

---

#### ✅ 3.10 — Plugin compatibility & versioning

**Goal:** Make the dormant `schemaVersion` and `compatibility.minPlatformVersion` fields functional, add an advisory `maxPlatformVersion`, and enforce compatibility consistently.

**Deliverables:**

- `packages/manifest`: add `semver`; validate `min`/`maxPlatformVersion` as semver; add `CURRENT_MANIFEST_SCHEMA_VERSION` (accept ≤ current, reject unknown-higher); add optional `maxPlatformVersion`; a pure `checkCompatibility(manifest, platformVersion)` resolver (manifest **minor** bump)
- Wire the resolver at four points: install (`sv plugin add`/`install-plugins`) + build (`generate-registry`) **refuse** incompatible; **boot disables + surfaces** (Console/health); registry filters (Task 0.5.18)
- Advisory `maxPlatformVersion` = warning, non-blocking; docs in `docs/plugin-development.md` + `docs/self-hosting.md` (+ docs-parity for the new field)

**Dependencies:** coordinates with RFC 0006's boot gate (Task 0.5.13)

**SRS reference:** RFC 0024

**Review checklist:**

- A too-new `minPlatformVersion` fails at install/build with a clear message; an incompatible installed plugin is disabled (not bricking) at boot and shown in health
- `schemaVersion` higher than current is rejected; older is accepted

---

#### ✅ 3.11 — Plugin-scoped environment variables

**Goal:** Let a plugin declare and supply its own env vars in plugin scope without touching monorepo files, with secrets never baked into artifacts.

**Deliverables:**

- Manifest `env` field: `KEY → { description, required?, secret?, scope: 'build'|'runtime', default? }` (`default` rejected on `secret`); manifest **minor** bump + docs-parity
- Auto-namespacing `SV_PLUGIN_<SLUG>_<KEY>`; a scoped `sdk.env.get('KEY')` accessor; `NEXT_PUBLIC_SV_PLUGIN_*` for build-scope client values
- `generate-registry` merges manifest defaults + a plugin-local `.env` (dev only), namespaces, validates (no committed secrets, no collisions), emits a generated gitignored loader + an operator-facing list of required secret keys
- Production secrets are operator-supplied at runtime via the namespaced container env; never baked

**Dependencies:** the `sdk.env` surface (SDK)

**SRS reference:** RFC 0018

**Review checklist:**

- A plugin reads its own keys via `sdk.env.get` unprefixed and cannot read platform/other-plugin keys via the accessor
- A committed secret value fails the build; secret keys never appear in the image

---

#### ✅ 3.12 — Plugin starter template & example plugins

**Goal:** A frictionless plugin on-ramp — one canonical starter skeleton delivered three ways, plus capability-demo example plugins that double as test fixtures.

**Deliverables:**

- One canonical skeleton via a GitHub **template repo** (`sovereign-plugin-template`), a **`sv plugin new <name>`** command, and an **`npm create @sovereignfs/plugin`** initializer
- Capability-demo example plugins (`example-basic`, `example-api`, …) that also serve as runtime test fixtures (composition, route-guard, `apiProvider`)
- Consolidated naming/conventions; tie-in to the registry (Task 0.5.18); the dev/test loop is runtime-hosted (RFC 0023 — no standalone run)

**Dependencies:** Task 0.5.20 (types-first SDK publish), Task 0.5.18 (registry), Tasks 0.5.16/0.5.23 (fixtures)

**SRS reference:** RFC 0017

**Review checklist:**

- A new plugin scaffolds and runs against a local Sovereign from any of the three entry points
- Example plugins compose and double as fixtures

---

#### ✅ 3.13 — Per-plugin database

**Goal:** Let a plugin opt into a dedicated database (`database: "isolated"`) rather than sharing the platform DB. RFC 0004 accepted.

**Deliverables:**

- SQLite: dedicated file per isolated plugin (`data/plugins/<pluginId>.db`) via `createClient`; per-plugin client registry (lazy, keyed by id); per-store migration-tracking table
- Postgres: schema-per-plugin (`CREATE SCHEMA`, `search_path`); provision on first use, `DROP SCHEMA … CASCADE` on uninstall; no extra pool (single connection)
- Migration runner routes each plugin's migrations to its resolved store (shared → platform DB; isolated → dedicated store)
- `sdk.db.getClient()` transparently returns the shared or dedicated client per the plugin's `database` setting
- Plugin lifecycle hooks: provision on first `getClient()`, drop on uninstall/purge (`sv plugin remove` with `--keep-data` opt-out)
- SRS §3.7/§4.6/§5 updated ("not implemented" → "opt-in isolated model")

**Dependencies:** Task 0.5.03 (Postgres), Task 0.5.05 (`sdk.db`)

**SRS reference:** RFC 0004

**Review checklist:**

- `database: "isolated"` plugin gets its own SQLite file; uninstall drops it entirely; `shared` plugin is unaffected; Postgres schema-per-plugin provisions and drops cleanly

---

#### ✅ 3.14 — Operator fork model & upstream sync

**Goal:** Publish the operator fork model documentation and add the "Maintaining a fork" section to `docs/self-hosting.md`. This is a documentation-only task — no code, no version bumps.

**Deliverables:**

- `docs/rfcs/0028-operator-fork-model.md` — the RFC (already drafted)
- `docs/self-hosting.md` — "Maintaining a fork" section: two-track summary (config-only vs fork-and-track), `operator/` directory convention, upstream sync command sequence, isolation principle, asset management guidance
- `docs/sovereign-proposal-plan-srs.md` — §2.7 pointer + decision-log row (already added in RFC documentation pass)
- `docs/rfcs/README.md` — RFC 0028 row updated from Draft to Accepted

**Optional follow-on (separate task):** `sv fork check` CLI command — reads `operator/UPSTREAM`, compares against the latest upstream tag, and warns if the fork is behind.

**Dependencies:** None hard. RFC 0027 (Task 1.0.03) should ship first so the "Post-RFC 0027 asset management" recommendation in the RFC is actionable.

**SRS reference:** RFC 0028, SRS §2.7

**Review checklist:**

- `docs/self-hosting.md` "Maintaining a fork" section is self-contained; a reader can follow it from fork setup through first upstream sync without consulting the RFC
- The two-track model, isolation principle, AGPL table, and rebase workflow are consistent between the RFC and the self-hosting doc
- RFC 0028 status in `docs/rfcs/README.md` updated to Accepted

---

#### ✅ 3.15 — Per-plugin database dialect selection (RFC 0036)

**Goal:** Extend the `database` manifest field so an isolated plugin can opt into SQLite storage
even when the platform runs Postgres. The **platform-as-ceiling rule** is enforced at install time:
a plugin on a SQLite platform may not request Postgres (no server available); a plugin on a
Postgres platform may always request SQLite (embedded, zero extra infrastructure).

**Current state:**

`packages/manifest/src/schema.ts:67` exposes `database: z.enum(['shared', 'isolated'])` — a
simple two-value enum with no dialect sub-field. All provisioning functions in
`packages/db/src/plugin-client.ts` (`getPluginDb`, `provisionPluginDb`, `dropPluginDb`) read
`resolveDialect(process.env)` globally; there is no per-plugin override path. The migration runner
(`runtime/src/plugin-migrations.ts`) resolves the platform dialect once and applies it to every
isolated plugin.

**Deliverables:**

- `packages/manifest/src/schema.ts` — extend `database` to a Zod union:
  - Backward-compat string branch: `'shared' | 'isolated'`
  - New object branch: `{ isolation?: 'shared' | 'isolated', dialect?: 'sqlite' }`
  - `'postgres'` is intentionally absent from the `dialect` enum — the schema itself encodes the
    ceiling rule (a plugin can only request a dialect ≤ the platform's; the only downgrade is
    SQLite).
- `packages/db/src/plugin-client.ts` — add optional `dialect?: Dialect` param to `getPluginDb`,
  `provisionPluginDb`, `dropPluginDb`. When omitted, falls back to `resolveDialect(process.env)`
  as today. No existing callers need updating.
- `runtime/src/sdk-host.ts` — extract `manifest.database.dialect` (where the object form is used)
  and pass through to the two provisioning calls.
- `runtime/src/plugin-migrations.ts` — add a per-plugin dialect variable inside the migration
  loop: `resolvePluginDialect(manifest) ?? platformDialect`.
- `bin/sv.ts` (`sv plugin remove`) — narrow the raw manifest JSON union before passing dialect to
  `dropPluginDb`.
- `docs/plugin-development.md` — document the new `database` object form, the allowed
  combinations table, and the ceiling rule.

**Version bumps:** `@sovereignfs/manifest` → minor (new optional field), `@sovereignfs/db` →
minor (new optional params on exported functions), `runtime` → patch, `bin/sv` → patch.

**Dependencies:** Task 3.13 (per-plugin database — the provisioning foundation this extends)

**SRS reference:** RFC 0036

**Review checklist:**

- A Postgres-platform instance with a plugin declaring `{ isolation: "isolated", dialect: "sqlite" }`
  gets a dedicated SQLite file at `data/plugins/<id>.db`; the platform Postgres schema is unaffected
- The same plugin's migrations run from `plugins/<id>/migrations/sqlite/` not `postgres/`
- `sv plugin remove` drops the SQLite file (not a Postgres schema) for such a plugin
- A plugin with `"database": "isolated"` (legacy string) on a Postgres platform still gets a Postgres
  schema — no regression
- A plugin with `"database": "isolated"` on a SQLite platform still gets a SQLite file — no regression
- `@sovereignfs/manifest` Zod schema rejects `{ dialect: "postgres" }` with a parse error
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.16 — Plugin background jobs and schedules (RFC 0046)

**Goal:** Add a platform-managed background job surface so plugins can enqueue one-off work, schedule recurring work, and report progress without relying on a browser request.

**Deliverables:**

- Add `sdk.jobs` for enqueueing, scheduling, cancellation, status lookup, and handler registration.
- Add platform job tables for queued/scheduled/running/completed/failed state.
- Add runtime worker loop with clear single-process semantics and a future path for multi-process coordination.
- Add progress reporting and notification integration for long-running work.
- Add admin health visibility for stuck/failed jobs.
- Define disabled-plugin and uninstall behavior for queued/scheduled jobs.

**Dependencies:** Task 4.1 (notifications for completion/failure), Task 5.1 (activity logging), Task 3.13 (per-plugin database where plugin jobs touch plugin data).

**SRS reference:** [RFC 0046](../rfcs/0046-plugin-jobs.md)

**Review checklist:**

- A plugin can enqueue a job and receive a completion/failure status.
- Scheduled jobs survive runtime restart.
- Disabled plugins do not execute queued or scheduled jobs.
- Long-running jobs can notify the user on completion without holding a request open.

---

#### ✅ 3.17 — Plugin events and realtime channels (RFC 0045)

**Goal:** Implement `sdk.events` as a plugin-scoped realtime publish/subscribe surface for ephemeral UI synchronization.

**Deliverables:**

- Add manifest permission/schema support for plugin event channels.
- Add `sdk.events` publish/subscribe API with runtime-injected plugin, tenant, and user context.
- Reuse or extend the notification transport model for polling/SSE/Redis where appropriate.
- Support channel authorization callbacks so a user receives only events for resources they can access.
- Document that events are ephemeral and not a durable queue, notification inbox, or audit log.

**Dependencies:** Task 4.3 (notification broker transport), Task 3.13 (per-plugin database for resource auth), Task 5.1 (activity remains separate).

**SRS reference:** [RFC 0045](../rfcs/0045-plugin-events.md)

**Review checklist:**

- Two browser sessions viewing the same authorized resource receive realtime updates.
- A user without access to a resource cannot subscribe to that resource's channel.
- Events are not persisted as notifications or activity log rows by default.
- Polling fallback remains available where SSE/Redis is disabled.

---

#### ✅ 3.18 — Plugin tool contracts (RFC 0047)

**Correction note (post-implementation):**

- The confirmation-token flow reuses the existing OAuth-state-token/signed-
  storage-URL HMAC pattern (`runtime/src/connections.ts`/`storage.ts`) —
  `runtime/src/tool-confirmation.ts` — rather than a new token format, plus
  an added `inputHash` binding neither precedent needed.
- `sdk.tools.provide()` is `async` (unlike `sdk.data.provide()`) so it can
  derive the provider's own plugin id from request headers and namespace
  the in-process registry as `<providerId>:<name>` — closing a real gap in
  RFC 0002's own resolver registry (keyed by bare contract name, no
  per-provider collision guard), confirmed by reading the actual
  implementation before building on it, not assumed from the RFC text.
- Input-schema validation against the manifest's `inputSchema` is a
  deliberately minimal JSON Schema subset
  (`type`/`properties`/`required`/`items`/`enum`,
  `runtime/src/tool-schema.ts`), not a full validator library — RFC 0047's
  own open question #2 on schema flavor was unresolved; adding a dependency
  to answer an open question wasn't warranted.
- Confirmation UI is caller-owned (RFC 0047 open question #3, resolved) —
  no Account or runtime-modal UI was built. `plugins/account` was never
  touched despite being named in the RFC's original `scope:` line; that
  line has been corrected.
- `tools:provide`/`tools:call` are new manifest permission enum values —
  no such permissions existed before this task.

**Goal:** Add platform-mediated tool contracts so plugins can expose structured, permissioned, auditable actions to trusted callers such as assistant or automation layers.

**Deliverables:**

- Add manifest `tools` declarations with names, schemas, effect classes, confirmation requirements, and optional verification requirements.
- Add provider registration through `sdk.tools.provide()`.
- Add caller preview/execute flows through `sdk.tools.preview()` and `sdk.tools.execute()`.
- Add platform confirmation-token flow for mutating or external effects.
- Add activity logging for tool execution attempts and outcomes.
- Add docs and examples for read, write, and external tool effects.

**Dependencies:** RFC 0002 cross-plugin data sharing, Task 5.1 activity logging, Task 1.8/1.9 progressive verification, Task 18.1 Harness when assistant execution is introduced.

**SRS reference:** [RFC 0047](../rfcs/0047-plugin-tools.md)

**Review checklist:**

- A provider plugin can declare and register a tool.
- A caller can request a preview without mutation.
- Mutating/external tools cannot execute without a matching confirmation token.
- Tool execution records provider, caller, actor, effect class, result, and error metadata.

---

#### ✅ 3.19 — Plugin external connections (RFC 0049)

**Goal:** Add a platform pattern for plugin-owned external provider connections, including OAuth/connect-account lifecycle, connection metadata, secret-vault integration, reconnect, disconnect, and operator visibility.

**Deliverables:**

- Add platform-owned connection metadata records scoped by plugin, tenant, user, and provider.
- Add `sdk.connections` or equivalent for create/list/get/update/disconnect/mark-used/mark-error flows.
- Add manifest metadata for provider declarations and callback paths.
- Add signed OAuth state helpers and server-side callback validation patterns.
- Store all credential material through the plugin secret vault; connection records contain metadata only.
- Add Account/Console views for connected credentials and provider status without revealing secrets.
- Document reconnect, token-refresh, disconnect, and sanitized provider error handling.

**Dependencies:** RFC 0043 plugin secret vault, RFC 0047 plugin tool contracts for caller-initiated external effects, RFC 0042/0050 where provider callbacks require public ingress.

**SRS reference:** [RFC 0049](../rfcs/0049-plugin-external-connections.md)

**Review checklist:**

- A plugin can create a user-scoped external connection without storing secrets in its own tables.
- OAuth state values are signed, expiry-bound, and validated on callback.
- Disconnect removes or revokes associated secrets where possible.
- Connection status is visible to the user without leaking credentials.

---

#### ✅ 3.20 — Cross-plugin references and dependency discovery (RFC 0051)

**Goal:** Let plugins discover optional dependencies and store stable, opaque references to provider-owned records without cross-plugin database coupling.

**Deliverables:**

- Add `sdk.plugins` discovery helpers for installed/enabled/user-available plugin status.
- Add consent-status helpers for declared data contracts.
- Define a standard `PluginReference` shape for provider ID, resource type, opaque resource ID, contract/version, label snapshot, and metadata.
- Add optional integration manifest metadata for discoverable sibling-plugin relationships.
- Document stale-reference behavior for unavailable providers, revoked consent, deleted resources, and version mismatches.
- Ensure cross-plugin references participate in export/import as inert metadata.

**Dependencies:** RFC 0002 cross-plugin data sharing, RFC 0047 plugin tool contracts, RFC 0052 plugin portability hooks.

**SRS reference:** [RFC 0051](../rfcs/0051-cross-plugin-references.md)

**Review checklist:**

- A consumer can tell whether an optional provider plugin is installed, enabled, and available to the current user.
- A stored reference does not grant access without a live data/tool contract authorization path.
- Provider uninstall/disable does not break consumer tables.
- UI can show cached labels while clearly marking unavailable or revoked links.

---

#### ✅ 3.21 — Plugin flow handoffs (RFC 0053)

**Goal:** Add platform-mediated handoffs so one plugin can start or continue a user-facing flow in another plugin with a signed, short-lived payload.

**Deliverables:**

- Add manifest `handoffs.receives` and `handoffs.sends` declarations with provider, name, path, schema, and public/authenticated mode metadata.
- Add `sdk.handoffs.create()` for caller plugins and `sdk.handoffs.consume()` for provider plugins.
- Add signed, expiry-bound, provider-scoped handoff tokens with payload hashing and optional single-use replay protection.
- Support both authenticated-user and public-anonymous handoff modes.
- Enforce public handoffs only on provider-declared public routes.
- Validate return URLs to avoid open redirects.
- Add docs and examples for checkout-style source plugin flows.

**Dependencies:** RFC 0042 public plugin page routes, RFC 0050 public plugin webhooks for related public ingress constraints, RFC 0051 cross-plugin references, RFC 0047 plugin tool contracts for later mutating actions after a handoff.

**SRS reference:** [RFC 0053](../rfcs/0053-plugin-flow-handoffs.md)

**Review checklist:**

- A source plugin can create a handoff token for a provider-declared flow.
- A provider plugin can consume only tokens addressed to its own plugin ID and handoff name.
- Expired, replayed, malformed, or wrong-provider tokens fail closed.
- Public handoffs work for anonymous visitors only when explicitly declared.

**Implementation notes (deviations from the RFC, found while implementing against real code, not RFC assumptions):**

- **No in-memory single-use tracking**, unlike RFC 0047's tool-confirmation
  tokens on the parallel leg 4 branch — single-use enforcement lives entirely
  in the new `plugin_handoffs` DB row's `consumed_at` column, claimed
  atomically via `UPDATE ... WHERE consumed_at IS NULL RETURNING`, the same
  idiom `checkWebhookReplay` (RFC 0050, leg 3) already uses. More correct
  than an in-memory `Map` under horizontal scaling, and RFC 0053 itself
  states a preference for server-side storage.
- **`handoffs.receives[].path` is an exact match**, not a prefix — mirrors
  `webhooks[].path` (RFC 0050), not `publicRoutes`' subtree match. A handoff
  receiver is one specific declared endpoint.
- **Input-schema validation is provider-owned, not platform-enforced** — RFC
  0053's own text places schema validation under "Provider responsibility,"
  unlike RFC 0047's tool contracts, which the platform validates before every
  call. `handoffs.receives[].inputSchema` is declarative metadata only.
- **Authenticated-mode consumption is pinned to the exact creating user** —
  a deliberate tightening beyond the RFC's literal text (which only required
  _a_ session): the consuming request's actor must equal the creating
  request's actor, closing a confused-deputy gap where a leaked or forwarded
  authenticated handoff URL could otherwise be redeemed by a different
  logged-in user.
- **`returnUrl` reuses `runtime/src/post-login-redirect.ts`'s existing
  `sanitizeRedirectPath()`** rather than reimplementing the same-origin
  relative-path check.
- **`expiresInSeconds` is clamped server-side to a 1-hour maximum**
  (default 15 minutes) regardless of what a plugin requests — found and
  fixed during this task's own test-writing pass, since nothing enforced the
  cap the SDK type's doc comment already claimed.

---

#### ✅ 3.22 — Generate script regression coverage

**Goal:** Freeze current plugin composition behavior before decomposing the
generation path that validates manifests, composes route trees, emits env files,
and writes registry artifacts.

**Deliverables:**

- Add focused tests for shell-mode route-prefix rules:
  - Overlay plugins reject multi-segment `routePrefix` values.
  - Minimal plugins accept multi-segment `routePrefix` values.
- Cover duplicate `apiProvider: true` manifests failing generation.
- Cover secret plugin env vars never being embedded in generated files.
- Cover plugin `.env` values being allowed only for non-secret dev defaults.
- Cover stale generated routes and icons being pruned.
- Cover deterministic manifest processing order.

**Dependencies:** Task 2.5 (overlay shell mode), Task 2.9 (minimal shell mode),
Task 2.4 (public `/api` namespace delegation), Task 3.11 (plugin-scoped
environment variables), Task 3.6 (icon system).

**SRS reference:** 3.8 Manifest System, 3.9 Plugin Loading Model, RFC 0018.

**Review checklist:**

- `pnpm generate` behavior is covered before decomposition starts.
- Current generated registry, env, capability, route, and icon outputs are
  protected from accidental format changes.
- The tests avoid depending on generated route copies under `runtime/app`.

---

#### ✅ 3.23 — Generate script decomposition

**Status (August 2026): shipped — workstream 0012 leg 4.** Split the
1282-line `scripts/generate-registry.ts` into nine focused modules under
`scripts/generate/`: `paths.ts` (shared path constants and
`readPlatformVersion`, not separately named in the original deliverable
list but needed once path constants have more than one consumer module),
`types.ts` (`PluginEntry`), `read-plugins.ts`, `compose-routes.ts`,
`plugin-icons.ts`, `plugin-env.ts`, `plugin-capabilities.ts`, plus
`plugin-schedules.ts`, `plugin-jobs.ts`, and `plugin-events.ts` — three
modules beyond the original 6-module list, added because the source file
turned out to have three more generated-output concerns (RFC 0046
schedules/jobs, RFC 0045 event authorizers) than the deliverable list
named, each following the exact same collect/render/write shape as
`plugin-capabilities.ts`. `write-registry.ts` rounds out the split.
`scripts/generate-registry.ts` stays the CLI entrypoint: `generate()`
orchestration, `--watch` mode, and re-exports of every module's public
symbols so the pre-existing `scripts/__tests__/generate-registry.test.ts`
(all 55 tests, from Task 3.22) keeps importing from `'../generate-registry'`
unchanged — verified byte-identical `pnpm generate` output for the current
plugin set (diffed `runtime/generated/*` before/after) and a clean
`pnpm build`.

**Goal:** Make plugin composition safer to evolve as shell modes, manifest
fields, and registry behavior grow.

**Deliverables:**

- Split `scripts/generate-registry.ts` into focused modules under
  `scripts/generate/`:
  - `read-plugins.ts`: manifest scanning, validation, and compatibility checks.
  - `compose-routes.ts`: shell-mode targets, sync, and stale route pruning.
  - `plugin-icons.ts`: static icon copy and pruning.
  - `plugin-env.ts`: plugin-scoped env declaration processing and output.
  - `plugin-capabilities.ts`: generated capability declaration output.
  - `plugin-schedules.ts` / `plugin-jobs.ts` / `plugin-events.ts`: the
    schedules (RFC 0046), jobs (RFC 0046), and event-authorizer (RFC 0045)
    generated-output modules — same collect/render/write shape as
    `plugin-capabilities.ts`, found during implementation and added for
    consistency rather than left bundled in the entrypoint.
  - `write-registry.ts`: generated registry output.
- Keep `scripts/generate-registry.ts` as the CLI entrypoint.
- Preserve generated output format on the first refactor to minimize blast
  radius.
- Avoid changing plugin behavior in the same change as the decomposition.

**Dependencies:** Task 3.22 (generate script regression coverage).

**SRS reference:** 3.8 Manifest System, 3.9 Plugin Loading Model.

**Review checklist:**

- `pnpm generate` emits the same registry, env, capability, route, and icon
  outputs as before for the current plugin set.
- Generate behavior is covered by focused tests.
- Future shell-mode changes can be made in `compose-routes.ts` without touching
  manifest validation or env processing.

---

#### ✅ 3.24 — SDK boundary and runtime contract tests

**Status (August 2026): shipped — workstream 0012 leg 2.** Added
`__tests__/eslint-plugin-boundary.test.ts` (a real `ESLint.lintText()` run
against fixture source, not a config snapshot),
`runtime/src/__tests__/sdk-host-db-routing.test.ts` (isolated-DB routing,
platform-DB-outside-plugin-context, and the identity-forging guarantee —
`sdk.db.getClient()` takes no arguments at all, so there's no parameter a
plugin could pass to claim a different identity), and
`packages/sdk/src/__tests__/host.test.ts` (`requireHost()`'s missing-host
error). Docs already matched tested usage — no fix needed there.

**A real, undocumented gap in the SDK boundary rule itself was found and
fixed while writing the lint fixture test — not invented as a test
scenario.** `docs/architecture-rules.md` states the rule as absolute:
"plugins must not import from `runtime/src`." But the ESLint rule
(`@typescript-eslint/no-restricted-imports`) only pattern-matched import
specifiers containing the literal string `runtime/src` — it never caught
the `@/` alias, which `runtime/tsconfig.json` maps to the exact same
location (`"@/*": ["./*"]`). `plugins/console/app/users/actions.ts` (real,
shipped code) already imports `@/src/activity`, `@/src/capabilities`,
`@/src/launcher-plugins`, `@/src/registry`, and `@/src/user-deletion` —
completely unflagged. Since every plugin (not just the three platform ones)
gets composed into `runtime/app/(platform)/(plugins)/<id>/` at build time,
where `@/` genuinely resolves, any third-party plugin could have used the
same trick to reach runtime internals undetected. Confirmed with the
developer this was meant as a platform-plugin exception, not a design
mistake to unwind — `eslint.config.ts` now has two rule blocks: the general
one blocks `@/*`/`@/src`/`@/src/*` alongside the existing patterns for every
plugin except `plugins/console/**`, and a narrower block for Console alone
that keeps the `@sovereignfs/db`/`manifest`/`mailer` restriction (Console
already voluntarily respects that one — see its own code comment) while
lifting only the `runtime/src` restriction. Launcher and Account get no
exception; neither uses the alias today.

**Goal:** Prevent accidental platform leakage into plugin code and keep the SDK
contract honest.

**Deliverables:**

- Add a lint fixture or test that intentionally imports forbidden packages from
  `plugins/` and asserts ESLint rejects it.
- Add SDK host behavior tests for:
  - Missing host throws a useful error.
  - Plugin-scoped DB calls route isolated-database plugins correctly.
  - Platform DB is returned outside plugin route context.
  - Request-context-derived plugin and user identity cannot be forged through
    plugin-provided SDK arguments.
- Ensure docs examples match tested SDK usage.

**Dependencies:** Task 0.3 (code quality tooling), Task 3.9 (SDK distribution
and plugin isolation boundary), Task 3.13 (per-plugin database).

**SRS reference:** 3.6 SDK, NFR-06.

**Review checklist:**

- The plugin import-boundary rule is tested, not just configured.
- SDK host failure modes remain actionable for plugin developers.
- Isolated database routing has regression coverage.

---

#### ✅ 3.25 — Plugin external dependency resolution (RFC 0057)

**Status (August 2026): shipped — workstream 0012 leg 8, the last leg in that
workstream.** New `bin/plugin-deps.ts` holds the decision logic as pure,
unit-tested functions (`extractExternalDeps`, `computePlatformPeerNames`,
`mergePluginDeps`, `prunePluginDeps`) plus thin orchestrators
(`hoistDepsForPlugin`, `pruneDepsForPlugin`, `syncLocalPluginDeps`) that are
the only parts touching disk or spawning `pnpm install` — split specifically
so the "do not proceed if the hoist/prune logic can't reliably distinguish a
genuine external dep from a transitive one" risk this leg's own workstream
entry flagged could be verified without a real filesystem or network. 27
unit tests cover every branch, including the version-conflict resolution
(newer `semver.minVersion()` wins) and the no-op/no-install paths.

`computePlatformPeerNames` treats "platform peer" dynamically rather than a
hardcoded list (`next`, `react`, …): anything already in
`runtime/package.json` that the ledger doesn't attribute to any plugin. This
also means a dep hand-added outside this mechanism is safely treated as a
peer (never mistakenly pruned) rather than causing a hard failure.

Wired into `bin/sv.ts`'s `plugin add`/`plugin remove` (after the registry
regenerates, per the RFC) and into `scripts/dev.ts` as a `.local`-plugin
self-heal step that runs every `pnpm dev` boot — cheap to check, only
installs when something actually changed. `runtime/generated/plugin-deps.json`
is the one deliberate exception to that whole directory's blanket
`.gitignore` rule (`runtime/generated/*` + a `!plugin-deps.json` negation —
a directory-anchored `runtime/generated/` pattern would have made the
negation impossible; documented in `.gitignore` itself), since unlike
everything else generated there it's not checkout-specific derived output —
it's the authoritative, meaningful-to-diff record of which committed plugin
contributed which runtime dependency, like a lockfile.

The `@dnd-kit/*` manual-workaround entries this task's deliverable said to
remove from `runtime/package.json` turned out to already be absent — some
earlier, untracked cleanup already removed them (Tasks, the plugin that
needed them, only exists as a `.local` dev clone, never committed). The
initial committed ledger is therefore `{}`, matching reality: no plugin
currently contributes a hoisted dep. Verified this isn't just a paper
exercise: ran `syncLocalPluginDeps` live against the four real `.local` dev
plugins in this environment (Tasks, Shopper, Plainwrite, Wallet), which
between them declare real external deps (`@dnd-kit/*`, `rrule`, `@tiptap/*`,
`gray-matter`, `jsbarcode`, …) — confirmed the extraction, platform-peer
filtering (`drizzle-orm`, already a runtime dep, correctly excluded), and
cross-plugin dep sharing (a dep two `.local` plugins both declare is only
counted "new" for the first one processed, but the ledger still records it
as a full contributor for both, so a later removal of either one correctly
keeps the shared dep) all resolved correctly. Deliberately reverted the
resulting `runtime/package.json`/lockfile changes before committing
anything, though — those four plugins are personal `.local` dev clones
(gitignored, never committed), not part of this repo's own plugin set, so
their hoisted deps have no business in this PR's diff or the committed
ledger baseline. The dev-startup sync itself stays exactly as designed: it
_will_ make this same change for real, automatically, the next time anyone
with these clones present runs `pnpm dev` after this merges — that's the
intended self-heal behavior, not something being worked around.
`docs/plugin-development.md` gained a new "External dependencies" section.

**Goal:** Automatically hoist a plugin's external npm dependencies into the
runtime's module scope when the plugin is installed or removed, so plugin
developers never need to manually edit `runtime/package.json`.

**Deliverables:**

- Add `runtime/generated/plugin-deps.json` — a committed ledger mapping each
  plugin manifest ID to the external deps it contributed to the runtime.
- Update `sv plugin add` to read the installed plugin's `package.json`, extract
  external deps (filtering out `@sovereignfs/*` workspace packages and platform
  peers already in `runtime/package.json`), write the ledger, merge deps into
  `runtime/package.json`, and run `pnpm install --filter runtime`.
- Update `sv plugin remove` to compute the set difference (deps no longer needed
  by any remaining plugin) and prune them from `runtime/package.json`, then run
  `pnpm install --filter runtime`.
- Update `scripts/dev.ts` to sync `.local` plugin deps at dev-startup — detect
  changes against the ledger, update `runtime/package.json` and re-install if
  needed (gated on a hash check to avoid triggering install on every boot).
- Remove the manually-added `@dnd-kit/*` entries from `runtime/package.json`
  and let the ledger manage them.
- Update `docs/plugin-development.md` — external deps are declared in the
  plugin's own `package.json`; no manual platform-side step is needed.

**Dependencies:** Task 3.4 (`sv` CLI core commands), Task 3.13 (per-plugin
database — establishes the `sv plugin add/remove` lifecycle).

**SRS reference:** 3.5 Plugin system, NFR-05 developer experience.

**Review checklist:**

- `sv plugin add` for a plugin with external deps updates the ledger and
  installs them without manual intervention.
- `sv plugin remove` prunes deps not needed by any remaining plugin and leaves
  shared deps intact.
- `pnpm dev` self-heals for `.local` plugins when their `package.json` changes.
- `runtime/package.json` no longer contains manually-added plugin deps.
- Docs updated: plugin developers declare deps in their own `package.json` only.

---

#### ✅ 3.26 — Plugin mailer permission and SDK email surface (RFC 0062)

**Goal:** Make plugin-triggered email safe by enforcing `mailer:send` at the runtime host
boundary and defining a user-scoped email API that does not let plugins freely email arbitrary
addresses by default.

**Deliverables:**

- Change `sdk.mailer.send()` host handling so the runtime resolves the calling plugin ID from
  request context and checks the plugin manifest for `mailer:send`.
- Reject plugin mailer calls outside a plugin route/request context unless explicitly made by
  trusted platform code.
- Add per-plugin and per-recipient rate limits for plugin-triggered email.
- Restrict third-party plugin email to platform-resolved users by default; direct arbitrary
  external recipient email remains an explicitly permissioned escape hatch.
- Add an additive `sdk.email.sendToUser()` or equivalent safer API that accepts
  `recipientUserId`, `templateId`, and structured data while the platform resolves email address,
  preferences, audit, rate limits, and delivery policy.
- Update `packages/manifest` docs/tests to clarify `mailer:send` semantics and any new
  email-specific manifest metadata.
- Add SDK host regression tests proving plugins without `mailer:send` cannot send email and that
  plugin-provided arguments cannot forge source identity.
- Update `docs/plugin-development.md` with email permission rules, recommended
  `sendToUser` usage, rate-limit expectations, and the distinction from notification/message
  delivery.

**Version bumps:** `@sovereignfs/sdk` → minor for the safer email API, `@sovereignfs/manifest`
→ patch or minor depending on schema additions, `runtime` → minor.

**Dependencies:** Task 3.9 (SDK distribution and host-provided implementations), Task 3.24 (SDK
boundary and runtime contract tests), Task 1.12 (user directory for user resolution patterns),
Task 1.14 (shared delivery wrapper and delivery log).

**SRS reference:** [RFC 0062](../rfcs/0062-email-delivery-coverage.md)

**Review checklist:**

- A plugin without `mailer:send` receives a clear error when calling the mailer.
- A plugin with `mailer:send` can send only through the allowed recipient/policy path.
- `sdk.email.sendToUser()` resolves recipient email server-side and respects delivery policy.
- Source plugin ID is runtime-derived and cannot be forged by plugin input.
- Rate limits prevent high-volume accidental or malicious plugin email sends.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.27 — Admin-managed external provider configuration

**Goal:** Let instance admins configure plugin-owned external provider settings,
such as OAuth client IDs/secrets, through Console instead of requiring
deployment-time environment variables and restarts for every provider.

This closes the Plainwrite-class gap where a plugin can use plugin-scoped env
vars for `PLAINWRITE_GITHUB_CLIENT_ID` / `PLAINWRITE_GITHUB_CLIENT_SECRET`, but
there is no standard operator UI or platform storage model for provider
configuration created after deployment.

**Deliverables:**

- Define a manifest or plugin metadata pattern for external provider config
  fields: provider ID, display name, public values, secret values, callback URL
  hints, and required scopes.
- Add Console surfaces for admins to create, update, test, and remove
  instance-level provider configuration for installed plugins.
- Store secret values through the plugin secret vault; store non-secret provider
  metadata in platform-owned tables.
- Preserve plugin-scoped env vars as the deployment-time fallback and define
  precedence between env-provided and Console-managed config.
- Expose a server-side SDK or runtime helper for plugins to read their effective
  provider configuration without accessing other plugins' settings.
- Document OAuth app setup, callback URL display, rotation, disconnect, and
  sanitized error handling patterns for plugin authors and operators.

**Dependencies:** Task 8.6 (plugin secret vault), Task 3.19 (plugin external
connections), Task 3.11 (plugin-scoped environment variables), Task 13.3/13.4
(Console plugin management/settings patterns).

**SRS reference:** RFC 0018, RFC 0043, RFC 0049; Plainwrite provider
configuration gap.

**Review checklist:**

- An admin can configure a GitHub-style OAuth provider for an installed plugin
  without editing `.env` or restarting the instance.
- Provider secrets are never stored in plugin tables, logs, activity rows,
  generated files, or exports.
- Plugins can read only their own effective provider configuration.
- Env-provided config remains supported for immutable/provisioned deployments.
- Docs explain when to use env vars vs Console-managed provider config.

---

#### ✅ 3.28 — Plugin catalog and install-time activation model (RFC 0065)

**Goal:** Split "which plugins are bundled in the image" from "which plugins an admin has
turned on for this instance," so an admin can activate any cataloged plugin at runtime without
a rebuild or redeploy. This is the foundation for Console's catalog browser (Task 13.8); it
itself builds on Task 2.21's schema, which must land first (see "Current state").

**Current state:** `scripts/install-plugins.ts` clones every plugin declared in
`sovereign.plugins.json` into `plugins/<id>/` at build/dev time; `scripts/generate-registry.ts`
composes every directory under `plugins/` into `runtime/generated/registry.ts` and the route
tree unconditionally — there is no `enabled` filter at generate time. "Installed" is purely
build-time/filesystem; there is no runtime action that makes a new plugin available without
someone running the install script and rebuilding. Enable/disable (`plugin_status`) already
operates independently of what's bundled in the image — a disabled plugin ships fully traced
into the standalone build today; this task extends that existing decoupling, it doesn't
introduce a new category of risk. Per an image-size check against the current 14-plugin
`plugins/` tree (3.4M total, 8K–570K per plugin `app/` dir), bundling the full catalog rather
than only active plugins adds low-single-digit MB to the standalone trace, not hundreds — unique
third-party npm dependencies per plugin are the larger variable, not plugin source size.

**Ordering note:** today, an absent `plugin_status` row means "enabled by default"
(`packages/db/src/platform-db.ts:160`) — the opposite of what this task needs ("absent row" =
"cataloged but never activated"). That reinterpretation is only safe once Task 2.21's migration
has backfilled an explicit `access_policy` row for every currently-shipped plugin, removing all
cases of "enabled via absence." **Task 2.21 must ship first**; this task's activation flow reads
as safe only after that backfill exists.

**Deliverables:**

- No change to the build pipeline: `sovereign.plugins.json` continues to declare the full
  catalog, and every declared plugin is cloned and composed at build time exactly as today.
- **One-time boot backfill** (`runtime/src/plugin-catalog.ts`'s `backfillPluginCatalogOnce`,
  called from `instrumentation.ts` after migrations/compat checks, gated by a
  `plugin_catalog_backfilled` platform setting so it runs exactly once per instance): creates an
  explicit `access_policy = 'everyone'` row for every plugin in the registry that had no row
  yet. **This is the actual fix for the epic's own "ordering note"** — Task 2.21 added the
  `access_policy` column but did not backfill data, so most already-shipped plugins still had no
  row (relying on the pre-existing "absence = enabled" convention). Without this backfill, the
  resolver default below would have made every existing plugin appear inactive/inaccessible.
- **Resolver default flipped** (`runtime/src/plugin-access-server.ts`'s `resolveAccessPolicy`):
  a genuinely absent `plugin_status` row now resolves to `disabled`, not `everyone`. This only
  became safe once the backfill above guarantees "absent row" means "cataloged but never
  activated" rather than "pre-existing plugin using the old default." Without this flip, a
  brand-new never-activated plugin would be fully open to everyone before an admin decided
  anything — exactly what activation exists to prevent. Verified live: deleting a plugin's
  `plugin_status` row makes it immediately inaccessible (404) rather than open.
- A runtime "activate" action (`activatePlugin`, `POST /api/admin/plugins/[id]/activate`,
  Console-triggered — Task 13.8) that creates a `plugin_status` row with `access_policy =
disabled` for a plugin with none yet. **Simplified from the original deliverable text**:
  migrations are not re-run here — `runtime/src/plugin-migrations.ts`'s
  `runAllPluginMigrations()` already runs unconditionally for every registry plugin at every
  boot, independent of activation state, so a plugin's migrations are already current by the
  time an admin can activate it. No filesystem write, no restart.
- A runtime-queryable catalog list (`getPluginCatalog`, `GET /api/admin/plugins/catalog`):
  every non-chrome plugin present in the registry, annotated active (has a row) or inactive.
- Activation is naturally all-or-nothing and idempotent: `createPluginStatusRowIfAbsent` uses
  `ON CONFLICT DO NOTHING`, so a repeated call is a silent no-op rather than a partial write —
  there's no multi-step sequence (like a migration run) left to fail halfway through.
- Documented (RFC 0065 "Dynamic runtime install (deferred)") that this does not support
  installing a plugin not already bundled in the image at build time.

**Dependencies:** Task 3.3 (install script), Task 3.4 (`sv` CLI, plugin migrate), Task 2.21
(plugin access policy — the `access_policy` default this sets).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Activating a cataloged plugin creates its `plugin_status` row with `access_policy = disabled`,
  with no rebuild or restart.
- A plugin already active is not reset by a repeated activation call (`activated: false,
reason: 'already-active'`).
- The boot backfill runs exactly once per instance and never touches an existing row.
- A plugin with no `plugin_status` row is inaccessible (404), not open — verified live by
  deleting an existing plugin's row and confirming its route 404s until reactivated.
- The catalog list correctly distinguishes active from cataloged-but-inactive plugins.
- Verified end-to-end in a live browser: catalog listing, activating a deliberately-deactivated
  plugin (still closed under the `disabled` default policy until an admin sets one), idempotent
  re-activation, and the `plugin.activated` activity log entry.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

**Post-completion correction (2026-07-19):** `backfillPluginCatalogOnce` was
removed. It turned out to be both unneeded for its stated purpose and actively
wrong for a genuinely fresh instance:

- **Unneeded:** the "ordering note" above assumed the app-level backfill was
  the only thing that could give "most already-shipped plugins" an explicit
  row. It wasn't — Task 2.21's own migration (`0016_plugin_access_policy.sql`)
  adds `access_policy`/`self_service` as `DEFAULT ... NOT NULL` columns, which
  in both Postgres and SQLite backfills every **already-existing**
  `plugin_status` row at `ALTER TABLE` time. The only case the app-level
  backfill genuinely covered was a plugin with **zero** `plugin_status` row at
  all (accessible purely via the pre-Task-2.21 "absence = enabled"
  convention) — a narrowing legacy case, not "most" plugins.
- **Actively wrong:** because it ran unconditionally for every non-chrome
  plugin — examples included — on an instance's first-ever boot, it made
  every plugin active with `accessPolicy: 'everyone'` before an admin had
  touched anything, on **any** instance whose first boot happened after this
  task shipped, not just ones upgrading from before it. That directly
  contradicted both this task's own "cataloged but inactive by default" model
  for ordinary plugins and Task 12.3's "examples ship hidden by default"
  model — and because "an explicit row always wins" (`plugin-status.ts`), the
  Settings → Example plugins bulk toggle became permanently inert for any
  example the backfill had already touched.
- **Why removal was safe:** `backfillPluginCatalogOnce` was gated by a
  one-time-per-instance flag (`plugin_catalog_backfilled`) — any instance that
  had already booted past this task's landing commit had already run it and
  set the flag, so it would never run again regardless of this change; only
  instances performing their first-ever backfill run _after_ this fix ships
  are affected, and for those the corrected (no eager activation) behavior is
  what both this task and Task 12.3 always intended.
- The "resolver default flipped" deliverable and the "no `plugin_status` row
  is inaccessible" review-checklist item both still hold — see
  `runtime/src/plugin-access-server.ts`'s `resolveAccessPolicy`, which now
  also carries a narrow exception: a row-less **example** plugin resolves to
  `everyone` (not `disabled`) when the Settings → Example plugins bulk toggle
  is on, so that toggle actually reaches the access-policy axis and not just
  the `plugin-status.ts` enabled/disabled axis. Regular (non-example) row-less
  plugins are unaffected and still resolve to `disabled`.

---

#### ✅ 3.29 — Private plugin repositories via access token

**Goal:** Let an operator declare a plugin hosted in a **private** git repository (their own
custom/proprietary plugin, or a private fork of a community plugin) in `sovereign.plugins.json`,
authenticated with a personal access token supplied via an environment variable — no manual git
credential setup, no committed secrets. Combined with the existing build-time composition model
(3.9 in the SRS — plugin loading stays build-time-only in v1, no change here), a private plugin
cloned once by `sv plugin add` needs its token again only if re-cloned from scratch; ordinary
version upgrades (`git pull` in the same checkout, then rebuild) never touch the already-cloned,
gitignored `plugins/<id>/` directory, so no new persistence mechanism is required.

**Current state:** `scripts/install-plugins.ts`'s `cloneInto` shells out to plain `git clone` /
`git init` + `remote add` + `fetch` (`scripts/install-plugins.ts:153`) against `entry.repository`
verbatim. There is no field for supplying credentials, so a private repository clone only
succeeds if the invoking shell already has ambient git auth (SSH agent, credential helper) set up
— undocumented and not something `sv plugin add`/`pnpm install:plugins` handle. `PluginEntry`
(`scripts/install-plugins.ts:41`) has `id`, `repository`, `ref`, `subdir` — no token field.

**Deliverables:**

- `PluginEntry` gains an optional `tokenEnv: string` — the **name** of an environment variable
  holding a PAT, never the token itself, so `sovereign.plugins.json` stays safe to commit.
  `parsePluginsConfig` validates it the same way as `ref`/`subdir` (non-empty string when present).
- `cloneInto` / `install-plugins.ts`: when `tokenEnv` is set, read `process.env[entry.tokenEnv]`
  at clone time. Missing/empty → a clear error naming the entry and the expected env var, not a
  silent git auth failure. Never log the token or an authenticated URL.
- Token handling avoids argv/`ps` exposure: write a short-lived git credential file (mode `0600`)
  in the same temp dir already used for pinned-ref clones, pass `-c
credential.helper="store --file=<tmpfile>"`, and delete it in the existing `finally` cleanup —
  not an embedded `https://<token>@...` URL passed as a process argument.
- `bin/sv.ts`'s `plugin add` gets a matching `--token-env <NAME>` flag, writing the same field
  into `sovereign.plugins.json`.
- `docs/plugin-development.md` — document the `tokenEnv` field in the `sovereign.plugins.json`
  reference and the `sv plugin add --token-env` flag.
- `docs/self-hosting.md` — new section documenting the full private-plugin workflow end to end:
  declaring a private repo with `tokenEnv`, setting the token env var, and the **one hard
  requirement** this depends on — the operator's build must run from a persistent checkout that
  is updated with `git pull` (the already-documented standard upgrade path, `docs/upgrade.md`),
  never a fresh clone or `git clean -fdx`, or the gitignored `plugins/<id>/` directory (and the
  token needed to reclone it) is lost. Cross-reference Task 3.14's "Maintaining a fork" section
  since this is the same fork-and-track model, not a new one.

**Dependencies:** Task 3.14 (operator fork model — this extends its documented workflow, doesn't
replace it).

**SRS reference:** SRS §3.9 Plugin Loading Model (build-time composition is unchanged), §2.7 Open
Source Strategy.

**Review checklist:**

- A `sovereign.plugins.json` entry with `tokenEnv` pointing at an unset env var fails with a
  clear error naming both the plugin id and the env var — not a raw git auth failure.
- A private GitHub repo clones successfully via `sv plugin add <repo> --token-env <NAME>` with
  the token only in `NAME`'s value, never in `sovereign.plugins.json`.
- Cloning a private repo does not print the token or an authenticated URL to stdout/stderr, and
  the token is not present as a process argument at any point (verify via `ps` during the clone).
- A second `pnpm install:plugins` run (simulating a version-upgrade rebuild) skips the
  already-cloned private plugin without needing the token env var set.
- `docs/self-hosting.md`'s new section is self-contained: an operator can follow it from
  declaring a private plugin through a subsequent version upgrade without consulting this epic
  file.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.30 — Console-managed SMTP settings (platform:owner only)

**Goal:** Let an instance owner view and change SMTP delivery settings (host, port, user,
password, from-address) through Console, instead of only `.env` + a restart — closing the gap
that mattered more once email verification (Task 1.8-adjacent, `AUTH_REQUIRE_EMAIL_VERIFICATION`)
made SMTP load-bearing for registration itself, not just password reset.

Combines two existing patterns rather than inventing a new one: Task 3.27's encrypted-secret
Console form shape (host/port/user/from as plaintext, password through the same AES-256-GCM
envelope as the plugin secret vault) and the invite-only Console toggle's dual-write-across-
services shape (`apps/auth/src/settings.ts`) — a setting the auth server's own mailer must read
authoritatively and locally, without a live dependency on the runtime being reachable.

**Deliverables:**

- New owner-only capability `instance:configure-secrets` (`OWNER_CAPS` only — never
  `ADMIN_CAPS`, never individually grantable — stricter than Task 3.27's own `console:access`-only
  gating, matching `role:assign`'s precedent instead).
- `runtime/app/api/admin/settings/route.ts` extended with a `smtp` field group: encrypts the
  password (`runtime/src/secrets.ts`, sentinel platform context), writes non-secret fields to
  `platform_settings`, and forwards the same payload to a new admin endpoint on the auth server
  so its own mailer never depends on a live call to runtime.
- `apps/auth/src/crypto-envelope.ts` — a small, self-contained AES-256-GCM envelope (same
  algorithm/format/key as `runtime/src/secrets.ts`) so the auth server can decrypt its own local
  copy without depending on `runtime` or `packages/db`.
- Both `platform-email.ts` files (`runtime/src/`, `apps/auth/src/`) stop memoizing their mailer at
  module load and instead resolve the effective config fresh before each send — a Console change
  takes effect immediately, no restart.
- Console → Settings → "Email delivery (SMTP)" section: editable for owners, read-only for
  everyone else, with a "Send test email" action.
- `docs/self-hosting.md` / `docs/security.md` updated; `SOVEREIGN_VAULT_KEY` documented as
  required on both the `runtime` and `auth` services once a password is Console-managed.

**Dependencies:** Task 3.27 (Console form/secret-storage pattern), Task 1.8-adjacent email
verification work (`AUTH_REQUIRE_EMAIL_VERIFICATION`, made SMTP registration-critical).

**SRS reference:** none directly — closest sibling is Task 3.27 (RFC 0018, RFC 0043, RFC 0049).

**Review checklist:**

- Only `platform:owner` can save SMTP settings or send a test email; other roles see the current
  values read-only.
- A Console-saved SMTP change takes effect immediately for both the runtime and the auth server's
  own mailer, without a restart.
- The password is never stored in plaintext, never logged, never returned to the client after
  saving — only whether one is set.
- Restarting either process does not lose Console-saved settings (dual-write actually persisted,
  not just in-memory).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.31 — Default plugin bundle reduced to Tasks-only

**Goal:** Stop shipping every first-party plugin (Plainwrite, Shopper, Wallet, Tritext,
Healthlog, Ledger, Tally, Docs) and all 7 example plugins baked into the default/official
image. A fresh checkout or the CI-published image should ship only the platform plugins
(console/launcher/account) plus **Sovereign Tasks** — matching what `CONTRIBUTING.md`
already documented as the intended default ("the shipped config has an empty plugins
list") before `sovereign.plugins.json` drifted to its current 16-entry bundle without a
matching doc update.

**Current state:** `sovereign.plugins.json` is committed at the repo root with 16 entries
and is read directly by `scripts/install-plugins.ts` (`CONFIG_PATH`) at dev time
(`pnpm dev`), Docker build time (`Dockerfile`'s `builder` stage), and in CI
(`publish-images.yml`, `.github/workflows/e2e.yml`). There is no per-environment
distinction — whatever is committed ships everywhere.

**Deliverables:**

- New committed `sovereign.plugins.default.json` at the repo root, containing only the
  `sovereign-tasks` entry (same repository/ref as today's `sovereign.plugins.json` entry).
  Serves two purposes: (1) it's the fallback set used whenever no local config exists, and
  (2) it's the template an operator copies to `sovereign.plugins.json` to declare their own
  set.
- `sovereign.plugins.json` removed from git tracking (`git rm --cached`) and added to
  `.gitignore` — it becomes a local, per-checkout file, never committed or shared.
- `scripts/install-plugins.ts`: when `sovereign.plugins.json` does not exist on disk, fall
  back to reading `sovereign.plugins.default.json` instead of the current "nothing to
  install" no-op (`scripts/install-plugins.ts:309-311`). A `sovereign.plugins.json` that
  exists — including an explicit `{"plugins": []}` — is used as-is and never falls back,
  so an operator can opt out of even Tasks deliberately. This single change is sufficient
  for all three build contexts without any Dockerfile- or CI-specific logic:
  - Fresh clone / `pnpm dev` → no local file → falls back to Tasks-only.
  - `publish-images.yml` (clean checkout) → same fallback → deterministic official images.
  - An operator's local `docker compose -f docker-compose.prod.yml up --build` → their own
    gitignored `sovereign.plugins.json` (already flows into the build context today —
    `.dockerignore` excludes cloned `plugins/*/` dirs but not the config file itself) is
    used as-is, shipping their custom set.
- `.github/workflows/e2e.yml`: add a step that writes a local `sovereign.plugins.json`
  (at minimum `sovereign-healthlog`, for the RFC 0071 `database.requireEncryption`
  coverage — audit the e2e specs for any other plugin routes exercised and include those
  too) before the existing `pnpm install:plugins` step, so CI coverage doesn't regress.
  With Task 8.15 landed first, adding `sovereign-healthlog` here no longer risks breaking
  any other plugin's boot — its encryption requirement stays scoped to its own database.
  Trimming the declared set also has an indirect effect worth knowing about: the launcher
  grid sorts installed plugins alphabetically by manifest id
  (`scripts/generate-registry.ts`), so `launcher.spec.ts`'s generic "click the first tile"
  test implicitly depends on whichever plugin sorts first _not_ requiring a paywall
  redirect or other special-cased navigation. `example-basic` is declared alongside
  `example-monetized` specifically to keep that assumption true — dropping it reintroduces
  the failure.
- `CONTRIBUTING.md` — "Installing external plugins" / "Cloning your own plugins" sections:
  describe the `sovereign.plugins.default.json` template + gitignored
  `sovereign.plugins.json` split; fix the now-accurate-again "shipped config has an empty
  plugins list" framing.
- `docs/self-hosting.md` — rewrite "Bundled example plugins" and "Bundled default plugins"
  sections: only Tasks ships by default now; document the two supported paths for running a
  larger plugin set in production — self-building the image from a checkout with a custom
  `sovereign.plugins.json`, or maintaining that file in a separate deployment/infra
  workflow.
- `docs/plugin-development.md` — update the `sovereign.plugins.json` reference sections to
  note the default-file fallback and the file's gitignored status.
- `docs/upgrade.md` — a migration note: from this version, only Tasks ships by default;
  anyone relying on a previously-bundled plugin must declare it in their own
  `sovereign.plugins.json` (using `sovereign.plugins.default.json` as a starting template)
  before their next rebuild, or its code drops out of the image. Its database tables and
  data are untouched either way and it reappears the moment the plugin is re-declared and
  the image is rebuilt.

**Dependencies:** Task 3.29 (private plugin repositories — defines the `PluginEntry`/
`tokenEnv` shape this task's fallback logic builds on, unchanged here). Task 8.15
(per-database SQLite encryption enforcement) must land first — this task's e2e
deliverable re-adds `sovereign-healthlog` to CI's plugin set, which is only safe once
8.15 fixes encryption enforcement to be scoped per-plugin instead of directory-wide.

**SRS reference:** SRS §3.9 Plugin Loading Model (build-time composition is unchanged —
only which plugins are declared by default).

**Review checklist:**

- A fresh clone with no local `sovereign.plugins.json`, running `pnpm dev`, shows only
  platform plugins (console/launcher/account) plus Tasks — no Plainwrite/Shopper/Wallet/
  Tritext/Healthlog/Ledger/Tally/Docs/examples.
- A local `sovereign.plugins.json` with a custom plugin list, present at Docker build time,
  ships exactly that set — the default file is not consulted when the local one exists.
- An explicit `{"plugins": []}` local file installs nothing, not even Tasks.
- `publish-images.yml`'s image (built from a clean checkout) matches the fresh-clone case.
- `.github/workflows/e2e.yml` still passes with its required plugins present.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.32 — Plugin surface model and SDK device environment (RFC 0080)

**Goal:** Give the platform one way to answer "what surface am I running on?" and
expose it to plugins as `sdk.device.*` — the abstraction RFC 0058 and RFC 0038 both
promised and neither shipped. Server-side for layout and routing decisions
(no hydration flash), client-side for what the server cannot know.

**Deliverables:**

- `runtime/middleware.ts` normalizes the shell User-Agent token into
  `x-sovereign-surface` (`browser` | `mobile` | `desktop`) plus an optional
  `x-sovereign-shell-version`, **stripping any inbound value first** as the
  `x-sovereign-user-*` family already requires. Unrecognized or absent → `browser`.
- `packages/sdk/src/device.ts` — server tier: `getSurface()`, `getShellVersion()`,
  `isNativeShell()`. Returns the safe default rather than throwing, following
  `env.ts`'s discipline (minor bump).
- `packages/sdk/src/device-client.ts` on the dedicated `@sovereignfs/sdk/device-client`
  subpath — client tier: `readEnvironment()` and `useDeviceEnvironment()`, reporting
  `installed` (`display-mode: standalone`), which is irreducibly client-side. The hook
  returns `null` before mount **by design**, so callers must handle "not known yet"
  instead of flashing a default.
- **New hard rule in `docs/architecture-rules.md`:** the surface signal derives from a
  client-controlled User-Agent and is trivially spoofable — it must never be an input
  to authorization, entitlement, paywall, or data-access decisions.
- `docs/plugin-development.md` documents `sdk.device.*` as a generic capability,
  stating plainly which tier answers which question.
- Extension seams left obvious for epic tasks 17.7 and 20.3, which extend this base
  rather than inventing parallel environment models.

**Dependencies:** RFC 0080. Prerequisite for Task 2.27.

**SRS reference:** §3.12, §3.19.

**Review checklist — all verified:**

- ✅ A request with a native shell User-Agent resolves the correct surface
  server-side; an ordinary browser resolves `browser` — covered by
  `runtime/src/__tests__/surface.test.ts` (pure `resolveSurface()`/
  `applySurfaceHeaders()` unit tests) and four new integration tests in
  `runtime/src/__tests__/middleware-regression.test.ts` exercising all three
  header-forwarding code paths (authenticated main path, RFC 0042 public
  plugin route, public `/api/*` namespace delegation) against a real
  `middleware()` call.
- ✅ A forged inbound `x-sovereign-surface` header is stripped and ignored —
  same test suite; `applySurfaceHeaders()` unconditionally overwrites the
  header on every path (unlike the pre-existing `x-sovereign-user-*`
  handling, which only overwrites when a session exists — a separate,
  pre-existing gap flagged as its own follow-up, not fixed here).
- ✅ `getSurface()` returns `browser` outside a plugin route context and
  never throws — `packages/sdk/src/__tests__/device.test.ts` (mocked
  `next/headers`).
- ✅ A `'use client'` component importing `@sovereignfs/sdk/device-client`
  builds — verified by actually running `tsup` and inspecting the built
  `dist/device-client.js`: 712 bytes, imports only `react`, zero occurrences
  of `next/headers`.
- ✅ `useDeviceEnvironment()` causes no hydration mismatch — by construction
  (`useState(null)` + fill in `useEffect`, the same pattern the hard rule
  against reading browser globals in render requires); `readEnvironment()`
  itself unit-tested in `packages/sdk/src/__tests__/device-client.test.ts`
  (jsdom).
- ✅ `useIsMobile` in `packages/ui` is unchanged — this task never touches
  `packages/ui`.
- ✅ The architecture-rules entry is present and explicit — see
  `docs/architecture-rules.md`'s `sdk.device.getSurface()` entry.

#### ✅ 3.33 — Manifest surfaces availability declaration (RFC 0080)

**Goal:** Let a plugin declare which surfaces it is available on, so the platform can
filter presentation instead of showing a mobile-only app on desktop.

**Deliverables:**

- `packages/manifest`: optional `surfaces` array of `browser` | `mobile` | `desktop`,
  unique and non-empty when present. **Absent means available everywhere** — today's
  behavior for every existing plugin, so purely additive (minor bump).
- Launcher grid, sidebar, and mobile-drawer entries filtered by the current surface.
- Navigating directly to an unavailable plugin renders a clear "not available on this
  surface" state, **not** a 404 — the plugin is installed, it just does not belong here.
- `docs/plugin-development.md` coverage, including the deliberate asymmetry with the
  RFC 0082 route lock: `surfaces` filters presentation and is bypassable, which is fine
  because nothing behind it is a secret.

**Dependencies:** Task 3.32, RFC 0080.

**SRS reference:** §3.12, §3.19.

**Review checklist:**

- A plugin declaring `surfaces: ["mobile"]` is absent from Launcher, sidebar, and
  drawer on desktop, and present on mobile.
- Direct navigation to it on desktop shows the unavailable state, not a 404.
- Every existing plugin (no `surfaces` field) behaves exactly as before.
- Manifest validation rejects an empty or duplicated `surfaces` array.

#### ✅ 3.34 — Device bridge protocol package (RFC 0083)

**Goal:** Establish the device-capability contract and its first implementation:
the contract in `@sovereignfs/sdk`, the transports in a new published
`@sovereignfs/bridge`. One protocol owned here and consumed by both external shell
repositories, so the Capacitor and Tauri shells cannot drift. Web transport only;
no plugin-facing capability calls yet.

**Deliverables:**

- `packages/sdk`: new **`device-bridge` subpath** — not `device-client` as RFC
  0083 originally wrote — holding the **contract** — capability registry,
  handshake shape, typed `DeviceResult`, the `BridgeImpl` interface, and
  `provideBridge()`. **Deviates from the RFC's literal wording for a verified
  technical reason:** `device-client.ts` (RFC 0080's `useDeviceEnvironment`)
  imports React; `@sovereignfs/bridge` imports `provideBridge` as a genuine
  runtime value (not just a type), and React ships no `"sideEffects": false`
  in its own `package.json`, so a bundler inlining the contract (required,
  since `@sovereignfs/bridge` takes the SDK as a devDependency only and must
  ship no runtime dependency on it) cannot tree-shake an unused React import
  out of a shared file. Confirmed empirically, not assumed: co-locating the
  contract in `device-client.ts` pulled ~64KB of React into
  `@sovereignfs/bridge`'s built `dist/index.js`; splitting it into its own
  React-free `device-bridge.ts` dropped that to 1.46KB with zero `react`
  references in the built output (checked directly against the `tsup` build
  artifact, not inferred from source). Leg 2's plugin-facing surface
  (`supports()`, `haptics`, `nativeNotifications`) still lands in
  `device-client.ts` as the RFC specifies — that code is consumed by plugin
  React components, which already depend on React, so it carries none of
  this risk.
  **`packages/sdk` keeps zero runtime dependencies** — it has no `dependencies`
  field today and must not gain one.
- **`provideBridge()` stores the implementation on a `Symbol.for`-keyed global**,
  never a module-level variable, following `packages/sdk/src/host.ts`'s documented
  reasoning (Next compiles separate bundles per entry; dev HMR resets module
  state) plus a second reason specific to this case: a plugin could install a
  different major of `@sovereignfs/bridge` than the platform ships, producing two
  copies with two independent handshake states, one of which never resolves.
- New `packages/bridge` → `@sovereignfs/bridge`, **published**, holding the
  **implementation**: the `web` transport, protocol/handshake mechanics, and the
  shell-side helper. Two entry points — `@sovereignfs/bridge` (page side, consumed
  by `runtime`) and `@sovereignfs/bridge/shell` (shell side) — so neither side
  pulls the other's code.
- `@sovereignfs/bridge` depends on `@sovereignfs/sdk` as a **`devDependency` only**
  (types erase at build), so its published output has no runtime dependency while
  the contract keeps one source of truth. Zero runtime deps otherwise — no React,
  no Next, no Node built-ins; never imports `next/headers`, `@sovereignfs/db`, or
  anything reachable from `SdkHost`. Verified by a standalone type-check.
- `runtime`: a client bootstrap that calls `provideBridge()` — the client-side
  analogue of `instrumentation.ts` calling `provideHost()`. **Resolved RFC 0083
  open question 7**: a module-level call to `installWebBridge()` at the top of
  `ClientShell.tsx` (the platform layout's single client-side entry point,
  rendered around every authenticated route) — runs once as soon as that chunk
  is evaluated, earlier and more reliable than a `useEffect`, since a plugin's
  first `supports()` call (leg 2) needs the handshake already answerable.
- Capability negotiation: the shell advertises `{ name, version }` descriptors at
  handshake. **Nothing compares shell versions** — `shell.version` is diagnostic
  only, and branching on it is a review-blocking mistake.
- `DeviceResult` with distinct `ok` / `unavailable` / `denied` / `dismissed` /
  `failed` states. Exceptions reserved for programmer error, never for user or
  environment outcomes.
- Build wiring: `tsup`, catalog-pinned dev deps per the pnpm `catalog:`
  convention. **`transpilePackages` added to `runtime/next.config.ts` only** —
  not `apps/auth/next.config.ts` too, despite the RFC's generic "both
  `next.config.ts` files" phrasing: `apps/auth` doesn't import
  `@sovereignfs/sdk` at all today (confirmed by grep, not assumed), so it has
  no reason to import the bridge either. No `turbo.json` pipeline entry needed
  — `build`/`typecheck` already participate generically via each package's own
  `package.json` scripts and turbo's existing `dependsOn: ["^build"]` rule.
- **Resolved RFC 0083 open question 2**: a native shell whose `protocolVersion`
  doesn't match this build's degrades to the `web` transport (empty
  capabilities) with a recorded `console.warn`, never a fatal error — an old
  shell can never hard-break an instance.
- The RFC's original `BridgeHandshake.shell.platform` enum
  (`'ios' | 'android' | 'macos' | 'windows' | 'linux'`) had no value for "no
  native shell is present" — the web transport's own handshake needs one.
  Extended with `'web'` rather than inventing a misleading OS guess.

**Dependencies:** RFC 0083.

**SRS reference:** §3.12, §3.19

**Review checklist — all verified:**

- ✅ `packages/sdk/package.json` still has **no `dependencies` field**.
- ✅ `packages/bridge` type-checks standalone (`pnpm --filter @sovereignfs/bridge
typecheck`); its published `dependencies` are empty and `@sovereignfs/sdk`
  appears only under `devDependencies`.
- ✅ Neither package imports `next/headers`, `@sovereignfs/db`, or anything
  reachable from `SdkHost` — verified by typecheck (would fail to resolve) and
  by inspecting the built `dist/index.js`/`dist/shell.js` directly.
- ✅ `provideBridge()` uses a `Symbol.for` global — `packages/sdk/src/__tests__/
device-bridge.test.ts` verifies a later registration replaces an earlier one
  via the same key, the two-module-instance scenario in miniature.
- ✅ An older shell advertising fewer capabilities (empty `capabilities: []`
  from the web fallback) and a newer/mismatched-protocol shell (degrades to
  the same empty-capabilities web fallback) both resolve without error —
  covered in `packages/bridge/src/__tests__/index.test.ts`.
- ✅ A capability call with no shell present, or a protocol mismatch, yields
  `{ status: 'unavailable', capability }`, never a throw — same test file.
- ✅ The web transport works in a plain browser tab with no shell present —
  same test file's "degrades to the web transport when no native shell has
  installed a bridge" case.
- ✅ `pnpm --filter @sovereignfs/runtime build` (a real production build, not
  just typecheck) produces every route including `/launcher` (which renders
  `ClientShell`) with no error — chosen over a dev-server click-test because
  authenticated routes need credentials this session cannot enter.
- ✅ No shell version comparison exists anywhere in either package —
  `shell.version` is only ever read (never compared) in `index.ts`'s pass-through
  of the native handshake.

#### ✅ 3.35 — Plugin device surface, permissions, and consent (RFC 0083)

**Goal:** Give plugins `sdk.device.*` capability calls with manifest-declared
`device:*` permissions and per-user consent, working end to end on the web tier
before either native shell implements a transport.

**Deliverables:**

- `@sovereignfs/sdk/device-client` gains `supports()`, `getTransport()`,
  `getShellInfo()`, `haptics.impact()`, and `nativeNotifications.*`. Browser-only
  subpath, for the reason `@sovereignfs/sdk/offline` already documents — the main
  barrel transitively reaches server-only `next/headers`.
- `supports()` returns `false` before the handshake resolves, **deliberately** —
  capabilities are progressive enhancement and a component must render a working
  state without them. Do not soften this into a render-blocking promise.
- `device:haptics` and `device:notifications` added to `permissionSchema` (additive;
  `@sovereignfs/manifest` minor bump). One permission per capability — never a broad
  `device:*` grant.
- Per-user, per-plugin, per-capability consent grants, managed in the Account plugin
  alongside the existing data-consent surface. **Resolves RFC 0083 open question 1**:
  reuses the _pattern_ (grant/revoke, Account UI list), not the `consent_grants`
  table — a new `device_consent_grants` table instead, compound-keyed on
  `(user_id, plugin_id, capability)`, mirroring `user_capability_grants`'s shape
  (hard delete on revoke) rather than `consent_grants`'s (single `id` PK,
  soft-delete `revoked_at`), since the subject is a capability grant, not a
  cross-plugin data contract.
- `notifications.native`'s web tier uses the Web Notifications API (`new
Notification(...)`) directly, **not** the push/broker pipeline (RFC
  0015/0016/0034). **Deviates from this task's own original wording** ("routes
  into the shipped Notification Center / web push path") for a real reason: that
  pipeline exists to reach a user whose tab is _closed_; `nativeNotifications.show()`
  is explicitly the immediate, foreground, currently-running-code capability
  (RFC 0083 §7's own table: "Local notification / OS notification / Web
  Notifications" — three _immediate_ mechanisms, one per transport), a genuinely
  different use case. "Route into the correct tier" is honored by using the Web
  Notifications API as the web tier's own tier, not by routing through the
  background-delivery tier. `requestPermission()` **does** reuse the existing
  `Notification.requestPermission()` flow already shipped in
  `plugins/account/app/notifications/page.tsx` — no second permission/subscription
  mechanism.
- **Simplified from RFC 0083 §5's UI flow, by explicit developer decision, not a
  silent scope cut**: no platform-rendered "_Tally_ wants to send notifications"
  overlay in v1. `requestPermission(pluginId)` records the consent grant and calls
  the browser's native permission dialog directly; the calling plugin's own UI
  (e.g. an "Enable notifications" button) is what supplies the naming context,
  since the user is already inside that plugin when they click it — the standard
  web pattern, and it avoids building a new global prompt primitive as unplanned
  scope. A platform-rendered prompt remains available as a future enhancement if
  this proves insufficient.
- **`docs/plugin-development.md` states the enforcement limits in plain words:**
  client-side plugin identity is self-declared and unverifiable on a shared origin,
  so `device:*` is install/review-time metadata and a consent-prompt input, and
  provides **no** isolation between plugins. Same posture as `offline:write`
  (RFC 0078 §6) and the surface signal (RFC 0080 §2).
- `secureStorage` remains platform-internal — **not** exposed to plugins in v1, for
  exactly the identity reason above.

**Dependencies:** Task 3.34, Task 3.32 (supplies the `device-client` subpath),
RFC 0083.

**SRS reference:** §3.12, §3.19

**Review checklist — all verified:**

- ✅ A plugin declaring `device:haptics` can call `haptics.impact()`; falls back to
  the Vibration API on the web transport with no native shell, and reports
  `unavailable` with neither a bridge nor `navigator.vibrate` — covered in
  `packages/sdk/src/__tests__/device-client.test.ts`.
- ✅ `nativeNotifications.show()` uses the Web Notifications API directly on the
  web transport (see the deliberate deviation noted above, not the push path);
  `requestPermission()` short-circuits to `{ status: 'denied' }` without
  re-prompting when the browser has already permanently denied it, and tolerates
  a grant-bookkeeping network failure without blocking the actual permission
  request — same test file.
- ✅ Consent can be granted (idempotently — a re-grant refreshes `grantedAt`
  rather than erroring) and revoked from Account (`plugins/account/app/data/page.tsx`'s
  new "Device app permissions" section) — covered in
  `packages/db/src/__tests__/platform-db.test.ts`'s "device consent grant helpers"
  block, and the `/api/account/device-grants` route verified live against a real
  dev server (matches its `/api/account/data-grants` sibling's session-gate
  behavior exactly — both 303-redirect an unauthenticated request to `/login`).
- ✅ `supports()` causes no hydration mismatch and no flash of a capability-dependent
  affordance — synchronous, returns `false` until the handshake resolves, by
  construction (same pattern `useDeviceEnvironment()` already established).
- ✅ A `'use client'` component importing `@sovereignfs/sdk/device-client` builds —
  verified via a real `pnpm --filter @sovereignfs/runtime build` (production
  build, not just typecheck) producing `/account/data` (which now renders the new
  section) with no error; `runtime/tsconfig.json` excludes composed plugin routes
  from its own standalone `tsc --noEmit` scope entirely, so the real build was the
  only way to actually verify this.
- ✅ The plugin-development doc states the non-isolation limit explicitly, not as a
  footnote — a dedicated paragraph, not a table cell.
- ✅ No plugin-facing `secureStorage` surface ships — not touched this task.

---

#### ✅ 3.36 — Tiered `offline` manifest declaration (Research 0012)

**Goal:** Replace the single `offline: boolean` flag with three graduated tiers,
so a plugin declares how much offline capability it needs — and so "no offline
support" stays the default.

**Deliverables:**

- `packages/manifest`: `offline: z.enum(['offline-first', 'device-only']).optional()`,
  replacing `offline: z.boolean()` (`schema.ts:228`). **Breaking** — major bump,
  plus a `docs/upgrade.md` migration note. This is the third shape change to this
  field (object → boolean → enum); the note should say so plainly.
- Omitting the field means no offline support. Deliberately **no** explicit "off"
  literal — that reintroduces the boolean-vs-enum ambiguity RFC 0078's flattening
  removed.
- Remove the `offline:write` permission (`schema.ts:36`) and its cross-field
  refine (`schema.ts:637`). The enum is sufficient install-review signal once both
  tiers imply local mutation. This also resolves RFC 0074's open question 1.
- A **capability-detection** contract deciding whether `device-only` is available
  on a given surface — is a durable, encrypted, device-auth-gated store present?
  Explicitly **not** `sdk.device.getSurface()`, which `docs/sdk-stability.md:65`
  documents as a presentation hint and never a security boundary.
- Migrate `plugins/launcher` (today's only in-repo adopter) to the new field.
- Mark RFC 0074 and RFC 0078 superseded; update `docs/rfcs/README.md`.
- `docs/plugin-development.md` rewritten for the tier model.

**Dependencies:** Research 0012. Blocks tasks 2.33, 3.37, 1.22.

**SRS reference:** §3.11.

**Review checklist:**

- A manifest with `offline: true` fails validation with a message pointing at the
  migration note.
- A manifest omitting `offline` gets no offline behaviour.
- `offline:write` is rejected as an unknown permission.
- Capability detection reports `device-only` unavailable on desktop web and
  available in the native shell.
- `runtime/src/__tests__/docs-parity.test.ts` passes with the new field.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

#### 📋 3.37 — Unified offline storage SDK surface (Research 0012)

> **Planning note (August 2026):** this task's execution plan is now split
> across [workstream 0008](../workstreams/0008-offline-first-architecture.md)'s
> legs 6 (IndexedDB + native-bridge backends) and 7 (the OPFS + `wa-sqlite`
> backend, marked a gate) — see those legs for the current, authoritative
> technical plan. Nothing here has shipped yet; this task stays 📋.
> `device-only-kv.ts` (`@sovereignfs/sdk/device-only-kv`), shipped this
> session, is a deliberately smaller, separate stopgap for `device-only`
> plugins specifically — not this task's own deliverable, and not something
> leg 6 migrates in place. See that module's own doc comment.

**Goal:** One SDK surface over three storage backends, so a plugin author writes
the same code whether the data lands in IndexedDB, OPFS-backed SQLite, or native
SQLite.

**Deliverables:**

- A single plugin-facing API replacing `packages/sdk/src/offline.ts` (331 lines)
  and `offline-queue.ts` (388 lines), selecting a backend by capability:
  - **IndexedDB** — universal floor; works in every context tested by research
    0008, including iOS `capacitor://`.
  - **OPFS + SQLite WASM** — use `OPFSCoopSyncVFS` (wa-sqlite), which does **not**
    require COOP/COEP headers. The official `sqlite-wasm` OPFS build does, and
    those headers would fight the CSP. No OPFS in Safari private browsing — fall
    back.
  - **Native SQLite** — via the device bridge; the only durable option, since it
    lives in the app sandbox rather than an evictable web storage partition.
- **Flush to storage as data is produced.** Research 0008 found iOS WKWebView
  discards in-memory JS state across a background/foreground cycle while Android
  preserves it; a buffer-then-flush design silently loses data on iOS only.
- Preserve the existing cross-tab `BroadcastChannel` purge safety and the
  sign-in/sign-out purge sites (`runtime/src/complete-sign-in.ts`).
- An eviction policy, which neither current store has — today the read cache
  throws at a soft cap and the queue throws at a hard 500-entry cap.
- Keep the static offline-route neutrality scanner or retire it deliberately,
  consistent with whatever task 2.31 decided.

**Dependencies:** Task 3.36.

**SRS reference:** §3.11.

**Review checklist:**

- The same plugin code runs unchanged on all three backends.
- Backend selection is observable and correct per surface.
- A background/foreground cycle on iOS loses no written data.
- Sign-out purges every backend, not only IndexedDB.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

#### 📋 3.38 — Background sync for `offline-first` plugins (Research 0012)

**Goal:** Give `offline-first` plugins real background synchronisation, so local
writes reach the server without the plugin author hand-rolling a sync loop.

**Deliverables:**

- Sync protocol: conflict resolution by last-write-wins timestamps (locked by
  research 0012 — CRDTs were rejected as solving concurrent multi-writer editing,
  which Sovereign's predominantly single-writer data is not), plus tie-breaking
  and clock-skew handling, which are **not** yet decided.
- Tombstones and deletion propagation.
- Partial sync and resume; batch sizing; a user-visible failure/retry surface.
- Drain triggers beyond today's manual `drainQueue()` — mount, reconnect, and an
  explicit retry affordance. No Background Sync API (no iOS Safari support).
- Preserve the queue's throw-rather-than-evict property: dropping a queued write
  silently is data loss.
- **Re-evaluate build vs. RxDB at this point**, with the design in hand rather
  than in the abstract. Research 0012 rejected PowerSync (FSL-licensed service,
  separate Docker dependency, Postgres-oriented), ElectricSQL (Postgres-only,
  read-path only), and Zero (offline explicitly out of scope), but kept RxDB open.

**Dependencies:** Task 3.37.

**SRS reference:** §3.11.

**Review checklist:**

- A write made offline reaches the server after reconnect, exactly once.
- Concurrent edits on two devices converge per the documented rule.
- A deletion made offline propagates and does not resurrect.
- An interrupted sync resumes without duplicating or dropping writes.
- The build-vs-RxDB decision is recorded with reasoning.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 3.39 — Namespace sdk.data's resolver registry by (providerId, contract)

**Goal:** Close a cross-plugin data-isolation bug found in a codebase audit: `runtime/src/sdk-host.ts`'s `_resolverRegistry` (line 250) is a `Map<string, DataContractResolver>` keyed only by bare contract name, and `data.query()` (line 703) looks the resolver up by contract alone — `providerId` is used only for the consent-grant check (`getConsentGrant`, lines 693-700), never for resolver dispatch. Two unrelated plugins that pick the same contract name (e.g. both naming a contract `"expenses"`) silently clobber each other's registration — last `sdk.data.provide()` call wins process-wide — so a consumer holding a valid, narrowly-scoped consent grant for provider A can be served provider B's resolver and see provider B's rows, a real data leak across the consent boundary RFC 0002 exists to enforce. The adjacent `_toolRegistry` (line 260) already solves the identical problem, namespaced `${providerId}:${toolName}` via `pluginToolName()`, with an inline comment (lines 252-259) explicitly noting the difference from `_resolverRegistry`. `data.provide()` (`SdkHost.data.provide`, `packages/sdk/src/host.ts` line 136) is also the only "provider registers a handler" SDK call — versus `tools.provide`, `portability.provideExport/Import/Delete`, `authz.provide` — that never threads the registering plugin's own id to the host at all, so there is no way to namespace the registry without first fixing that gap.

**Deliverables:**

- Add `pluginContractName(providerId, contract): string` to `packages/manifest/src/data-contract-utils.ts` (new file) — returns `${providerId}:${contract}`, mirroring `pluginToolName`/`pluginCapabilityName` in `packages/manifest/src/tool-utils.ts`/`cap-utils.ts`. Export it from `packages/manifest/src/index.ts`.
- `runtime/src/sdk-host.ts`: change `_resolverRegistry` (line 250, `Map<string, DataContractResolver>`) to be keyed by `pluginContractName(providerId, contract)` instead of bare `contract`. Update `data.provide()` (lines 675-677) to take `providerId` and call `_resolverRegistry.set(pluginContractName(providerId, contract), resolver)`, mirroring `tools.provide()` (line 1560-1561). Update `data.query()`'s lookup (line 703) to `_resolverRegistry.get(pluginContractName(ref.providerId, ref.contract))`. Rewrite the `_resolverRegistry` doc comment (lines 245-250) to match `_toolRegistry`'s (lines 252-259) — it currently says 'Keyed by contract name' with no mention of the collision it now prevents.
- `packages/sdk/src/host.ts`: change the `SdkHost.data.provide` signature (line 136) from `provide(contract: string, resolver: DataContractResolver): void` to `provide(providerId: string, contract: string, resolver: DataContractResolver): void`, matching `tools.provide(providerId, name, handlers)` (line 358).
- `packages/sdk/src/data.ts`: rewrite `data.provide()` (lines 65-71) to read `x-sovereign-plugin-id` off `headers()` and throw `'sdk.data.provide() requires a plugin route context (x-sovereign-plugin-id header missing).'` when absent, then call `requireHost().data.provide(providerId, contract, resolver)` — mirroring `tools.provide()` in `packages/sdk/src/tools.ts` (lines 80-89) exactly. This makes `provide()` `async`/`Promise<void>` (it was synchronous `void`); update its JSDoc example (and the one in `docs/plugin-development.md` line 1486) to `await sdk.data.provide(...)`.
- `scripts/generate/read-plugins.ts`: add `duplicateDataContracts(plugins: PluginEntry[]): Map<string, string[]>` next to `duplicatePluginIds` (lines 48-60) — builds contract-name → declaring-pluginId[] from every entry's `manifest.data?.provides`, returns only contracts declared by more than one distinct plugin id. Wire it into `readPlugins()` alongside the existing `duplicateApiProviders` check (lines 144-154): on a non-empty result, `console.error` each colliding contract with its declaring plugin ids and `process.exit(1)`, matching that check's exact style and exit behavior.
- Regression tests: new `runtime/src/__tests__/sdk-host-data-routing.test.ts` (sibling of `sdk-host-storage-routing.test.ts`/`sdk-host-db-routing.test.ts`) proving two different `providerId`s registering the identical contract name resolve independently and a consumer with a grant for provider A never receives provider B's rows. New `scripts/generate/__tests__/read-plugins.test.ts` (or the existing suite for that file, if one exists) covering `duplicateDataContracts`: no collision when contract names differ or when only one plugin declares a given contract, a collision when two distinct plugin ids declare the same contract name.
- Update the 5 hand-rolled mock `SdkHost` fixtures' `data.provide` stub and the `sdk.data.provide` call site in `packages/sdk/src/__tests__/sdk.test.ts` (mock at line 58, call+assertion at lines 646-650) for the new `(providerId, contract, resolver)` signature; add a `mockHeaders({})` case asserting `sdk.data.provide()` rejects with `/plugin route context/` when the header is missing, mirroring the existing `tools.provide()` case at lines 421-427.
- Update `docs/plugin-development.md`'s `data` section (around line 1486, and the 'Resolver registration timing' note at lines 1521-1525) to show the `await` call and to state that contract names are now namespaced per-provider internally, so two providers may reuse the same local contract name without collision (the manifest schema's own `provides[].contract` comment — 'Should be globally unique — prefix with your plugin slug' — was the un-enforced version of this and should be softened or removed once namespacing makes it unnecessary). Update `docs/sovereign-proposal-plan-srs.md` line 532 (`sdk.data.provide(contract: string, resolver: DataContractResolver): void`) to reflect the new signature and `Promise<void>` return type.
- Bump `@sovereignfs/sdk` **minor** (not patch) per NFR-04 — `SdkHost.data.provide`'s signature changed, a host-implementer-facing breaking change in the same category as the `StorageContext.pluginId`/`sdk.env` precedents this file's own Status log documents. Add a `### @sovereignfs/sdk x.y.0 → x.(y+1).0` entry to `docs/upgrade.md` describing the `data.provide()` call becoming `async` and gaining the `providerId` argument (SDK-facing call site is unaffected — plugin authors still call `sdk.data.provide(contract, resolver)`; only the `SdkHost` implementation signature changed). Bump `runtime`'s `package.json` patch version for the `sdk-host.ts` fix.
- Bump `@sovereignfs/manifest`'s package.json (new exported `pluginContractName` + `duplicateDataContracts`-adjacent behavior is additive — minor).

**Dependencies:** None — self-contained remediation, independent of tasks 3.37/3.38 (offline storage) currently ahead of it in docs/epics/plugins-runtime.md.

**SRS reference:** docs/sovereign-proposal-plan-srs.md §3.13 Cross-Plugin Data Sharing (RFC 0002; implemented in Task 0.5.11) — this task fixes an isolation bug in that RFC's shipped implementation, it does not change the design. RFC 0002 (`docs/rfcs/0002-cross-plugin-data-sharing.md`, Status: Implemented) stays `Implemented`; no RFC status change required.

**Review checklist:**

- Two plugins with manifests declaring `data.provides: [{ contract: "expenses", ... }]` under different plugin ids both build and register successfully (no collision at the runtime registry level) and each resolves independently — verified by the new `sdk-host-data-routing.test.ts`.
- A consumer with a consent grant scoped to `(consumer, providerA, "expenses")` never receives `providerB`'s rows when both providers registered a contract literally named `"expenses"`.
- `sdk.data.provide('contract', resolver)` called with no `x-sovereign-plugin-id` request header rejects with an error matching `/plugin route context/`, mirroring `sdk.tools.provide()`'s existing behavior.
- Two plugin directories under `plugins/` whose manifests both declare the same `data.provides[].contract` name fail `pnpm generate`/the build with a clear `[generate]` error naming both plugin ids and the colliding contract — not a silent last-write-wins registration.
- `grep -n '_resolverRegistry.set(contract\|_resolverRegistry.get(ref.contract' runtime/src/sdk-host.ts` returns nothing — both call sites now key by `pluginContractName(providerId, contract)`.
- `pnpm --filter @sovereignfs/sdk typecheck` passes with all 5 mock `SdkHost` fixtures (`packages/sdk/src/__tests__/{events,jobs,mailer-email-plugin-id,sdk,webhooks}.test.ts`) updated for `data.provide`'s new 3-arg signature.
- `docs/plugin-development.md`'s `data.provide` example shows `await`, and `docs/sovereign-proposal-plan-srs.md` line 532's literal signature matches the new `Promise<void>` return type.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.

---

#### ✅ 3.40 — Sweep sdk.* surfaces for the headers()-outside-request bug class

**Goal:** Close the recurring "`headers()` throws outside a real Next.js request" bug class in `packages/sdk`, which has been independently found and fixed four separate times as isolated incidents (`sdk.db.getClient` and `sdk.storage` in the same session that produced platform `0.101.1`, `sdk.env` in `0.101.3`, and `sdk.crypto` — which got the pattern right on first implementation for RFC 0092 only because the earlier three had already established it) rather than closed once as a class. `next/headers()`'s `headers()` rejects when called with no request-scoped `AsyncLocalStorage` active — the case every `sdk.jobs`/`sdk.schedules` handler and every `sdk.portability` export/import resolver runs in, per `runtime/src/background-plugin-context.ts` and `runtime/src/portability/plugin-context.ts`'s own doc comments. Ten more `packages/sdk/src/*.ts` surfaces still call `headers()` directly with no `try/catch`: `activity.ts:14`, `authz.ts:109,126`, `connections.ts:32`, `data.ts:75`, `directory.ts:15,26`, `e2ee.ts:17`, `handoffs.ts:15`, `plugins.ts:96,140`, `secrets.ts:21`, and `tools.ts:23,81` — confirmed by reading each file directly. `docs/plugin-development.md`'s `schedules`/`jobs` sections (~line 2340–2470) describe the background-handler contract generically ("a persistent... mechanism for one-off and dynamically recurring work") with no surface-by-surface note on which `sdk.*` calls actually tolerate that context, so a plugin author has no documented way to know these ten will throw an unhandled rejection instead of failing gracefully. Deliberately excluded from this task, each for its own already-documented reason confirmed by reading the file: `auth.ts` (session has no background-invocation analog — there is no "user this job runs as" to fall back to), `device.ts` (its own doc comment already claims "never throws... outside a plugin route context, matching env.ts's discipline", though the code has no visible `try/catch` to back that claim — a possible latent doc/implementation mismatch worth a separate look, not folded into this sweep), `notifications.ts` (doc comment at `notifications.ts:14-24` explicitly reasons it only ever runs inside a real request, never a background job), and `portability.ts` (its three `headers()` calls register resolvers at plugin load inside a real route, the same shape `authz.provide()`/`tools.provide()` already handle).

**Deliverables:**

- packages/sdk/src/activity.ts:14-17 — wrap the `headers()` call in `activity.log()` in try/catch, matching db.ts/storage.ts's exact style: on catch, leave `actorId`/`pluginId` as `null` and let the host resolve what it can instead of letting the rejection propagate uncaught.
- packages/sdk/src/authz.ts:109 (`provide()`) and :126-127 (`hasGrant()`, which `requireGrant()` calls transitively) — same try/catch wrap at both call sites.
- packages/sdk/src/connections.ts:32 — wrap `connectionContext()`'s `headers()` call; this single helper backs all nine `connections.*` methods (create/list/get/update/disconnect/markUsed/markError/createOAuthState/verifyOAuthState/getProviderConfig).
- packages/sdk/src/data.ts:75 — wrap the `headers()` call in `data.query()` (the only one of `data`'s two exports that reads headers; `data.provide()` doesn't).
- packages/sdk/src/directory.ts:15 (`searchUsers()`) and :26 (`resolveUsers()`) — wrap both currently-separate inline `headers()` calls (no shared helper exists yet in this file, unlike `plugins.ts`'s `requestContext()`).
- packages/sdk/src/e2ee.ts:17 — wrap `e2eeContext()`'s `headers()` call; this single helper backs every exported `e2ee.*` method (getProfile/createProfile/getRecoveryWrapper/setRecoveryWrapper/enrollDevice/listDevices and the remaining methods further down the file).
- packages/sdk/src/handoffs.ts:15 — wrap `handoffContext()`'s `headers()` call; backs both `create()` and `consume()`.
- packages/sdk/src/plugins.ts:96 (`requestContext()`, backing `get()`/`list()`) and :140 (`getConsentStatus()`'s own separate inline call) — wrap both.
- packages/sdk/src/secrets.ts:21 — wrap `secretContext()`'s `headers()` call; backs every `secrets.*` method.
- packages/sdk/src/tools.ts:23 (`toolContext()`, backing `preview()`/`execute()`) and :81 (`provide()`'s own separate inline call) — wrap both.
- runtime/src/sdk-host.ts — add one `resolveXPluginId()`/`resolveXContext()` helper per surface (mirroring `resolveEnvPluginId()` at line 537 and `resolveStorageContext()` at line 514), wired into the corresponding host method: `activity` (line 727), `authz` (756), `data` (674), `directory` (643), `e2ee` (1275), `handoffs` (973), `plugins` (766), `connections` (1430), `secrets` (1351), `tools` (1559). Each falls back `pluginId ?? getPortabilityPluginContext() ?? getBackgroundPluginContext() ?? null`. For the userId-bearing contexts (`directory`, `e2ee`, `data.query`, `tools.preview`/`execute`), fall back `userId ?? getPortabilityUserContext() ?? null` only — never through `getBackgroundPluginContext()`, which by `background-plugin-context.ts`'s own deliberate design carries no user id (a job is plugin-scoped, not user-scoped, same reasoning already documented for the storage `ownerUserId` gap). Where a surface currently throws its own `Error('sdk.X requires a plugin route context...')` on a null pluginId (authz.provide, connections, secrets, tools, handoffs), keep that same thrown message once the fallback chain is exhausted — the fix is that it's reached via a controlled path, not an unhandled `next/headers()` rejection.
- 10 new regression test files under runtime/src/**tests**/ (sdk-host-activity-routing.test.ts, -authz-routing, -connections-routing, -data-routing, -directory-routing, -e2ee-routing, -handoffs-routing, -plugins-routing, -secrets-routing, -tools-routing.test.ts), mirroring sdk-host-env-routing.test.ts's mock-and-assert structure: each covers (a) the request-header path is unchanged, (b) the background/portability fallback resolves correctly where applicable, wrapped in runWithBackgroundPlugin()/runWithPortabilityPlugin() from runtime/src/background-plugin-context.ts and runtime/src/portability/plugin-context.ts, and (c) the no-context case fails with the surface's own documented error/return value (not an unhandled next/headers() rejection) — assert this by mocking next/headers()'s headers() to reject and confirming the call still resolves/throws the documented error rather than an unhandled promise rejection.
- docs/plugin-development.md — add a background-invocation support table to the schedules/jobs section (near line 2340-2470) enumerating every relevant sdk.* surface (the 10 fixed here, the 4 already-fixed: db/storage/env/crypto, and the 4 explicitly excluded: auth/device/notifications/portability) with a one-line note per surface: works via header, works via background/portability fallback, or requires a real request only (with why).
- docs/architecture-rules.md — add one new generalized bullet documenting the headers()-outside-request bug class itself (distinct from the existing storage-ownerUserId bullet at ~line 826, which only covers one symptom of it): 'A new packages/sdk/src/*.ts surface that calls next/headers() must wrap it in try/catch with a host-side AsyncLocalStorage fallback (getBackgroundPluginContext()/getPortabilityPluginContext(), runtime/src/sdk-host.ts) from day one — this exact gap was independently found and fixed four separate times (sdk.db.getClient, sdk.storage, sdk.env, sdk.crypto) before being closed as a class across the remaining ten surfaces in task 3.40.' Cross-reference it from the existing storage-ownerUserId bullet instead of leaving that as the sole documented instance of the pattern.
- CLAUDE.md's 'Hard architectural rules — critical violations' list — mirror the new docs/architecture-rules.md bullet there, given this is now the most independently-rediscovered violation class in the project's Status history (four prior incidents before this task).
- Bump packages/sdk/package.json 1.47.0 → 1.47.1 and runtime/package.json 0.91.5 → 0.91.6 (both patch — no SdkHost member's public signature or type changes, only internal fallback resolution; no docs/upgrade.md migration note needed).

**Dependencies:** None. All ten surfaces already exist and ship in packages/sdk/src today; this is remediation of existing code following an already-established pattern (sdk.db.getClient/sdk.storage/sdk.env/sdk.crypto), not new capability work, and does not block or get blocked by any other roadmap task.

**SRS reference:** None — this is remediation, not new design. The underlying RFCs for the ten affected surfaces (0005 activity, 0054 authz, 0002 data, directory has no dedicated RFC, 0060 e2ee, 0053 handoffs, 0051 plugins, 0049 connections, 0043 secrets, 0047 tools) are all already implemented and unaffected in their public contracts; this task only hardens an internal invocation-context gap common to all of them, the same gap RFC 0046 (jobs/schedules) implicitly created by allowing sdk.* to be called from a handler with no real Next.js request.

**Review checklist:**

- `grep -n "await headers()" packages/sdk/src/{activity,authz,connections,data,directory,e2ee,handoffs,plugins,secrets,tools}.ts` — every match sits inside a `try { … } catch { … }` block; no bare unguarded call remains in these ten files.
- Each of the ten new `resolveXPluginId()`/`resolveXContext()` helpers in `runtime/src/sdk-host.ts` falls back through `getPortabilityPluginContext() ?? getBackgroundPluginContext()` for `pluginId`, and through `getPortabilityUserContext()` only (never `getBackgroundPluginContext()`) for `userId` on the surfaces that take one — matching `resolveStorageContext()`/`resolveEnvPluginId()`'s existing shape.
- `pnpm exec vitest run runtime/src/__tests__/sdk-host-activity-routing.test.ts runtime/src/__tests__/sdk-host-authz-routing.test.ts runtime/src/__tests__/sdk-host-connections-routing.test.ts runtime/src/__tests__/sdk-host-data-routing.test.ts runtime/src/__tests__/sdk-host-directory-routing.test.ts runtime/src/__tests__/sdk-host-e2ee-routing.test.ts runtime/src/__tests__/sdk-host-handoffs-routing.test.ts runtime/src/__tests__/sdk-host-plugins-routing.test.ts runtime/src/__tests__/sdk-host-secrets-routing.test.ts runtime/src/__tests__/sdk-host-tools-routing.test.ts` passes, with each file's no-context case asserting no unhandled `next/headers()` rejection reaches the caller.
- Full repo suite stays green: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm exec vitest run`.
- `docs/plugin-development.md`'s new background-invocation support table lists all 18 relevant `sdk.*` surfaces (10 fixed here + 4 already-fixed + 4 explicitly excluded) with an accurate one-line reason per row, cross-checked against the actual current behavior of each file.
- `docs/architecture-rules.md` and `CLAUDE.md` both carry the new generalized bullet, and the pre-existing storage-`ownerUserId` bullet in `docs/architecture-rules.md` cross-references it rather than standing alone as the only documented instance of the pattern.
- Live verification per the repo's 'verify before claiming done' convention: call at least one of the ten fixed surfaces (e.g. `sdk.secrets.list()`) from inside a real `sdk.schedules` handler in a throwaway local test plugin and confirm it no longer throws the raw `next/headers()` rejection, then remove the throwaway plugin.
- `packages/sdk/package.json` is `1.47.1` and `runtime/package.json` is `0.91.6`; no other package's `package.json` version changed as part of this task.

---

#### ✅ 3.41 — Enforce sdk.device.getSurface()'s documented no-throw guarantee

**Goal:** Close a doc/implementation mismatch found by the codebase audit: `packages/sdk/src/device.ts`'s doc comment (lines 10-24, directly above `export const device = {`) explicitly claims `getSurface()`, `getShellVersion()`, and `isNativeShell()` return "the safe default... outside a plugin route context, in a unit test, anywhere — never throws, matching `env.ts`'s discipline" — but none of the three wraps its `const h = await headers();` call (lines 28, 33, 38) in a `try/catch`. `env.ts`'s `env.get()` (`packages/sdk/src/env.ts:33-41`) already has the try/catch this doc comment is claiming device.ts matches; device.ts itself does not. If any of the three ever runs outside a real Next.js request — a background job/schedule handler, a script, any future non-request caller — `headers()` throws and the call rejects instead of returning the documented safe default, the same failure class that previously hit `sdk.storage`, `sdk.env`, and `sdk.db.getClient()` before each was hardened (see the Status section's `0.94.3`, `0.101.1`, and `0.101.3` entries in `sovereign/CLAUDE.md` for the pattern and its production trigger each time). `packages/sdk/src/__tests__/device.test.ts`'s `mockHeaders()` helper (lines 3-7) always mocks `headers()` to succeed synchronously, so nothing in the current suite exercises the documented-but-unenforced no-throw guarantee — the gap is silent until a real background caller (e.g. a plugin's schedule/job handler reading `sdk.device.getSurface()`) hits it in production.

**Deliverables:**

- Wrap `const h = await headers();` in `packages/sdk/src/device.ts`'s `getSurface()` (line 28), `getShellVersion()` (line 33), and `isNativeShell()` (line 38) each in their own `try/catch`, mirroring `env.ts`'s `env.get()` (`packages/sdk/src/env.ts:34-41`) — the `catch` block returns exactly the same safe default the function already returns when the header is merely absent: `'browser'` for `getSurface()`, `null` for `getShellVersion()`, `false` for `isNativeShell()`. No change to the exported `Surface` type or `parseSurface()` (lines 4-8).
- No `runtime/src/sdk-host.ts` changes: unlike `storage`/`env`/`db` (which delegate to `requireHost()` and need a background-invocation-context fallback), `device.ts` does pure local header parsing with no host round trip, so the fix is contained to the three catch blocks in `device.ts` itself.
- Add regression coverage to `packages/sdk/src/__tests__/device.test.ts` for the throw path the existing `mockHeaders()` helper (lines 3-7) never exercises — it always resolves to a working `Headers` object. Add a second mock helper (or inline `vi.doMock('next/headers', () => ({ headers: () => Promise.reject(new Error('no request context')) }))`) and three new `it()` blocks asserting `await device.getSurface()` resolves to `'browser'`, `await device.getShellVersion()` resolves to `null`, and `await device.isNativeShell()` resolves to `false` when `headers()` rejects — none of the three should reject.
- Verify the doc comment at `packages/sdk/src/device.ts:10-24` (the block above `export const device = {`) still matches the implementation once the fix lands — it already asserts the never-throws behavior and needs no wording change, just confirmation it's no longer aspirational.

**Dependencies:** None.

**SRS reference:** None — this is remediation of an implementation/doc-comment mismatch found by audit, not new design. RFC 0080 (Plugin surface model) defines `sdk.device.getSurface()` itself; this task changes only its error-handling robustness, not its contract or behavior when `headers()` succeeds.

**Review checklist:**

- `grep -n 'try {' packages/sdk/src/device.ts` shows three occurrences, one inside each of `getSurface()`, `getShellVersion()`, `isNativeShell()`.
- A unit test that mocks `next/headers`'s `headers()` to reject confirms `device.getSurface()` resolves to `'browser'`, `device.getShellVersion()` resolves to `null`, and `device.isNativeShell()` resolves to `false` — none reject or throw.
- The existing three passing-path tests in `packages/sdk/src/__tests__/device.test.ts` (header present, header absent, unrecognized value) still pass unchanged — the fix must not alter behavior when `headers()` succeeds.
- `packages/sdk/src/device.ts`'s no-throw doc comment (lines 10-24) is read once more after the fix and confirmed to now be an accurate description of the implementation, not aspirational.
- `pnpm --filter @sovereignfs/sdk typecheck && pnpm --filter @sovereignfs/sdk exec vitest run src/__tests__/device.test.ts` passes.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` passes for the full repo.

---

#### ✅ 3.42 — Recursively prune stale composed plugin route directories

**Goal:** Close an audit finding in `scripts/generate/compose-routes.ts`'s `pruneGeneratedEntries` (`compose-routes.ts:161-172`), which only diffs the top-level entries of `PLATFORM_PLUGINS_DIR`/`MODAL_DIR`/`MINIMAL_DIR` via a single `readdirSync(dir)` and tracks active entries by first path segment only (`composePlugins`'s `firstSeg` helper, `compose-routes.ts:196`). A plugin with a multi-segment `routePrefix` — explicitly supported for `shell: minimal` (`docs/architecture-rules.md:129-139`, "Multi-segment routePrefix is allowed... kiosk use case", also confirmed by the existing test at `scripts/__tests__/generate-registry.test.ts:79-87` composing `/kiosk/display`) and not restricted at the manifest schema level for `shell: default` either (`packages/manifest/src/schema.ts:127` only requires `routePrefix` to start with `/`) — that gets renamed (e.g. `/kiosk/display` → `/kiosk/settings`) or uninstalled leaves its old nested directory (or, in production, symlink) physically in place on disk: the shared first segment (`kiosk`) still matches an active entry, so the stale nested leaf is never diffed or removed, and Next.js keeps serving it straight off the file tree since App Router routing resolves purely from disk, independent of the registry. Because the registry has no manifest entry for that stale path, both `decidePluginRoute` (`runtime/src/route-guard.ts:95-96`, `if (!matched) return 'ok'`) and the middleware's entire gating block (`runtime/middleware.ts:378-379`, `if (underPlugin) { ... }`, which only runs when the pathname matches an installed plugin's `routePrefix`) treat \"no manifest match\" as an unconditional pass-through for any authenticated user — so a route that used to be `adminOnly`, paywalled, disabled, or access-restricted keeps being served with zero gating, indefinitely, until someone notices the stale directory by hand.

**Deliverables:**

- Rewrite `pruneGeneratedEntries` (`scripts/generate/compose-routes.ts:161-172`) to walk each base directory recursively instead of a single top-level `readdirSync(dir)`: for an entry whose full relative path exactly matches an active entry, leave it untouched (already synced by `linkOrCopyTarget`); for an entry that is a directory containing at least one active entry further down (an ancestor of a nested composed route), recurse into it and prune only the stale descendants, then remove the ancestor itself if it ends up empty; otherwise remove the entry outright exactly as today. Keep the existing `keep`/`onlyPrefix` options applying only at depth 0, so `PLUGINS_DIR_KEEP`/`MINIMAL_DIR_KEEP` (`scripts/generate/paths.ts`) and the `(.)`-prefix restriction on `MODAL_DIR` behave identically to today for single-segment plugins.
- Change `composePlugins` (`scripts/generate/compose-routes.ts:174-215`) to record each active destination's full relative path — not just its first path segment — into `activePlatform`/`activeModal`/`activeMinimal`. Replace the `firstSeg` helper (`compose-routes.ts:196`, `relative(base, dest).split(sep)[0]`) with a `relative(base, dest)` call (normalized to forward slashes) so a `shell: minimal` plugin composing at a multi-segment `routePrefix` like `/kiosk/display` records `kiosk/display`, not `kiosk`, and a later rename to `/kiosk/settings` correctly identifies `kiosk/display` as stale instead of treating the whole `kiosk` directory as still active.
- Add a generate-time consistency check — e.g. `assertNoOrphanedRouteDirectories()` in `scripts/generate/compose-routes.ts` — run at the end of `composePlugins` after pruning: walk each of `PLATFORM_PLUGINS_DIR`, `MODAL_DIR`, and `MINIMAL_DIR` down to leaf directories containing a `page.tsx`/`layout.tsx` (a composed plugin app root), and if any leaf's relative path isn't in that base's active-entries set (and isn't a `keep`-listed hand-written file), print a clear error identifying the orphaned path and call `process.exit(1)` — a defense-in-depth guard independent of whether the recursive prune itself is correct, so a future regression in the pruning logic fails the build loudly instead of silently leaving an unguarded route on disk.
- Add regression tests to the `generated artifact pruning` describe block in `scripts/__tests__/generate-registry.test.ts` (currently `scripts/__tests__/generate-registry.test.ts:398-433`): (1) a `shell: minimal` plugin composed at `/kiosk/display`, then recomposed at `/kiosk/settings` — assert `kiosk/display` is fully removed from disk and `kiosk/settings` plus the shared `kiosk` parent directory remain; (2) the same plugin fully removed from the active list — assert the entire `kiosk` subtree, including the now-empty parent, is removed; (3) the existing single-segment prune tests (`generate-registry.test.ts:409-431`) continue passing unmodified, proving the recursive rewrite is behavior-preserving for the common case; (4) a test for the new consistency check that plants an orphan directory with a `page.tsx` outside any active entry and asserts it is detected.
- Add a bullet to `docs/architecture-rules.md`'s existing `shell: minimal` rule (currently `docs/architecture-rules.md:129-139`, the paragraph noting multi-segment `routePrefix` is allowed) documenting that pruning is recursive to the leaf composed directory and backed by the generate-time consistency check — so a future change to `composePlugins`/`pruneGeneratedEntries` doesn't regress back to first-segment-only diffing without a reviewer noticing the documented invariant. Add the matching one-line critical-violations bullet to `sovereign/CLAUDE.md`'s "Hard architectural rules" list per that file's own "Keep this file current" instruction.

**Dependencies:** None.

**SRS reference:** RFC 0001 (overlay shell variant — establishes the compose-time route-group model `pruneGeneratedEntries` maintains); RFC 0014 (minimal shell mode — the source of the multi-segment `routePrefix` case this bug affects). No incident doc exists for this — it is proactive remediation of a codebase-audit finding, not a reported production incident.

**Review checklist:**

- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.
- The four new/updated tests in `scripts/__tests__/generate-registry.test.ts`'s `generated artifact pruning` block pass, including the pre-existing single-segment cases (lines 409-431) unmodified.
- Live repro: with a local `shell: minimal` plugin manifest at `routePrefix: "/kiosk/display"`, run the generator, confirm `runtime/app/(minimal)/kiosk/display/` exists on disk; change the manifest to `routePrefix: "/kiosk/settings"`, rerun the generator, and confirm `runtime/app/(minimal)/kiosk/display/` no longer exists while `runtime/app/(minimal)/kiosk/settings/` does.
- With `pnpm dev` running against that same before/after rename, `GET /kiosk/display` returns a 404 (via the `__not-found` rewrite) after the rename instead of continuing to serve the plugin's old page.
- Manually planting an orphaned `page.tsx` under `runtime/app/(platform)/(plugins)/` with no corresponding active registry entry causes the generator to fail loudly (non-zero exit, clear error naming the path) rather than silently succeeding.
- `grep -n "firstSeg" scripts/generate/compose-routes.ts` returns nothing — the first-segment-only tracking is fully replaced, not left as dead code alongside the new logic.
- `docs/architecture-rules.md`'s `shell: minimal` paragraph and `sovereign/CLAUDE.md`'s "Hard architectural rules" list both describe the recursive-prune + consistency-check invariant.

---

#### ✅ 3.43 — Add a cross-plugin routePrefix collision check at generate time

**Goal:** Close a real correctness gap in `scripts/generate/read-plugins.ts`: it already fails generation loudly on two manifests sharing a plugin `id` (`duplicatePluginIds()`, read-plugins.ts:48-60) and on more than one `apiProvider: true` manifest (`duplicateApiProviders()`, read-plugins.ts:34-36), but nothing checks whether two _different_ plugin ids declare the same `routePrefix`. `scripts/generate/compose-routes.ts`'s `resolveComposeTargets()` (compose-routes.ts:45-78) computes each plugin's composed destination purely from `manifest.routePrefix` (plus `shell`), so two independently-authored plugins with colliding prefixes both resolve to the identical destination path. In production this is silent last-write-wins: `composePlugins()` (compose-routes.ts:174-215) iterates plugins in the alphabetically-sorted order `sortPluginEntries()` produces, and `linkOrCopyTarget()`'s production branch (compose-routes.ts:152-159) does an unconditional `rmSync` + `symlinkSync` at the shared destination — whichever plugin id sorts last silently overwrites the other's symlink, and the loser's routes vanish with no error anywhere in the build. In dev, `linkOrCopyTarget()`'s `syncDir()` branch (compose-routes.ts:102-140) never clears the destination wholesale before syncing — it only removes dest entries absent from the _current_ plugin's own `src` listing — so across successive `--watch` generate runs for two colliding plugins, files from both plugins' `app/` trees can interleave into one corrupted composite route tree, with no error and no clean failure mode. Fix by adding a `duplicateRoutePrefixes()` guard, analogous in shape to the existing `duplicatePluginIds()`, that fails `pnpm generate` loudly the moment two manifests resolve to the same composed target path — accounting for `shell: overlay`'s dual targets (fallback + modal interception copy, compose-routes.ts:74), so a collision on either target is caught, not just the primary one.

**Deliverables:**

- Add `duplicateRoutePrefixes()` to `scripts/generate/read-plugins.ts` (alongside the existing `duplicatePluginIds()` at read-plugins.ts:48-60 and `duplicateApiProviders()` at read-plugins.ts:34-36): for each plugin entry, call `resolveComposeTargets(manifest)` (import from `./compose-routes`) and skip entries where `result.ok` is `false` (already rejected elsewhere — e.g. overlay's multi-segment-routePrefix guard at compose-routes.ts:64-73); build a `Map<string, string[]>` from each resolved composed target path to the manifest ids that resolve to it, so an overlay plugin's two targets (the `platformPluginsDir` fallback AND the `modalDir` `(.)`-prefixed interception copy, compose-routes.ts:74) are both checked, not just the first.
- Wire the new check into `readPlugins()` (read-plugins.ts:114-157), immediately after the existing `idDuplicates` block and before the `apiProvider` duplicate check: iterate the resulting map, and for any target path claimed by more than one plugin id, `console.error` the colliding ids and the shared destination path, then `process.exit(1)` — matching the existing `idDuplicates` block's error-formatting style (read-plugins.ts:129-142) rather than inventing a new format.
- Re-export `duplicateRoutePrefixes` from `scripts/generate-registry.ts`'s existing re-export list (alongside `duplicatePluginIds`/`duplicateApiProviders`) so it's importable from `../generate-registry` the same way the existing guard functions are in `scripts/__tests__/generate-registry.test.ts`.
- Add tests to `scripts/__tests__/generate-registry.test.ts`'s existing `describe('plugin generation guards', ...)` block (around line 90-161), covering: (a) two `default`-shell plugins declaring the identical `routePrefix` are detected; (b) a `default`-shell plugin and an `overlay`-shell plugin declaring the same `routePrefix` collide on the shared `platformPluginsDir` fallback target and are detected; (c) two plugins declaring the same route _segment_ but different `shell` values that resolve to genuinely different destination directories (e.g. `shell: minimal` vs `shell: default`, which land under `MINIMAL_DIR` vs `PLATFORM_PLUGINS_DIR` per compose-routes.ts:57-77) are NOT flagged — a false-positive regression guard; (d) two `overlay`-shell plugins with different `routePrefix` values produce no false positive even though both independently write two targets each.
- Update `docs/epics/plugins-runtime.md`'s Task 3.43 heading to ✅ and `ROADMAP.md`'s matching row in the same PR once shipped (standard task-completion convention; not part of this task's own code deliverables, called out here since sibling tasks 3.22/3.23 in this same file establish the precedent this task follows).

**Dependencies:** Task 3.23 (Generate script decomposition) — this task extends the `read-plugins.ts`/`compose-routes.ts` module split that task produced; the new check reuses `resolveComposeTargets()` from `compose-routes.ts` rather than reimplementing shell-mode target resolution. Task 3.22 (Generate script regression coverage) established the `scripts/__tests__/generate-registry.test.ts` fixture helpers (`manifest()`, `entry()`) this task's new tests reuse.

**SRS reference:** None — this is remediation from a codebase audit finding, not new design. SRS §3.9 Plugin Loading Model already states "the composed segment's directory name is the routePrefix, not the source directory name — so routePrefix is the single source of truth for a plugin's URL" (docs/sovereign-proposal-plan-srs.md:647); this task closes the gap between that stated invariant and the fact that nothing in scripts/generate/read-plugins.ts currently enforces it's actually unique across plugins.

**Review checklist:**

- `pnpm generate` fails loudly with a non-zero exit code and a clear error naming both colliding plugin ids and the shared destination path when two plugin manifests under `plugins/` resolve to the same composed target (verify with a throwaway pair of fixture manifests declaring the same `routePrefix`, then remove the fixtures).
- The check correctly treats an `overlay`-shell plugin's two composed targets (fallback + modal interception copy) as two independent collision surfaces, not one — a collision on just the modal target (or just the fallback target) is still caught.
- Two plugins sharing a route _segment_ but landing in genuinely different destination directories because of differing `shell` values (e.g. `minimal` vs `default`) are NOT flagged as a false positive.
- The new test cases in `scripts/__tests__/generate-registry.test.ts` pass and fail correctly when the check is temporarily disabled (sanity-check the tests actually exercise the new function, not a no-op).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.
- No change in generated output (`runtime/generated/*`) for the current, non-colliding plugin set — diff before/after to confirm this task is purely an added validation guard, not a behavior change to composition itself.

---

#### ✅ 3.44 — Standardize BaseSQLiteDatabase typing in platform-owned plugin code

**Goal:** Close a code-quality finding from a codebase audit: `plugins/warden/app/_lib/{conversations,model-visibility,portability}.ts` and `example-plugins/example-encrypted/app/_lib/data.ts` each declare `type Db = BaseSQLiteDatabase<'async', any, any>` to type the SDK's opaque `sdk.db.getClient()` return value, and each needs its own `// eslint-disable-next-line @typescript-eslint/no-explicit-any` to get past lint. This is unnecessary: `BaseSQLiteDatabase`'s second generic parameter (`TRunResult`) has no `extends` constraint in `drizzle-orm/sqlite-core/db.d.ts`, so `unknown` satisfies it exactly as well as `any` does, and the third parameter (`TFullSchema`) already defaults to `Record<string, never>` when omitted. Six other files in the monorepo already prove this out with zero disable comments — `packages/db/src/client.ts:48` and, in the separately-tracked plugin repos checked out under `plugins/*.local/` (not touched by this task), `sovereign-plugin-kanban.local/app/_db/client.ts:11`, `sovereign-plugin-ledger.local/app/_db/client.ts:11`, and `sovereign-plugin-travellog.local/app/_db/client.ts:11` use the two-argument `BaseSQLiteDatabase<'async', unknown>` form; `sovereign-plugin-docs.local/app/_lib/context.ts:8`, `sheets.local/app/_lib/context.ts:9`, and `tally.local/app/_lib/context.ts:10` use the explicit three-argument `BaseSQLiteDatabase<'async', unknown, Record<string, unknown>>` form. Scope is limited to the 4 files this repo actually owns and ships (warden is a platform plugin bundled at `plugins/warden`; `example-encrypted` is an in-repo example plugin under `example-plugins/`). The 15 other files carrying the same `any, any` pattern — across `sovereign-plugin-docs.local/app/_lib/portability.ts`, `plainwrite.local` (3 files), `sheets.local/app/_lib/portability.ts`, `shopper.local` (2 files), `tasks.local` (3 files), `travellog.local/app/_lib/portability.ts`, and `wallet.local` (4 files) — live in separately-tracked repos with their own CLAUDE.md/roadmap and are explicitly out of scope; standardizing those is each repo's own follow-up.

**Deliverables:**

- In plugins/warden/app/_lib/conversations.ts:26-30, replace `type Db = BaseSQLiteDatabase<'async', any, any>;` and its `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with `type Db = BaseSQLiteDatabase<'async', unknown>;` — no disable comment needed. Update the preceding doc comment (lines 26-28), which currently justifies the disable directive, to point at the working pattern instead (e.g. reference `packages/db/src/client.ts:48`'s `SqliteDb` or the sibling fix in `example-plugins/example-encrypted/app/_lib/data.ts`).
- In plugins/warden/app/_lib/model-visibility.ts:26-27, apply the identical replacement: drop the `eslint-disable-next-line` and change `type Db = BaseSQLiteDatabase<'async', any, any>;` to `type Db = BaseSQLiteDatabase<'async', unknown>;`.
- In plugins/warden/app/_lib/portability.ts:34-37, inside `provideDelete`'s callback, replace `const database = ctx.db as BaseSQLiteDatabase<'async', any, any>;` (with the `-- required by BaseSQLiteDatabase's own generic signature` disable comment above it) with `const database = ctx.db as BaseSQLiteDatabase<'async', unknown>;` and remove the disable line. The comment on lines 34-35 referencing 'same generic-args pattern as conversations.ts's `Db`' stays accurate once conversations.ts is fixed the same way — no change needed there beyond removing the now-obsolete disable-directive rationale.
- In example-plugins/example-encrypted/app/_lib/data.ts:7-10, apply the same fix: drop the `eslint-disable-next-line @typescript-eslint/no-explicit-any` and change `type Db = BaseSQLiteDatabase<'async', any, any>;` to `type Db = BaseSQLiteDatabase<'async', unknown>;`. This file is scaffolding/reference code that other platform plugins' comments explicitly point to as the canonical pattern (see conversations.ts:28 and data.ts's own comment), so it must be fixed, not left as the stale example.
- Grep the four touched files after the edit to confirm zero remaining `@typescript-eslint/no-explicit-any` disable comments and zero remaining `, any, any>` / `, any>` BaseSQLiteDatabase generics.
- Run `pnpm --filter @sovereignfs/warden typecheck` (or the equivalent workspace filter for plugins/warden) and `pnpm --filter example-encrypted typecheck` if such a script/workspace exists, otherwise `pnpm typecheck` at the repo root, to confirm the narrower `unknown` generic still type-checks every call site (`.select()`, `.insert()`, `.update()`, `.delete()`, `.transaction()` usages in these files).

**Dependencies:** None.

**SRS reference:** None — this is remediation of a pre-existing type-authoring inconsistency found during a codebase audit, not new design.

**Review checklist:**

- `grep -rn 'any, any' plugins/warden/app/_lib/{conversations,model-visibility,portability}.ts example-plugins/example-encrypted/app/_lib/data.ts` returns nothing.
- `grep -rn 'eslint-disable.*no-explicit-any' plugins/warden/app/_lib/{conversations,model-visibility,portability}.ts example-plugins/example-encrypted/app/_lib/data.ts` returns nothing.
- All four files declare (or inline-cast to) `BaseSQLiteDatabase<'async', unknown>`, matching the working pattern already used in `packages/db/src/client.ts:48` and the six precedent files in the `.local` plugin repos.
- `pnpm typecheck` passes with no new errors in `plugins/warden` or `example-plugins/example-encrypted`.
- `pnpm lint` passes with no new warnings/errors and no unused-disable-directive complaints from the removed comments.
- `pnpm format:check` passes (no formatting drift from the edits).
- `pnpm test` passes — no behavior change, this is a type-only edit.

---

## Related RFCs

- [RFC 0004 — Per-plugin database](../rfcs/0004-per-plugin-database.md)
- [RFC 0010 — Test organization](../rfcs/0010-test-organization.md)
- [RFC 0011 — Icon system](../rfcs/0011-icon-system.md)
- [RFC 0017 — Plugin starter template & examples](../rfcs/0017-plugin-starter-and-examples.md)
- [RFC 0018 — Plugin-scoped env vars](../rfcs/0018-plugin-scoped-env.md)
- [RFC 0023 — SDK distribution & isolation](../rfcs/0023-sdk-distribution.md)
- [RFC 0024 — Plugin compatibility & versioning](../rfcs/0024-plugin-compatibility.md)
- [RFC 0028 — Operator fork model](../rfcs/0028-operator-fork-model.md)
- [RFC 0036 — Per-plugin database dialect selection](../rfcs/0036-per-plugin-dialect.md)
- [RFC 0045 — Plugin events and realtime channels](../rfcs/0045-plugin-events.md)
- [RFC 0046 — Plugin background jobs and schedules](../rfcs/0046-plugin-jobs.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)
- [RFC 0049 — Plugin external connections](../rfcs/0049-plugin-external-connections.md)
- [RFC 0051 — Cross-plugin references and dependency discovery](../rfcs/0051-cross-plugin-references.md)
- [RFC 0053 — Plugin flow handoffs](../rfcs/0053-plugin-flow-handoffs.md)
- [RFC 0057 — Plugin external dependency resolution](../rfcs/0057-plugin-dep-hoisting.md)
- [RFC 0062 — Email delivery coverage](../rfcs/0062-email-delivery-coverage.md)
- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)
  (Task 3.28 — plugin catalog and install-time activation)
- [RFC 0080 — Plugin surface model](../rfcs/0080-plugin-surface-model.md)
  (Tasks 3.32–3.33 — `sdk.device.*`, `x-sovereign-surface`, manifest `surfaces`)
- [RFC 0083 — Device bridge and capability contract](../rfcs/0083-device-bridge-capability-contract.md)
  (Tasks 3.34–3.35 — `@sovereignfs/bridge`, `device:*` permissions, consent)

**Deferred future work (not yet an epic task):** true dynamic runtime installation of a plugin
not already bundled in the image — fetching/cloning arbitrary plugin code into a running
instance without a rebuild/redeploy. RFC 0065 documents why this is out of scope for the
catalog/activation model in Task 3.28 (it's a build-pipeline and deployment-model change, not an
access-control one) and records it as an explicit alternative to revisit as a future RFC once
there's concrete demand.

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [sdk-stability.md](../sdk-stability.md)
- [plugin-database.md](../plugin-database.md)

## Cross-references

- Per-plugin database (Task 0.8.1) also appears in [Data Sovereignty](data-sovereignty.md) — it is the storage layer for plugin-owned data isolation.
