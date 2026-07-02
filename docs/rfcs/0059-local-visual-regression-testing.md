---
rfc: 0059
title: Local visual regression testing
status: Draft
date: July 2026
author: kasunben
scope: packages/ui, runtime, plugins/account, plugins/console, plugins/launcher, __tests__/visual, docs; builds on RFC 0010 and epic task 9.7
incorporated_into_plan: 'Yes - epic task 9.14'
---

## Summary

Add local, Playwright-based visual regression testing for Sovereign's stabilizing
UI. The first tier uses Storybook as the fixture source for `packages/ui`
components. A second, smaller tier captures runtime shell and first-party plugin
smoke screens. Screenshot baselines are managed locally and in CI; no hosted
visual review product is required.

This RFC also defines the snapshot-testing boundary: broad React DOM snapshots
are discouraged for UI. Snapshot tests are reserved for stable serialized
outputs where textual diffs are meaningful, such as generated registries,
manifest validation, normalized email HTML/text, and config JSON.

## Motivation

Sovereign's UI is becoming a public contract. `@sovereignfs/ui` components,
semantic tokens, shell layout, Account, Console, Launcher, overlays, and mobile
navigation are now stable enough that accidental visual changes should be caught
before review.

The project should still preserve its self-hosted and local-first posture. A
hosted visual review tool such as Chromatic or Percy would improve review UX,
but it introduces an external service and project-level process before the local
need is proven. Playwright screenshots provide the necessary regression signal
with the tooling Sovereign already uses for e2e.

## Current state

- RFC 0010 reserves visual test naming and layout conventions but does not
  choose visual regression tooling.
- Storybook is planned/used as the component reference surface for
  `packages/ui` in epic task 9.7.
- Existing e2e tests use Playwright for browser-driven golden paths.
- `docs/testing-e2e.md` documents Playwright usage but does not cover visual
  baselines.
- There is no hosted visual review tool, no committed screenshot baseline set,
  and no policy for when snapshots are appropriate.

## Proposed design

### Tooling

Use Playwright screenshots for visual regression.

The initial scripts should be local and CI-friendly:

```bash
pnpm test:visual
pnpm test:visual:update
```

`test:visual` runs screenshot comparisons. `test:visual:update` refreshes
baselines intentionally. CI should fail on visual diffs and upload screenshot
diff artifacts where the existing CI environment supports artifacts.

No Chromatic, Percy, Loki, or other hosted visual review system is required.
Those can be reconsidered later if local baseline review becomes too slow or
high-friction.

### Tier 1: Storybook component visuals

`packages/ui` is the canonical first target because it is a public UI contract
for platform screens and plugin developers.

Run Playwright against the built Storybook output and capture stable component
states:

- light and dark themes;
- mobile, tablet, and desktop viewports where component behavior changes;
- default, disabled, loading, error, selected, and empty states;
- overlay/open states for `Dialog`, `Drawer`, `Popover`, and similar components;
- token gallery and component gallery smoke screenshots.

Baselines for this tier may be committed because the set is curated and stable.
Avoid screenshots for every permutation if the result becomes noisy. The suite
should protect meaningful contracts, not record every possible prop combination.

### Tier 2: runtime shell and first-party plugin visuals

Add a small Playwright visual smoke suite for integrated app surfaces:

- auth login screen;
- Launcher plugin grid;
- Account profile/security/preferences;
- Console settings/system health;
- overlay route presentation;
- mobile nav drawer and mobile header/footer layout;
- instance identity / attribution surfaces when configured.

This tier must stay intentionally small. Its purpose is to catch layout
regressions across the composed runtime, not to screenshot every workflow.
Behavior and data correctness remain the job of unit, integration, and e2e tests.

### Baseline policy

Screenshot baselines are source artifacts. Updating them is an intentional
review act, not a side effect of running tests.

Rules:

- commit baselines only for curated, stable screenshots;
- keep dynamic data, timestamps, random IDs, and animation out of screenshots;
- prefer seeded deterministic fixtures;
- use fixed viewport sizes and fonts in CI;
- disable or reduce motion during visual tests;
- mask unavoidable dynamic regions rather than accepting noisy diffs;
- use `test:visual:update` only when the visual change is expected.

CI should upload actual/expected/diff images when a visual test fails. The
project does not need a hosted visual dashboard for the first implementation.

### Snapshot policy

Do not use broad UI DOM snapshots such as
`expect(container).toMatchSnapshot()` for components or pages. They are noisy,
review poorly, and rarely catch the visual regressions users notice.

Allowed snapshot use cases:

- generated plugin registry output;
- manifest/schema validation output;
- normalized email HTML and plain text;
- stable config JSON;
- CLI output when normalized for paths, versions, and timestamps.

Prefer semantic assertions for UI behavior:

- labels are connected to controls;
- dialogs and menus open/close;
- active navigation is announced correctly;
- form errors are associated with fields;
- keyboard navigation and focus management work.

Visual screenshots complement these semantic assertions; they do not replace
them.

### Test placement

Follow RFC 0010's boundary rule:

- Storybook/component visual tests live with `packages/ui` or under its visual
  test folder.
- Cross-runtime visual smoke tests live under root `__tests__/visual/`.
- Filenames use `*.visual.spec.ts` or the convention chosen by the Playwright
  config.

The exact folder layout can be finalized during implementation, but the boundary
rule remains: package-owned visuals stay with the package; composed app visuals
live at the root.

## Alternatives considered

### Chromatic

Excellent Storybook visual review UX, but it introduces a hosted dependency,
account management, and potentially paid/private-project constraints. Deferred
until local Playwright review proves insufficient.

### Percy

Good Playwright integration for app-flow screenshots, but it has the same hosted
dependency tradeoff as Chromatic and is less directly tied to the component
Storybook surface. Deferred.

### Loki

Purpose-built for Storybook screenshot testing and can run locally, but it adds
another toolchain when Playwright is already present for e2e. Rejected for the
first implementation.

### Broad React snapshots

Rejected for UI. They create high-churn text artifacts that reviewers often
approve mechanically. Use semantic assertions and visual screenshots instead.

## Open questions

1. Exact baseline directory layout for Storybook versus root visual tests.
2. Whether baselines should be committed immediately or introduced first as CI
   artifacts during a calibration period.
3. Per-platform tolerance policy: Linux-only CI baselines versus local macOS
   baselines.
4. Whether `test:visual` should run in the default verification gate or remain a
   targeted check until the baseline set stabilizes.

## Adoption path

1. Add Playwright visual config and scripts: `test:visual` and
   `test:visual:update`.
2. Build Storybook before component visual tests and capture a small curated
   baseline set for `packages/ui`.
3. Add root `__tests__/visual/` smoke specs for auth, shell, Launcher, Account,
   Console, overlays, and mobile navigation.
4. Document baseline update workflow in `docs/testing-e2e.md` or a dedicated
   visual-testing doc.
5. Add CI artifact upload for visual diffs.
6. Revisit hosted visual review only if local workflow becomes a bottleneck.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
