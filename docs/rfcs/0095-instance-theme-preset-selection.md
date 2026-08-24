# RFC 0095 — Instance-level theme preset selection

**Status:** Implemented\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/db`, `runtime`, `plugins/console`, `.env.example`, docs. Depends entirely on [RFC 0094](0094-design-system-theme-presets.md) (design-system theme presets) — this RFC adds no new visual design, only the operator-facing activation path for presets RFC 0094 defines. Extends the exact delivery pipeline [RFC 0027](0027-white-labeling.md)/[0032](0032-instance-identity-rename.md) (accent colour) and [RFC 0077](0077-instance-radius-control.md) (corner radius) already ship.\
**Incorporated into plan:** Yes — shipped alongside RFC 0094 in the same change, per explicit developer direction. Schema + migration (both dialects), `instance-style.ts` delivery (with the "operator's explicit choice wins" precedence verified by a dedicated regression test), the Console `Select` control, and env var/doc parity all landed. Open question #1 (whether that precedence is the right long-term product default) remains genuinely open — implemented as designed, not blocking, but worth revisiting if real usage suggests otherwise.

---

## Summary

Let an operator pick a theme preset (from RFC 0094's closed, built-in set)
for their instance — Console → Instance identity, the same place they already
pick a corner-radius preset and accent colour — via one new `instance_config`
column and one more line in the existing `instance-style.ts` delivery
pipeline. An operator's separately-set accent colour and radius preset
continue to override the theme preset's own bundled defaults, so switching
themes never silently discards branding an operator already configured.

## Motivation

RFC 0094 defines what a theme preset _is_ but deliberately ships inert —
nothing in `runtime/` ever sets its selector, so no live Sovereign instance
can use it. This RFC is the activation step, split out on purpose (see that
RFC's Summary) so the visual design can be validated in Storybook before
locking in a Console-facing control and a DB column — the same reason RFC
0077 itself was scoped as a single, self-contained PR only after its token
mechanism was settled.

## Current state (what this builds on)

- **The exact delivery pipe already exists and is proven.**
  `runtime/src/instance-provider.tsx`'s `InstanceProvider` (used once, in
  `runtime/app/(platform)/layout.tsx:182`) renders `buildInstanceStyle()`'s
  output as an inline `<style>` tag ahead of its children. `instance-style.ts`
  already emits `--sv-radius-scale` (via its `RADIUS_SCALE` lookup) and
  `--sv-color-accent`/`--sv-color-accent-hover` (via hex→HSL conversion) into
  one `:root { ... }` block, plus a `[data-theme='dark']` block for the
  accent's dark-mode hover value.
- **Why this can't be a `data-theme-preset` attribute on `<html>`.** RFC 0077
  already ran into and rejected exactly this shape for radius (its "Course
  correction" section): `runtime/app/layout.tsx`'s root `<html>` is rendered
  by a synchronous layout with no DB access, and `InstanceProvider` only
  exists three layers deeper, rendering a `<style>` tag rather than wrapping
  a DOM node it could stamp an attribute onto. A `<style>` tag's `:root { }`
  rules apply document-wide regardless of where in the tree the tag sits —
  which is exactly why accent colour and radius both already use this path,
  and why this RFC reuses it rather than reopening the attribute-on-`<html>`
  question RFC 0077 already settled.
- **`instance_config` naming convention.** Columns are named `brand_*` even
  after the RFC 0032 app-level rename to `instance*`
  (`packages/db/src/schema/sqlite/platform.ts:552-569`); `instanceRadius:
text('brand_radius')` is the most recent precedent to follow
  (`platform-db.ts:2895-2903` for the `InstanceConfig` type,
  `getInstanceConfig`/`setInstanceConfig` at lines 2920/2964).
- **Console precedent.** `InstanceForm`
  (`plugins/console/app/settings/SettingsForms.tsx:240-293`) already renders
  name/colour/logo/radius fields as one `useActionState` form against
  `/api/admin/instance-config`; RFC 0077 §4 flagged that `SegmentedControl`
  (2–3 option guidance) is already a stretch at radius's 5 options — a theme
  preset list will only grow, so this RFC uses `Select` from the start rather
  than repeating that open question.

## Proposed design

### 1. Storage — one more nullable column

```ts
// packages/db/src/schema/{sqlite,postgres}/platform.ts
/** Theme preset (RFC 0094) overriding the design system's default token set. Null = 'default'. */
instanceThemePreset: text('brand_theme_preset'), // ThemePresetName | null
```

Plus a Drizzle migration, same scope as RFC 0077's `brand_radius` migration.
`InstanceConfig` gains `instanceThemePreset: ThemePresetName | null`;
`getInstanceConfig`/`setInstanceConfig` extend in parallel with the existing
`instanceRadius` handling, validating against RFC 0094's `ThemePresetName`
union the same way `instanceRadius` validates its own 5-value union today.

Env var fallback for the single-tenant case: `INSTANCE_THEME_PRESET`
(`.env.example`, `docs/self-hosting.md` — required by CLAUDE.md's env-var
doc-parity convention).

### 2. Delivery — import RFC 0094's data directly, don't re-derive it

```ts
// runtime/src/instance-style.ts
import { THEME_PRESETS } from '@sovereignfs/ui/tokens/theme-presets';

export function buildInstanceStyle(config: InstanceConfig): string {
  const lines: string[] = [];
  const darkLines: string[] = [];

  // Theme preset lines go FIRST — an operator's explicit accent/radius
  // choice (pushed later, below) then wins by ordinary "last declaration
  // in the same block wins" CSS rules. No special-case precedence logic.
  if (config.instanceThemePreset) {
    const preset = THEME_PRESETS[config.instanceThemePreset];
    for (const [token, value] of Object.entries(preset.light)) {
      lines.push(`  ${token}: ${value};`);
    }
    for (const [token, value] of Object.entries(preset.dark)) {
      darkLines.push(`  ${token}: ${value};`);
    }
  }

  if (config.instanceRadius) {
    lines.push(`  --sv-radius-scale: ${RADIUS_SCALE[config.instanceRadius]};`);
  }
  // ...existing accent-colour lines appended after, unchanged...

  return (
    `:root {\n${lines.join('\n')}\n}` +
    (darkLines.length ? `\n[data-theme='dark'] {\n${darkLines.join('\n')}\n}` : '')
  );
}
```

This is additive to the existing function — no restructuring of the
accent-colour or radius branches. `@sovereignfs/ui` is already a workspace
dependency of `runtime`; importing a plain, tree-shakeable TS object adds no
new dependency and no CSS-parsing step. Nothing about this delivery path sets
any attribute on `<html>` — it stays entirely within the proven `:root {
}`-injection mechanism, sidestepping the constraint described in Current
state entirely.

### 3. Console UI

Extend `InstanceForm` with a `Select` control ("Theme" — Default,
Neobrutalism, …) below the existing radius-preset field, wired through the
same `useActionState` action and `/api/admin/instance-config` route as the
rest of the form. No new permission surface.

## UI flows

1. Operator opens Console → Settings → Instance identity.
2. Picks a theme preset from the new "Theme" `Select` (default: "Default").
   Their existing accent colour and radius preset selections are visible and
   unchanged in the same form.
3. Saves. `setInstanceConfig` validates and persists `instanceThemePreset`.
4. On next render, `InstanceProvider`'s injected `<style>` block includes the
   preset's token overrides; the operator's already-configured accent colour
   and radius preset (if set) still take precedence over the preset's own
   defaults for those specific tokens, per the ordering in §2 above.

## Alternatives considered

- **`data-theme-preset` attribute on `<html>`.** Rejected — see Current
  state; RFC 0077 already ran into and rejected this exact shape for radius,
  for the same structural reason (no DB access at the point `<html>`
  renders).
- **Overload the existing `instanceRadius` field to also encode the theme.**
  Rejected — radius and theme preset are orthogonal: an operator might want
  square corners with the default theme, or a specific radius override even
  while using neobrutalism. Keeping them separate columns (as this RFC does)
  preserves that independence for free.
- **Compute/duplicate the preset's token values independently in
  `runtime/`** rather than importing RFC 0094's `THEME_PRESETS` object.
  Rejected — would immediately reintroduce the two-representations drift
  risk RFC 0094 specifically designed its data module to avoid.
- **Theme preset fully owns the look; hide/ignore accent-colour and
  radius-preset controls while a non-default theme is active.** Considered
  and rejected in favour of the "operator's explicit choice always wins"
  precedence — simpler mental model, but risks silently discarding branding
  an operator already configured on a theme switch. Flagged as an open
  product question below in case that judgment call should go the other way.

## Open questions

1. **Is "operator's explicit accent/radius choice always wins" the right
   default UX**, or should switching to a theme preset be presented as
   fully replacing the look (with an explicit way to re-apply a custom
   accent on top)? Recommended in Proposed design, but this is a product
   call worth confirming before implementation, not purely a technical one.
2. **Live preview in Console** — same nice-to-have RFC 0077 flagged for
   radius (§3 Open questions there), now with more visual surface area to
   preview. Not blocking.
3. **Auth-app/login-page propagation gap.** Neither accent colour nor radius
   reaches `apps/auth`'s login/register pages or the synchronous runtime root
   layout today (RFC 0077's Open question #4) — a theme preset inherits the
   identical gap. Not solved by this RFC either; tracked as the same
   pre-existing limitation.

## Adoption path

Single PR is feasible, same reasoning as RFC 0077: no auth-app phasing
needed (auth doesn't consume `InstanceProvider` for anything today,
regardless of this RFC). Suggested order: schema + migration →
`InstanceConfig` plumbing → `instance-style.ts` emission (importing RFC
0094's `THEME_PRESETS`) → Console form control → env var + doc parity
(`.env.example`, `self-hosting.md`).

**Prerequisite:** RFC 0094 must ship (or at minimum have its `theme-presets.ts`
data module and `ThemePresetName` type stable) before this RFC's schema and
`instance-style.ts` work can start, since both directly depend on that
export.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft                                                                                                                                                                                                                                                                 |
| 0.2     | August 2026 | Implemented, alongside RFC 0094 in the same change. Verified live: `buildInstanceStyle()`'s precedence ordering (theme-preset lines before radius/accent) proven correct by a dedicated test rather than assumed from the code shape. No change to the design's public shape. |
