# Epic 2: Design System

> `@sovereignfs/ui` working in the new workspace, published from it, and grown
> with whatever core's pages need.

## Status

📋 Planned

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

#### 📋 2.1 — ui, bridge and mailer build in the new workspace

**Goal:** The imported packages build, test and run their tooling here.

**Deliverables:**

- Remove the three `!packages/…` exclusions from `pnpm-workspace.yaml`, and the
  matching entries in `.prettierignore`, `eslint.config.ts`, `tsconfig.json`,
  `vitest.config.ts` and
  `scripts/lib/doc-links.ts` (for `docs/design-system.md` and the four imported
  scripts too); add to the catalog whatever the three packages need (Storybook,
  dnd-kit, testing-library, tsup, Playwright, jsdom…) at current releases
- `packages/ui`, `packages/bridge`, `packages/mailer` resolve their
  dependencies from the new catalog and `packages/tsconfig`
- **`bridge` stops depending on the removed SDK:** it imports types from
  `@sovereignfs/sdk/device-bridge` (a 129-line module of types and
  registration); move that module into `packages/bridge` and delete the
  `@sovereignfs/sdk` dev dependency. (`ui` only mentions the SDK in comments, so
  needs no code change.)
- Root scripts `generate:icons`, `generate:theme-presets` and
  `design:tokens:check` wired up; the token check pointed at `apps/core` and
  `packages/` instead of legacy paths
- Storybook runs and builds
- `docs/design-system.md` (already imported from legacy with its history)
  adapted to this repository: plugin wording and legacy paths (`runtime/`,
  `plugins/`) replaced with core's

**Dependencies:** 0.1

**Spec reference:** §1.3

**Review checklist:**

- `pnpm build`, `pnpm test` and `pnpm typecheck` pass for all three packages
- `pnpm install --frozen-lockfile` still works with the exclusions gone
- No file under `packages/` mentions `@sovereignfs/sdk` except in prose that explains why
- `pnpm design:tokens:check` passes and fails on a hard-coded colour

#### 📋 2.2 — Publishing and licence

**Goal:** `@sovereignfs/ui` and `@sovereignfs/bridge` keep their npm names and
release from this repository, under MPL-2.0.

**Deliverables:**

- Package licences changed to MPL-2.0, with a `LICENSE` in each package; the
  `NOTICE` carrying Lucide's ISC licence kept
- A release path for each package (the release workflow itself is decided
  separately)
- Storybook deployment from this repository

**Dependencies:** 2.1

**Spec reference:** —

**Review checklist:**

- A dry-run publish of each package succeeds
- `package.json` and `LICENSE` agree for every package

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
