# Workstream 0012 — Engineering hygiene

**Status:** ⏳ In progress — legs 1–2 done. Leg 1: tasks 14.2, 13.5, 15.2,
additive test coverage across Account/Console/Launcher. Leg 2: task 3.24,
SDK boundary and runtime contract tests — found and closed a real gap in
the boundary rule itself (the `@/` alias reaching `runtime/src` unflagged),
formalized as a scoped, documented exception for `plugins/console` only.
Legs 3–8 not started; legs 3, 4, 5, 7, 8 have no blocking dependency and
can proceed in any order — only leg 6 waits on leg 5\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0057](../rfcs/0057-plugin-dep-hoisting.md) (leg 8 only). The other
seven tasks are internal engineering hygiene — decomposition, test coverage,
and build tooling — with no product-facing design decision to record; each
task's own `docs/epics/` entry is the design record.\
**Epics touched:** 0 (Infrastructure), 2 (Platform Shell), 3 (Plugins
Runtime), 13 (Plugin — Console), 14 (Plugin — Accounts), 15 (Plugin —
Launcher)

---

## Goal

Work through the backlog of `📋` tasks that exist purely to keep the platform
maintainable as it grows — regression coverage for user-facing plugin
workflows, decomposing two files that have outgrown a single unreviewable
diff (`runtime/middleware.ts`, `scripts/generate-registry.ts`), a build-speed
improvement, one deferred design-system migration, and one developer-
experience automation (RFC 0057) — none of which shipped a product feature on
their own and so kept losing priority against roadmap work. At the end: all
ten tasks are ✅, and `ROADMAP.md`'s Non-prioritised section no longer carries
this backlog as unowned.

## Definition of done

- [x] `14.2`, `13.5`, `15.2` — Account, Console, and Launcher plugin
      workflows named in each task's own Deliverables have unit/action or E2E
      coverage; no existing user-facing behavior changed. (Two real
      authorization gaps and one search-matching bug were found and fixed
      along the way — see leg 1's own status note; none were pre-existing
      _tested_ behavior, so this doesn't count as a behavior change made to
      enable testing.)
- [x] `3.24` — the plugin import-boundary ESLint rule has a fixture test
      proving it rejects a forbidden import, and the four listed SDK host
      behaviors have regression coverage. (Found and closed a real gap in
      the rule itself along the way — the `@/` alias to `runtime/src` was
      never pattern-matched, and `plugins/console` was already using it
      unflagged; see leg 2's own status note.)
- [ ] `0.14` — `pnpm typecheck` has a recorded before/after timing
      improvement; Turbo caching and Next.js app typechecking are confirmed
      unaffected.
- [ ] `3.23` — `scripts/generate-registry.ts` is decomposed into
      `scripts/generate/*` per the epic's module list; `pnpm generate` output
      is byte-identical for the current plugin set.
- [ ] `2.17` — `runtime/middleware.ts` is decomposed into
      `runtime/src/middleware/{response,session,plugin-gate}.ts`; fail-open
      and fail-closed semantics are unchanged, verified by Task 2.16's
      existing regression suite.
- [ ] `2.18` — middleware self-fetch counts are measured before/after; any
      caching added has a documented invalidation window and does not weaken
      auth or entitlement correctness.
- [ ] `13.6` (scoped — see Decisions locked) — Console's confirm-dialog
      pattern, table styling, and icon-only action buttons are migrated to
      shared primitives; no behavioral regression on user
      deactivation/deletion/MFA-reset/invite-cancellation/plugin
      install-remove, manually re-verified.
- [ ] `3.25` — `sv plugin add`/`remove` hoist/prune a plugin's external deps
      into `runtime/package.json` automatically via
      `runtime/generated/plugin-deps.json`; the manually-added `@dnd-kit/*`
      entries are removed and re-derived from the ledger.

## Decisions locked

| Decision                | Choice                                                                                    | Rejected alternative and why                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                   | Exactly the 10 tasks listed above                                                         | Including task **2.20** (error-page quote rotation) — rejected outright by the developer during this workstream's planning pass; marked ❌ in `ROADMAP.md` and `docs/epics/platform-shell.md`, not carried into any workstream                                                                                                                     |
| Scope boundary          | The "Pre-v1 stabilization gate" cluster (0.13, 0.15, 0.16, 0.18) is **not** included here | Bundling it in — rejected because 0.16 itself depends on this workstream's legs 4 and 5 (Tasks 3.23, 2.17) completing first; folding a gate into the workstream it gates creates a circular workstream. That cluster is a separate, future workstream once this one ships                                                                          |
| `13.6` leg scope        | Only the confirm-dialog, table-pattern, and icon-button-consolidation deliverables        | Also migrating Console's section nav to `NavTabs` and page headers to `PageHeader` — rejected for this workstream because the epic's own text blocks those two items on Task 9.15 (NavTabs `Link` support + `PageHeader` heading level), which is not in scope here; re-add them to `13.6`'s leg now that 9.15 has shipped (workstream 0013 leg 1) |
| Leg 6 (`2.18`) ordering | After leg 5 (`2.17`), never before                                                        | The epic's own Dependencies line requires it — caching correctness on top of a not-yet-decomposed middleware would be built against code this workstream is about to restructure underneath it                                                                                                                                                     |
| Workstream execution    | Legs — one branch, one draft PR, one review gate per leg                                  | A single combined PR — rejected for the same reviewability reason as every other workstream in this index; these ten tasks touch disjoint file trees and have no reason to share a PR                                                                                                                                                              |

## Prerequisites

None blocking leg 1. Every task's own epic-listed dependency (2.16, 3.22,
0.2/0.9, 0.3/3.9/3.13, 14.1/2.13/4.2/1.4, 13.4/9.8/1.10/1.5, 15.1/2.13/7.1,
9.12, 3.4/3.13) is already ✅. Task 9.15, for `13.6`'s nav/header items, was
**not yet satisfied when this workstream was drafted** — handled by scoping
those items out of this workstream's leg 7 rather than blocking it (see
Decisions locked). It has since shipped (workstream 0013 leg 1), so leg 7's
deferred nav/header migration can be re-added.

## Legs

| Leg | Name                                          | Epic tasks       | Epics      | Gate? | Done when                                                                                                |
| --- | --------------------------------------------- | ---------------- | ---------- | ----- | -------------------------------------------------------------------------------------------------------- |
| 1   | Plugin workflow test coverage ✅              | 14.2, 13.5, 15.2 | 13, 14, 15 | No    | Account, Console, and Launcher workflows named in each task have regression coverage; no behavior change |
| 2   | SDK boundary and runtime contract tests ✅    | 3.24             | 3          | No    | Import-boundary rule and SDK host behaviors are test-covered, not just configured                        |
| 3   | Typecheck performance                         | 0.14             | 0          | No    | Recorded `pnpm typecheck` speedup; Turbo caching and Next.js typechecking unaffected                     |
| 4   | Generate script decomposition                 | 3.23             | 3          | No    | `scripts/generate/*` modules exist; `pnpm generate` output unchanged                                     |
| 5   | Middleware decomposition                      | 2.17             | 2          | No    | `runtime/src/middleware/*` modules exist; fail-open/fail-closed semantics unchanged                      |
| 6   | Middleware internal fetch caching review      | 2.18             | 2          | No    | Self-fetch counts measured; any cache added has documented invalidation                                  |
| 7   | Console primitive migration, Phase 2 (scoped) | 13.6             | 13         | No    | Confirm-dialog, table, and icon-button patterns migrated; admin-destructive flows manually re-verified   |
| 8   | Plugin external dependency resolution         | 3.25             | 3          | No    | `sv plugin add`/`remove` hoist/prune deps automatically; `@dnd-kit/*` entries re-derived from the ledger |

Legs 1–4 and 8 are mutually independent and may be reordered or parallelized
across engineers. Leg 6 must follow leg 5. Leg 7 is independent of the rest
but scoped down per Decisions locked. Default sequence is the table order,
smallest/safest first.

## Leg detail

### Leg 1 — Plugin workflow test coverage ✅

**Epic tasks:** 14.2, 13.5, 15.2

**Status (August 2026): shipped.** Full account in each task's own epic doc
(`docs/epics/plugin-accounts.md`, `plugin-console.md`, `plugin-launcher.md`).
Three real bugs were found and fixed while writing this coverage — two
authorization gaps in Console (`resetMfaAction` and nearly every
settings/branding action had no capability check at all, despite attaching
`SOVEREIGN_ADMIN_KEY` on the caller's behalf) and one search-matching bug in
Launcher (`SearchableGrid` compared against the un-trimmed query). None of
these were "changing behavior to make it testable" — this leg's own "do not
proceed if" below is about that specific trap, and doesn't apply here: the
code was already fully testable in its buggy state; the fixes are
independent, flagged corrections discovered by close reading, the same class
of finding this project's history treats as worth fixing immediately rather
than shipping a test that documents a vulnerability as if it were correct
behavior. Also fixed in passing: `plugins/account/package.json` was missing
its own `qrcode` dependency (only `runtime/package.json` declared it), so
the plugin's source could never resolve its own import in isolation —
surfaced only because this leg was the first to actually import
`actions.ts` from a test. Added a `resolve.alias` for `@/` to the root
`vitest.config.ts` (matching `runtime/tsconfig.json`'s own mapping), needed
because Console's `users/actions.ts` reaches `runtime/src` directly (the
documented platform-plugin exception to the SDK boundary rule) and nothing
had exercised that import path from a test before.

**Why this leg is first:** purely additive test coverage across three
disjoint plugin directories — lowest risk in the workstream, and the fastest
way to shrink the backlog's task count.

**Technical notes:**

- Each task's own Deliverables list is the test plan; don't invent additional
  scope.
- Tests must avoid depending on generated route copies under `runtime/app`
  (14.2's own review checklist) — a pattern likely worth applying to 13.5 and
  15.2's tests too for consistency.
- These can genuinely be three separate PRs if a reviewer prefers tighter
  diffs; grouped here as one leg because they're the same shape and change
  nothing but test files.

**Do not proceed if:** achieving coverage requires changing existing
user-facing behavior to make it testable — flag and stop rather than quietly
changing behavior under a "test coverage" leg.

### Leg 2 — SDK boundary and runtime contract tests ✅

**Epic tasks:** 3.24

**Status (August 2026): shipped.** Full account in `docs/epics/plugins-runtime.md`'s
task 3.24 entry. Writing the lint fixture test surfaced a real, undocumented
gap in the SDK boundary rule itself — it never caught the `@/` alias reaching
`runtime/src`, and `plugins/console` was already using exactly that,
unflagged. Confirmed with the developer this should become a formal,
scoped exception rather than be unwound; `eslint.config.ts` and
`docs/architecture-rules.md` both updated in the same PR.

**Technical notes:**

- The ESLint fixture test should intentionally import a forbidden package
  from `plugins/` and assert the rule rejects it — a real regression test,
  not a snapshot of current config.
- Cover the four SDK host behaviors listed in the epic: missing-host error,
  isolated-DB routing, platform-DB-outside-plugin-context, and
  identity-cannot-be-forged-via-SDK-args.

**Do not proceed if:** N/A — this is additive test coverage against an
already-shipped contract.

### Leg 3 — Typecheck performance

**Epic tasks:** 0.14

**Technical notes:**

- Audit the `tsconfig` inheritance graph first; add `composite: true` to
  packages before attempting project references for apps.
- Evaluate Next.js app/runtime compatibility with project references
  separately — the epic explicitly calls this out as a distinct risk from the
  packages-only change.
- Record before/after `pnpm typecheck` timings in the PR description.

**Do not proceed if:** enabling project references for the Next.js apps
makes Turbo caching behave incorrectly — ship the packages-only improvement
and leave the apps out, rather than force it.

### Leg 4 — Generate script decomposition

**Epic tasks:** 3.23

**Technical notes:**

- Split into `scripts/generate/{read-plugins,compose-routes,plugin-icons,
plugin-env,plugin-capabilities,write-registry}.ts` per the epic; keep
  `scripts/generate-registry.ts` as the CLI entrypoint.
- Preserve generated output byte-for-byte on the first pass — don't combine
  behavior changes with the decomposition.

**Do not proceed if:** N/A — this is a structural refactor with an existing
regression suite (Task 3.22) to verify against.

### Leg 5 — Middleware decomposition

**Epic tasks:** 2.17

**Why this leg needs care:** `runtime/middleware.ts` gates auth, routing,
CSP, paywall, and root-plugin behavior for every request — the highest
blast-radius file touched in this workstream.

**Technical notes:**

- Extract into `runtime/src/middleware/{response,session,plugin-gate}.ts`
  exactly as scoped in the epic; keep the exported `middleware()` function as
  an orchestration layer, not a rewrite.
- Preserve fail-open/fail-closed semantics exactly: auth verification fails
  closed; disabled-plugin and paywall fetches fail open; unauthenticated
  gated requests still 303-redirect to `/login`.
- Task 2.16's middleware regression coverage is the safety net — run it
  before and after, not just after.

**Do not proceed if:** the existing regression suite (Task 2.16) doesn't
actually cover one of the fail-open/fail-closed paths above — add coverage
for that path first rather than decomposing code the suite can't verify.

### Leg 6 — Middleware internal fetch caching review

**Epic tasks:** 2.18

**Technical notes:**

- Must land after leg 5 — the epic's own Dependencies line names Task 2.17
  explicitly, and measuring/caching self-fetches against code about to be
  restructured underneath it would be wasted work.
- Measure current fetch counts by path type (normal page, plugin route,
  root `/`, public `/api/*`) before adding any cache.
- Keep entitlement checks uncached, or very-short-TTL and user-scoped, unless
  measurement shows real pressure — don't cache pre-emptively.
- Document fail-open/fail-closed behavior at the caching layer itself, not
  just in the epic doc.

**Do not proceed if:** measurement shows the self-fetch count isn't actually
a meaningful cost — ship the measurement and skip adding a cache; a cache
with no measured benefit is new risk for nothing.

### Leg 7 — Console primitive migration, Phase 2 (scoped)

**Epic tasks:** 13.6 (partial — see Decisions locked)

**In scope for this leg:**

- Migrate the confirm-dialog pattern (`.confirmNativeDialog` / native
  `<dialog>` in `UserActionButtons.tsx`, `UserCard.tsx`,
  `RevokeSessionButton.tsx`, `PluginInstallPanel.tsx`) to the shared `Dialog`
  component.
- Migrate or document the hand-rolled `.table` styling in `users/page.tsx`.
- Consolidate the icon-only action button family (`.iconBtn`,
  `.iconBtnReactivate`, `.iconBtnDanger`, `.copyButton`,
  `.pluginCardBtnToggle`, `.pluginCardBtnRemove`, `.userCardMenuBtn`).

**Explicitly out of scope for this leg:** migrating Console's section nav to
`NavTabs` and per-page headers to `PageHeader` — was blocked on Task 9.15,
which is not part of this workstream. 9.15 has since shipped (workstream 0013
leg 1); re-open this task (or file a follow-up) to add the deferred
migration.

**Technical notes:**

- These are admin-critical, admin-destructive-adjacent flows (user
  deactivation, entitlements, plugin management) — per the epic's own review
  checklist, changes need manual re-verification, not just
  typecheck/lint/test green.
- `.rolePill`/`.rolePills` stays local per the epic — not a candidate for
  this migration.

**Do not proceed if:** the confirm-dialog migration changes observable
behavior on any admin-destructive action (deactivation, deletion, MFA reset,
invite cancellation, plugin install/remove) — stop and get manual sign-off
before merging, per this epic's own checklist.

### Leg 8 — Plugin external dependency resolution

**Epic tasks:** 3.25

**Technical notes:**

- Add `runtime/generated/plugin-deps.json` as a committed ledger mapping
  plugin manifest ID → external deps contributed.
- `sv plugin add`: read the plugin's `package.json`, filter out
  `@sovereignfs/*` workspace packages and existing platform peers, write the
  ledger, merge into `runtime/package.json`, run
  `pnpm install --filter runtime`.
- `sv plugin remove`: compute the set difference against remaining plugins'
  ledger entries and prune.
- `scripts/dev.ts`: sync `.local` plugin deps at dev-startup, gated on a hash
  check against the ledger to avoid an install on every boot.
- Remove the manually-added `@dnd-kit/*` entries from `runtime/package.json`
  once the ledger can re-derive them.
- Update `docs/plugin-development.md`: external deps are declared in the
  plugin's own `package.json`, no manual platform-side step needed.

**Do not proceed if:** the dep-hoisting mechanism can't reliably distinguish
a plugin's genuine external dependency from a transitive dependency already
satisfied by the workspace — a wrong hoist/prune here corrupts
`runtime/package.json` for every plugin, not just the one being
installed/removed. Ship a dry-run mode first if confidence is low.

## Risks

- **Leg 5 (middleware decomposition) is the highest-blast-radius leg in this
  workstream** — every request routes through this file. A regression here
  is platform-wide, not scoped to one plugin. Treat it as above-routine risk
  even though it's marked "No gate."
- **Leg 7 touches admin-destructive Console flows** (deactivation, deletion,
  MFA reset, plugin install/remove) — the epic's own checklist already
  requires manual re-verification; don't let CI-green stand in for that.
- **Leg 8 writes to `runtime/package.json` programmatically** — a bug in the
  hoist/prune logic is a supply-chain-adjacent risk (wrong or stale deps
  merged into the platform's own dependency tree), not just a plugin-scoped
  bug.
- Legs 1–4 and 6 are comparatively low risk — additive tests, a build-speed
  change, and two structural refactors each backed by an existing regression
  suite.

## Kill criteria

Each leg stands on its own value; none blocks another except leg 6 on leg 5.
If any single leg's "Do not proceed if" condition triggers, ship the other
legs regardless — this workstream has no single point of failure. What
survives if leg 5 or leg 8 (the two highest-risk legs) has to stop: legs
1–4, 6, and 7 (or whichever subset already shipped) still close out that much
of the backlog and are independently valuable.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 10 tasks, excludes Task 2.20 (rejected) and the Pre-v1 stabilization-gate cluster (0.13, 0.15, 0.16, 0.18, deferred to a future workstream)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0.2     | August 2026 | Leg 1 shipped (tasks 14.2, 13.5, 15.2). Found and fixed two live authorization gaps in Console (missing capability checks on `resetMfaAction` and nearly every settings/branding action) and one search-matching bug in Launcher (`SearchableGrid` filtering against an un-trimmed query) — full account in each task's own epic doc. Also fixed `plugins/account`'s missing `qrcode` dependency declaration and added a `@/` alias to `vitest.config.ts` for platform-plugin source-tree tests that reach `runtime/src` directly.                                                                                |
| 0.3     | August 2026 | Leg 2 shipped (task 3.24). Found and closed a real gap in the SDK boundary rule itself while writing the lint fixture test: the ESLint `no-restricted-imports` pattern never matched the `@/` alias to `runtime/src` (only the literal path string), and `plugins/console` was already using it, unflagged. Confirmed with the developer this should become a formal, scoped exception (Console only, and only for `runtime/src` — the `@sovereignfs/db`/`manifest`/`mailer` restriction still applies there) rather than be unwound. `eslint.config.ts` and `docs/architecture-rules.md` updated in the same PR. |
