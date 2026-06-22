# RFC 0014 — Minimal shell mode

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `scripts/generate-registry.ts` (composition), runtime route tree (a new `(minimal)` route group + committed layout + `.gitignore`), `runtime/src/root-plugin.ts` (eligibility), `packages/manifest` (validation), `docs/plugin-development.md`, CLAUDE.md, SRS; builds on RFC 0001 (shell modes) and RFC 0013 (mobile responsiveness)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.25; documentation-first. This RFC specifies the wiring and the remaining missing pieces for `shell: "minimal"`; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Wire the third manifest `shell` mode — **`minimal`** — which is declared in the
schema but currently **fails the build**. A `minimal` plugin renders with **no
platform chrome**: no sidebar, header, footer, or overlay slot. The plugin owns
the **entire viewport**, for full-bleed experiences (an editor, a canvas, a
presentation/kiosk surface).

The mechanism mirrors the existing route-composition model: a `minimal` plugin
composes into a **new top-level `(minimal)` route group** that is a **sibling** of
`(platform)` — so it escapes the shell layout — while remaining session-gated by
the middleware exactly like every other route (the gate is path-based and
route-group-agnostic). This RFC defines that group, the generate-script branch
that replaces the build-fail, root-plugin eligibility, the navigation contract,
and the docs/tests that complete the mode.

It honours the **responsive expectations** RFC 0013 sets for minimal (full `dvh`
height, `viewport-fit=cover`, safe-area pass-through, no chrome).

## Motivation

`shell: "minimal"` has been a declared-but-unimplemented enum value since RFC 0001. The generate script intentionally **fails loudly** rather than
mis-composing one:

> `[generate] plugin <id> declares shell: "minimal", which is not yet supported —
a chrome-free route group lands with the first minimal plugin.`
> — `scripts/generate-registry.ts:138–144`

That placeholder has done its job (no silent breakage), but it blocks a whole
class of legitimate plugins: a writing surface like Plainwrite, a drawing canvas,
a slideshow, or a single-purpose kiosk deployment, all of which want the screen to
themselves. Completing `minimal` closes the last gap in the shell-mode trio
(`default` ✅, `overlay` ✅, `minimal` ⏳) and is almost entirely **our own
route-composition code** — low-ambiguity, low-risk wiring.

## Current state (what this builds on)

- **Shell mode drives composition, not request-time branching.** The generate
  script picks a destination from the manifest `shell` so the plugin inherits the
  right layout from the route tree (`scripts/generate-registry.ts:15–28, 124–161`):
  - `default` → `runtime/app/(platform)/(plugins)/<routePrefix>/` (under the shell);
  - `overlay` → the fallback **and** the `@modal/(.)<segment>` interception copy;
  - `minimal` → **`process.exit(1)`** (the build-fail above).
- **Chrome lives in one layout.** `runtime/app/(platform)/layout.tsx` renders the
  sidebar + mobile header/footer and reads `headers()` (making it dynamic). Any
  route group **nested under `(platform)`** inherits this chrome — so a chrome-free
  plugin **cannot** live under `(platform)`; it needs a sibling group.
- **`(plugins)/layout.tsx` is a pass-through** that exists only to host the
  `@modal` slot (`runtime/app/(platform)/(plugins)/layout.tsx`) — it adds no chrome,
  but it still sits inside `(platform)`, so it is not the escape hatch either.
- **The middleware gates by URL path, not route group.** Its matcher excludes only
  auth/PWA/static paths and gates everything else (`runtime/middleware.ts:220–228`);
  `decidePluginRoute` enforces `adminOnly` (403) and disabled (404) by `routePrefix`
  (`:174–187`); `/` rewrites to the root plugin's prefix (`:206–215`). **None of
  this depends on which route group a plugin composes into** — a `minimal` plugin at
  `/editor` is gated identically whether it lives in `(platform)` or `(minimal)`.
- **The root layout owns the document.** `runtime/app/layout.tsx` provides
  `<html>/<body>`, the `--sv-*` tokens, the pre-paint theme script, and the viewport
  metadata. Both `(platform)` and a new `(minimal)` group nest under it, so a
  minimal plugin inherits theme + tokens + (RFC 0013) `viewport-fit=cover` with **no
  extra work**.
- **Root-plugin eligibility** currently rejects only `overlay`
  (`runtime/src/root-plugin.ts:22`); `minimal` is, by omission, already eligible.

## Proposed design

### A new `(minimal)` route group (sibling of `(platform)`)

Add `runtime/app/(minimal)/` as a **top-level, URL-transparent** route group
alongside `(platform)`. Because route groups don't affect the URL, a plugin with
`routePrefix: /editor` composed at `runtime/app/(minimal)/editor/` still serves at
`/editor` and is still middleware-gated — it simply does **not** inherit the shell
chrome.

Committed (hand-written) files in the group, mirroring the `(plugins)` pattern:

- **`(minimal)/layout.tsx`** — chrome-free. Renders `{children}` full-bleed (a
  `100dvh` container honouring `env(safe-area-inset-*)` per RFC 0013), and forces
  **dynamic rendering** (await `headers()` or `export const dynamic = 'force-dynamic'`)
  so the per-request CSP nonce applies to any inline scripts — the same reason
  `(platform)/layout.tsx` is dynamic and `apps/auth` forces dynamic (RFC 0008). No
  sidebar/header/footer, no `@modal` slot.
- **`(minimal)/.gitignore`** — keeps the committed `layout.tsx` + `.gitignore`,
  ignores the generated composed copies (the same allowlist approach the
  `(plugins)/.gitignore` uses).

### Generate-script branch (replace the build-fail)

In `composeTargets` (`scripts/generate-registry.ts:133–161`), replace the
`minimal` `process.exit(1)` with a real target:

```ts
const MINIMAL_DIR = join(ROOT, 'runtime', 'app', '(minimal)');
// …
if (shell === 'minimal') {
  return [join(MINIMAL_DIR, routeSegment)];
}
```

- **Multi-segment `routePrefix` is allowed for minimal** (unlike `overlay`, whose
  single-segment rule exists only for `(.)` interception). `mkdirSync(dirname(dest))`
  already handles nested segments.
- Extend `composePlugins`' clear step (`:163–179`) to also clear the `(minimal)`
  group between runs, keeping its committed `layout.tsx` + `.gitignore` (a
  `MINIMAL_DIR_KEEP` set, analogous to `PLUGINS_DIR_KEEP`).

### Root-plugin eligibility

Keep `minimal` **eligible** as the root plugin (`runtime/src/root-plugin.ts`) — a
single-app / kiosk instance that serves a full-screen plugin at `/` is a
legitimate operator choice, and `/`-rewrite-to-`routePrefix` already works for it.
**Caveat (documented):** a minimal root plugin renders no chrome, so the instance
has **no platform navigation** to reach other plugins / Console / Account — the
operator opts into that deliberately. Whether to warn in Console when selecting a
minimal root is an open question.

### Navigation contract

Minimal = "the plugin dictates the entire view," so the **plugin owns its own
navigation**, including a way back to the rest of the platform. The platform does
**not** inject an escape hatch (that would contradict chrome-free). Convention
(documented in `docs/plugin-development.md`): a minimal plugin **should** provide a
link to `/` (or another route) so a user isn't trapped. Minimal plugins are
otherwise ordinary non-chrome plugins, so they still appear in the launcher grid
and the desktop sidebar / mobile Drawer (RFC 0013) — that is how a user reaches
them from the default shell; activating one swaps the `(platform)` layout out for
the full-bleed `(minimal)` route.

### Manifest & validation

No schema change is required (`shell` already includes `minimal`). Remove the
"not supported" expectation from any test that asserts the build-fail, and add
coverage that a `minimal` plugin composes to `(minimal)/<segment>` and **not** into
`(platform)`. `shellConfig.overlaySize` remains overlay-only (the existing
`.refine`, `packages/manifest/src/schema.ts:67–70`).

## UI / navigation flows

**Open a minimal plugin from the shell** — default shell → launcher grid or
sidebar / mobile Drawer → tap the plugin → route changes to its `routePrefix`; the
`(platform)` shell unmounts and the plugin renders full-bleed across `100dvh`
(safe-area respected). The plugin's own UI provides any "back to home" affordance.

**Minimal as root (kiosk)** — operator sets a minimal plugin as the root plugin →
`/` rewrites to its `routePrefix` → every sign-in lands directly in the full-screen
plugin with no chrome. (Operator-acknowledged: no platform nav.)

**Hard load / deep link** — a direct hit on `/editor` is session-gated by the
middleware (redirect to `/login` if unauthenticated), then renders via the
`(minimal)` layout — identical gating to any other plugin route.

## Alternatives considered

1. **Nest `minimal` under `(platform)` and hide chrome with CSS.** Rejected — the
   shell layout still mounts (and runs its `headers()`/registry work); hiding it is
   fragile and wastes a layout. A sibling group is the clean App-Router idiom.
2. **A single shared group with conditional chrome in one layout.** Rejected —
   pushes per-request branching into a layout, the opposite of the
   composition-decides-layout model RFC 0001 established.
3. **Forbid minimal as a root plugin.** Tempting (avoids a nav-less instance), but
   it removes the legitimate kiosk/single-app use case. Kept eligible with a
   documented caveat instead.
4. **Platform-injected "exit" button on minimal routes.** Contradicts "plugin owns
   the entire view"; left to a plugin convention instead.

## Open questions

1. **Console warning** when an admin selects a `minimal` plugin as the root
   (no-chrome / no-nav consequence) — surface a confirmation, or document only?
2. **Reference plugin.** Should Plainwrite (the writing surface) be the first
   `minimal` plugin and the worked example in the docs?
3. **Minimal × `adminOnly`.** Works via `decidePluginRoute`, but is an admin-only
   full-screen plugin a real use case worth an example?
4. **Requirement IDs.** Proposed PLT-/CON- entries (minimal route group +
   root-eligibility caveat) — not assigned in the SRS until accepted.
5. **Interaction with RFC 0013's safe-area guarantees** — confirm the `(minimal)`
   layout is the single place those guarantees are applied for chrome-free routes.

## Adoption path

1. **Documentation-first (this RFC).** Wiring design captured; no code, no SRS
   edits, no scheduling.
2. **When accepted & scheduled** (a small runtime + generate-script change):
   add the `(minimal)` group (committed `layout.tsx` + `.gitignore`), replace the
   generate-script build-fail with the `minimal` compose target + clear step,
   confirm root-plugin eligibility + the nav caveat, add compose/parity tests, and
   document `minimal` fully in `docs/plugin-development.md` + the CLAUDE.md
   load-bearing notes. Honour RFC 0013's responsive expectations in the layout.
3. **Follow-on (optional):** ship a reference `minimal` plugin (candidate:
   Plainwrite) as the worked example.

## Changelog

| Version | Date     | Change                                                                                                                                                      |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; wire `shell: "minimal"` via a sibling `(minimal)` route group, generate-script branch, root eligibility + nav contract; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.25.                                                                                                          |
