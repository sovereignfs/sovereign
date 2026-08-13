# Example plugins

Reference plugins that double as documentation, runtime test fixtures, and
copyable starting points for plugin developers. They live here — in-repo,
tracked in git — as a sibling of `plugins/`, not inside it.

See `docs/epics/example-plugins.md` (tasks 12.2's correction note and 12.4)
for the full design rationale and decision log, and
`docs/plugin-development.md`'s "Example plugins" section for
the developer-facing walkthrough. This file covers just the mechanics: how
these get built, and how to add a new one.

## Why these live here, not in `plugins/`

An earlier iteration of this project moved the example set out to a separate
`sovereignfs/sovereign-plugins-examples` repository, cloned at build time via
`sovereign.plugins.json`. That was reversed on 2026-08-01 (see
`docs/epics/example-plugins.md`'s correction note): the clone-based model
added build-time network dependence and cross-repo friction without ever
actually shipping the examples by default, and keeping the source here makes
it directly browsable and copyable for anyone building their own plugin.

## How composition works

Nothing here is bundled or installed automatically. `scripts/generate-registry.ts`
only scans `example-plugins/` — alongside its normal `plugins/` scan — when the
`SOVEREIGN_EXAMPLES_ENABLED` env var is truthy (`1`/`true`/`yes`/`on`; **off by
default**):

```bash
# .env
SOVEREIGN_EXAMPLES_ENABLED=1
```

```bash
pnpm dev    # or: pnpm generate && pnpm build
```

With it set, every example composes into the runtime exactly like a plugin
under `plugins/` — same manifest validation, same copy-in-dev/symlink-in-prod
route composition, same dev-watcher hot-reload on source changes. With it
unset (the default), `example-plugins/` is never scanned: no routes, no
registry entries, nothing shipped.

This is a **build-time** decision. It's distinct from — but shares the same
env var as — the **runtime** Console → Settings → Example plugins toggle,
which only controls whether an already-composed example is _shown_ (its route
still exists and can be flipped visible with no rebuild). See
`docs/self-hosting.md`'s "Reference example plugins" section for the full
two-layer model, including the Docker build-arg mechanics.

## The current set

| Plugin ID                             | Route                     | What it shows                                                                                                                                             |
| ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs.sovereign.example-basic`          | `/example-basic`          | Session reading, `@sovereignfs/ui`, CSS tokens, plugin-declared capabilities                                                                              |
| `fs.sovereign.example-overlay-small`  | `/example-overlay-small`  | `shell: "overlay"` with `overlaySize: "sm"`                                                                                                               |
| `fs.sovereign.example-overlay-medium` | `/example-overlay-medium` | `shell: "overlay"` with `overlaySize: "md"`                                                                                                               |
| `fs.sovereign.example-overlay-large`  | `/example-overlay-large`  | `shell: "overlay"` with `overlaySize: "lg"`                                                                                                               |
| `fs.sovereign.example-minimal`        | `/example-minimal`        | `shell: "minimal"` chrome-free/fullscreen composition                                                                                                     |
| `fs.sovereign.example-api`            | `/example-api`            | API provider serve-route pattern (PLT-16)                                                                                                                 |
| `fs.sovereign.example-monetized`      | `/example-monetized`      | Monetization manifest field, Ed25519 license gating, paywall flow (RFC 0003)                                                                              |
| `fs.sovereign.example-mobile`         | `/example-mobile`         | `@sovereignfs/ui`'s PWA/mobile layout: responsive breakpoint fork, swipeable carousel                                                                     |
| `fs.sovereign.example-encrypted`      | `/example-encrypted`      | App-level field encryption (RFC 0092): classified schema, seal/open, blind-index search, registration, plaintext export                                   |
| `fs.sovereign.example-device-only`    | `/example-device-only`    | `offline: "device-only"` (RFC 0093): `DeviceOnlyGate`/`DeviceStorageKeyGate`, encrypted notes via `device-only-kv.ts`, unlock-session status/lock control |

Each plugin's own `manifest.json` and (where present) `README.md` cover its
specifics — start there for the pattern you want to copy.

## Adding a new example

Same shape as any plugin: a directory with `manifest.json`, `app/`, and
optionally `icon.svg`. Two things specific to this directory:

- Set `"example": true` in the manifest (`packages/manifest`'s schema field —
  classification only, no routing/permission effect) so Console and the
  runtime treat it as an example for visibility/bulk-toggle purposes.
- Each example is also its own pnpm workspace package (`example-plugins/*` is
  in `pnpm-workspace.yaml`'s `packages:` glob), so it needs a `package.json`
  with a unique `@sovereignfs/*` name, a `"typecheck": "tsc --noEmit"` script,
  a `tsconfig.json` extending `@sovereignfs/tsconfig/nextjs.json`, and (if it
  uses CSS modules) a `css-modules.d.ts` — copy these four files from any
  existing example rather than writing them from scratch.

## Conflicts with `plugins/`

If a directory under `plugins/` declares the same manifest `id` as something
under `example-plugins/` (e.g. an example manually copied into `plugins/` for
some reason, or the same id declared in `sovereign.plugins.json`), `pnpm
generate` fails loudly with a duplicate-manifest-id error rather than silently
composing both to the same route — the same guard that already catches a
`plugins/<id>` clone coexisting with a `plugins/<id>.local` dev override.
