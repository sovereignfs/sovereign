# RFC 0077 — Instance-level corner radius control

**Status:** Implemented\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/ui`, `packages/db`, `runtime`, `plugins/console`, `.env.example`, docs; extends RFC 0027 / RFC 0032 (instance identity theming)\
**Incorporated into plan:** Yes — every step in this RFC's Adoption path has shipped: `--sv-radius-scale` and the `calc()`-based radius tokens in `packages/ui/src/tokens/primitives.css`; the `brand_radius`/`instanceRadius` column and migration in both `packages/db` schemas (sqlite `migrations/sqlite/0018_odd_jigsaw.sql`, postgres `migrations/postgres/0018_melodic_leopardon.sql`); the `RADIUS_SCALE` lookup and emission in `runtime/src/instance-style.ts`; the Console `Select` control in `plugins/console/app/settings/SettingsForms.tsx`; the `INSTANCE_RADIUS` env var and its `docs/self-hosting.md` entry; the `docs/design-system.md` token-architecture exception note; and all five presets in `packages/ui/src/stories/TokenGallery.stories.tsx`. Open question #2 (SegmentedControl vs. Select) resolved as `Select`. Open question #3 (a live-updating preview in Console) was never built — it was filed as a non-blocking nice-to-have, not an adoption-path step, so its absence doesn't change this RFC's status.

---

## Summary

Add a five-step, instance-level "corner radius" setting — **None / XS / S / M
/ L** — that an operator picks once (Console → Instance identity, or an
`INSTANCE_RADIUS` env var for the single-tenant case) and which then scales
every rounded corner across the whole design system. **None** produces fully
square corners everywhere; **M** is today's shipped look, byte-for-byte
unchanged, so existing instances see zero visual difference until an operator
opts in; **L** pushes past today's values enough that short elements —
buttons, badges, small popovers — render as full pills/stadiums (see "Why L
doesn't need a separate mechanism" below).

The five presets are one proportional scale factor (`--sv-radius-scale`)
applied to today's six corner-radius tokens (`--sv-radius-sm` through
`-3xl`) via `calc()`. Delivered through the **exact same** per-tenant
`instance_config` → `InstanceProvider` → injected `<style>` pipeline that
already powers accent-colour theming (RFC 0027/0032) — no new delivery
mechanism, and **no component changes anywhere**, because every component
already reads `--sv-radius-sm`/`-md`/etc. by name and those names don't
change.

`--sv-radius-full` (avatars, pill badges, the toggle switch knob) is
deliberately **not** touched by this setting — see "Alternatives considered."

## Motivation

Some operators want a stricter, more utilitarian visual language (square
corners read as "enterprise tool," not "consumer app") without hand-overriding
dozens of individual component styles one at a time. Today radius is
documented as a "theme-stable" scale token
(`docs/design-system.md` — Token architecture: "The scale tokens
(`--sv-space-*`, `--sv-radius-*`, `--sv-font-size-*`) have no separate
semantic tier — they are theme-stable and used directly"). This RFC carves out
one deliberate exception to that rule, on the same precedent RFC 0027 already
set for `--sv-color-accent`: a token that was nominally "fixed" until an
instance-level control made it operator-configurable.

## Current state (what this builds on)

- **Radius primitives** — six corner tokens plus one shape token, defined once
  at `packages/ui/src/tokens/primitives.css:87-93`:
  `--sv-radius-sm` (6px), `-md` (8px), `-lg` (11px), `-xl` (12px), `-2xl`
  (14px), `-3xl` (20px), `-full` (9999px). Every component references these
  by name (e.g. `packages/ui/src/components/Menu/Menu.module.css:30` —
  `border-radius: var(--sv-radius-sm)`); none hardcode a literal radius
  (enforced by `pnpm design:tokens:check`).
- **Instance identity storage** — `instance_config` table
  (`packages/db/src/schema/sqlite/platform.ts:552-569`), one row per tenant,
  columns named `brand_*` even after RFC 0032 renamed the _application-level_
  field names to `instance*` (the DB columns were left as-is; see the
  `instanceName: text('brand_name')` mapping at line 555). `InstanceConfig`
  (`packages/db/src/platform-db.ts:2895-2903`), `getInstanceConfig` (line 2920) and `setInstanceConfig` (line 2964) read/write it; `instancePrimary`
  is validated against `HEX_COLOR_RE` before it can reach a `<style>` block
  (line 2969).
- **Delivery mechanism** — `runtime/src/instance-provider.tsx`'s
  `buildInstanceStyle()` (line 35) builds a `:root { ... }` string from the
  config and `InstanceProvider` renders it as an inline `<style>` tag ahead of
  its render-prop `children` (line 108-111). **This is the only place instance
  config becomes CSS.** It matters where: `InstanceProvider` is used exactly
  once, inside `runtime/app/(platform)/layout.tsx:182`, wrapping the
  authenticated shell. It is **not** used in the synchronous root
  `runtime/app/layout.tsx` (which has no DB access — it doesn't `async`/await
  anything) and **not** in `apps/auth`. Accent-colour theming today therefore
  only reaches the authenticated platform shell, not the standalone
  login/register pages — a known, pre-existing gap this RFC inherits rather
  than solves (see Open questions).
- **Console UI precedent** — `InstanceForm` in
  `plugins/console/app/settings/SettingsForms.tsx:240-293` renders the
  existing instance-identity fields (name, primary colour, logos) as a
  `useActionState` form; `plugins/console/app/identity/page.tsx` loads current
  values via `/api/admin/instance-config` and renders the form.
  `SegmentedControl` (`packages/ui/src/components/SegmentedControl/`) is the
  existing DS component for a 2–3 option picker; at 5 options this preset
  picker is a stretch for it (see §4 below).

## Proposed design

### 1. Token layer — one scale factor, six `calc()` tokens

```css
/* packages/ui/src/tokens/primitives.css */
:root {
  --sv-radius-scale: 1; /* M — today's look. Overridden per-instance below. */
  --sv-radius-sm: calc(var(--sv-radius-scale) * 0.375rem);
  --sv-radius-md: calc(var(--sv-radius-scale) * 0.5rem);
  --sv-radius-lg: calc(var(--sv-radius-scale) * 0.6875rem);
  --sv-radius-xl: calc(var(--sv-radius-scale) * 0.75rem);
  --sv-radius-2xl: calc(var(--sv-radius-scale) * 0.875rem);
  --sv-radius-3xl: calc(var(--sv-radius-scale) * 1.25rem);
  --sv-radius-full: 9999px; /* unaffected — see Alternatives considered */
}
```

No component changes: `--sv-radius-sm` etc. keep their names and their
default values at `--sv-radius-scale: 1`, so a package consumer who never sets
the scale sees pixel-identical output to today.

Proposed scale factors per preset (open to visual-QA adjustment — see Open
questions):

| Preset | `--sv-radius-scale` | sm (6px) | md (8px) | lg (11px) | xl (12px) | 2xl (14px) | 3xl (20px) |
| ------ | ------------------: | -------: | -------: | --------: | --------: | ---------: | ---------: |
| None   |                   0 |        0 |        0 |         0 |         0 |          0 |          0 |
| XS     |                0.35 |     ~2px |     ~3px |      ~4px |      ~4px |       ~5px |       ~7px |
| S      |                0.65 |     ~4px |     ~5px |      ~7px |      ~8px |       ~9px |      ~13px |
| M      |                   1 |      6px |      8px |      11px |      12px |       14px |       20px |
| L      |                2.75 |    ~17px |    ~22px |     ~30px |     ~33px |      ~39px |      ~55px |

#### Why L doesn't need a separate mechanism

`border-radius` is spec-clamped: the UA caps a box's used radius at half its
own height (and, for adjacent corners, proportionally scales all four down
together so they never overlap — [CSS Backgrounds §5.5](https://www.w3.org/TR/css-backgrounds-3/#corner-overlap)).
That's the standard trick behind every hand-written "pill button"
(`border-radius: 9999px` on a 40px-tall element clips to 20px automatically).

Button heights are 32/36/40px (`Button.module.css:39` — sm/md/lg); at L's
`--sv-radius-md ≈ 22px`, even the tallest (40px, half-height 20px) clips to a
full pill. Badges (~18px tall) clip at L's `--sv-radius-sm ≈ 17px` too. Cards,
dialogs, and drawers are large enough that the same scale factor just reads as
"very rounded," not literally circular — which matches "full curvy UI" without
needing a second mechanism, a different token set, or per-component
overrides. `--sv-radius-full` still doesn't move (it's already maximally
round) — L doesn't change that story, it just makes the _other_ six tokens
big enough to hit the same visual result on short elements.

### 2. Storage — extend `instance_config`

Add one nullable column, following the existing `brand_*` naming:

```ts
// packages/db/src/schema/{sqlite,postgres}/platform.ts
/** Corner-radius intensity preset overriding --sv-radius-scale. Null = default (M). */
instanceRadius: text('brand_radius'), // 'none' | 'xs' | 's' | 'm' | 'l'
```

plus a Drizzle migration (mirrors `migrations/sqlite/0005_rename_tenant_branding.sql`'s
scope for the earlier rename).

`InstanceConfig` (`platform-db.ts:2895`) gains:

```ts
instanceRadius: 'none' | 'xs' | 's' | 'm' | 'l' | null;
```

`getInstanceConfig`/`setInstanceConfig` extend in parallel with the existing
`instancePrimary` handling — `setInstanceConfig` validates against the
5-value literal union the same way it validates `HEX_COLOR_RE` today (line
2969), rejecting anything else before it can reach persistence.

Env var fallback for the single-tenant case, matching `INSTANCE_PRIMARY_COLOR`:
`INSTANCE_RADIUS` (`.env.example`, `docs/self-hosting.md` — required by
CLAUDE.md's env-var doc-parity convention).

### 3. Delivery — one more line in `buildInstanceStyle()`

```ts
// runtime/src/instance-provider.tsx
const RADIUS_SCALE: Record<'none' | 'xs' | 's' | 'm' | 'l', number> = {
  none: 0,
  xs: 0.35,
  s: 0.65,
  m: 1,
  l: 2.75,
};

if (config.instanceRadius) {
  lines.push(`  --sv-radius-scale: ${RADIUS_SCALE[config.instanceRadius]};`);
}
```

This reuses the existing `:root { ... }` block and `<style>` tag verbatim —
no new injection surface, no new CSP consideration, no math (a plain lookup
table, safer than the accent-colour path's HSL conversion since there's
nothing to compute from user input).

**Course correction from our chat:** I'd floated a `data-radius="none|xs|s|m"`
attribute on `<html>` (the same mechanism as `data-theme`) as the cleaner
option, and that's genuinely the nicer shape _in isolation_. But
`runtime/app/layout.tsx`'s `<html>` is rendered by a synchronous root layout
with no DB access — `InstanceProvider` only exists three layouts deeper, at
`(platform)/layout.tsx`, and renders a `<style>` tag rather than wrapping a
DOM element it could stamp an attribute onto. `:root { }` CSS injected from a
`<style>` tag applies document-wide regardless of where in the tree that tag
sits, which is _why_ accent-colour used this path in the first place — it's
the only channel that reaches document scope from where `InstanceProvider`
actually renders. Given that constraint, extending the same pipe is simpler
than restructuring `RootLayout` to be async just to host one more data
attribute.

### 4. Console UI

Extend `InstanceForm` (`SettingsForms.tsx:240`) with a control offering
None/XS/S/M/L below the existing "Primary colour" field, wired through the
same `useActionState` action and `/api/admin/instance-config` route as the
rest of the form — same gating, same save/feedback pattern, no new
permission surface. `SegmentedControl` is documented for "2–3 option" use
(`docs/design-system.md` — Component gallery); five options is a stretch for
that visual style, so this may want a `Select` instead — a UI-fit call best
made once the control is actually laid out next to the other fields, not
decided in the abstract here.

### 5. Design-system doc

`docs/design-system.md`'s Token architecture section currently states scale
tokens are "theme-stable" without qualification. This needs a one-line
exception carved out for radius specifically, pointing at this RFC — "Docs
are part of the change" per CLAUDE.md.

## Alternatives considered

- **Also flatten `--sv-radius-full` under "None."** Rejected (per our
  discussion) — `-full` produces circles and pills, a _shape_ decision
  (avatar, toggle knob, pagination current-page indicator), not a "how
  rounded are corners" one. Flattening it would be a much bigger, more
  surprising visual change than "square corners" implies, and nothing in the
  request asked for square avatars.
- **Hand-tuned pixel table per preset** (24 hand-picked numbers instead of one
  scale factor). Rejected (per our discussion) — loses the guarantee that "M"
  equals today's tokens exactly, loses proportionality between steps, and is
  more to maintain for no clear benefit. The one real cost of the scale-factor
  approach is sub-pixel `calc()` output at XS/S (e.g. ~2.1px) — accepted, since
  browsers render fractional pixel radii fine.
- **`data-radius` attribute mirroring `data-theme`.** Rejected once the actual
  render tree was checked — see "Course correction" above.
- **Per-component/per-plugin override instead of a single theme-level
  control.** Rejected — explicitly out of scope; the ask was one instance-wide
  knob, not per-surface control.
- **Continuous slider (0–100%) instead of fixed presets.** Rejected — the ask
  was fixed, named states matching a deliberately designed visual language,
  not open-ended variation.
- **A separate "pill mode" flag for L instead of a bigger scale factor.**
  Rejected — unnecessary. `border-radius`'s own spec-mandated clamping to
  half the box height already turns a large-enough radius into a pill on
  short elements (see "Why L doesn't need a separate mechanism" above); a
  second flag would duplicate behavior the platform gets for free.

## Open questions

1. **Exact scale factors for XS/S/L.** 0.35/0.65/2.75 are reasonable starting
   points (L's is grounded in actual Button/Badge heights — see above — the
   other two are an even proportional split) but untested against every
   component — worth a visual pass in Storybook (Token Gallery / Design
   System Overview) before finalizing, since these are trivial to retune (one
   number each). L is the one preset that _increases_ radius past today's
   baseline rather than reducing it, so it's worth specifically eyeballing
   the large panels (Dialog, Drawer's top corners at `--sv-radius-3xl ≈ 55px`)
   to confirm "very curvy" doesn't tip into "looks broken" at that scale —
   the small/short components (Button, Badge) are the ones grounded in exact
   math above; the large ones are the ones most likely to need retuning.
2. **SegmentedControl vs Select for 5 options in Console** (see §4 above) —
   pick once the form is actually laid out.
3. **Live preview in Console.** A static control tells the operator the
   _name_ of what they're picking but not the look. A small live-updating
   swatch (a couple of components re-rendered with the pending value) would
   be a nicer admin experience — flagging as a nice-to-have, not blocking.
4. **Auth-app propagation.** `apps/auth`'s login/register pages and the
   synchronous runtime root layout don't consume `InstanceProvider` at all
   today, so neither accent colour nor this new radius setting reaches them.
   Pre-existing gap (tracked implicitly by RFC 0027's deferred "Phase 2: email
   - auth login"), not something this RFC takes on.
5. **Field/column naming** — `instanceRadius` / `INSTANCE_RADIUS` /
   `brand_radius` column, `--sv-radius-scale` CSS var, `'none' | 'xs' | 's' |
'm' | 'l'` values — all provisional pending sign-off before implementation
   starts.

## Adoption path

Single PR is feasible — the surface area is small and, unlike RFC 0027, there
is no auth-app work to phase separately (auth doesn't consume
`InstanceProvider` today for anything, radius included). Suggested order:
schema + migration → `InstanceConfig` plumbing → `primitives.css` scale
conversion → `instance-provider.tsx` emission → Console form control → env
var + doc parity (`.env.example`, `self-hosting.md`) → `design-system.md`
exception note → Storybook Token Gallery update to show all five presets.

**Semver:** `packages/ui` token changes are additive — `--sv-radius-scale` is
new, and every existing `--sv-radius-*` token keeps its name and its default
computed value. Not a breaking change to the published `@sovereignfs/ui`
contract; ships as a minor bump per the repo's `feat/` convention.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                  |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft                                                                                                                                                                                                                                                                                                           |
| 0.2     | August 2026 | Status corrected from Draft to Implemented — the feature shipped without this RFC's status line being updated at the time. Verified against the live code (token layer, both DB migrations, Console form, env var/doc parity, Storybook Token Gallery) rather than assumed from the design; no functional changes made. |
