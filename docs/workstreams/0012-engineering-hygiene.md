# Workstream 0012 — Engineering hygiene

**Status:** ✅ Complete — all 8 legs done. Leg 1: tasks 14.2, 13.5, 15.2,
additive test coverage across Account/Console/Launcher. Leg 2: task 3.24,
SDK boundary and runtime contract tests — found and closed a real gap in
the boundary rule itself (the `@/` alias reaching `runtime/src` unflagged),
formalized as a scoped, documented exception for `plugins/console` only.
Leg 3: task 0.14, typecheck performance — opt-in incremental project
references for the 7 core library packages; caught and avoided a real
regression where the first approach broke `tsup`'s build; Next.js apps
evaluated and excluded with concrete reasons. Leg 4: task 3.23, generate
script decomposition — nine modules under `scripts/generate/`, three more
than the epic's original list (schedules/jobs/events generated-output
concerns found during implementation); `pnpm generate` output verified
byte-identical, all 55 existing regression tests pass unchanged via the
entrypoint's re-export barrel. Leg 5: task 2.17, middleware decomposition
(the highest blast-radius leg in this workstream) — three modules under
`runtime/src/middleware/` exactly per the epic's list, plus a new
`verifySession()` consolidating three duplicated cookie-cache-then-fallback
call sites into one typed result; the existing 115-test regression suite
(Task 2.16) passes completely unchanged, plus 22 new focused unit tests
across the three modules. Leg 6: task 2.18, middleware internal fetch
caching review — measured real self-fetch counts by path type as a live
test (0/3/1/1 for normal page/plugin route/root/public-api), added a 3s
in-process TTL cache for exactly the two lookups the deliverable named
(disabled-plugin IDs, root-plugin prefix), left entitlement/access-policy
lookups uncached per the epic's own guidance. Leg 7: task 13.6 (scoped) —
confirm-dialog migration was already done pre-leg; consolidated the
icon/text+icon action-button CSS families via `composes` (zero TSX
changes); documented (didn't migrate) the users table, since the shared
`Table` primitive's cell components don't merge an incoming `className`;
nav/header migration stays deferred to a follow-up per this workstream's
own locked scoping. Manually re-verified live against a disposable test
account promoted to owner in the dev DB (no working credentials existed for
the DB's real accounts) — deactivate/reactivate cycle, both confirm
dialogs, and the consolidated icon buttons all confirmed working with no
regression; see leg 7's own status note for the full account. Leg 8: task
3.25 (RFC 0057), plugin external dependency resolution — `bin/plugin-deps.ts`
hoists/prunes a plugin's external npm deps into `runtime/package.json` on
`sv plugin add`/`remove` and self-heals `.local` plugin deps on every `pnpm
dev` boot, backed by a committed `runtime/generated/plugin-deps.json` ledger
(the one deliberate exception to that directory's blanket `.gitignore`
rule) and 27 unit tests; verified live against this environment's four real
`.local` dev plugins before reverting the resulting (correctly generated,
but not meant for this PR) `runtime/package.json` changes. All ten tasks
across all 8 legs are now ✅; `ROADMAP.md`'s Non-prioritised section no
longer carries this backlog as unowned.\
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
- [x] `0.14` — `pnpm typecheck` has a recorded before/after timing
      improvement; Turbo caching and Next.js app typechecking are confirmed
      unaffected. (The "improvement" is an opt-in incremental path for the 7
      core packages — `pnpm typecheck` itself is unchanged and was
      re-verified 31/31 passing; Next.js apps evaluated and excluded with
      concrete technical reasons, not enabled. See leg 3's own status note.)
- [x] `3.23` — `scripts/generate-registry.ts` is decomposed into
      `scripts/generate/*` per the epic's module list; `pnpm generate` output
      is byte-identical for the current plugin set. (Nine modules, not six —
      three more generated-output concerns turned up during implementation;
      see leg 4's own status note.)
- [x] `2.17` — `runtime/middleware.ts` is decomposed into
      `runtime/src/middleware/{response,session,plugin-gate}.ts`; fail-open
      and fail-closed semantics are unchanged, verified by Task 2.16's
      existing regression suite. (All 115 existing tests pass unchanged;
      22 new focused unit tests added; see leg 5's own status note.)
- [x] `2.18` — middleware self-fetch counts are measured before/after; any
      caching added has a documented invalidation window and does not weaken
      auth or entitlement correctness. (Measured as a live test, not just a
      note; cached only disabled-plugin IDs and root-plugin prefix, left
      entitlement/access-policy lookups uncached; see leg 6's own status note.)
- [x] `13.6` (scoped — see Decisions locked) — Console's confirm-dialog
      pattern, table styling, and icon-only action buttons are migrated to
      shared primitives; no behavioral regression on user
      deactivation/deletion/MFA-reset/invite-cancellation/plugin
      install-remove, manually re-verified. (Confirm-dialog was already
      done pre-leg; table styling documented as staying bespoke, not
      migrated, per this task's own "or document why" deliverable; manual
      re-verification done via a disposable test account promoted to owner
      in the dev DB — deactivate/reactivate cycle, both confirm dialogs, and
      the consolidated icon buttons all confirmed live; see leg 7's own
      status note for the full account.)
- [x] `3.25` — `sv plugin add`/`remove` hoist/prune a plugin's external deps
      into `runtime/package.json` automatically via
      `runtime/generated/plugin-deps.json`; the manually-added `@dnd-kit/*`
      entries are removed and re-derived from the ledger. (The `@dnd-kit/*`
      entries were already absent — nothing to remove; verified live against
      this environment's real `.local` dev plugins; see leg 8's own status
      note.)

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

| Leg | Name                                             | Epic tasks       | Epics      | Gate? | Done when                                                                                                |
| --- | ------------------------------------------------ | ---------------- | ---------- | ----- | -------------------------------------------------------------------------------------------------------- |
| 1   | Plugin workflow test coverage ✅                 | 14.2, 13.5, 15.2 | 13, 14, 15 | No    | Account, Console, and Launcher workflows named in each task have regression coverage; no behavior change |
| 2   | SDK boundary and runtime contract tests ✅       | 3.24             | 3          | No    | Import-boundary rule and SDK host behaviors are test-covered, not just configured                        |
| 3   | Typecheck performance ✅                         | 0.14             | 0          | No    | Recorded `pnpm typecheck` speedup; Turbo caching and Next.js typechecking unaffected                     |
| 4   | Generate script decomposition ✅                 | 3.23             | 3          | No    | `scripts/generate/*` modules exist; `pnpm generate` output unchanged                                     |
| 5   | Middleware decomposition ✅                      | 2.17             | 2          | No    | `runtime/src/middleware/*` modules exist; fail-open/fail-closed semantics unchanged                      |
| 6   | Middleware internal fetch caching review ✅      | 2.18             | 2          | No    | Self-fetch counts measured; any cache added has documented invalidation                                  |
| 7   | Console primitive migration, Phase 2 (scoped) ✅ | 13.6             | 13         | No    | Confirm-dialog, table, and icon-button patterns migrated; admin-destructive flows manually re-verified   |
| 8   | Plugin external dependency resolution ✅         | 3.25             | 3          | No    | `sv plugin add`/`remove` hoist/prune deps automatically; `@dnd-kit/*` entries re-derived from the ledger |

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

### Leg 3 — Typecheck performance ✅

**Epic tasks:** 0.14

**Status (August 2026): shipped, packages only.** Full account in
`docs/epics/infrastructure.md`'s task 0.14 entry — including a real
regression found and avoided: the first attempt put `composite: true`
directly in the shared `packages/tsconfig/library.json`, which broke
`tsup`'s DTS build (`pnpm build` failure on `packages/ui`), since tsup
reads the same tsconfig and doesn't tolerate composite mode's stricter
file-list validation. Fixed by isolating the new machinery into a
dedicated `tsconfig.build-refs.json` per package, leaving every
package's real `tsconfig.json` (and `tsup`, and the existing `tsc
--noEmit` script) untouched. Next.js apps evaluated and excluded with
concrete reasons (not just caution) — see the epic entry.

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

### Leg 4 — Generate script decomposition ✅

**Epic tasks:** 3.23

**Status (August 2026): shipped.** Full account in the epic doc
(`docs/epics/plugins-runtime.md`). Split into nine modules under
`scripts/generate/` — the epic's six (`read-plugins`, `compose-routes`,
`plugin-icons`, `plugin-env`, `plugin-capabilities`, `write-registry`) plus
`paths.ts` and `types.ts` (shared constants/types once more than one module
needed them) and three more discovered during implementation:
`plugin-schedules.ts`, `plugin-jobs.ts`, `plugin-events.ts` — the source file
had three more generated-output concerns than the deliverable list named
(RFC 0046 schedules/jobs, RFC 0045 event authorizers), each following
`plugin-capabilities.ts`'s exact collect/render/write shape.
`scripts/generate-registry.ts` stays the CLI entrypoint (`generate()`
orchestration, `--watch` mode) and re-exports every module's public API so
Task 3.22's existing 55-test regression suite keeps importing from
`'../generate-registry'` unchanged — all 55 pass against the decomposed
modules with zero test-file edits. `pnpm generate` output verified
byte-identical for the current plugin set (diffed `runtime/generated/*`
before/after); full `pnpm test` (2411 passed) and `pnpm build` also
verified green, given leg 3's tsup regression lesson.

**Technical notes:**

- Split into `scripts/generate/{read-plugins,compose-routes,plugin-icons,
plugin-env,plugin-capabilities,write-registry}.ts` per the epic; keep
  `scripts/generate-registry.ts` as the CLI entrypoint.
- Preserve generated output byte-for-byte on the first pass — don't combine
  behavior changes with the decomposition.

**Do not proceed if:** N/A — this is a structural refactor with an existing
regression suite (Task 3.22) to verify against.

### Leg 5 — Middleware decomposition ✅

**Epic tasks:** 2.17

**Status (August 2026): shipped.** Full account in the epic doc
(`docs/epics/platform-shell.md`). Split the 891-line `runtime/middleware.ts`
into `runtime/src/middleware/{response,session,plugin-gate}.ts` exactly per
the epic's list. `verifySession()` in `session.ts` is the "typed result
carrying the verified session and forwarded cookies" the deliverable asked
for — it consolidates three previously-duplicated cookie-cache-then-fallback
blocks (public plugin routes, public handoffs, the main session gate) into
one call, with each site keeping its own pre-existing behavior on a null
result (the two public branches proceed anonymously; the main gate calls
the new `buildLoginRedirect()` and returns). `fetchRootPluginPrefix` landed
in `plugin-gate.ts` alongside the three lookups the epic did name, since
it's the same "Edge can't reach the DB, ask the Node-runtime admin API,
fail open" shape. The `applyCsp`/`withCookies`/`withDevMode` response
helpers stayed as thin per-request closures in `middleware()` delegating to
the new module functions, specifically so their ~15 existing call sites
across the file needed zero edits — the closure body is the only diff.
Verified against Task 2.16's existing 115-test regression suite (unmodified,
all passing) plus 22 new focused unit tests across the three new modules;
full `pnpm test` (2433 passed), `pnpm typecheck`, `pnpm lint`, and
`pnpm build` all green, Edge middleware bundle size unchanged (86.5 kB).

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

### Leg 6 — Middleware internal fetch caching review ✅

**Epic tasks:** 2.18

**Status (August 2026): shipped.** Full account in the epic doc
(`docs/epics/platform-shell.md`). Measured real counts (0 for a normal page
outside any plugin prefix, 3 concurrent for a plugin route, 1 for root `/`,
1 for public `/api/*`) as an enforced test rather than a one-time note, so a
future branch change has to consciously update the asserted count. Added a
3-second in-process TTL cache for exactly the two lookups the deliverable
named — `fetchDisabledPluginIds` (one global entry) and
`fetchRootPluginPrefix` (per `userId:role`, since root-plugin resolution is
entitlement/policy-dependent) — left `fetchPaywalledPluginIds` and
`fetchRestrictedPluginIds` fully uncached per the epic's own conservative
guidance for entitlement/access-policy correctness. No explicit
invalidation on the admin toggle mutation (judged impractical without
coupling the Node-runtime admin route to Edge middleware's in-process
state); used the epic's documented TTL fallback instead. Fail-open extends
to the cache deliberately — a failure's safe fail-open result is itself
cached, so an outage doesn't turn into a retry-every-request loop for the
rest of the window. Added a `resetPluginGateCacheForTests()` hook (same
convention as `rate-limit.ts`'s), wired into the existing regression suite's
`beforeEach` so cache state can't leak stale mocked values across test
cases. All 115 existing regression tests pass unchanged, plus 4 measurement
tests and 4 cache-behavior tests; full `pnpm test` (2446 passed),
`pnpm typecheck`, `pnpm lint`, `pnpm build` all green (Edge middleware
bundle +0.2 kB).

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

### Leg 7 — Console primitive migration, Phase 2 (scoped) ✅

**Epic tasks:** 13.6 (partial — see Decisions locked)

**Status (August 2026): shipped.** Full account in the epic doc
(`docs/epics/plugin-console.md`). Confirm-dialog migration turned out to be
**already done** before this leg started (every confirm prompt already used
`@sovereignfs/ui`'s `ConfirmDialog`; the CSS module already had a comment
recording it) — closed by inspection, no code change. Table styling **stays
bespoke, documented in code** rather than migrated: `Table`'s
`TableHeaderCell`/`TableCell` don't merge an incoming `className` with their
own base style (they spread `...rest`, including `className`, _after_ their
own hardcoded class on the same element — a passed-in className fully
replaces the primitive's styling rather than layering on it), and this table
is the single highest-traffic admin-destructive surface in Console. Icon-only
and text+icon action-button consolidation is **done** as a documented local
pattern (not a new `@sovereignfs/ui` `Button` variant — disproportionate for
a Console-only need on a published, NFR-04-constrained package): six
near-duplicate CSS declarations collapsed to two shared bases + tone-only
overrides via CSS Modules `composes` (same convention as `apps/auth`'s
`.linkButton`), zero TSX changes. `.copyButton` (named in the original
deliverable) was already dead code. `.userCardMenuBtn` stays outside the
family on purpose — a different control (borderless menu trigger), not a
near-duplicate. Also fixed a stale doc-drift reference found along the way:
the epic text named Task 9.13 as the nav/header migration's blocker; 9.13 is
actually unrelated (❌ rejected, "Subtle Sovereign attribution") — the real
blocker was Task 9.15, corrected in the epic doc.

**Manual re-verification done**, after initially being flagged as a gap.
The local dev database only had real (non-test) user accounts with no known
credentials, and `sv seed` correctly refused to plant known-password test
accounts over them (its own safety check, working as designed) — so a
disposable account was created via the normal `/register` flow, promoted to
`platform:owner` with one additive `UPDATE` against the dev sqld instance
(no existing row touched), used to sign in and click through Console's
Users page, then deleted afterward. Confirmed live: the icon-only action
buttons render correctly (borders, spacing, tone colors, delete in red);
both the "Delete user" and "Deactivate user" `ConfirmDialog`s render and
function correctly; a full deactivate → reactivate cycle on a disposable
test account worked end-to-end, including `.iconBtnReactivate` — the
specific consolidated class — rendering and functioning correctly
afterward. No regression found. Also verified by `pnpm build`/`pnpm lint`/
`pnpm format:check`/`pnpm design:tokens:check` all clean, all 36 existing
Console tests passing unchanged, and direct inspection of the compiled
CSS/JS bundle confirming the `composes` output is correct.

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

### Leg 8 — Plugin external dependency resolution ✅

**Epic tasks:** 3.25

**Status (August 2026): shipped.** Full account in the epic doc
(`docs/epics/plugins-runtime.md`) and RFC 0057 (now `Implemented`). The
decision logic — what counts as an external dep, how a version conflict
resolves, what survives a remove — lives as pure, unit-tested functions in
`bin/plugin-deps.ts` (`extractExternalDeps`, `computePlatformPeerNames`,
`mergePluginDeps`, `prunePluginDeps`); only the thin orchestrators
(`hoistDepsForPlugin`, `pruneDepsForPlugin`, `syncLocalPluginDeps`) touch
disk or spawn `pnpm install`, specifically so this leg's own "do not
proceed if" risk could be verified without a real filesystem or network. 27
new tests. `runtime/generated/plugin-deps.json` is committed — the one
carve-out from that directory's blanket `.gitignore` rule, via
`runtime/generated/*` + a negation (a directory-anchored pattern would have
made the negation impossible). The `@dnd-kit/*` cleanup deliverable turned
out to already be satisfied — those entries were already absent from
`runtime/package.json`; the initial ledger is `{}`, matching reality.
Verified live against this environment's four real `.local` dev plugins
(Tasks, Shopper, Plainwrite, Wallet — genuine external deps including
`@dnd-kit/*`, `rrule`, `@tiptap/*`), confirming extraction, platform-peer
filtering, and cross-plugin dep sharing all resolve correctly, then
deliberately reverted the resulting `runtime/package.json`/lockfile
changes before committing anything (those four plugins are personal
gitignored dev clones, not part of this repo's committed plugin set — the
dev-startup sync will still make this same change for real automatically
the next time `pnpm dev` runs with them present, which is the intended
behavior, just not part of this PR's diff). `pnpm test` (2473 passed),
`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build` all
green.

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

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 10 tasks, excludes Task 2.20 (rejected) and the Pre-v1 stabilization-gate cluster (0.13, 0.15, 0.16, 0.18, deferred to a future workstream)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.2     | August 2026 | Leg 1 shipped (tasks 14.2, 13.5, 15.2). Found and fixed two live authorization gaps in Console (missing capability checks on `resetMfaAction` and nearly every settings/branding action) and one search-matching bug in Launcher (`SearchableGrid` filtering against an un-trimmed query) — full account in each task's own epic doc. Also fixed `plugins/account`'s missing `qrcode` dependency declaration and added a `@/` alias to `vitest.config.ts` for platform-plugin source-tree tests that reach `runtime/src` directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.3     | August 2026 | Leg 2 shipped (task 3.24). Found and closed a real gap in the SDK boundary rule itself while writing the lint fixture test: the ESLint `no-restricted-imports` pattern never matched the `@/` alias to `runtime/src` (only the literal path string), and `plugins/console` was already using it, unflagged. Confirmed with the developer this should become a formal, scoped exception (Console only, and only for `runtime/src` — the `@sovereignfs/db`/`manifest`/`mailer` restriction still applies there) rather than be unwound. `eslint.config.ts` and `docs/architecture-rules.md` updated in the same PR.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.4     | August 2026 | Leg 3 shipped (task 0.14), packages only. Found and avoided a real regression: putting `composite: true` in the shared `packages/tsconfig/library.json` broke `tsup`'s DTS build (`pnpm build` failure), since tsup reads the same tsconfig and doesn't tolerate composite mode's stricter file-list validation. Fixed by isolating the new machinery into a dedicated `tsconfig.build-refs.json` per package — every package's real `tsconfig.json`, `tsup`, and the existing `pnpm typecheck` are completely untouched. New opt-in `pnpm typecheck:packages:incremental` script for the 7 core packages via `tsc -b`. Measured: existing `pnpm typecheck` cold ~83s (unchanged); new path cold ~7.8s, no-op ~0.44s, single-file-touch ~0.5s. Next.js apps evaluated and excluded with concrete reasons (`.next/types` is a dynamically-regenerated set, a poor fit for composite's static file-list requirement, and the tsup-class regression risk applies equally to `next build`'s own internal type-checking). |
