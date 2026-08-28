# RFC 0096 — Plugin pre-deletion veto hook

**Status:** Draft\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/manifest` (new `deletion:veto` permission), `packages/sdk` (`DeletionCheckRequest`/`DeletionCheckResult` types, `sdk.auth.verifyPlatformCall()`), `runtime/src/user-deletion.ts`, `runtime/app/api/account/route.ts`, `runtime/app/api/admin/users/[id]/route.ts`, `plugins/console` (admin override UI), `plugins/account` (blocked-deletion message), `docs/plugin-development.md`, `docs/architecture-rules.md`; **amends [RFC 0033](0033-user-data-deletion.md)** (adds a pre-deletion check the existing cascade does not have; RFC 0033 stays "Implemented" for everything it already covers).\
**Incorporated into plan:** No — documentation-first. Design only; not yet scheduled in `ROADMAP.md`.

---

## Summary

Gives a plugin a way to **block** account deletion before it starts, not just clean up
after it. A plugin declares a new manifest permission, `deletion:veto`, and implements
a fixed route, `POST <routePrefix>/api/deletion-check`; the runtime calls it for every
enabled plugin that declares the permission, before either deletion route proceeds. Any
plugin that says no blocks the deletion with a `409` and a human-readable reason — with
one exception: an admin (never a self-deleting user) can pass a second, explicit query
flag to override a plugin's veto, and that override is written to the audit log. A
plugin whose check fails or times out blocks the deletion the same way a real veto
would (fail-closed), reusing the existing 30s-per-handler timeout RFC 0033 already
established for cleanup handlers.

This also folds in the one veto the platform already has — "the sole `platform:owner`
cannot self-delete" — currently hand-written twice, once per deletion route. Both
routes call one new function; the duplication goes away as a side effect of building
the general mechanism.

## Motivation

[Research 0020](../research/0020-plugin-deletion-veto-hook.md) found that RFC 0033's
`provideDelete` hook runs plugin cleanup **after** deletion has already started, in
parallel, with no way for a handler to object — a handler that throws only gets logged;
the cascade continues regardless. That's fine for a plugin whose data is wholly owned by
the deleted user, but several plugins have data where one user's row affects another
user's correctness:

- **Tally** deliberately leaves every `expenses`/`expense_splits`/`settlements` row in
  place rather than delete a joint ledger other members' balances depend on — but wants
  a real block ("don't let someone with an outstanding balance delete their account"),
  and there is no SDK surface for that today. Tally's own `SPEC.md` §7 independently
  reached the same conclusion while speccing this behavior.
- **Docs** already ships a real, if narrow, corruption case: a sole-owner folder with no
  other members cascade-deletes every document filed in it, including documents owned by
  a _different_ user (`plugins/sovereign-plugin-docs.local/app/_lib/portability.ts:519-546`).
- **Sheets** and **Kanban** have real collaborator/owner data models
  (`workbookMembers`; `boardMembers`/`projectMembers`) and register no deletion handler
  at all — "protected" only by RFC 0033's default fallback (an unregistered plugin's
  rows are left in place), not by design.

Three of six plugins that register any deletion handler already touch this shape; two
more have a collaborative data model and no handler. This is a recurring gap, not a
one-off, and it will keep recurring as more plugins ship shared or joint data — each one
rediscovering, independently, that the platform gives them no way to say "not yet."

## Current state (what this builds on)

- `runtime/src/user-deletion.ts:49` (`deleteUser()`) runs every plugin's `provideDelete`
  handler in parallel, each in its own try/catch, raced against a 30s timeout
  (`DELETION_TIMEOUT_MS = 30_000`, line 18; race at lines 84–99). A handler's error is
  recorded in `DeletionSummary.errors`; the cascade proceeds regardless (lines 76,
  94–121).
- The one existing veto — sole `platform:owner` cannot self-delete — is hand-written
  twice, with no shared code and no override: `runtime/app/api/account/route.ts:51-65`
  (self-service, returns `409`) and `runtime/app/api/admin/users/[id]/route.ts:39-54`
  (admin-initiated, its own separately-written check). Both call `deleteUser()`
  unconditionally afterward — `runtime/app/api/account/route.ts:89`,
  `runtime/app/api/admin/users/[id]/route.ts:88`.
- `packages/sdk/src/portability.ts:83-99` defines `DeletionContext`, `DeletionResult`,
  and `DeletionHandler`; `provideDelete()` (line 166) registers a handler into an
  in-process, `Symbol.for`-keyed global (`runtime/src/portability/registry.ts`) that
  resets on restart and is only populated once a plugin's own route has served a
  request in the current process. Research 0020 flagged this as an acceptable risk for
  export/import (failure mode: incomplete backup) but not for a hook whose entire job
  is preventing corruption — a plugin that silently has no registered veto is worse
  than a plugin that silently has no export.
- Plugin-owned API routes are real and already composed into the live runtime today,
  independent of this RFC: `plugins/warden/app/api/chat/route.ts` is copied by
  `scripts/generate/compose-routes.ts`'s `composePlugins()` (lines 174–215) into
  `runtime/app/(platform)/(plugins)/warden/api/chat/route.ts` and served at
  `/warden/api/chat`. This is separate from `runtime/src/api-namespace.ts`'s
  `RESERVED_API_SEGMENTS`, which only governs the top-level public `/api/<slug>/*`
  namespace via the `apiProvider` manifest flag.
- There is no existing precedent, anywhere in `runtime/src`, for the runtime calling a
  plugin's logic over same-process HTTP. Every current runtime→plugin invocation —
  `provideDelete`/`provideExport`/`provideImport`, job handlers
  (`runtime/src/jobs.ts:171-172`), schedule handlers (`runtime/src/scheduler.ts:85-93`)
  — is an in-process function reference. The closest existing same-process self-fetch
  pattern is `runtime/src/middleware/plugin-gate.ts`'s calls to the runtime's own admin
  API (`SELF_URL`, line 39; e.g. line 85), authenticated with
  `Authorization: Bearer ${process.env.SOVEREIGN_ADMIN_KEY}` and checked on the
  receiving end by `checkAdminKey()` (`runtime/src/admin-guard.ts:8-20`).
- `packages/manifest/src/schema.ts:20-45` (`permissionSchema`) is a closed `z.enum(...)`
  — adding a new permission means adding a new literal to this list, the same way
  `data:export`/`data:import` (lines 33–34) were added for RFC 0007.
- `plugins/console`'s admin actions already read `process.env.SOVEREIGN_ADMIN_KEY`
  directly and send it as a bearer token to `runtime/app/api/admin/*` routes
  (`plugins/console/app/users/actions.ts:34,53,75`) — same-process plugin code already
  has, and legitimately uses, read access to this env var today, for a first-party
  plugin.
- Sovereign plugins of `type: sovereign`, `runtime: native` (which covers every plugin
  discussed in this RFC) are built and served from the **same** Next.js process as the
  runtime (`runtime/package.json:9-10` — one `next build`/`next start`). There is no
  per-plugin process isolation.

## Proposed design

### Manifest permission

Add `'deletion:veto'` to `permissionSchema` (`packages/manifest/src/schema.ts:20-45`),
next to `data:export`/`data:import`. A plugin opts in by adding it to its own
`permissions` array — same as any other permission — and by implementing the route
below. Declaring the permission with no route implemented is a plugin bug (the check
call fails closed and blocks every deletion — see Fail-closed behavior below), not a
platform concern; `docs/plugin-development.md`'s permissions table documents the
contract.

### The deletion-check route

A plugin declaring `deletion:veto` must implement:

```
POST <routePrefix>/api/deletion-check
Authorization: Bearer <SOVEREIGN_ADMIN_KEY>
Body: DeletionCheckRequest = { userId: string; tenantId: string }

200 → DeletionCheckResult = { allowed: boolean; reason?: string }
```

`reason` is required when `allowed: false` — it is the only thing shown to the admin
(and, for a self-service attempt, the user) explaining the block. Any non-`200`
response, a malformed body, a thrown error, or no response within the existing 30s
`DELETION_TIMEOUT_MS` is treated identically to `{ allowed: false }` — see
Fail-closed behavior.

`DeletionCheckRequest`/`DeletionCheckResult` are added as type-only exports next to
`DeletionContext`/`DeletionResult` in `packages/sdk/src/portability.ts` — plugin authors
get type safety for their route handler without any new SDK registration function.
There is deliberately no `sdk.portability.provideDeletionCheck()`: that would recreate
the in-process registry this RFC exists to avoid (see Alternatives considered).

This reuses the exact composition mechanism Warden's `app/api/chat/route.ts` already
proves works — no change to `compose-routes.ts` is needed. What's new is the runtime
actually calling in, and authenticating that call.

### Authenticating the runtime's call

The runtime calls `${SELF_URL}${manifest.routePrefix}/api/deletion-check` (same
`SELF_URL` convention as `plugin-gate.ts:39`) with
`Authorization: Bearer ${process.env.SOVEREIGN_ADMIN_KEY}` — the same bearer-token
pattern already used for every other same-process runtime self-call.

**This does not cryptographically distinguish "the runtime" from "another installed
plugin."** Every `type: sovereign, runtime: native` plugin runs in the same process and
can already read `process.env.SOVEREIGN_ADMIN_KEY` — Console already does, legitimately,
for its own admin calls. A per-call signed token was considered and rejected (see
Alternatives considered): same-process code sharing means there is no secret a plugin's
own JS cannot read, so a stronger token buys ceremony, not a stronger boundary. The
platform's existing trust model already treats an installed, admin-enabled plugin as
trusted code — it can read arbitrary env vars, and nothing here changes that. What the
bearer check **does** protect against, and the reason it's still worth doing rather than
leaving the route open, is an **external, unprivileged caller** hitting
`POST /tally/api/deletion-check` directly — without the key, they get `403`, the same
protection `checkAdminKey()` gives every other admin-only route today. This is
documented explicitly as an accepted limitation, not silently assumed away — see
Security considerations.

A new SDK helper, `sdk.auth.verifyPlatformCall(request: Request): boolean`
(`packages/sdk/src/auth.ts`, alongside `hasCapability`), wraps the check so plugin
authors write `if (!sdk.auth.verifyPlatformCall(request)) return new Response(null, { status: 403 })`
instead of hand-rolling a comparison against `process.env.SOVEREIGN_ADMIN_KEY`
themselves. Plugin code cannot import `checkAdminKey()` directly — it lives in
`runtime/src`, off-limits under the SDK boundary rule — so this helper is the one
correct, tested way to do the check, rather than leaving every plugin author to get the
comparison right on their own.

### The shared call site

`runtime/src/user-deletion.ts` gains a new function, run as the first step of
`deleteUser()`:

```ts
type PreDeletionCheckResult =
  { blocked: false } | { blocked: true; blockedBy: string; reason: string; overridable: boolean };

async function runPreDeletionChecks(
  userId: string,
  tenantId: string,
  opts: { overridePluginVetoes: boolean },
): Promise<PreDeletionCheckResult>;
```

It runs two layers, in order:

1. **The platform's own sole-owner check**, in-process (no HTTP, no manifest
   involved) — the exact logic currently duplicated at
   `runtime/app/api/account/route.ts:51-65` and
   `runtime/app/api/admin/users/[id]/route.ts:39-54`, moved here once.
   `blockedBy: 'platform:sole-owner'`, `overridable: false` — this is a hard invariant
   (an instance cannot have zero owners), not a plugin's data-integrity objection, and
   `opts.overridePluginVetoes` has no effect on it.
2. **Every enabled plugin declaring `deletion:veto`** (from `getInstalledPlugins()`,
   `runtime/src/registry.ts:18`, filtered by `permissions.includes('deletion:veto')` and
   cross-referenced against active `plugin_status` rows — a **disabled** plugin's veto
   does not run, matching how `plugin-catalog.ts`'s `getPluginCatalog()` already
   combines the two), called in parallel via `Promise.race` against the existing
   `DELETION_TIMEOUT_MS`, exactly mirroring the pattern `deleteUser()` already uses for
   `provideDelete` cleanup handlers. The first `allowed: false` (or failure — see below)
   short-circuits the rest. `blockedBy: <pluginId>`, `overridable: true`.

`deleteUser()`'s own signature changes to surface this:

```ts
type DeletionOutcome =
  | { blocked: true; blockedBy: string; reason: string }
  | { blocked: false; summary: DeletionSummary };

async function deleteUser(
  userId: string,
  tenantId: string,
  opts?: { overridePluginVetoes?: boolean },
): Promise<DeletionOutcome>;
```

Both routes call this one function and branch on `outcome.blocked`, returning `409`
with `{ error: outcome.reason, blockedBy: outcome.blockedBy }` when blocked — the exact
status code the sole-owner check already returns today, now generalized. This removes
both routes' own copies of the sole-owner check as a direct consequence of centralizing
the call site, which was the actual duplication problem Research 0020 flagged, not an
extra cleanup step bolted on afterward.

### Admin override

`runtime/app/api/account/route.ts` (self-service) **never** passes
`overridePluginVetoes` — its call site has no such option, so a self-deleting user can
never bypass a plugin's veto, structurally, not just by convention.

`runtime/app/api/admin/users/[id]/route.ts` (admin-initiated) accepts a **second**,
independent query flag: `?deleteData=true&overridePluginVetoes=true`. `deleteData=true`
alone still runs `runPreDeletionChecks()` and returns `409` on any `overridable: true`
block; only the second flag suppresses it. The sole-owner block (`overridable: false`)
ignores this flag entirely — there is no way to delete an instance's last owner through
this route, override or not.

When an override actually suppresses a real block (i.e. `runPreDeletionChecks()` would
otherwise have blocked), `deleteUser()` writes a new activity-log event,
`account.deletion_veto_overridden`, before proceeding — actor: the admin;
metadata: `{ targetUserId, blockedBy, reason }`. If the flag is passed but nothing was
actually blocked, nothing is logged — the audit trail records overrides that happened,
not defensive flags that were passed and did nothing.

### Fail-closed behavior

A plugin's deletion-check call is treated as `{ allowed: false }` if it throws, times
out, returns a non-`200` status, or returns a body that doesn't parse as
`DeletionCheckResult`. `reason` in that case is a fixed platform string —
`"<pluginId>'s deletion check failed to respond"` — not anything plugin-supplied, since
there is nothing plugin-supplied to show. This block is `overridable: true` (an admin
still has an escape hatch for an instance with a broken plugin — the availability risk
Research 0020 flagged for a instance-wide fail-closed default), but the resulting
`account.deletion_veto_overridden` log entry's `reason` makes clear this was a **failed
check**, not a plugin's real objection, so an admin reviewing the audit log later can
tell the difference.

### UI flows

**Account → Data** (self-service): the existing "Delete my account" confirmation
dialog's password-verification call now returns `409` with a `reason` when blocked. The
dialog shows that reason in place of the generic error and offers no override —
consistent with "self-service can never bypass a veto." The user's only path forward is
whatever the plugin's reason describes (e.g. "settle your balance in Tally first").

**Console → Users**: the existing `[Delete…]` confirmation dialog's call to
`DELETE /api/admin/users/[id]?deleteData=true` now also may return `409`. On a block
with `overridable: true`, the dialog shows the reason and a second, explicit
confirmation step — a checkbox or a re-styled second button, not a silent retry —
before resubmitting with `&overridePluginVetoes=true`. On `overridable: false` (the
sole-owner case), the dialog shows the reason with no override control at all, matching
today's behavior.

## Alternatives considered

**Keep the in-process SDK-registration model** (`sdk.portability.provideDeletionCheck()`,
matching `provideExport`/`provideImport`/`provideDelete`) — Research 0020's own
Recommendation section originally favored this, for consistency with the three existing
hooks. Rejected once the registry's reset-on-restart gap was weighed against this
hook's actual stakes: a plugin whose process hasn't served a request since the last
restart would have **no registered veto at all**, and deletion would proceed as if the
plugin had no objection — a silent correctness gap, not a degraded-but-safe fallback.
Export/import degrade to "incomplete backup" the same way; this hook degrades to "the
corruption it exists to prevent, happening anyway." A startup warm-up pass (visiting
every installed plugin once after boot to force registration) was also considered as a
mitigation and rejected — it narrows the window but doesn't close it (a plugin enabled
after boot, or a dev-mode hot reload, still has the gap), and manifest-declared
permissions have no such window at all: the manifest is static, known at every deletion
attempt regardless of whether the plugin's process code has run yet.

**A stronger per-call signed token instead of `SOVEREIGN_ADMIN_KEY`** — e.g. the runtime
generates a single-use, cryptographically random token per deletion attempt and expects
the plugin to echo it back for verification. Rejected: verifying an echoed token still
requires the plugin to check it against _something_ the runtime told it, and same-process
JS has no facility to keep that something secret from other same-process JS — there is
no Node-level sandboxing between plugins and the runtime here. A stronger token adds
real implementation complexity for a boundary that same-process code-sharing cannot
actually provide, regardless of which secret is used. See Security considerations for
what the bearer check is actually good for.

**Soft warning only, no real block** (`provideDeletionWarning()`, surfaced in the
confirmation UI without blocking the API call) — this is Research 0020's Option 2.
Rejected as a standalone mechanism: a user or script calling `DELETE /api/account`
directly bypasses whatever the UI showed, leaving the actual corruption risk unsolved.
Kept as a side effect of this design instead of a separate hook — the same `reason`
string a veto returns is exactly what the UI already needs to show; there is no second
mechanism to build.

**Status quo** — no platform mechanism, left to each plugin's own handler design.
Rejected per Research 0020's survey: three of six plugins registering any deletion
handler already touch this pattern, and Docs' own workaround already shipped a real gap
despite genuine effort. The pattern will keep recurring.

## Security considerations

- **The runtime→plugin bearer check does not defend against a malicious co-resident
  plugin.** `SOVEREIGN_ADMIN_KEY` is a `process.env` value, and every
  `type: sovereign, runtime: native` plugin shares the runtime's own process — nothing
  stops a plugin's server code from reading it and either forging a call to another
  plugin's `/api/deletion-check` route, or reading it to detect it's being asked a
  real deletion-check question. This is not a new hole this RFC introduces: the
  platform's trust model already treats an admin-installed plugin as trusted code with
  full same-process access (`plugins/console` already reads and uses this exact key),
  and an adversarial-plugin threat model doesn't exist anywhere else in the platform
  today either. It is accepted here explicitly, not silently inherited.
- **What the bearer check does protect: an external, unprivileged caller.** Without
  `SOVEREIGN_ADMIN_KEY`, a request to `POST /tally/api/deletion-check` from outside the
  process gets `403`, same as every other admin-gated route. Absent this check, the
  route would otherwise be reachable by anyone who can reach the plugin's own public
  routePrefix — a real information-disclosure risk (e.g. probing whether a given user
  has an outstanding balance) even setting aside deletion entirely.
- **Fail-closed has an availability cost, by design.** A broken or slow
  `deletion:veto` plugin blocks every admin and self-service deletion attempt on the
  instance until either the plugin is fixed or an admin exercises the override on each
  attempt. This is the deliberate tradeoff Research 0020's Decision recorded: silently
  letting deletions through when a check can't be trusted (fail-open) reintroduces
  exactly the corruption this hook exists to prevent. The override exists specifically
  so this isn't a hard availability failure, only friction.
- **A self-deleting user can never bypass a veto.** `overridePluginVetoes` has no code
  path from the self-service route — there is no query parameter, flag, or header a
  user could pass to trigger it. Only the admin-initiated route accepts it, and doing
  so is written to the audit log every time it actually suppresses a block.
- **The sole-owner block is never overridable**, by either route, regardless of any
  flag — an instance cannot reach zero `platform:owner` users through this mechanism.

## Open questions

1. **Docs' sole-owner-folder cascade bug** (Research 0020, finding 4) is real and
   already shipped, independent of whether this RFC lands. Out of this RFC's scope —
   flagged here so it isn't lost, and because once `deletion:veto` exists, Docs is a
   natural first adopter for the underlying case this bug is a symptom of.
2. **Console health visibility for a chronically-broken veto check.** A plugin whose
   `/api/deletion-check` route is permanently broken makes every admin deletion attempt
   for every user fail closed, one 409 at a time, each requiring its own override click.
   Should Console surface this as a standing health warning (similar to existing plugin
   health/status signals) rather than relying on an admin to notice the pattern across
   repeated per-attempt failures? Left open — the per-attempt fail-closed behavior and
   audit log are the v1 mechanism either way.
3. **Reason text handling.** A plugin's `reason` string is shown directly to an admin
   (and, for a non-overridable block, to the deleting user themselves). Does it need
   length capping or sanitization beyond what the UI's existing text-rendering already
   does for other plugin-supplied strings (e.g. activity log descriptions)? Likely no
   new handling needed — flagged for the implementer to confirm against existing
   precedent rather than assumed.

## Adoption path

Documentation-first: this RFC is not yet scheduled. Once accepted, implementation is
one platform-side epic task (manifest permission, SDK types + `verifyPlatformCall()`,
the `runPreDeletionChecks()`/`deleteUser()` refactor, both routes, both UI flows) —
`docs/plugin-development.md`'s permissions table and `docs/architecture-rules.md` need
the corresponding doc updates in the same PR per the platform's parity convention.
Plugin adoption (Tally, Docs, Sheets, Kanban each implementing their own
`/api/deletion-check` route) is separate follow-up work per plugin, not part of this
RFC's own implementation — the platform capability has to exist before any plugin can
build against it.

**Semver:** `@sovereignfs/manifest` — minor (new permission enum value, additive).
`@sovereignfs/sdk` — minor (`DeletionCheckRequest`/`DeletionCheckResult` type exports,
`sdk.auth.verifyPlatformCall()`; both additive, no existing signature changes).
`runtime` — minor (`deleteUser()`'s signature change is internal to `runtime/src`, not
a public contract; both routes' response shape gains a `blockedBy` field on the
existing `409`, additive). `plugins/console`, `plugins/account` — patch (UI changes,
no manifest/permission changes of their own).

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
