# Design System Stabilization Proposal

This proposal captures follow-up work from the design system review. The goal is
to make `@sovereignfs/ui` a stricter, more reliable public contract for platform
screens and third-party plugins.

The current direction is solid: semantic CSS tokens, dark-mode mapping, CSS
Modules, Storybook coverage, a11y/theming decorators, and a useful set of
RSC-safe primitives are already in place. The main gaps are enforcement,
undefined token drift, accessibility wiring in a few primitives, and inconsistent
adoption across Account, Console, and runtime shell screens.

## Goals

- Keep the token contract trustworthy for plugin authors.
- Prevent undefined or private token usage from shipping.
- Make core form/control primitives accessible by default.
- Reduce duplicate local button/input/select/tab/card CSS in platform plugins.
- Add repeatable checks so design drift is caught before visual review.

## Non-goals

- Redesign the visual language.
- Replace CSS Modules.
- Introduce Tailwind, CSS-in-JS, or a large component dependency.
- Build a full enterprise component library before the platform needs it.
- Force every bespoke shell control into `@sovereignfs/ui` when it is genuinely
  shell-specific.

## Current State

`packages/ui` currently provides:

- token files: `tokens/primitives.css`, `tokens/semantic.css`, and
  `tokens.css`;
- primitives: `Button`, `Input`, `Select`, `Toggle`, `SegmentedControl`,
  `Tabs`, `NavTabs`, `Dialog`, `Drawer`, `Popover`, `Toast`, `Badge`, `Card`,
  `PageHeader`, `EmptyState`, `Avatar`, `Icon`, `Spinner`, `SystemBanner`,
  `Tooltip`, `FormField`;
- Storybook stories for core components, token gallery, mobile patterns, and
  design-system overview;
- a11y and theme decorators in Storybook;
- component tests for many interactive primitives.

The runtime imports `@sovereignfs/ui/tokens.css` globally, so semantic tokens are
available to platform screens and plugins.

## Findings

### 1. Undefined tokens are used in shipped CSS

Several CSS files reference tokens that are not defined in the current token
files:

- `--sv-color-text-secondary`
- `--sv-color-text-tertiary`
- `--sv-font-size-base`
- `--sv-color-on-accent`
- `--sv-color-surface-subtle`
- `--sv-color-accent-subtle`
- `--sv-color-error`

Some usages include fallbacks, but others do not. The highest-risk examples are
inside `packages/ui` itself, such as `Toast.module.css`, because third-party
plugins inherit those defects when consuming the package.

### 2. The token contract is documented but not enforced

`docs/design-system.md` states that components must use `--sv-*` tokens and that
hardcoded colour, spacing, or radius values are bugs. `packages/ui/package.json`
does not currently expose a token validation or lint script, so undefined tokens
and literal drift can land unnoticed.

### 3. `FormField` does not associate hint/error text with the control

`FormField` computes `aria-describedby` IDs, but applies them to a wrapper
`<div>` around the child instead of to the input/select/textarea itself. Screen
readers may not announce hints or errors as part of the control.

### 4. Adoption is inconsistent across platform plugins

Account and Console still define many local versions of controls and page
patterns already available in `@sovereignfs/ui`:

- local `.button`, `.input`, `.select`;
- custom tab/nav styles;
- repeated card/table/header patterns;
- bespoke status chips and feedback banners.

This creates visual consistency at a glance, but not a true system contract.
Each local pattern must be audited and fixed separately.

### 5. Some scale exceptions are not documented

The design-system docs allow tiny fixed pixel values for control details, but
some component CSS uses values such as `13px` padding. If intentional, these
exceptions should be documented; if not, they should be converted to token-based
values.

## Proposed Work

### 1. Normalize Token Names

**Goal:** eliminate undefined token references and decide whether aliases should
exist.

Recommended mapping:

| Current usage               | Preferred token                            |
| --------------------------- | ------------------------------------------ |
| `--sv-color-text-secondary` | `--sv-color-text-muted`                    |
| `--sv-color-text-tertiary`  | `--sv-color-text-subtle`                   |
| `--sv-font-size-base`       | `--sv-font-size-md`                        |
| `--sv-color-on-accent`      | `--sv-color-text-on-accent`                |
| `--sv-color-error`          | `--sv-color-error-text`                    |
| `--sv-color-surface-subtle` | `--sv-color-surface-sunken`                |
| `--sv-color-accent-subtle`  | add explicit semantic token only if needed |

Technical options:

1. **Strict cleanup:** replace all undefined references with existing tokens and
   do not add aliases.
2. **Compatibility aliases:** define aliases in `semantic.css` for common
   historical names, then migrate usages over time.

Recommendation: use strict cleanup for `packages/ui`; consider compatibility
aliases only if published plugin compatibility requires them.

Acceptance criteria:

- No undefined `--sv-*` token references in `packages/ui/src`.
- No undefined token references in runtime or first-party plugins unless they
  have explicit fallback values and are scheduled for cleanup.
- `docs/design-system.md` matches the final token vocabulary.

Priority: high.

Effort: low.

### 2. Add Token Validation

**Goal:** make undefined token usage and hardcoded design values detectable.

Add a script, for example:

```bash
pnpm design:tokens:check
```

Suggested implementation:

- scan CSS/TSX files for `var(--sv-...)`;
- parse defined tokens from `packages/ui/src/tokens/*.css`;
- fail on undefined tokens unless explicitly allowlisted;
- optionally warn on hardcoded hex/rgb values in `packages/ui/src/components`;
- allow rgba/composed shadows only inside token files, or via an explicit
  allowlist;
- run in CI after typecheck.

Initial scope should be `packages/ui/src`. After cleanup, extend to:

- `runtime/app`;
- `plugins/account`;
- `plugins/console`;
- generated plugin templates.

Acceptance criteria:

- CI fails when a component references an undefined token.
- CI fails when a component introduces hardcoded colour literals outside allowed
  files.
- The script is documented in `docs/design-system.md`.

Priority: high.

Effort: medium.

### 3. Fix `FormField` Accessibility

**Goal:** make label, hint, error, required, and invalid state wiring reliable.

Preferred API:

```tsx
<FormField label="Email" hint="Used for sign-in">
  {(field) => <Input {...field.inputProps} type="email" />}
</FormField>
```

Where `field.inputProps` includes:

- `id`;
- `aria-describedby`;
- `aria-invalid`;
- `aria-required` or `required`.

Alternative: keep the existing child API and clone a single valid React element
to inject props. Render-props are more explicit and avoid ambiguous multi-child
cases.

Acceptance criteria:

- Hint and error text are announced with the associated control.
- Tests cover hint, error, required, and custom `id` behavior.
- Examples in Storybook and docs use the new accessible pattern.

Priority: high.

Effort: medium.

### 4. Standardize Core Form Controls

**Goal:** reduce local form styling in Account and Console.

Migrate common controls to design-system primitives:

- `Button`
- `Input`
- `Select`
- `Toggle`
- `SegmentedControl`
- `FormField`
- `SystemBanner`

Add missing primitives before migration if needed:

- `Textarea`
- `Checkbox`
- `RadioGroup`
- `Fieldset`
- `InlineAlert`

`Textarea` and `Checkbox` should be added early because current screens use
native textarea/checkbox controls with repeated local CSS.

Acceptance criteria:

- Account and Console no longer define generic `.button`, `.input`, `.select`,
  or `.textarea` styles for new work.
- Existing local styles remain only for layout or domain-specific composites.
- Plugin development docs show the design-system form pattern.

Priority: medium-high.

Effort: medium.

### 5. Consolidate Navigation and Page Patterns

**Goal:** use shared page structure primitives for first-party plugins.

Targets:

- replace custom Account/Console tab strips with `NavTabs` where practical;
- use `PageHeader` for page-level title/description/action layout;
- use `Card`, `Badge`, and `EmptyState` for repeated item patterns;
- preserve shell-specific controls separately when they do not belong in
  `@sovereignfs/ui`.

Acceptance criteria:

- Account and Console use shared primitives for top-level page headers and tab
  navigation.
- Repeated status chips use `Badge` unless they need a domain-specific
  composite.
- New plugin templates demonstrate the shared layout primitives.

Priority: medium.

Effort: medium.

### 6. Add Design-System Test and Storybook Checks

**Goal:** make component quality measurable.

Work:

- add a package-level test script for `packages/ui`;
- add Storybook build to CI if not already present;
- run Storybook a11y checks for key stories where practical;
- add visual or DOM smoke tests for core components:
  - Button variants and disabled state;
  - FormField hint/error association;
  - Dialog/Drawer focus behavior;
  - Toast live-region behavior;
  - Select and Toggle accessibility.

Acceptance criteria:

- `packages/ui` has scripts for `test`, `typecheck`, `build`, and token checks.
- CI runs the non-visual checks.
- Storybook remains the visual review surface for component changes.

Priority: medium.

Effort: medium.

### 7. Document Extension Rules for Plugin Authors

**Goal:** make the design system easier for plugin authors to follow.

Add or update docs with:

- when to use a primitive versus local CSS;
- how to create local composite components using primitives;
- token naming rules;
- examples for forms, settings pages, tables, empty states, and destructive
  actions;
- a short "do not" list:
  - no primitive colour tokens in plugin CSS;
  - no hardcoded hex colours;
  - no custom focus-ring removal;
  - no card-inside-card layouts;
  - no unlabelled icon-only controls.

Acceptance criteria:

- `docs/plugin-development.md` includes a practical UI section.
- `docs/design-system.md` remains the contributor/spec reference.
- Plugin templates use the documented patterns.

Priority: medium.

Effort: low-medium.

## Suggested Sequencing

### Phase 1 — Contract Cleanup

1. Replace undefined token usages in `packages/ui`.
2. Replace or alias undefined token usages in runtime and first-party plugins.
3. Add token validation script.
4. Wire the script into CI.

### Phase 2 — Accessibility and Missing Primitives

1. Fix `FormField`.
2. Add `Textarea`.
3. Add `Checkbox`.
4. Add tests and stories for the updated form pattern.

### Phase 3 — First-Party Adoption

1. Migrate Account forms and settings controls.
2. Migrate Console forms, status chips, page headers, and nav tabs.
3. Update plugin templates and docs.

### Phase 4 — Quality Gate

1. Add package-level UI tests.
2. Build Storybook in CI.
3. Add a lightweight component checklist to PR review docs.

## Risks and Tradeoffs

- **Alias compatibility vs strictness:** aliases reduce breakage but can prolong
  token vocabulary drift.
- **Primitive migration churn:** converting first-party screens touches many
  files; do it in focused batches to avoid mixing visual cleanup with behavior
  changes.
- **Over-generalizing components:** avoid adding large abstractions for one-off
  layouts. Prefer primitives plus local composition.
- **Storybook CI cost:** start with token checks and unit tests; add full
  Storybook/a11y checks once runtime cost is acceptable.

## Definition of Done

The design system stabilization work is complete when:

- `packages/ui` has no undefined token references;
- token checks run in CI;
- `FormField` correctly wires labels, descriptions, and errors;
- Account and Console use shared primitives for common controls and page
  structure;
- docs and plugin templates show the recommended patterns;
- new component work has tests, stories, and token-safe CSS.
