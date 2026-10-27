# Epic 2: Design System

> `@sovereignfs/ui` working in the new workspace, published from it, and grown
> with whatever core's pages need.

## Status

⏳ In Progress

## Overview

Every page core serves is built from `@sovereignfs/ui` (spec §1.3). The
package arrived with its full history from the legacy repository and does not
build here yet. This epic makes it build, keeps its npm releases going from
the new repository, and adds the components core needs, in the design system
first.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §1.3
- `packages/ui/README.md`

## Tasks

#### ✅ 2.1 — ui, bridge and mailer build in the new workspace

**Goal:** The imported packages build, test and run their tooling here.

**Deliverables (as built):**

- The three `!packages/…` exclusions are gone from `pnpm-workspace.yaml`, and so
  are the matching entries in `.prettierignore`, `eslint.config.ts`,
  `tsconfig.json`, `vitest.config.ts` and `scripts/lib/doc-links.ts` (for
  `docs/design-system.md` and the imported scripts too). The catalog now holds
  what the packages need: tsup 9, jsdom, Testing Library, Playwright, dnd-kit,
  nodemailer, `@react-email/*`, and a named `storybook` catalog that keeps
  Storybook's packages on one version. `lucide` is pinned exactly at the root
  because it generates the icon components
- `packages/ui`, `packages/bridge` and `packages/mailer` resolve their
  dependencies from the catalog and `packages/tsconfig`. The imported code is
  formatted with the repository's Prettier and passes its ESLint (strict, with
  the accessibility rules)
- **`bridge` has no SDK.** The contract it took from `@sovereignfs/sdk` (the
  types and `provideBridge`/`getBridge`) is now `packages/bridge/src/device-bridge.ts`,
  with no imports, so the package still ships with no runtime dependencies. The
  registration key is `@sovereignfs/bridge:registered`. `ui` only mentioned the
  SDK in comments and story text, which now say what the caller passes in
- tsup 9 builds the declaration files without the `ignoreDeprecations` workaround
  the older tsup needed under TypeScript 6, so the workaround is gone
- `pnpm design:tokens:check`, `generate:icons` and `generate:theme-presets` are
  wired up, and `verify:push` and CI run the token check. The token check is now
  a tested library (`scripts/lib/design-tokens.ts`) that scans `packages/ui/src`
  and `apps/`; the generators format their output with Prettier, so a
  regeneration is a no-op. Regenerating with the pinned `lucide` changed two
  committed icons (`beef`, `circle-check`) to the pinned version's drawings
- The unit tests of all three packages run in the repository's `unit` project
  (`.tsx` included; a test opts into jsdom with a pragma)
- `pnpm storybook` and `pnpm build-storybook` run from the root; the dev server
  serves the stories and the static build succeeds; CI builds it with the
  packages
- `docs/design-system.md` is adapted: plugin wording, legacy paths and legacy
  references replaced with core's, and the Storybook deployment left to task 2.2.
  Legacy RFC and task numbers that remain in code comments and stories point at
  the legacy repository and are left as history

**Dependencies:** 0.1

**Spec reference:** §1.3

**Review checklist:**

- `pnpm build`, `pnpm test` and `pnpm typecheck` pass for all three packages
- `pnpm install --frozen-lockfile` still works with the exclusions gone — also
  on `node:alpine` (musl)
- No file under `packages/` mentions `@sovereignfs/sdk`
- `pnpm design:tokens:check` passes, and fails on a hard-coded colour and on an
  undefined token (a test, and seen on a real component)
- The built `bridge` runs under plain Node and has no dependencies

#### ✅ 2.2 — Publishing and licence

**Goal:** `@sovereignfs/ui` and `@sovereignfs/bridge` keep their npm names and
release from this repository, under MPL-2.0.

**Deliverables (as built):**

- Every package under `packages/` declares MPL-2.0 and carries the licence text in its own
  `LICENSE` (the same file everywhere); `apps/core` and the repository stay
  AGPL-3.0-or-later. The design system keeps its `NOTICE` with Lucide's ISC licence, listed
  in `files`. A test (`scripts/__tests__/licences.test.ts`) keeps each `package.json` and
  `LICENSE` in agreement, and the README says the same
- The published packages ship `dist/` and their licence and README only (no `src`, tests or
  stories: `ui` shipped its source before), with `repository`, `homepage` and `bugs`
  pointing at this repository; `bridge` has a README now
- A release path, documented in `docs/releasing.md`: what is published, how the version is
  set, `pnpm packages:check` (packs each published package, checks the tarball with a tested
  checker, and runs the real `pnpm publish --dry-run`; it runs in CI after the build), and
  the manual release steps a maintainer follows until the release workflow is decided
- Storybook deployment from this repository: `.github/workflows/storybook.yml` builds it and
  publishes it to the dedicated `sovereignfs/storybook` repository (the existing
  <https://sovereignfs.github.io/storybook/>, unchanged) when a `sb-v*` tag is pushed or the
  workflow is started by hand, using the Actions secret `STORYBOOK_DEPLOY_TOKEN` (a personal
  access token that can write to that repository, as the old repository's workflow did). This
  repository's own Pages settings are not used

**Not here:** the automated release workflow and npm provenance, which are decided
separately, and publishing anything: no release was made.

**Dependencies:** 2.1

**Spec reference:** —

**Review checklist:**

- A dry-run publish of each package succeeds (`pnpm packages:check`: `ui` and `bridge`)
- `package.json` and `LICENSE` agree for every package (the licence test)
- The checker fails on what it should: a missing licence, an entry point pointing at
  source, a file that must not ship, a workspace dependency; seen on the real packages
- actionlint is clean on the new workflow, and zizmor reports only the `./` style finding
  kept on purpose; the deploy runs with the token configured

#### 📋 2.3 — Components core needs `[parallel]`

**Goal:** Anything a core page needs that the design system lacks is added to
`packages/ui` first.

**Deliverables:**

- New or extended components, each with a story and a gallery entry, as the
  pages in epics 4, 7, 8 and 9 reveal them

**Dependencies:** 2.1; runs alongside M1 and M2

**Spec reference:** §1.3

**Review checklist:**

- No component used by core is defined inside `apps/core`
- Each new component has a story and passes the a11y lint
