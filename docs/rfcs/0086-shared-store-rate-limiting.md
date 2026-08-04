# RFC 0086 — Shared-store rate limiting for multi-instance deployments

**Status:** Draft\
**Date:** August 2026\
**Author:** kasunben\
**Scope:** `apps/auth/src/auth.ts`, `runtime/src/rate-limit.ts`, `runtime/src/brokers/redis.ts` (pattern reused, not modified), `.env.example`, `docs/security.md`, `docs/self-hosting.md`\
**Incorporated into plan:** Yes — epic tasks 1.19, 2.29.

---

## Summary

Sovereign has two independent per-IP rate limiters today, and both are
in-memory and single-process by construction:

1. **`apps/auth`'s better-auth limiter** (`apps/auth/src/auth.ts:113-116`) —
   3 sign-in/sign-up attempts per 10s per IP, 3 password-reset requests per
   60s per IP. `storage: 'memory'`.
2. **`runtime/middleware.ts`'s general per-IP limiter**
   (`runtime/src/rate-limit.ts`) — a coarse flood-protection floor over every
   route the middleware matches, 300 requests/minute per IP by default.
   Also in-memory, added directly against `Map`.

Neither survives an operator scaling past one `runtime`/`auth` process —
each process holds its own independent bucket state, so a client can get up
to N× the intended limit simply by having requests land on different
instances, and every instance's counters reset independently on restart.
This is already a known, documented limitation
(`docs/security.md`'s "Login rate limiting" bullet says as much for #1;
`runtime/src/rate-limit.ts`'s doc comment says as much for #2) — this RFC
proposes closing it for both, with a different backend for each because
their traffic profiles differ by roughly two orders of magnitude.

## Motivation

Sovereign already documents and supports running more than one `runtime`
process/container (PM2 cluster mode, multiple Docker replicas) — see
`docs/self-hosting.md`'s "Notification transport (RFC 0034)" section, which
requires operators in that situation to set `NOTIFICATION_TRANSPORT=redis`
because the default in-process `EventEmitter` transport has no cross-process
visibility. Rate limiting has the identical shape of problem and, unlike the
notification bell (where a missed real-time push degrades gracefully to the
next poll), a rate limiter that silently gets N× weaker under scale-out is a
security regression an operator is unlikely to notice — nothing errors,
nothing logs, the limit just quietly stops being the limit.

This matters most for `apps/auth`: brute-force/credential-stuffing
protection on sign-in is the security-critical case rate limiting exists
for in the first place, and it's the one currently most exposed if an
operator scales `apps/auth` without realizing its limiter doesn't follow.

## Current state (what this builds on)

- **better-auth 1.6.25** (the pinned version, `apps/auth/package.json:18`)
  ships three built-in rate-limit storage backends, selected via
  `rateLimit.storage`:
  - `'memory'` (current default/explicit setting) — an in-process `Map`.
  - `'database'` — reads/writes a `rateLimit` table through the same
    adapter better-auth already uses for `user`/`session`/`account`/etc.
    Atomic increment via a conditional `UPDATE ... WHERE count < max`
    (`node_modules/better-auth/dist/api/rate-limiter/index.mjs`, function
    `createDatabaseStorageWrapper`) — correct under concurrent processes,
    not just concurrent requests in one process.
  - `'secondary-storage'` — delegates to whatever object is passed as
    `secondaryStorage`, via `get`/`set`/`increment`. If `increment` is
    provided, it's used for atomic consume (`getRateLimitStorage`,
    `storage === 'secondary-storage'` branch); Redis's `INCR` is the
    canonical fit.
  - There's also `customStorage`, a full escape hatch (same file), not
    needed here.
- **`apps/auth` manages its own database access directly**
  (`apps/auth/src/db.ts`), passing the raw driver (`better-sqlite3` or
  `pg.Pool`) straight to better-auth. better-auth's own migrator
  (`apps/auth/src/migrate.ts`, `getMigrations(getAuthOptions())`) generates
  and applies schema for whatever tables its own options imply — this
  already runs on every startup. Turning on `storage: 'database'` needs no
  hand-written schema or migration: the `rateLimit` table appears in
  better-auth's own generated migration set as soon as the option is set,
  the same way `user`/`session`/`account` already do.
- **`runtime` already has `ioredis` as a dependency** and an established
  Redis integration pattern: `runtime/src/brokers/redis.ts`'s
  `RedisBroker`, gated behind `REDIS_URL`
  (`docs/self-hosting.md`'s "Notification transport" section,
  `.env.example:230-235`), with `ioredis` imported lazily via `require()`
  so the module import cost is paid only when Redis mode is actually
  selected. `apps/auth` does **not** currently depend on `ioredis`.
- **`runtime/src/rate-limit.ts`** (added by the general per-IP limiter,
  landed just before this RFC) is a fixed-window bucket keyed by client IP,
  same shape as `directory.ts`/`plugin-mailer.ts`'s existing per-feature
  limiters, but held in a bare in-process `Map` with no storage
  abstraction — there's currently nothing to swap out.

## Proposed design

Two independent changes, matched to each limiter's traffic profile.

### `apps/auth`: switch to `storage: 'database'`

```ts
// apps/auth/src/auth.ts
rateLimit: {
  enabled: process.env.NODE_ENV !== 'test',
  storage: 'database',
},
```

Sign-in/sign-up/reset traffic is inherently low-volume (a handful of
attempts per user per session at most) — a database round-trip per attempt
is negligible overhead, and it's the same database (SQLite or Postgres)
`apps/auth` already talks to for every other request, so this adds no new
infrastructure, no new dependency, and no new failure mode beyond "the auth
database is unavailable," which is already fatal to sign-in regardless.
It also means the fix scales itself correctly: an operator who's outgrown
SQLite's single-file model has already moved to Postgres for the primary
auth data, and the rate limiter's correctness now rides on that same
decision instead of needing a second one.

No new env var. `.env.example`/`docs/security.md` get a wording update
(see "Docs impact" below) since the "in-memory per process... sufficient
for single-instance deployments" caveat stops being true.

### `runtime`'s general per-IP limiter: optional Redis backend, mirroring `NOTIFICATION_TRANSPORT`

Unlike `apps/auth`, this limiter runs on **every** matched request, not just
auth attempts — routing that through the primary platform database would
add a write to shared, latency-sensitive infrastructure on every page load
and API call, which is the wrong trade. Redis's `INCR`/`PEXPIRE` is built
for exactly this access pattern and is already optional, established
infrastructure in this codebase.

Proposed shape, following the `NOTIFICATION_TRANSPORT` precedent closely
enough to be immediately familiar to anyone who's already configured that:

```
SOVEREIGN_RATE_LIMIT_STORE=memory|redis   # default: memory
```

- `memory` (default): today's behavior, unchanged — the existing `Map` in
  `runtime/src/rate-limit.ts`. Zero-config, correct for the default
  single-container topology.
- `redis`: `checkGlobalRateLimit` delegates to a small Redis-backed bucket
  (new sibling file, e.g. `runtime/src/rate-limit-redis.ts`) using the same
  lazy-`require('ioredis')` pattern as `RedisBroker`, keyed the same way
  (`sv:ratelimit:<ip>`), using `INCR` + `PEXPIRE NX` (or a small Lua script
  for atomicity — better-auth's own database path is a useful reference for
  how much atomicity actually matters here) instead of the in-memory
  `Map`. Reuses `REDIS_URL` — no second Redis connection string.
- Requires `REDIS_URL` to be set when `SOVEREIGN_RATE_LIMIT_STORE=redis`;
  fails closed at startup (consistent with this codebase's "no secrets with
  defaults" posture applied to required config, not just secrets) rather
  than silently falling back to memory, since a silent fallback here is
  exactly the "looks configured, isn't" failure mode this RFC exists to
  avoid.

`docs/self-hosting.md`'s existing "If you run more than one runtime
container or process, you must set..." callout gets a second bullet
alongside `NOTIFICATION_TRANSPORT=redis` for this.

### Why not one unified store for both

Considered — a single new abstraction (e.g. `packages/rate-limit-store` or
an addition to `packages/db`) exposing `get`/`set`/`increment` with two
backends, consumed by both `apps/auth` (via better-auth's `customStorage`)
and `runtime/src/rate-limit.ts`. Rejected for this RFC: `apps/auth`
deliberately does not depend on `packages/db` (`apps/auth/src/db.ts:37-38`,
"mirrors packages/db; not imported, as the auth server intentionally does
not depend on packages/db") — introducing a new shared package both apps
depend on cuts against that existing boundary for a feature where the two
sides don't actually want the same backend anyway (one wants the primary
DB, one wants Redis). Two small, independent changes that each reuse an
existing in-house pattern is less total surface than one new cross-app
abstraction. Worth revisiting only if a third rate limiter shows up with
its own shared-store need.

## Alternatives considered

- **`apps/auth` also on Redis (`secondary-storage`)** — only sensible if the
  instance is already running Redis for notifications; otherwise it's new
  required infrastructure for a low-volume path that the database backend
  already solves for free. Would need `ioredis` added as a new `apps/auth`
  dependency (currently `runtime`-only). Not worth the extra moving part
  when `storage: 'database'` is a one-line, zero-new-dependency fix.
- **Leave both as documented, accepted limitations** — the status quo.
  Rejected because Sovereign already treats "more than one process" as a
  supported, if advanced, deployment shape (RFC 0034), and a rate limiter
  that quietly weakens under exactly that shape is worse than one that
  requires explicit opt-in configuration to scale correctly.
- **Make `runtime`'s limiter always require Redis once any scaling is
  detected** — no reliable way to auto-detect "more than one process" from
  inside one process; matches why `NOTIFICATION_TRANSPORT` is also an
  explicit operator choice, not auto-detected.

## Open questions

- Exact atomicity mechanism for the Redis-backed general limiter (`INCR` +
  conditional `PEXPIRE` vs. a small Lua script) — a leg-detail item, not a
  design blocker; better-auth's own `secondary-storage` branch
  (`getRateLimitStorage`, `ctx.options.secondaryStorage.increment`) is a
  reasonable reference implementation to match.
- Whether `SOVEREIGN_RATE_LIMIT_STORE=redis` without `REDIS_URL` set should
  fail at startup (proposed above) or fail the first request — startup is
  preferred (fail fast, matches "no secrets with defaults") but worth
  confirming against how `NOTIFICATION_TRANSPORT=redis` currently handles
  the same missing-`REDIS_URL` case, for consistency.
- Whether `apps/auth`'s switch to `storage: 'database'` needs a
  regression test asserting the `rateLimit` table actually appears after
  `runAuthMigrations()` runs, or whether better-auth's own test coverage of
  that path is trusted as-is.

## Adoption path

Documentation-first. Two small, independently shippable changes once
scheduled:

1. `apps/auth`'s `storage: 'database'` flip — smaller of the two, no new
   dependency, could ship alone ahead of the Redis-backed `runtime` change
   if prioritized separately.
2. `runtime`'s `SOVEREIGN_RATE_LIMIT_STORE` option — adds a new sibling
   module and one new env var; `.env.example`/`docs/self-hosting.md` need
   the docs-parity updates the existing convention requires.

No SDK, manifest, or published-package surface changes. No breaking change
to either limiter's default behavior — `memory` stays the default for
`runtime`, and `apps/auth`'s switch to `database` storage doesn't change
its externally-visible 429/`X-Retry-After` behavior, only where the counters
live.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
