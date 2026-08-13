---
docSection: contributors
docType: guide
audiences:
  - contributor
---

# Visual regression testing

Sovereign uses [Playwright](https://playwright.dev) screenshot comparisons for local visual
regression testing, per [RFC 0059](rfcs/0059-local-visual-regression-testing.md). It has two
tiers:

- **Tier 1 — component visuals** (`packages/ui/__tests__/visual/`): a curated baseline set of
  `@sovereignfs/ui` components and gallery screens, captured directly against Storybook's
  isolated iframe. No app, no database.
- **Tier 2 — runtime smoke** (root `__tests__/visual/`): a small cross-runtime suite covering
  auth, shell/Launcher, Account, Console, overlay presentation, and mobile nav layout.

Both tiers are deliberately **not exhaustive**. Behavior and data correctness stay the job of
unit tests and [`__tests__/e2e/`](testing-e2e.md) — visual tests exist only to catch accidental
layout/style regressions in a stable, curated set of screens.

## Running locally

```bash
# Everything (Tier 1 then Tier 2):
pnpm test:visual

# Tier 1 only — fast, no app/DB required:
pnpm --filter @sovereignfs/ui test:visual

# Tier 2 only:
playwright test --config=playwright.visual.config.ts

# Update baselines intentionally (never run this as a side effect of a normal check):
pnpm test:visual:update
```

Tier 1 starts its own Storybook dev server (`storybook:visual`, port `6100` — distinct from
the regular `storybook` script's `6006`, so both can run side by side). Tier 2 reuses
`__tests__/e2e/global-setup.ts` and `fixtures.ts` for pre-authenticated pages, so it needs the
same local setup as `pnpm test:e2e` (sqld running — see `pnpm dev`'s own sqld bootstrap, or
`docker-compose.yml`).

## Baseline update workflow

Screenshot baselines (`*-snapshots/*.png`) are source artifacts, committed to the repo. Updating
them is an intentional review act:

1. Make the intended visual change.
2. Run `pnpm test:visual:update` (or the scoped Tier 1/Tier 2 variant).
3. **Review the diff.** A baseline PNG changing is a real part of the code review — look at the
   actual image diff, don't just accept it because the command ran.
4. Commit the updated `*-snapshots/*.png` files alongside the change that caused them.

`pnpm test:visual` (no `:update`) is what CI runs, and what you should run before any PR that
touches `packages/ui`, the runtime shell, or a first-party plugin's layout — it fails loudly on
any unintended diff, with expected/actual/diff images attached to the failure.

## Known limitation — cross-platform font rendering

Playwright's snapshot filenames are platform-suffixed (`*-darwin.png` on macOS, `*-linux.png` in
CI). This repo's committed baselines were generated on macOS. A Linux CI run will not find a
matching baseline and fails with "snapshot doesn't exist" rather than a real pixel diff — this
is expected until a maintainer runs `pnpm test:visual:update` once from a Linux environment
(`.github/workflows/visual.yml` supports this via `workflow_dispatch` with
`updateSnapshots: true`) to produce the matching `-linux.png` baselines. Font rendering differs
enough between the two that macOS-generated baselines cannot be reused as-is for a Linux
comparison; `expect.toHaveScreenshot`'s `maxDiffPixelRatio: 0.02` tolerance absorbs run-to-run
anti-aliasing noise on the _same_ platform, not cross-platform differences. See RFC 0059's open
question on per-platform tolerance policy.

**Practical effect:** until that calibration pass happens, `pnpm test:visual` is a local
developer check (or a CI check run manually / via `workflow_dispatch`), not a blocking gate —
`.github/workflows/visual.yml` is `workflow_call`-only and intentionally not wired into
`publish-images.yml` yet, unlike `e2e.yml`.

## Filename convention

Visual specs use `*.visual.spec.ts`, not [RFC 0010](rfcs/0010-test-organization.md)'s originally
reserved `*.visual.test.tsx` — the latter would match Vitest's `*.test.{ts,tsx}` include globs
(`vitest.config.ts`), and Vitest would then try to run a Playwright-only spec file as a unit
test. `*.spec.ts` mirrors `__tests__/e2e/`'s own convention and is excluded from Vitest's
`include` the same way. `vitest.config.ts` also explicitly excludes both visual test
directories, documenting the intent rather than relying only on the suffix mismatch.

## What's covered

### Tier 1 — `packages/ui/__tests__/visual/components.visual.spec.ts`

Design System Overview (component gallery) and Token Gallery screens, plus one representative
state each for: NavTabs (default + the mobile many-tabs layout), PageHeader, Card (interactive),
FormField (error state), Checkbox (disabled+checked), EmptyState, Avatar. Light and dark theme
for every entry except the mobile-only NavTabs case.

### Tier 1 — `packages/ui/__tests__/visual/overlays.visual.spec.ts`

Open/visible states for Dialog, Drawer, and Popover — these only render their interesting visual
state on interaction, so a default-args screenshot alone would just show a closed trigger
button. Both themes.

### Tier 2 — root `__tests__/visual/`

| Spec                        | Covers                                                         |
| --------------------------- | -------------------------------------------------------------- |
| `auth.visual.spec.ts`       | Unauthenticated login page                                     |
| `shell.visual.spec.ts`      | Launcher grid (desktop), shell header/footer (mobile viewport) |
| `account.visual.spec.ts`    | Account profile (full-page fallback) and overlay presentation  |
| `console.visual.spec.ts`    | Console settings and system health pages                       |
| `mobile-nav.visual.spec.ts` | Mobile apps drawer, open state                                 |

## Adding a new visual test

Add one when a component or screen's visual contract is stable enough to be worth protecting —
not for every prop permutation. Per RFC 0059:

- Prefer masking or seeding away dynamic content (timestamps, random IDs) over accepting a noisy
  diff.
- Keep Tier 2 additions to layout-level smoke, not full workflow coverage — that's e2e's job.
- No broad React DOM snapshots (`toMatchSnapshot()` on a rendered component/page) — see RFC
  0059's snapshot policy for the narrow cases where a text snapshot (not a screenshot) is
  appropriate (generated registries, manifest validation output, normalized email HTML/text,
  config JSON).
