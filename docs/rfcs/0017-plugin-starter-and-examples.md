# RFC 0017 — Plugin starter template & example plugins

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `bin/sv` + `bin/helpers.ts` (a new `plugin new` command), `@sovereignfs/sdk` npm publishability (**prerequisite**), `docs/plugin-development.md`, `CONTRIBUTING.md`, the registry (`registry/plugins.json`, Task 0.5.19), and **external GitHub repos** (a template + example plugins) under the `sovereignfs` org; builds on the plugin model (SRS §3.5/§3.9), RFC 0001 (overlay), RFC 0014 (minimal shell), RFC 0015 (notifications), RFC 0010 (test organization — examples double as fixtures)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.28; documentation-first. This RFC defines the starter/example strategy, contents, naming, the hard prerequisite, and the example set. The template and example repos are external repos created as execution after acceptance; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Give plugin authors a real on-ramp. A Sovereign plugin is only about five files,
but today a newcomer has to _know which five_ — the manifest field rules, the
SDK-only import boundary, the slug-prefixed `tenant_id` DB conventions, and the
naming conventions — by reading docs and copying a built-in plugin. This RFC
proposes:

- a **canonical starter skeleton** (one source of truth) delivered three ways: a
  **GitHub template repo** (`Use this template`), a **`sv plugin new <name>`** CLI
  command, and an **`npm create @sovereignfs/plugin`** initializer;
- a small set of **example plugins** — purpose-built, single-capability demos
  (_not_ the real first-party plugins) that also serve as **runtime test
  fixtures**;
- an explicit **prerequisite**: making `@sovereignfs/sdk` npm-installable, without
  which a standalone repo cannot depend on the SDK.

The plugin system is the product; "five files, but you must know which five" is
exactly the friction a starter removes.

## Motivation

`sv` has `plugin add` and `plugin remove` but **no scaffold command** — there is no
`sv plugin new`, no template, no initializer. Every new plugin starts by reading
`docs/plugin-development.md` and reverse-engineering a built-in plugin. That is a
high bar for the one thing the platform most wants to encourage. A starter that
emits a correct manifest, a working `app/` route, the SDK/UI wiring, and the DB
conventions — and example plugins that show one capability each — turns plugin
authoring from "study the platform" into "fork and edit."

## Current state (what this builds on)

- **A plugin is ~5 files.** `manifest.json` + `package.json` + `app/page.tsx`, with
  optional `icon.svg` and `db/schema.ts` (reference: `plugins/launcher/`). The
  manifest required fields and rules live in `packages/manifest/src/schema.ts`
  (incl. `repository` required for `type: sovereign | community`).
- **No scaffold command.** `bin/sv.ts` / `bin/helpers.ts` implement
  `install`/`generate`/`build`/`dev`/`serve` and `plugin add`/`plugin remove` — but
  nothing that _creates_ a plugin. `plugin add <repo>` shallow-clones a repo, keys
  the destination off the manifest `id`, validates, and composes.
- **Install + discovery today.** `scripts/install-plugins.ts` reads
  `sovereign.plugins.json` (`{ id, repository }[]`) and shallow-clones each into
  `plugins/<id>/`; the `.gitignore` allowlist keeps only `console`/`launcher`/
  `account` committed. The planned **registry** (`registry/plugins.json`, Task
  0.5.18) is the future discovery layer with a submission/review process.
- **Monorepo-only resolution.** In-repo plugins use `@sovereignfs/sdk` /
  `@sovereignfs/ui` as `workspace:*`, `next`/`react` as `catalog:`
  (`pnpm-workspace.yaml`), and rely on the runtime's `transpilePackages`
  (`runtime/next.config.ts`). **None of these exist in a standalone repo** — a
  template must use real npm versions.
- **The blocker.** `@sovereignfs/ui` is npm-publishable, but **`@sovereignfs/sdk`
  is not yet** — its `dist` imports the private `@sovereignfs/db`/`@sovereignfs/mailer`
  (CLAUDE.md, Task 0.5.8 caveat). A standalone template can't `npm install
@sovereignfs/sdk` until that is resolved.
- **Conventions** — GitHub org `sovereignfs`; repos `sovereign-plugin-<name>`;
  plugin ids `io.openfs.sovereign.<name>` (community/first-party) and
  `fs.sovereign.*` (built-ins); npm scope `@sovereignfs/*`.

## Prerequisite — `@sovereignfs/sdk` on npm

The standalone template and the npm initializer **depend on** publishing
`@sovereignfs/sdk` (either bundle `db`/`mailer` into the SDK `dist` via tsup
`noExternal`, or publish those packages) — the follow-up already flagged for Tasks
0.5.07/0.5.19. This RFC states it as a **blocking dependency** rather than glossing
over it. `@sovereignfs/ui` is already publishable. **Superseded by RFC 0023:** the
SDK's distribution model is now decided there — publish a **types-first contract**
(host-provided impls, no `db`/`mailer` dependency) rather than bundling the private
deps; read 0023 for the prerequisite's actual shape. **Partial unblock:** the
`sv plugin new` path can scaffold **in-monorepo** today (where `workspace:*`
resolves), so the CLI mechanism can ship ahead of the npm work; only the external
template repo and the initializer truly require the published SDK.

## Proposed design

### The canonical skeleton (single source of truth)

Define the minimal, well-commented starter **once** and have all three mechanisms
emit it (no drift):

- `manifest.json` — every field annotated; `type: community`, `repository` set, a
  sensible `routePrefix` and `permissions` (`auth:session`, `db:readWrite`).
- `package.json` — **npm-versioned** `@sovereignfs/sdk` / `@sovereignfs/ui` and
  literal `next`/`react` versions (**not** `catalog:` / `workspace:*`).
- `tsconfig.json` — static (inline, or extending a published `@sovereignfs/tsconfig`).
- `app/page.tsx` + `app/layout.tsx` — a working route showing **SDK-only** imports,
  a `@sovereignfs/ui` component, and a `--sv-` token (modelling the conventions).
- `db/schema.ts` — one slug-prefixed table with `tenant_id` (dialect-agnostic).
- `icon.svg`, `.gitignore` (generated copies), `.env.example`, `README.md`, and CI
  (lint / format / build).

Recommendation: the **template repo is the canonical skeleton**; `sv plugin new`
and the initializer scaffold from it (degit-style fetch, or a vendored-and-synced
copy). Keeping those in sync is an open question.

### Three delivery mechanisms

- **GitHub template repo** — `sovereignfs/sovereign-plugin-template` with a
  `Use this template` button. Zero-maintenance, discoverable, ideal for the
  "develop in my own repo" path.
- **`sv plugin new <name>`** — a scaffold command beside `plugin add`/`remove` in
  `bin/sv.ts`: derive the `id`, write the skeleton (into `plugins/<id>/` for
  monorepo dev). Works **before** the SDK is on npm.
- **`npm create @sovereignfs/plugin`** — a prompted initializer (name, id,
  permissions, shell) for users outside the repo. Depends on the SDK prerequisite.

### Example plugins (capability demos)

Purpose-built, single-concept repos named `sovereign-plugin-example-<x>` (ids
`io.openfs.sovereign.example.<x>`). Each is the **smallest** thing that teaches one
ability — explicitly **teaching artifacts**, distinct from the real first-party
plugins (Tasks/Splitify/API Composer have their own specs and are _not_ examples).
Candidate set (recommend shipping **a couple** first — `example-basic` +
`example-api`):

- **`example-basic`** — default shell + `auth:session` + `db:readWrite` (one
  slug-prefixed `tenant_id` table) + `@sovereignfs/ui` + tokens. The "normal plugin"
  reference.
- **`example-api`** — `apiProvider: true` with a public `/api/<slug>` endpoint and
  API-key auth (PLT-16). The "serve an API" reference.
- **`example-overlay`** — `shell: overlay` dialog + `shellConfig.overlaySize` (RFC 0001).
- **`example-minimal`** — `shell: minimal` full-bleed (depends on RFC 0014).
- **`example-notify`** — `notifications:send` into the Notification Center
  (depends on RFC 0015).

### Examples as test fixtures (dual-use)

Because each demo is minimal and exercises exactly one capability, the same repos
make ideal **runtime test fixtures**:

- `example-basic` → manifest validation + default composition + db/auth;
- `example-api` → `apiProvider` resolution + the public `/api` namespace
  (`findApiProvider`, `decideApiNamespace`);
- `example-overlay` / `example-minimal` → the shell-mode composition branches in
  `scripts/generate-registry.ts`;
- an `adminOnly` variant → the route guard (`decidePluginRoute`, 403/404).

Consequence: fixtures must be **deterministic and version-pinned** for CI, which
argues for an **in-monorepo copy/pin** (or a pinned clone) rather than a floating
external clone. Cross-reference **RFC 0010** (test organization) for where fixtures
live (`/__tests__/` cross-boundary vs per-package). The exact location is an open
question below.

### Naming & conventions

Consolidate the rules so the starter models them: org `sovereignfs`, repos
`sovereign-plugin-<name>` (examples carry the `example-` infix to signal
"demo, not product"), ids `io.openfs.sovereign[.example].<name>`, npm scope
`@sovereignfs/*`.

### Tie to the registry (Task 0.5.19)

The template and the examples are natural first entries / discovery anchors for
`registry/plugins.json`. The contributor loop becomes: **Use this template →
develop (`sv plugin add` / `pnpm dev`) → publish → register.** `sv plugin new` and
the docs point at the registry.

## Dev flow

Scaffold (template repo / `sv plugin new` / initializer) → install into a local
Sovereign (`sv plugin add <repo>` or a `sovereign.plugins.json` entry) → `pnpm dev`
(HMR via re-copy) → publish the repo → submit to the registry.

## Alternatives considered

1. **In-monorepo `examples/` directory only** (no external repos). Rejected as the
   end state — the goal is real, forkable repos a developer can use as a template —
   but **noted as the interim** if the SDK isn't published in time (and it doubles
   as the fixtures location, see RFC 0010).
2. **A single mechanism.** Rejected — the template repo, the CLI, and the npm
   initializer serve different audiences (own-repo devs, monorepo devs, and
   prompted newcomers). One shared skeleton keeps them consistent.
3. **"Just copy a built-in plugin / the docs."** The status quo. Rejected — drift
   between copies, no `Use this template` discoverability, no guided prompts.

## Open questions

1. **Skeleton sync** — canonical template repo vs a vendored-in-monorepo copy the
   CLI/initializer read; how to keep them from diverging.
2. **How many examples** to ship first (recommend two).
3. **`sv plugin new` target** — only `plugins/` (monorepo), or also a standalone
   directory?
4. **Template versioning** — how the skeleton tracks `minPlatformVersion` as the
   platform evolves.
5. **Fixture location** — do the examples live as external repos pinned/cloned for
   CI, as an in-monorepo copy used directly as fixtures (RFC 0010), or both kept in
   sync?
6. **Requirement IDs** — proposed entries, deferred until accepted.

## Adoption path

1. **Prerequisite:** make `@sovereignfs/sdk` npm-installable (bundle or publish
   `db`/`mailer`).
2. Build the **canonical skeleton** + the **template repo**.
3. Add **`sv plugin new`** consuming the skeleton (can land first, in-monorepo).
4. Ship the **npm initializer**.
5. Build the first couple of **example repos** (and wire them as test fixtures).
6. **Register** the template + examples (Task 0.5.19).

Documentation-first now; nothing above is built in this RFC.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                              |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; one canonical skeleton via template repo + `sv plugin new` + npm initializer; capability-demo example plugins that double as test fixtures; SDK-npm publishability as an explicit prerequisite; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.28.                                                                                                                                                                                  |
