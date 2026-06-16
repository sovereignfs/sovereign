# RFC 0010 — Test file organization

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `vitest.config.ts`, all `*.test.ts(x)` locations, a new root `/__tests__/`, `package.json` test scripts, CLAUDE.md + CONTRIBUTING test conventions\
**Incorporated into plan:** Yes — **Task 0.5.16** (decision-log row in SRS §6). The file moves + Vitest glob/script changes + CLAUDE.md/CONTRIBUTING updates land in that task.

---

## Summary

Adopt an **intentional, boundary-aware test layout** as the suite grows to span
unit, integration, e2e (future), and visual (future) tiers. The organizing
principle is: **a test's placement follows the boundary it crosses, not its
"type" label.**

- Tests that belong to **one workspace package** live **inside that package** in
  per-directory `__tests__/` folders.
- Tests that belong to **no single package** — cross-service integration and
  e2e — live at the **root `/__tests__/`**.

| Test kind                             | Location                                       | Naming                              |
| ------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| Unit, component, **visual** (future)  | per-dir `__tests__/` inside the owning package | `*.test.ts(x)`, `*.visual.test.tsx` |
| **Within-package** integration        | the owning package's `__tests__/`              | `*.integration.test.ts`             |
| **Cross-service** integration         | root `/__tests__/integration/`                 | `*.integration.test.ts`             |
| **E2e** (Playwright, future)          | root `/__tests__/e2e/`                         | `*.e2e.ts` / `*.spec.ts`            |
| Postgres parity (existing, env-gated) | stays in its package                           | `*.pg.test.ts` (unchanged)          |
| docs-parity / schema-parity           | stay in `runtime` / `packages/db` `__tests__/` | unchanged                           |

## Motivation

Today all 31 test files are **flat-co-located** (`*.test.ts(x)` directly beside
source) under a single root `vitest.config.ts`. That is fine for a unit-only
suite, but as e2e and visual tiers arrive the flat layout gives no signal of a
test's _kind_ or _scope_, and offers no obvious home for tests that span the
runtime ↔ auth boundary or drive a browser. This RFC introduces structure
**before** those tiers land, so the conventions exist when the first e2e/visual
test is written — without disturbing the lean current suite.

## Current state (what this builds on)

- **Single root config** — `vitest.config.ts` with workspace-wide `include`
  globs (`packages/**/src`, `apps/**/src`, `runtime/src`, `plugins/**`,
  `scripts/**`, `bin/**`); `environment: 'node'` by default with components
  opting into jsdom via a `// @vitest-environment jsdom` pragma;
  `classNameStrategy: 'non-scoped'` for CSS-module assertions.
- **31 test files, 100% flat-co-located**, clustered in `packages/*`,
  `runtime/src`, `apps/auth/src`, `bin`, `scripts`, `plugins/*`.
- **Env-gated Postgres parity** tests (`*.pg.test.ts`) — skipped unless
  `TEST_DATABASE_URL` is set (CONTRIBUTING documents this).
- **Special validators:** `runtime/src/docs-parity.test.ts`,
  `packages/db/src/schema/parity.test.ts`.
- **No e2e / visual tooling yet** — no Playwright/Cypress/Storybook;
  `@testing-library/react` is used for jsdom component tests only.
- **`pnpm test` runs Vitest from root** (`vitest run`); turbo has no `test` task.
- CLAUDE.md documents the current convention as "co-located `*.test.ts`".

## Proposed design (the layout is deferred; this RFC settles the convention)

### The boundary rule

In a pnpm + Turborepo monorepo, a test belongs to the **package that owns the
code under test**, so it stays near its subject and can run/cache per package.
The root `/__tests__/` is reserved for tests that belong to **no** single package
— full-stack flows that wire runtime and auth together, and browser e2e. This is
why "integration" is **not** one location: a test that integrates two modules
**within** `packages/db` is a package-local test; a test that exercises
runtime → auth over HTTP is a root test. Placement tracks the widest boundary the
test crosses.

### Within a package

Unit, component, and (future) visual tests move from flat co-location into
per-directory `__tests__/` folders beside the code they cover, e.g.
`packages/ui/src/components/__tests__/Button.test.tsx`. Within-package
integration tests live in the same `__tests__/` folders, distinguished by the
`*.integration.test.ts` suffix. The existing special validators (`docs-parity`,
`schema-parity`) and the env-gated `*.pg.test.ts` parity tests are package-local
and **stay in their packages** (moved into `__tests__/`, names unchanged).

### At the root

`/__tests__/integration/` for cross-service integration and `/__tests__/e2e/` for
browser e2e (with `/__tests__/visual/` reserved for visual regression). These are
created empty (with a short README) now; they fill as those tiers are built.

### Naming & disambiguation

Filename suffixes let a tier be targeted independently of location:
`*.test.ts(x)` (unit/component), `*.integration.test.ts`, `*.visual.test.tsx`,
`*.e2e.ts` (or Playwright `*.spec.ts`), and the existing `*.pg.test.ts`.
Companion scripts — `test` (all), `test:unit`, `test:integration`, `test:e2e` —
select tiers. Optionally adopt **Vitest "projects"** to give node, jsdom, and
e2e their own environments/config; whether to do that now or stay glob-only is an
open question.

### Tooling reservations (future — no dependencies added now)

E2e is expected to be **Playwright**; visual regression either Playwright
screenshots or Storybook/Chromatic. This RFC only reserves the `/__tests__/{e2e,
visual}` locations and the naming; the tools are chosen and added when those
tiers are actually built.

## Impact when performed (deferred to a later mechanical task)

- Move the ~31 flat-co-located test files into per-directory `__tests__/` folders
  within their packages.
- Update `vitest.config.ts` `include` to match `**/__tests__/**/*.test.{ts,tsx}`
  inside packages **plus** `__tests__/**` at the root; keep `classNameStrategy`
  and the jsdom pragma working.
- Add the root `/__tests__/{integration,e2e}` scaffolding (+ a README) and the
  `test:*` scripts.
- Update the CLAUDE.md tech-stack/"co-located `*.test.ts`" line and the
  CONTRIBUTING testing section to describe the new layout.
- `*.pg.test.ts`, `docs-parity`, and `schema-parity` stay within their packages
  (relocated into `__tests__/`, behavior unchanged). No turbo `test` task is
  required (a per-package task can be added later if caching is wanted).

This is a single mechanical pass; done in one PR so the suite never sits
half-moved.

## Alternatives considered

1. **All tests by type at the root** (`/__tests__/{unit,integration,e2e}`).
   Centralized and simple to picture, but it divorces package-local tests from
   their code and from per-package run/caching — a regression in a monorepo.
   Rejected.
2. **Keep flat side-by-side co-location** (status quo). Zero churn, but gives no
   signal of test kind/scope and no home for cross-service/e2e tests. Rejected in
   favour of the `__tests__/` folder layout.
3. **Put all "integration" in one place.** Rejected — integration spans a
   spectrum from two modules in one package to two services over HTTP; one
   location is wrong for half of them. Hence the boundary rule.

## Open questions

1. **Vitest "projects" now vs glob-only.** Adopt projects to separate
   node/jsdom/e2e environments immediately, or defer until e2e lands?
2. **Visual-test suffix.** `*.visual.test.tsx` vs a Storybook-driven convention.
3. **Within-package integration form.** Suffix (`*.integration.test.ts`,
   proposed) vs a `__tests__/integration/` subfolder per package.
4. **E2e tool.** Confirm Playwright when the tier is built.

## Changelog

| Version | Date     | Change                                                                           |
| ------- | -------- | -------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; boundary-based layout, per-dir `__tests__/`, root `/__tests__/`.  |
| 1.0     | Jun 2026 | Accepted; incorporated into the build plan (Task 0.5.16) and a decision-log row. |
| 1.1     | Jun 2026 | Implemented in Task 0.5.16 (merged to `main`).                                   |
