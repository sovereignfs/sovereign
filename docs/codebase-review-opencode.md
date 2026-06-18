# Codebase Review

Review date: 2026-06-18
By Open Code (DeepSeek V4 Flash)

## Summary

Sovereign is an exceptionally well-engineered codebase. The architecture is the
product of careful RFC-driven design; the documentation is comprehensive and kept
honest by parity tests; the security posture (strict CSP, no default secrets,
layered session verification) is production-quality.

The main gaps are in testing (no integration/E2E coverage, untested platform
plugins) and middlegrowth refactoring opportunities in the middleware and
generate script.

## Improvement points (priority order)

### 1. Write an integration smoke test

`__tests__/integration/` and `__tests__/e2e/` exist as scaffolds (`--passWithNoTests`)
but contain no real tests. A single smoke test covering register → login → verify
launcher loads would catch middleware regressions, session-verify issues, plugin
composition failures, and CSP blocking in one go. The infra (Vitest, Docker
Compose) is all in place.

**Files:** `__tests__/integration/`, `__tests__/e2e/`

### 2. Add tests for the three platform plugins

None of Console, Launcher, or Account have `__tests__/` directories despite
`vitest.config.ts` including `plugins/**`. The Account plugin's display-name
and password-change actions, and Console's plugin-toggle route are the highest
value targets.

**Files:** `plugins/account/`, `plugins/console/`, `plugins/launcher/`

### 3. Refactor `middleware.ts`

The single `middleware()` function at `runtime/middleware.ts:121` handles CSP,
public API routing, session verification (local + fallback), plugin route
protection, root-plugin rewrite, and header injection. It spans ~100 lines with
deeply nested branches. The `applyCsp` and `withCookies` closures are passed
around 5+ response construction sites, making the flow hard to follow.

Extract the response-builder helpers into their own module and consider splitting
the three main middleware responsibilities (CSP, auth, plugin routing) into
composable functions.

**Files:** `runtime/middleware.ts`

### 4. Refactor `scripts/generate-registry.ts`

The generate script handles manifest validation, compatibility checks, registry
writing, and route copying for multiple shell modes (default, overlay, with
minimal wired but failing aggressively). As more shell modes come online it will
become unwieldy. Break it into smaller modules.

**Files:** `scripts/generate-registry.ts`

### 5. Audit CSP nonce generation

`runtime/src/security.ts:16-22` uses `String.fromCharCode` + `btoa` for the
per-request nonce. This works in practice on V8/SpiderMonkey/JSC but is
technically incorrect for byte values > 127 — `String.fromCharCode` followed by
`btoa` is not a correct base64 encoding of arbitrary bytes across all engines.
Consider `crypto.randomUUID()` or a typed `Uint8Array` → hex encoding.

**Files:** `runtime/src/security.ts`

### 6. Add TypeScript project references

With 17+ packages/apps, `pnpm typecheck` runs via Turbo but without project
references (`composite: true` + `references` in tsconfig) the type checker
processes the entire dependency graph on every invocation. Project references
would enable incremental caching and faster typechecking as the codebase grows.

**Files:** `packages/tsconfig/`, individual `tsconfig.json` files

### 7. Test the CLI orchestration layer

`bin/helpers.ts` is unit-tested, but `bin/sv.ts` (the CLI orchestration that
shells out to pnpm/turbo) has no coverage. The orchestration layer contains
process-management logic (mutual teardown in `sv serve`, command sequencing in
`sv build`) that would benefit from smoke tests.

**Files:** `bin/sv.ts`, `bin/__tests__/`

### 8. Harden the Vitest test-discovery glob

The `vitest.config.ts` `include` globs use `**/__tests__/**/*.test.{ts,tsx}`
which relies on "anchoring" to avoid generated plugin copies under
`runtime/app/(plugins)`. An explicit exclusion list would be more robust against
future directory restructuring.

**Files:** `vitest.config.ts`

### 9. Note: middleware DB-fetch pattern is correct but worth monitoring

The middleware fetches disabled plugin IDs and the root plugin prefix from
`localhost:3000` Node API routes (Edge can't open SQLite). This adds two
`fetch()` calls per matching request. Fine for v1 scale but worth a
stale-while-revalidate or in-memory cache strategy if the plugin count grows
significantly.

**Files:** `runtime/middleware.ts:31-61`

### 10. Note: dual-write invite-only toggle has a desync surface

The Console toggle writes to both `platform_settings` and `auth_settings`, but
registration reads only the auth copy. If the two databases desync (e.g. a
restore of one but not the other), the toggle UI could show one state while
enforcement uses another. Low risk for v1 single-tenant but worth documenting
in operations runbooks.

**Files:** `plugins/console/`, `apps/auth/src/settings.ts`
