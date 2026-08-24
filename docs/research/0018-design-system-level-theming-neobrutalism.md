# Research 0018 — Alternate visual themes at the design-system level (neobrutalism worked example)

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/ui` (tokens, component CSS Modules) — explicitly _not_ `runtime/` and _not_ any component's public props/API\
**Related:** [RFC 0027](../rfcs/0027-white-labeling.md) (tenant accent-colour theming), [RFC 0032](../rfcs/0032-instance-identity-rename.md) (instance identity rename), [RFC 0077](../rfcs/0077-instance-radius-control.md) (instance corner-radius control — the closest existing precedent), `docs/design-system.md`'s Theming and Token architecture sections

---

## Question

Can Sovereign support a strongly distinct alternate visual identity — e.g. a
[neobrutalist](https://neobrutalism.com/) skin (thick borders, hard offset
shadows, loud saturated colour, square corners, heavy type, tactile "press"
interactions) — **entirely at the design-system level**: shipped from
`packages/ui`, with **zero changes to `runtime/` (platform code)** and **zero
changes to any component's public API/props**? What's already achievable
purely through the existing token-override theming surface, and where are the
real gaps?

## Findings

### The existing theming contract

`@sovereignfs/ui` already has exactly the shape this question is asking
about: a two-tier token system where **components only ever reference
semantic tokens by name**, and theming is defined as "swap the semantic
values, change no component code" (`docs/design-system.md:402-419`,
`packages/ui/src/tokens/semantic.css:1-12`). Three features already ship on
this exact contract, and each is precedent for what a fourth ("neobrutalism")
would look like:

- **Dark mode** — a `[data-theme='dark']` block in `semantic.css:102-141`
  overriding every colour/shadow semantic token. Zero component changes.
- **Tenant accent colour** (RFC 0027/0032) — `runtime/src/instance-style.ts`
  computes an HSL accent + derived hover from an operator-picked hex and
  injects `--sv-color-accent`/`--sv-color-accent-hover` into a `:root`
  `<style>` block via `InstanceProvider`. Zero component changes.
- **Instance corner-radius preset** (RFC 0077) — `primitives.css:106-117`
  makes every `--sv-radius-*` token `calc(var(--sv-radius-scale) * ...)`;
  `instance-style.ts`'s `RADIUS_SCALE` lookup (`none: 0` … `l: 2.75`) emits
  `--sv-radius-scale` the same way. Also zero component changes — this is the
  RFC that established "a token nominally documented as 'theme-stable' can
  still become an instance-controlled exception" as a repo precedent.

So the mechanism this question is asking about isn't hypothetical — it's the
same lever already pulled three times.

### What's already swappable today, with no `packages/ui` code change at all

Because tokens are plain CSS custom properties, nothing _technically_ stops
an override at any selector, even for values `docs/design-system.md` labels
"primitive" and "theme-stable" (that label is a **documented convention**,
not a CSS-enforced restriction):

- **Colour** — `--sv-color-*` is the whole point of the semantic layer;
  trivially swappable to loud, saturated values.
- **Shadow shape, not just colour** — `--sv-shadow-card`/`-hover`/`-popover`/
  `-overlay`/`-control` (`semantic.css:82-87`) each hold a **full `box-shadow`
  value**, not a colour. Overriding `--sv-shadow-card:
4px 4px 0 var(--sv-black)` replaces a soft blurred elevation with a
  neobrutalist hard offset shadow in one line — no new token needed.
- **Corner radius** — `--sv-radius-scale: 0` already produces the "square
  corners" look site-wide (RFC 0077's own "None" preset).
- **Font family/weight** — `--sv-font-family` and `--sv-font-weight-*` are
  documented primitives, but are still literal `var()` references
  everywhere; overriding them under a scoped selector works today despite
  the "primitives are fixed" convention being a discipline, not a technical
  wall.

### What is _not_ tokenized — the real gaps

- **Border width is a hardcoded literal, not a token, almost everywhere.**
  `grep`-confirmed 39 hits across 29 component CSS Modules (`Card.module.css:9`,
  `Button.module.css:6`, `Input.module.css`, `Popover.module.css`,
  `Dialog.module.css`, etc.) all write `border: 1px solid var(--sv-color-...)`
  — the colour is themable, the **width is not**. `docs/design-system.md:274-278`
  documents this as a deliberate exception to "everything is a token"
  (hairline borders are exempt from `pnpm design:tokens:check`). Neobrutalism's
  signature 2–4px black outline on every element is the single biggest thing
  that cannot be reproduced by a pure token override today — it needs a new
  `--sv-border-width-*` token that component CSS switches to reference.
- **No tactile "press" interaction exists on `Button`.** Neobrutalist buttons
  typically shift `transform: translate(shadow-x, shadow-y)` and drop their
  shadow on `:active`, reading as a physical stamp. `Button.module.css`'s
  `:active` rules (lines 104-105, 120-121, 135-136, 151-152) only
  `color-mix()`-darken the background — and `Button` doesn't consume any
  `--sv-shadow-*` token at all today (only `Card`/`Popover`/overlays/`Toggle`
  do, per the semantic token table). Getting this needs an internal
  `Button.module.css` change — API-compatible (no new props), but still a
  real `packages/ui` component-code change, not a token-only one.
- **Only one themable brand colour.** `--sv-color-accent` is the sole
  instance-themable hue; status colours (error/red, warning/amber,
  success/green, info/blue) are fixed primitives never touched by
  `instance-style.ts`. Neobrutalism typically assigns different bold colours
  to different surfaces (a yellow button next to a pink card), which the
  current one-accent model can't express without new semantic tokens (e.g.
  `--sv-color-accent-2`, `--sv-color-surface-alt`).
- **`data-theme` is a hardcoded light/dark binary baked into platform code.**
  `runtime/src/theme-script.ts`'s pre-paint script computes
  `document.documentElement.dataset.theme = dark ? 'dark' : 'light'` — there
  is no third state, and the script is a **fixed string pinned by a CSP hash**
  (`THEME_SCRIPT_CSP_HASH`) specifically so it doesn't need a nonce. Making a
  third theme _user-selectable_ the way light/dark is today would require
  editing this file (plus `ThemeControl`, the theme cookie's type) — squarely
  `runtime/` platform code, which is exactly what this question asks to avoid.
- **The instance-theming delivery pipe is a closed allowlist, not an open
  channel.** `instance-style.ts`'s `buildInstanceStyle()` only ever emits
  four specific properties (logo, favicon, radius scale, accent [+ derived
  hover]) — there is no "arbitrary custom CSS" or "arbitrary token override"
  field an operator can fill in via Console today.
- **The "operators supply instance CSS" line in the docs doesn't correspond
  to a real feature.** `docs/design-system.md:120-122` says web fonts are
  "not loaded by the design system — operators must supply a `<link>` or
  `@font-face` via their instance CSS." `docs/self-hosting.md` has **zero**
  matches for "font" or "custom CSS" — there is no documented or
  implemented mechanism for an operator to inject either into a running
  instance. This line describes a capability that doesn't exist yet, not a
  working feature.
- **Standalone `@sovereignfs/ui` consumers are the one case with zero gaps
  today.** An app that isn't a Sovereign plugin (`docs/design-system.md`'s
  "Standalone usage" section, lines 423-525) owns its own `<head>` — it can
  load `@sovereignfs/ui/tokens.css` then layer any override stylesheet after
  it, right now, with no repo change at all. This gets 100% of "what's
  technically override-able" (everything in the "already swappable" list
  above), but doesn't reach an actual running Sovereign instance, where no
  equivalent injection point exists.
- **CI tooling doesn't block adding new tokens.** `pnpm design:tokens:check`
  (`scripts/design-tokens-check.ts`) only fails on `var(--sv-...)` references
  that don't resolve to a defined token, and on hardcoded colour literals —
  it does not restrict _adding_ new token definitions. Extending the token
  surface (e.g. a new border-width tier) is not blocked by anything
  mechanical.

## Options considered

**A — Operator-side override, standalone consumers only (today, zero repo
changes).** Works immediately for any app using `@sovereignfs/ui` outside the
Sovereign runtime. Doesn't help an actual self-hosted Sovereign deployment —
no injection point exists there.

**B — First-class opt-in "theme pack" inside `packages/ui`, design-system
level only.** A new semantic-token block scoped to a selector that doesn't
collide with `[data-theme]`'s light/dark binary (e.g. a separate
`[data-theme-variant='neobrutalism']` attribute or a wrapper class), plus the
additive `--sv-border-width-*` token, plus the internal (non-API)
`Button.module.css` press-effect change. Zero `runtime/` changes, zero
component prop changes, ships as an additive/non-breaking `packages/ui` minor
bump — matches the stated constraint exactly. **The catch:** `packages/ui`
can _define_ a theme but can't _activate_ itself — nothing in `runtime/`
today would ever set `data-theme-variant` on anything, so this alone ships a
theme nobody sees unless something (a plugin's own root class, a Storybook
toggle) turns it on.

**C — Full RFC 0077-style operator-facing preset.** Mirror the radius-preset
pattern exactly: a Console dropdown, an `instance_config` column, wiring
through `InstanceProvider`. This is what actually makes the theme reachable
by a real instance admin with a UI — but it is explicitly `runtime/` platform
code (schema, `InstanceProvider`, Console form), which is outside this
question's stated constraint. Would need its own RFC, following RFC 0077
almost verbatim.

**D — Approximate it with only today's already-shipped, already
operator-facing knobs.** Console's existing accent-colour + radius-preset
fields, set to a loud colour and `--sv-radius-scale: 0`, reach a live
instance **today with zero repo changes of any kind**. This is the ceiling of
"zero code, live instance, right now" — but it can't get thick borders,
can't get a multi-colour palette, can't get the tactile press effect, and
can't touch type. It reads as "a bold monochrome-plus-one-colour square
theme," not an authentic neobrutalist skin.

## Recommendation

Option B is the one that actually matches what was asked — a design-system-
level addition, no platform code, no API changes — and it's genuinely
additive/non-breaking, consistent with how dark mode, RFC 0027, and RFC 0077
were all shipped. Two things are worth fixing on their own merits regardless
of whether neobrutalism specifically goes anywhere:

1. The border-width tokenization gap. Any future theme wanting a different
   stroke weight hits the same wall; the fix (a
   `--sv-border-width-hairline/thick` pair or similar, referenced instead of
   the literal `1px` across ~29 files) is small and independently useful.
2. `docs/design-system.md:120-122`'s "operators must supply instance CSS"
   line — either build the mechanism it implies, or soften the claim so the
   doc stops describing a feature that isn't there.

Activation (Option B vs. C — i.e. whether a real user ever sees this) is
deliberately a separate, later decision. Validate the visual design first
(e.g. via Storybook's existing Themes toolbar, extended with a variant
control alongside light/dark — `docs/design-system.md:1675-1679`) before
deciding whether it graduates toward Option C.

## Open questions

- **Where does a "theme variant" live structurally** — extending
  `[data-theme]` into a broader enum, or a wholly separate attribute/class?
  Light/dark (colour-scheme preference) and "brand skin" (structural visual
  identity) read as orthogonal axes — you'd presumably want a neobrutalist
  variant in both a light and dark form — which argues for a second,
  independent selector rather than overloading `data-theme`.
- **Is border-width theme-stable (one more built-in preset, like radius was
  before RFC 0077) or operator-tunable (a whole new RFC-0077-shaped knob)?**
  Depends entirely on whether the ambition stops at "ship one more built-in
  look" or extends to "let any operator dial stroke weight."
- **Is the `Button` press-interaction change safe to ship as a small,
  universally-available enhancement**, usable by any theme including today's
  default, or should it be strictly gated behind the new variant selector so
  the shipped default never gets a surprise motion change?
- **How would anything actually turn the variant on, concretely?** Nothing in
  `runtime/` sets any such attribute today. Even at exploratory stage this
  needs a real answer (a documented dev-only Storybook toggle is enough to
  make the doc useful; a live instance needs Option C).
- No established process exists yet for visually validating a token-level
  change across every consuming surface — `Card.module.css:1-6`'s own comment
  notes a site-wide `Card` change was left alone specifically because "no
  visual regression tooling exists yet to verify" (epic task 9.14, not
  landed, as of this doc's writing). A theme-pack change touching every
  component at once has a larger blast radius than that single-component
  case and would want the same kind of verification this comment already
  flags as missing.

## Next steps

**Graduated.** The recommendation was accepted, and scoped up from "a
neobrutalism theme" to "a generic, closed set of built-in theme presets,
neobrutalism first" — a deliberate generalization of this doc's Option B.
Split into two RFCs exactly as anticipated:

- [RFC 0094](../rfcs/0094-design-system-theme-presets.md) — the
  `packages/ui`-only mechanism (new tokens, the preset data source, the
  `neobrutalism` preset itself, the `Button` internal change), inert until
  activated.
- [RFC 0095](../rfcs/0095-instance-theme-preset-selection.md) — the
  `runtime`/`packages/db`/Console wiring that makes a preset operator-
  selectable, depending entirely on RFC 0094.

Both are Draft, documentation-first, pending scheduling — this doc's findings
and file:line citations remain the grounding for both RFCs' "Current state"
sections rather than being restated there.
