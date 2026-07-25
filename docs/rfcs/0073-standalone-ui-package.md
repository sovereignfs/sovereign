# RFC 0073 — Standalone usage of `@sovereignfs/ui` outside the plugin runtime

**Status:** Draft\
**Date:** July 2026\
**Author:** External contributor (submitted for consideration; adapted to repository conventions)\
**Scope:** `packages/ui`, `docs/design-system.md`, `docs/sdk-stability.md`. No dependency on `@sovereignfs/sdk` or any RFC governing plugin composition.\
**Incorporated into plan:** No — documentation-first. Design only; scheduling deferred to a roadmap slot.

---

## Summary

Make `@sovereignfs/ui` usable as an ordinary npm dependency in an external
app that is not a Sovereign plugin and does not run inside the Sovereign
runtime shell — with its design tokens, components, and hooks all working
correctly without any runtime-injected globals. Most of the technical
groundwork already exists (see Current state); this RFC is mainly about
stating and documenting a guarantee that today is true by accident, not by
contract.

## Motivation

`@sovereignfs/ui` is a well-scoped, accessibility-conscious component
library (`Button`, `FormField`, `TagInput`, `StatusBadge`, `Icon`, mobile
interaction hooks, etc.) that's a good fit for apps well beyond Sovereign
plugins. Today the documented usage pattern assumes the component tree is
mounted inside the Sovereign runtime shell, which injects the `--sv-*`
design token stylesheet globally. There is no stated compatibility
guarantee for a standalone consumer, and no explicit confirmation that
components/hooks (e.g. `useIsMobile`, `useLongPress`) have no hidden
dependency on runtime-provided context.

This matters directly for **FindMyModel**, a separate standalone app under
active development that wants visual consistency with the Sovereign
ecosystem for its curator-facing interface, without becoming a plugin
itself.

## Current state (what this builds on)

The package is closer to standalone-ready than the original draft assumed —
this RFC corrects that and scopes the remaining gap precisely:

- `packages/ui/package.json` is **already published-shaped**: not
  `private`, `publishConfig.access: "public"`, version `0.41.0`, and
  `exports` already declares a standalone tokens entry point
  (`"./tokens.css": "./src/tokens.css"`, plus `./tokens/primitives.css` and
  `./tokens/semantic.css`). The original draft's premise ("packages/ui is
  listed as yet to be published") is **stale** — confirming current npm
  publication status (has a version actually been published to the
  registry, distinct from being publish-configured) is the one open item
  here, not building the export.
- `grep -rn "@sovereignfs/sdk" packages/ui/src` returns **no matches** — the
  package already has zero coupling to the SDK or plugin contract, which
  the draft flagged as something "worth flagging in review." It's already
  satisfied.
- `packages/ui/src/hooks/` (`useIsMobile.ts`, `useLongPress.ts`,
  `useDoubleTap.ts`, `useCommitOnEnterOrBlur.ts`) contain no
  `createContext`/`Provider` dependency — they're self-contained. The only
  `Provider`/`createContext` usage in the package is local to `Toast` and
  `Dialog` (own internal state, not a runtime-injected global), per
  `grep -rln "createContext\|Provider" packages/ui/src`. No
  `SovereignUIRoot`-equivalent wrapper exists or is needed today.
- Dark mode is driven by a `[data-theme='dark']` attribute selector in
  `packages/ui/src/tokens/semantic.css:91`, set at `:root` — not a
  `prefers-color-scheme` media query and not JS-context-dependent. An
  external app needs only to toggle that attribute itself; this is not
  currently documented anywhere outside the CSS source comment
  (`packages/ui/src/tokens/semantic.css:6`).
- `docs/design-system.md` has no "standalone usage" section — confirmed by
  search; the closest existing precedent for a tiered stability statement
  is `docs/sdk-stability.md`, which this RFC proposes mirroring rather than
  inventing a new format.

## Non-goals

- Changing the plugin-facing usage pattern, which works today and stays
  as-is.
- Theming/rebrand support beyond exposing the existing token set — a
  separate, larger conversation.
- Any `@sovereignfs/sdk` dependency, direct or transitive. The motivating
  consumer wants the component library and design tokens only — no session
  access, no plugin manifest, no runtime composition.

## Proposed design

### 1. Confirm and state npm publication status

Confirm whether a version of `@sovereignfs/ui` has actually been published
to the npm registry (publish-configured is not the same as published).
State this plainly in `docs/design-system.md` so external consumers aren't
guessing.

### 2. State the "no root provider required" guarantee explicitly

Per Current state, no context provider is required today. Rather than
leaving this implicit, add an explicit statement to `docs/design-system.md`:
components are pure CSS-variable/props consumers; no wrapper is required to
use them outside the runtime shell. If a future component needs shared
context (theme, density, locale), that becomes a breaking addition subject
to the semver policy below — not a silent assumption.

### 3. State hooks are runtime-independent

Add an explicit compatibility guarantee for `useIsMobile`, `useLongPress`,
`useDoubleTapHandler`, `useCommitOnEnterOrBlur`: "these hooks have no
dependency on the Sovereign runtime and are safe to use in any React 18+
app" (per Current state, this is already true — the gap is only that it's
undocumented).

### 4. Add a "standalone usage" section to `design-system.md`

A short, explicit section covering:

- Installation (`npm install @sovereignfs/ui`)
- Importing tokens (`import '@sovereignfs/ui/tokens.css'` — already a valid
  import path per the existing `exports` map)
- No required root wrapper (per §2)
- Dark mode toggling outside the runtime shell: set `data-theme="dark"` on
  the consumer's own `:root` (or `documentElement`), matching
  `[data-theme='dark']` in `packages/ui/src/tokens/semantic.css:91`
- A minimal working example (a form using `FormField` + `Input`)

### 5. Tiered stability statement for the standalone surface

`docs/sdk-stability.md` sets a precedent for a tiered stability statement.
Mirror it for `@sovereignfs/ui`'s standalone consumption surface: token
names and core primitives (`Button`, `FormField`, `Input`, `Card`, tokens)
are stable; editor-workflow primitives added for plugin-internal use (e.g.
`SplitPane`, per epic task 9.16) may be marked experimental for standalone
consumers if they carry assumptions not yet audited outside a plugin
context.

## Security considerations

None expected — this is a pure client-side styling/component surface with
no auth or data implications. Worth confirming during implementation that
no component silently assumes a same-origin runtime API (e.g. an
icon-loading endpoint) that wouldn't resolve correctly from an external
domain; `docs/design-system.md:307` already states the published
`@sovereignfs/ui` carries zero runtime/peer icon dependencies, which is a
good sign but should be explicitly re-verified for the icon set in scope
here.

## Alternatives considered

- **Fork or vendor the token set** into the external app instead of
  depending on the package directly. Rejected as a first choice — it
  immediately drifts from the source of truth and defeats the purpose of
  visual consistency across the ecosystem. A fallback only if the package
  genuinely can't be used standalone (Current state suggests it already
  can).

## Open questions

- Are there icon assets served from a Sovereign-runtime-relative path that
  wouldn't resolve for an external consumer? (`docs/design-system.md`
  suggests not, but this should be verified against the actual `Icon`
  component implementation as part of the task, not assumed from docs.)
- Should the tiered stability statement (§5) live entirely in
  `docs/design-system.md`, or get its own `docs/ui-stability.md` mirroring
  `docs/sdk-stability.md`'s structure 1:1? Recommend starting as a section
  in `docs/design-system.md` and splitting out only if it grows enough to
  warrant its own doc.

## Adoption path

Documentation-first: this RFC does not commit to a roadmap slot. Given how
much of the underlying capability already exists (per Current state), the
implementation is primarily a documentation and verification task, not new
code — a single epic task (9.17).
No `@sovereignfs/ui` API surface changes are anticipated; if the icon-path
or provider audits (Open questions) surface a gap, any resulting change
follows NFR-04 (minor bump minimum, migration note in `docs/upgrade.md`).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
