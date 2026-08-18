# Workstream 0017 — Auth and security hardening

**Status:** ⏳ In progress — legs 1–2 done (task 1.8, RFC 0035 Phase 1
infrastructure; task 1.9, Phase 2 capability opt-in); legs 3 (task 1.13) and
4 (task 1.19) implemented; leg 5 (task 2.29) paused before 
implementation on a design gap found in RFC 0086 (see its correction note)\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0035](../rfcs/0035-progressive-user-verification.md) (legs 1–2),
[0054](../rfcs/0054-plugin-scoped-roles-and-grants.md) (leg 3),
[0086](../rfcs/0086-shared-store-rate-limiting.md) (legs 4–5)\
**Epics touched:** 1 (Users & Auth), 2 (Platform Shell)

---

## Goal

Close three independent security gaps: a real, functioning trust-level
model (registered → email-verified → MFA-enrolled → admin-vouched) that
capabilities and plugin routes can actually gate on; a standard
plugin-scoped authorization model so plugins don't have to invent their own
role/grant systems; and multi-instance-correct rate limiting for both the
auth server and the general runtime, closing a gap where running more than
one process silently multiplies the effective attempt limit. At the end:
sensitive capabilities can require a verification level, plugins can define
their own roles/grants without becoming platform roles, and brute-force
protection is correct under horizontal scaling.

## Definition of done

- [x] `1.8` — `verification_level` exists on `users`, better-auth hooks
      promote/demote it on email verification and MFA enrollment/removal,
      and it propagates through the session header chain. (Lands on the
      auth database's `user` table via `additionalFields`, not a
      `packages/db` migration — see the epic task's correction note.)
- [x] `1.9` — `hasCapability()` accepts a verification-level check;
      `minVerificationLevel` is annotated on applicable capabilities;
      plugin routes enforce `minVerificationLevel` from the manifest with a
      `verification_required` 403 (API routes) or a redirect to a nudge page
      (page routes) — see the epic task's correction note.
- [ ] `1.13` — plugins can declare role presets and resource-scoped grants
      without granting platform-level access automatically; grant
      create/revoke/change is audited; export/import/delete flows through
      the existing portability hooks; platform-owner override is explicit,
      narrow, and audited.
- [x] `1.19` — `apps/auth`'s rate limiter uses `storage: 'database'`
      instead of per-process memory; `docs/security.md`'s stale
      single-instance caveat is corrected.
- [ ] `2.29` — the general per-IP limiter supports
      `SOVEREIGN_RATE_LIMIT_STORE=redis`, defaulting to unchanged `memory`
      behavior; setting `redis` without `REDIS_URL` fails at startup rather
      than silently falling back.

## Decisions locked

| Decision                   | Choice                                                                                                                                                                       | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                      | Exactly 1.8, 1.9, 1.13, 1.19, 2.29                                                                                                                                           | Splitting into three separate workstreams (verification, plugin authz, rate limiting) — considered, since the three sub-groups are functionally unrelated; kept as one workstream because the developer's own category ("Auth/security hardening") grouped them together, and each sub-group is small enough (2, 1, and 2 tasks) that three separate workstream documents would be more process overhead than the tasks warrant                                     |
| Leg order                  | 1.8 → 1.9 (strict), then 1.13, then 1.19/2.29 (either order, parallel-safe)                                                                                                  | Running 1.9 before 1.8 — impossible; 1.9's own text says "Phase 1 laid the infrastructure; this task makes it functional," a direct sequential dependency, not just a suggested order                                                                                                                                                                                                                                                                               |
| 1.19 vs. 2.29 relationship | Independent legs, no shared code                                                                                                                                             | Building one shared "distributed rate limiter" abstraction for both — rejected; `apps/auth`'s limiter is better-auth's own `storage: 'database'` option (a config flip, no new code), while `runtime`'s is a hand-rolled in-process `Map` needing a new Redis-backed sibling module. They solve the same class of bug in two structurally different systems that don't share a code path — forcing a shared abstraction would add coupling neither system asked for |
| Downstream unblock         | Completing 1.8/1.9 here unblocks [workstream 0015](0015-plugin-extensibility-surface.md)'s leg 4 (Task 3.18, plugin tool contracts), which is gated on this exact dependency | Sequencing this workstream inside 0015 instead of as its own prerequisite — rejected; 1.8/1.9/1.13/1.19/2.29 are a coherent auth/security unit on their own merits, independent of whether 0015 exists, and forcing them under 0015's umbrella would misrepresent this workstream's actual scope to the developer's request                                                                                                                                         |
| Workstream execution       | Legs — one branch, one draft PR, one review gate per leg                                                                                                                     | A single combined PR — rejected for the standard reviewability reason; 1.13 alone is a substantial new authorization model and shouldn't share a review with the smaller rate-limiting config changes                                                                                                                                                                                                                                                               |

## Prerequisites

None blocking leg 1. 1.13's named dependencies (1.5, 1.6, 1.12, 5.1, 8.8, RFC 0051) are already ✅. 1.19 and 2.29 have no dependencies beyond their own
epic descriptions.

**Downstream consumer:** workstream 0015's leg 4 (Task 3.18, plugin tool
contracts) was gated on legs 1–2 here (1.8, 1.9); both shipped together
with that leg in the same branch/PR (PR #455, root `0.91.0`), so the gate
is satisfied.

## Legs

| Leg | Name                                             | Epic tasks | Epics | Gate? | Done when                                                                                   |
| --- | ------------------------------------------------ | ---------- | ----- | ----- | ------------------------------------------------------------------------------------------- |
| 1   | Progressive verification — infrastructure        | 1.8        | 1     | No    | `verification_level` exists and is tracked through auth hooks and session propagation       |
| 2   | Progressive verification — capability opt-in     | 1.9        | 1, 2  | No    | Capabilities and plugin routes can actually gate on verification level                      |
| 3   | Plugin-scoped roles and grants                   | 1.13       | 1     | No    | Plugins can define local roles/grants without becoming platform roles; audited and portable |
| 4   | Database-backed rate-limit storage — `apps/auth` | 1.19       | 1     | No    | Auth server rate limiting is correct across multiple processes                              |
| 5   | Redis-backed rate-limit store — runtime          | 2.29       | 2     | No    | General per-IP limiting is correct across multiple `runtime` processes when enabled         |

Legs 1–2 are strictly sequential. Leg 3 is independent of legs 1/2/4/5 and
may run in parallel. Legs 4 and 5 are independent of each other and of every
other leg here.

## Leg detail

### Leg 1 — Progressive verification, infrastructure

**Epic tasks:** 1.8

**Why this leg is first:** leg 2 has nothing to gate on until this ships —
the four-level trust model and its propagation through sessions is the
prerequisite infrastructure.

**Technical notes:**

- `verification_level` and `verification_events` land as a Drizzle migration
  on both SQLite and Postgres — `0007_user_verification` per the epic;
  verify both dialects, not just whichever is the default local setup.
- better-auth hooks handle both directions: promotion on
  email-verification/MFA-enrollment, and demotion on MFA removal/last-passkey
  deletion — the demotion path is easy to under-test since it's the less
  common flow.
- Session cache invalidation on `onEmailVerification` matters — a stale
  cached session at the old verification level defeats the point of this
  leg.

**Do not proceed if:** N/A — this is new, additive schema and hook wiring
with a documented default (`0`) that doesn't change existing behavior until
leg 2 makes it functional.

### Leg 2 — Progressive verification, capability opt-in

**Epic tasks:** 1.9

**Technical notes:**

- `hasCapability(role, cap, userLevel?)`'s third parameter must be
  backwards-compatible — existing callers that don't pass it must be
  unaffected. Verify this with a regression test, not just a type signature
  read.
- The plugin manifest enforcement path (`min_verification_level` → 403
  `verification_required`) is the actual access-control boundary plugins
  will rely on — get the error body shape right and documented, since it's
  the ergonomic price plugin authors pay for using this feature.
- The shell nudge banner needs to vary its message by which level is
  needed — a generic "verify your account" message doesn't tell a user
  whether they need email verification or MFA enrollment specifically.

**Do not proceed if:** the third-parameter backwards-compatibility claim
doesn't hold under test — existing capability checks silently changing
behavior because of this leg would be a platform-wide authorization
regression, not a scoped bug.

**Done.** Backwards-compatibility verified by grepping every existing
`hasCapability`/`capabilitiesForRole`/`requireCapabilityOrForbidden` call
site before implementing (none checked `user:manage`/`role:assign`, so zero
behavior change for any 2-arg caller) plus a regression test asserting the
omitted-third-arg case explicitly. Landed as a dedicated nudge page
(`/verification-required/[pluginId]`), not an inline shell banner — see the
epic task's correction note for why.

### Leg 3 — Plugin-scoped roles and grants

**Epic tasks:** 1.13

**Technical notes:**

- Keep scoped grants **out of** the global session capability header —
  resolve them inside plugin server code with resource context. This is the
  architectural boundary that keeps plugin-local authorization from leaking
  into platform-wide capability checks.
- Last-owner protection matters for plugin resources where lockout is
  possible — document and enforce it, don't leave it as a known gap.
- Platform-owner override policy: no silent access. Any override must be
  explicit, narrow, audited, and preferably read-only — this is a hard
  requirement per the epic, not a nice-to-have.
- Grant export/import/delete must flow through the existing plugin
  portability hooks (Task 8.8) rather than adding a parallel data-export
  path.

**Do not proceed if:** an override path exists that grants platform-owner
access to plugin-scoped resources without being audited and visible to the
plugin/resource owner — that's the "no silent access" line this task cannot
cross.

**Implemented locally, not yet committed.** Resolved RFC 0054's open
questions using existing codebase precedent rather than inventing new
patterns: no platform grant tables (plugin-owned storage only — SDK
provides types + a `provide()`-style resolver registration mirroring
`sdk.portability.provideExport/Import/Delete` exactly, same
`requireHost()` + `x-sovereign-plugin-id` header pattern, in-process
`Symbol.for` registry on `globalThis`); `roles` added to the manifest
schema now, reusing the existing kebab-case capability-name regex rather
than the RFC's dotted example, plus a cross-field `.refine()` requiring
every role's `capabilities` to already be declared in the manifest's
`capabilities` object; no platform-owner emergency override in v1 (RFC §7
explicitly defers this); no Account/Console "resources shared with me" UI
(RFC's adoption path defers this too); grant export/import/delete
documented as flowing through the existing portability hooks (Task 8.8)
with no new platform code, matching RFC §9's safe-match-or-inert-metadata
rule. Shipped: `packages/manifest/src/schema.ts` (`roles` field + subset
validation), `packages/sdk/src/authz.ts` (`PluginGrant`, `GrantScope`,
`GrantCheck`, `GrantResolver`, `sdk.authz.provide/hasGrant/requireGrant`,
fails closed with no resolver registered), `packages/sdk/src/errors.ts`
(`GrantRequiredError`), `runtime/src/authz-registry.ts` (registry, mirrors
`runtime/src/portability/registry.ts`), `runtime/src/sdk-host.ts` (wiring),
`docs/plugin-development.md` (new "`roles` and `sdk.authz`" section —
manifest field, provider/consumer usage, fail-closed behavior, session
header exemption, assignment/revocation/last-owner-protection rules,
override policy, portability guidance). Tests: 9 new manifest validation
cases, an `authz-registry` unit suite, and an `sdk.authz` behavior suite
(provide/hasGrant/requireGrant, default-deny, header resolution) — full
repo-wide `pnpm format:check && pnpm lint && pnpm typecheck` and the full
Vitest suite (2320 passed) all green.

### Leg 4 — Database-backed rate-limit storage, `apps/auth`

**Epic tasks:** 1.19

**Technical notes:**

- This is genuinely a one-line config flip
  (`rateLimit.storage: 'memory'` → `'database'`) — better-auth's own
  migrator already runs on every startup and will pick up the new table
  automatically. Resist the urge to add anything beyond the flip and the
  doc correction.
- Update `docs/security.md`'s "Login rate limiting" bullet, which currently
  claims in-memory storage is a limitation requiring "a shared secondary
  storage (e.g. Redis)" for multi-instance setups — that claim becomes
  false the moment this leg ships.

**Do not proceed if:** N/A — this is the smallest leg in the workstream by
design; the whole point is that the fix already exists in better-auth's own
option surface.

**Done.** Verified live against the real dev database rather than trusting
the config flip alone: confirmed the `rateLimit` table auto-creates via
`runAuthMigrations()`, then confirmed the actual bug this closes — two
independent `betterAuth()` instances (simulating separate `apps/auth`
processes) built from the same options shared rate-limit counters through
the database, with a 4th sign-in attempt split across the two instances
returning `429`.

### Leg 5 — Redis-backed rate-limit store, runtime

**Epic tasks:** 2.29

**Status: paused before implementation.** `runtime/middleware.ts` runs in
Next.js's Edge runtime, which cannot load `ioredis` (it needs Node's
`net`/`tls` built-ins) — so the "reuse `RedisBroker`'s lazy
`require('ioredis')` pattern" plan below cannot work as written from
`checkGlobalRateLimit`/`clientIp`'s actual call site in middleware. Full
writeup: RFC 0086's "Open questions" section and task 2.29's own correction
note in `docs/epics/platform-shell.md`. This was not caught until this leg's
own implementation attempt — the original technical notes below are kept
for reference but are no longer a validated plan.

**Technical notes (original plan, now blocked — see status above):**

- `SOVEREIGN_RATE_LIMIT_STORE` mirrors `NOTIFICATION_TRANSPORT`'s existing
  shape (`memory` default, `redis` opt-in) — reuse that pattern rather than
  inventing a new config convention.
- Reuse the existing `REDIS_URL` — no second connection string, matching
  `RedisBroker`'s lazy `require('ioredis')` pattern
  (`runtime/src/brokers/redis.ts`).
- `SOVEREIGN_RATE_LIMIT_STORE=redis` with no `REDIS_URL` set must fail at
  startup, not silently fall back to `memory` — a silent fallback here is
  exactly the "looks configured, isn't" failure mode this task exists to
  prevent, per its own goal statement.

**Do not proceed if:** the startup failure on misconfiguration doesn't
actually trigger in testing — a limiter that silently degrades to `memory`
under a Redis outage or misconfiguration defeats this leg's entire purpose.
**Also do not proceed** with any implementation until the Edge-runtime
question above is resolved as its own deliberate, scoped decision — most
likely candidate is enabling Next.js Node.js Middleware for the whole file,
which has platform-wide blast radius and needs its own review, not a
workaround folded quietly into this leg.

## Risks

- **Leg 2 changes a capability-check function signature used platform-wide**
  — even with backwards compatibility as a hard requirement, this is a
  high-blast-radius change to verify carefully, not routine.
- **Leg 3 introduces a new authorization model** — plugin-scoped roles and
  grants are new surface area with real lockout/override risk if the
  last-owner protection or audit requirements are under-built.
- **Legs 4/5 are low risk** — leg 4 is closer to a config flip than a code
  change; leg 5 follows an existing, already-shipped pattern
  (`NOTIFICATION_TRANSPORT`/`RedisBroker`) closely.

## Kill criteria

Legs 4 and 5 are independent of everything else and should ship regardless
of what happens to legs 1–3 — they're small, low-risk, and close a real
security gap on their own. If leg 3 (plugin-scoped roles) turns out to need
more design work than expected, ship legs 1/2/4/5 and split leg 3 into its
own follow-up rather than holding the whole workstream open.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 5 tasks (1.8, 1.9, 1.13, 1.19, 2.29) across three independent sub-groups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.2     | August 2026 | Legs 1–2 shipped (tasks 1.8, 1.9, RFC 0035), merged to `main` as PR #455 at root `0.91.0` (2026-08-14) — bundled with workstream 0015's leg 4 (3.18, RFC 0047) in the same branch/PR, since RFC 0047 gates mutating/external tool execution on the verification level RFC 0035 introduces (a hard dependency, not a soft one). 1.8: `verificationLevel` (0–3) lands as a better-auth `additionalField` on the auth DB's `user` table (not a `packages/db` migration), recomputed whenever email verification, MFA, or admin-vouching state changes, and propagates through the session capability header. 1.9: `hasCapability()` gains a backwards-compatible third parameter (verified by grepping every existing call site plus a regression test asserting the omitted-third-arg case); manifest `minVerificationLevel` enforced with a `verification_required` 403 on API routes and a redirect to a dedicated nudge page (`/verification-required/[pluginId]`) on page routes, not an inline shell banner. |
| 0.3     | August 2026 | Leg 3 (task 1.13, RFC 0054) implemented locally, on its own branch (`feat/plugin-scoped-roles-grants`), separate from legs 4/5's branch(es) — see leg 3's own detail section above for the full shipped-file list and design-decision writeup. Not yet committed within this session; the developer will reconcile this changelog's numbering with legs 4/5's own entry when the leg branches are merged in whatever order they land.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
