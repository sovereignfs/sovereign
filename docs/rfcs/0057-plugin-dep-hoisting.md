---
rfc: 0057
title: Plugin external dependency resolution — automatic runtime dep hoisting on plugin add/remove
status: Draft
date: July 2026
author: kasunben
scope: >
  bin/sv.ts, runtime/package.json, runtime/generated/plugin-deps.json (new),
  scripts/dev.ts, docs/plugin-development.md; standalone, no prior RFC dependency
incorporated_into_plan: 'Yes — epic task 3.25 (plugins-runtime), non-prioritised roadmap slot.'
---

# RFC 0057 — Plugin external dependency resolution

## Summary

When a plugin is added to a Sovereign instance, its external npm dependencies
(anything that isn't a workspace package or a platform peer) must be resolvable
by the Next.js compiler inside the runtime. Today that resolution fails silently
unless someone manually adds the plugin's deps to `runtime/package.json` — a
non-starter for third-party plugins and a DX landmine for first-party ones.

This RFC specifies that `sv plugin add` and `sv plugin remove` automatically
maintain a `runtime/generated/plugin-deps.json` ledger and keep
`runtime/package.json` in sync with the union of external deps across all
installed plugins. The fix is transparent to plugin developers: they declare
deps in their own `package.json` and the platform takes care of the rest.

## Motivation

Plugin source files are copied by the generate step into
`runtime/app/(plugins)/<id>/` and compiled by Next.js as part of the runtime's
module graph. Module resolution happens from the runtime's `node_modules` — not
from the plugin's own directory. pnpm's strict isolation means a dep declared
in `plugins/my-plugin/package.json` is installed in the plugin's own virtual
store and is invisible to the runtime compiler.

The consequence today: every plugin that brings an external dependency (e.g.
`@dnd-kit/core`, a charting library, a date library) silently breaks the
runtime's typecheck and compilation unless someone manually adds those deps to
`runtime/package.json`. This was discovered during Tasks plugin development
when `@dnd-kit/*` had to be manually patched in.

This is untenable at scale:

- Third-party plugin developers have no way to trigger the patch.
- `sv plugin remove` has no corresponding cleanup path.
- The coupling between a plugin's deps and the runtime's manifest is invisible
  and undocumented.

## Current state

- `sv plugin add` clones/copies a plugin into `plugins/<id>/`, registers it,
  and runs `pnpm install` once. It does not inspect the plugin's `package.json`
  for external deps.
- `sv plugin remove` deletes the plugin directory and updates the registry. It
  does not clean up any deps.
- `runtime/package.json` is manually maintained. There is no record of which
  entries were added for which plugin.
- `plugins/*` are pnpm workspace members (via `plugins/*` glob in
  `pnpm-workspace.yaml`). Their deps are installed in the pnpm virtual store
  but are not hoisted to the runtime's resolution scope.
- Local dev plugins (`plugins/*.local/`) follow the same model and have the
  same resolution gap.

## Proposed design

### 1. Plugin dep ledger — `runtime/generated/plugin-deps.json`

A generated JSON file tracking which external deps each plugin contributed.
Never hand-edited. Committed to the repo (it's a generated artefact, like
`registry.ts`).

```json
{
  "fs.sovereign.tasks": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  }
}
```

The ledger is the authoritative record of what `runtime/package.json` contains
on behalf of plugins. It enables safe cleanup on remove: a dep is removed from
`runtime/package.json` only when no remaining plugin entry in the ledger
references it.

### 2. Dep extraction — what counts as an external dep

When reading a plugin's `package.json`, filter out:

- `@sovereignfs/*` — workspace packages, already resolved via pnpm workspaces.
- Platform peer deps already in `runtime/package.json`: `next`, `react`,
  `react-dom`, `typescript`, `react-dom`, and any other explicit platform dep.
- `devDependencies` — never needed at runtime.

Everything remaining in `dependencies` is an **external dep** that must be
hoisted to the runtime.

### 3. `sv plugin add` — install path

After the plugin directory is created and the registry is regenerated:

1. Read `plugins/<id>/package.json`.
2. Extract external deps (step 2 filter).
3. If non-empty:
   a. Write/update `runtime/generated/plugin-deps.json` with the plugin's entry.
   b. Add the deps to `runtime/package.json` `dependencies` (merge, not
   replace — preserve existing entries from other plugins).
   c. Run `pnpm install --filter runtime` to install the new deps.
4. Print a summary: `Added 3 runtime deps for fs.sovereign.tasks`.

If the plugin declares no external deps, skip silently.

### 4. `sv plugin remove` — cleanup path

After the plugin directory and registry entry are removed:

1. Read `runtime/generated/plugin-deps.json`.
2. Find the departing plugin's dep set.
3. Compute the union of all _remaining_ plugins' dep sets.
4. Remove from `runtime/package.json` any dep that is in the departing set but
   **not** in the remaining union (i.e. no other plugin still needs it).
5. Update `runtime/generated/plugin-deps.json` (delete the plugin's entry).
6. Run `pnpm install --filter runtime` to prune the removed deps.
7. Print a summary: `Removed 2 runtime deps (1 still needed by another plugin, kept)`.

### 5. Local dev plugins — `pnpm dev` sync

For `.local` plugins the add/remove path isn't always used. `scripts/dev.ts`
should run a lightweight sync at startup:

1. Scan `plugins/*.local/` for `package.json` files.
2. For each, extract external deps.
3. Compare against `runtime/generated/plugin-deps.json`.
4. If there is a diff (new dep or removed dep), update the ledger and
   `runtime/package.json`, then run `pnpm install --filter runtime`.
5. Print a one-line notice if deps changed; continue dev startup as normal.

This makes `pnpm dev` self-healing for local plugins — adding a dependency to
a local plugin's `package.json` is picked up automatically on the next `pnpm dev`.

### 6. Version conflict policy

If a plugin declares `"some-lib": "^2.0.0"` and another plugin already
contributed `"some-lib": "^1.0.0"` to the runtime, the newer version wins and
the ledger records both contributors. On remove, the dep stays at the remaining
plugin's version. A warning is printed when a version conflict is detected at
install time so the operator is aware.

## Alternatives considered

### Do nothing / document the manual step

Rejected. Third-party plugin developers cannot update `runtime/package.json` on
an installed instance. The manual step is invisible and fails at runtime, not at
install time.

### Require plugins to declare platform peers only

Rejected. Plugins are mini-applications and will legitimately need domain
libraries (date pickers, chart libs, drag-and-drop). Prohibiting external deps
would severely limit what plugins can build.

### Change the compilation model (longer-term path)

Instead of copying plugin source into the runtime, build each plugin as a
compiled package (via `tsup`) and have the runtime import it. This lets pnpm
resolve the plugin's deps from the plugin's own `node_modules` naturally —
no hoisting needed. This is the right long-term architecture but requires
significant changes to the generate step and the way Next.js loads plugin routes.

This RFC is the interim fix; the compilation model change is the eventual
successor. Both can coexist: the ledger approach works whether source is copied
or imported.

### Use `pnpm --shamefully-hoist`

Rejected. Shamefully hoisting all workspace deps defeats the purpose of pnpm's
strict isolation and can cause hard-to-diagnose version conflicts across
unrelated packages.

### Add each plugin as a direct dep of the runtime (`workspace:*`)

Adding `"@sovereignfs/sovereign-tasks": "workspace:*"` to `runtime/package.json`
makes pnpm link the plugin and transitively install its deps. But it still
requires `runtime/package.json` to list every installed plugin, which is the
same coupling problem — just at the package level instead of the dep level.
It also doesn't work for third-party plugins whose package names aren't
`@sovereignfs/*`.

## Open questions

1. Should the ledger file be committed or gitignored? Committing it makes
   review transparent (you can see what a new plugin adds). Gitignoring it
   means it's always regenerated. Leaning toward committed.
2. Should version conflict warnings be blocking (error + exit) or advisory?
   Advisory seems right — SemVer ranges often resolve safely.
3. Should `sv plugin migrate` (the DB migration command from the same sprint)
   and this dep-hoisting step be combined into a single `sv plugin sync` command
   that brings a plugin fully up to date after a manifest or schema change?
4. Does the dev-startup sync in `scripts/dev.ts` add too much latency? If
   `pnpm install` is triggered on every `pnpm dev` even when nothing changed,
   it should be gated on a hash/mtime check of the plugin `package.json`.

## Adoption path

1. **RFC draft:** agree on ledger format, filter rules, and the dev-startup sync.
2. **Implementation:** update `sv plugin add`, `sv plugin remove`, and
   `scripts/dev.ts`. Generate initial `plugin-deps.json` from the current
   `runtime/package.json` entries that are known to be plugin-contributed
   (`@dnd-kit/*` from Tasks).
3. **Remove manual workaround:** delete `@dnd-kit/*` from
   `runtime/package.json` and let the ledger manage them.
4. **Docs:** update `docs/plugin-development.md` — external deps are declared
   in the plugin's own `package.json` and the platform installs them; no manual
   step needed.

No published package (`@sovereignfs/sdk`, `@sovereignfs/ui`) or manifest schema
changes are required.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
