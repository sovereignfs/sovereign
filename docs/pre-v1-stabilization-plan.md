# Pre-v1 Stabilization Plan

This plan captures the current architecture review follow-up work before it is
split into roadmap epics. The intent is to reduce change risk in the
load-bearing parts of the platform, improve contributor feedback loops, and
bring documentation back in sync with the current codebase.

## Goals

- Keep the plugin-first architecture easy to change without regressions.
- Reduce the complexity of the middleware and plugin generation paths.
- Expand regression coverage around platform workflows users depend on.
- Make operational drift easier to detect before it becomes a production issue.
- Prefer stabilization and clarity over adding new surface area before v1.

## 1. Tighten Current-State Docs

**Goal:** remove stale or misleading documentation so contributors can trust the
repository docs.

**Technical work:**

- Update `__tests__/e2e/README.md` to reflect the current Playwright suite.
- Add a compact test matrix to the docs that explains:
  - Vitest unit and component test scope.
  - Playwright E2E scope.
  - Postgres parity tests via `TEST_DATABASE_URL`.
  - Why generated plugin route copies are excluded from test discovery.
- Consider a docs parity check for E2E documentation if there is a stable enough
  signal to test.

**Acceptance criteria:**

- No docs claim the E2E suite is empty.
- Test commands and expected prerequisites are documented in one place.
- `pnpm test` and `pnpm test:e2e` behavior is accurately described.

**Priority:** high.

**Effort:** low.

## 2. Middleware Decomposition

**Goal:** keep `runtime/middleware.ts` behavior identical while reducing the
risk of future auth, routing, CSP, paywall, and root-plugin changes.

**Technical work:**

- Extract response helpers into `runtime/src/middleware/response.ts`:
  - CSP application.
  - forwarded cookie handling.
  - dev-mode response stamping.
  - login and paywall redirect helpers.
- Extract session verification into `runtime/src/middleware/session.ts`:
  - local signed cookie-cache verification.
  - auth-server fallback verification.
  - a typed result that carries the verified session and forwarded cookies.
- Extract plugin route gating into `runtime/src/middleware/plugin-gate.ts`:
  - disabled-plugin lookup.
  - entitlement and paywall lookup.
  - admin-only, disabled, and paywalled route decisions.
- Keep the exported `middleware()` function as a readable orchestration layer.
- Preserve existing fail-open and fail-closed semantics exactly:
  - auth verification fails closed.
  - disabled-plugin and paywall status fetches fail open.
  - unauthenticated gated requests redirect to `/login` with `303`.

**Tests to add or preserve:**

- Unauthenticated POST to a gated route redirects with `303`.
- Non-admin access to Console returns `403`.
- Disabled plugin route returns `404`.
- Paywalled page route redirects to `/paywall/<pluginId>`.
- Paywalled plugin API route returns `402`.
- Root `/` rewrites to the configured root plugin when available.
- Public `/api/*` delegation remains unauthenticated and provider-owned.

**Acceptance criteria:**

- Middleware behavior is unchanged from the user's perspective.
- Extracted helpers have focused unit tests where practical.
- E2E tests cover the high-risk middleware branches.
- `runtime/middleware.ts` reads as orchestration rather than implementation.

**Priority:** high.

**Effort:** medium.

## 3. Generate Script Decomposition

**Goal:** make plugin composition safer to evolve as shell modes, manifest
fields, and registry behavior grow.

**Technical work:**

- Split `scripts/generate-registry.ts` into focused modules under
  `scripts/generate/`:
  - `read-plugins.ts`: manifest scanning, validation, compatibility checks.
  - `compose-routes.ts`: shell-mode targets, sync, and stale route pruning.
  - `plugin-icons.ts`: static icon copy and pruning.
  - `plugin-env.ts`: plugin-scoped env declaration processing and output.
  - `plugin-capabilities.ts`: generated capability declaration output.
  - `write-registry.ts`: generated registry output.
- Keep `scripts/generate-registry.ts` as the CLI entrypoint.
- Preserve generated output format on the first refactor to minimize blast
  radius.
- Avoid changing plugin behavior in the same change as the decomposition.

**Tests to add or preserve:**

- Overlay plugins reject multi-segment `routePrefix` values.
- Minimal plugins accept multi-segment `routePrefix` values.
- Duplicate `apiProvider: true` manifests fail generation.
- Secret plugin env vars are never embedded in generated files.
- Plugin `.env` values are allowed only for non-secret dev defaults.
- Stale generated routes and icons are pruned.
- Manifest processing order is deterministic.

**Acceptance criteria:**

- `pnpm generate` emits the same registry, env, capability, route, and icon
  outputs as before for the current plugin set.
- Generate behavior is covered by focused tests.
- Future shell-mode changes can be made in `compose-routes.ts` without touching
  manifest validation or env processing.

**Priority:** high.

**Effort:** medium.

## 4. Platform Plugin Workflow Coverage

**Goal:** test the workflows provided by the built-in plugins that users and
operators depend on.

**Technical work:**

- Account plugin coverage:
  - profile and display-name update.
  - password validation and password-change action paths.
  - sidebar plugin preference save and read behavior.
  - notification preference update.
  - security panel helper behavior where it can be tested without browser APIs.
- Console plugin coverage:
  - plugin enable and disable actions.
  - invite creation flow.
  - root plugin update.
  - branding and settings update.
  - role update guardrails.
  - admin-only behavior for sensitive routes.
- Launcher plugin coverage:
  - plugin filtering and ordering.
  - hidden chrome plugins excluded from app tiles.
  - monetized plugin tile and paywall behavior.

**Acceptance criteria:**

- Each first-party platform plugin has meaningful tests beyond private helper
  functions.
- Critical operator actions have either unit/action tests or E2E coverage.
- Tests avoid depending on generated route copies under `runtime/app`.

**Priority:** high.

**Effort:** medium.

## 5. SDK Boundary And Runtime Contract Tests

**Goal:** prevent accidental platform leakage into plugin code and keep the SDK
contract honest.

**Technical work:**

- Add a lint fixture or test that intentionally imports forbidden packages from
  `plugins/` and asserts ESLint rejects it.
- Add SDK host behavior tests for:
  - missing host throws a useful error.
  - plugin-scoped DB calls route isolated-database plugins correctly.
  - platform DB is returned outside plugin route context.
  - request-context-derived plugin and user identity cannot be forged through
    plugin-provided SDK arguments.
- Ensure docs examples match tested SDK usage.

**Acceptance criteria:**

- The plugin import-boundary rule is tested, not just configured.
- SDK host failure modes remain actionable for plugin developers.
- Isolated database routing has regression coverage.

**Priority:** medium-high.

**Effort:** medium.

## 6. Middleware Internal Fetch Caching Review

**Goal:** reduce repeated middleware self-fetches without weakening correctness
or making admin changes feel stale.

**Technical work:**

- Measure current middleware internal fetch count by path type:
  - normal platform page.
  - plugin route.
  - root `/`.
  - public `/api/*`.
- Consider a short-lived in-process cache for:
  - disabled plugin IDs.
  - root plugin prefix.
- Keep entitlement checks uncached, or user-scoped with a very short TTL if
  measurements show meaningful pressure.
- Add explicit invalidation on admin mutations if practical. Otherwise, use a
  conservative TTL such as 2-5 seconds.
- Document fail-open and fail-closed behavior near the caching layer.

**Acceptance criteria:**

- Caching is introduced only after baseline behavior is covered by tests.
- Admin changes become visible within an explicit and documented window.
- Auth and entitlement correctness is not weakened.

**Priority:** medium.

**Effort:** medium.

## 7. Typecheck Performance And Project References

**Goal:** improve contributor feedback time as the monorepo grows.

**Technical work:**

- Audit the current `tsconfig` inheritance graph.
- Add `composite: true` to package configs where viable.
- Add root TypeScript project references for packages first.
- Evaluate Next.js app/runtime compatibility separately before enabling
  references for apps.
- Confirm Turbo caching still behaves correctly.
- Measure before and after timings for `pnpm typecheck`.

**Acceptance criteria:**

- Package-level typechecking can use incremental metadata.
- The change does not make Next.js app typechecking more fragile.
- Timing data is recorded in the PR or epic notes.

**Priority:** medium.

**Effort:** medium.

## 8. Operational Consistency Checks

**Goal:** catch drift between auth DB, platform DB, generated state, and
operator configuration.

**Technical work:**

- Add or extend health checks for:
  - generated registry presence and platform compatibility.
  - root plugin ID points to an installed, enabled, root-eligible plugin.
  - invite-only state if duplicated between auth and platform stores.
  - disabled incompatible plugins and recorded reasons.
  - plugin env vars required by manifests.
- Consider a `pnpm sv doctor` command that reports:
  - required env readiness.
  - DB dialect and migration status.
  - plugin manifest and generation status.
  - auth URL, public auth URL, and cookie-domain consistency.
  - notification transport configuration.

**Acceptance criteria:**

- Operators can distinguish liveness from configuration readiness.
- Common deployment drift has actionable error messages.
- The doctor command does not mutate state unless explicitly requested.

**Priority:** medium.

**Effort:** medium-large.

## 9. Pre-v1 Stabilization Gate

**Goal:** create a release-quality checkpoint that prevents new feature work
from outrunning platform maintainability.

**Technical work:**

- Create a stabilization epic with explicit acceptance criteria:
  - middleware refactor complete or explicitly deferred.
  - generate refactor complete or explicitly deferred.
  - E2E suite covers auth, account, console, launcher, and paywall flows.
  - docs reflect current commands, test behavior, and development workflow.
  - `pnpm generate` leaves no stale generated artifacts.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` pass in CI.
- Require new pre-v1 feature epics to state whether they touch middleware,
  generation, auth, plugin manifests, or SDK contracts.

**Acceptance criteria:**

- There is a clear go/no-go checklist before v1.
- Stabilization work is visible on the roadmap rather than hidden in ad hoc
  cleanup.
- Feature work that changes load-bearing architecture has test requirements
  attached up front.

**Priority:** high.

**Effort:** planning plus enforcement.

## Suggested Implementation Order

1. Tighten current-state docs.
2. Add middleware regression tests around current behavior.
3. Decompose middleware.
4. Add generate-script regression tests around current behavior.
5. Decompose generate script.
6. Expand platform plugin workflow coverage.
7. Add SDK boundary and runtime contract tests.
8. Add operational health or `sv doctor` checks.
9. Evaluate TypeScript project references and typecheck performance.

This order freezes high-risk behavior with tests before refactoring the
load-bearing paths.
