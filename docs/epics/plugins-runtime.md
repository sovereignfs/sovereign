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
        "repository": "https://github.com/sovereignfs/sovereign-tasks"
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

#### 📋 3.16 — Plugin background jobs and schedules (RFC 0046)

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

#### 📋 3.17 — Plugin events and realtime channels (RFC 0045)

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

#### 📋 3.18 — Plugin tool contracts (RFC 0047)

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

#### 📋 3.21 — Plugin flow handoffs (RFC 0053)

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

#### 📋 3.23 — Generate script decomposition

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

#### 📋 3.24 — SDK boundary and runtime contract tests

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

#### 📋 3.25 — Plugin external dependency resolution (RFC 0057)

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
