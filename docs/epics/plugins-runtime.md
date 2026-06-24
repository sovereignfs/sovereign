# Epic: Plugins Runtime

> The full plugin lifecycle — manifest schema, generate script, SDK contract, install/remove tooling, environment isolation, compatibility gating, and the public registry.

## Status

⏳ In Progress

## Overview

This epic owns everything that makes plugins a first-class concept in Sovereign: the typed manifest schema, the generate script that composes plugin routes into the runtime, the `@sovereignfs/sdk` contract that plugin code calls, environment variable namespacing, per-plugin database isolation, compatibility versioning, the plugin registry, and the `sv` CLI. The operator fork model documentation (epic task 3.14) is the only remaining item.

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
        "id": "io.openfs.sovereign.tasks",
        "repository": "https://github.com/sovereignfs/sovereign-plugin-tasks"
      },
      {
        "id": "io.openfs.sovereign.splitify",
        "repository": "https://github.com/sovereignfs/sovereign-plugin-splitify"
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

#### 📋 3.14 — Operator fork model & upstream sync

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

#### 📋 3.15 — Per-plugin database dialect selection (RFC 0036)

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

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [sdk-stability.md](../sdk-stability.md)
- [plugin-database.md](../plugin-database.md)

## Cross-references

- Per-plugin database (Task 0.8.1) also appears in [Data Sovereignty](data-sovereignty.md) — it is the storage layer for plugin-owned data isolation.
