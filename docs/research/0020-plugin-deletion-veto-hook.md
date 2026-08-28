# Research 0020 — A pre-deletion veto/check hook extending RFC 0033

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/sdk`, `runtime/src/user-deletion.ts`, `runtime/app/api/account/route.ts`, `runtime/app/api/admin/users/[id]/route.ts`, plugin `provideDelete` handlers\
**Related:** [RFC 0033](../rfcs/0033-user-data-deletion.md) (Implemented) — this research proposes extending it, not replacing it. Prompted directly by `sovereign-plugin-tally`'s own `SPEC.md` §7, which independently reached the same conclusion while speccing account-deletion behavior for a joint expense ledger.

---

## Question

RFC 0033's `sdk.portability.provideDelete()` lets a plugin **clean up after** account deletion, but gives it no way to **object before** it happens. Several plugins have data where one user's rows are referenced by, or affect the correctness of, other users' data — deleting them blindly can corrupt someone else's numbers or content, not just the deleted user's own footprint. Should the platform add a generic pre-deletion veto/check hook, and if so, what should it look like?

## Findings

### RFC 0033's actual mechanism cannot veto

`runtime/src/user-deletion.ts:49-108` (`deleteUser()`) runs every registered plugin's
`provideDelete` handler **after** deletion has already started, in parallel, each
wrapped in its own try/catch with a 30s timeout
(`runtime/src/user-deletion.ts:83-99`). A handler that throws only gets its error
recorded in `DeletionSummary.errors` — the cascade continues regardless
(`runtime/src/user-deletion.ts:106-108`, and RFC 0033's own "Security considerations"
confirms this is by design: "if a plugin handler throws, the cascade records the
error... but continues"). There is no return value or mechanism by which a plugin can
pause or cancel the deletion already in progress. `DeletionContext`/`DeletionResult`
(`packages/sdk/src/portability.ts:83-96`) carry no fields that would support one
either.

### The one existing veto in the whole platform is hardcoded, not a hook — and duplicated

Self-deletion cannot proceed if the user is the sole `platform:owner`:
`runtime/app/api/account/route.ts:51-65`. The admin-initiated deletion route has its
own, separately-written version of the same check:
`runtime/app/api/admin/users/[id]/route.ts:39-54`. This is real, working proof that a
pre-deletion block is buildable and already shipped — but it's platform-specific
logic hand-written twice, not a plugin-extensible mechanism. A plugin author cannot
add a case like it without a platform code change.

### The registry a new hook would reuse has a known fragility

`provideDelete` (and `provideExport`/`provideImport`) register into an in-process,
`Symbol.for`-keyed global (`runtime/src/portability/registry.ts:1-30`) that **resets
on restart** and is only populated once a plugin's route has actually served a
request in the current process. This exact gotcha was hit and confirmed for
portability handlers earlier in this repo's own history (see the root `CLAUDE.md`
Status entry for `0.94.3` — a scheduler/job handler resolving the wrong plugin
context — and this session's own verification that Tally's export handler was absent
from a bundle until a Tally page was visited once). Any new veto hook built the same
way inherits the identical risk: a plugin whose process hasn't served a request since
the last restart would silently have **no** registered veto, and deletion would
proceed as if the plugin had no objection — a correctness gap that matters more here
than it does for export/import, where the failure mode is "incomplete backup," not
"a block that should have fired didn't."

### This is not a Tally-specific problem

A survey of every plugin registering `provideDelete` today:

| Plugin     | Strategy                                                                                                                                                                                                                                                                | Joint-data risk today                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tally**  | Deletes only the user's `user_settings` row; every `group_members`/`expenses`/`expense_payers`/`expense_splits`/`settlements` row is deliberately left in place (`SPEC.md` §7) — a joint ledger other members' balances depend on. Wants a real block; can't build one. | Mitigated by design (nothing is deleted), but the _desired_ protection (block deletion while a balance is outstanding) is unbuildable today.                                                                                                  |
| **Docs**   | Ownership-transfer pattern (`plugins/sovereign-plugin-docs.local/app/_lib/portability.ts:320-588`): promotes a co-owner (or the earliest-joined member) before removing the deleting user, hard-deleting only when they're the sole member.                             | Mostly solved — but a sole-owner **folder** with no other members cascade-deletes every document filed in it, _including documents owned by a different user_ (same file, lines 519-546). A real, if narrow, corruption case already shipped. |
| **Sheets** | No handler registered at all, despite a real owner/collaborator model (`workbooks`/`workbookMembers`, `plugins/sovereign-plugin-sheets.local/app/_db/schema.ts:36,73`).                                                                                                 | Currently "protected" only by RFC 0033's own default fallback (unregistered plugins' rows are left in place) — not a deliberate plugin decision.                                                                                              |
| **Kanban** | No handler registered, despite `boards`/`boardMembers`/`projectMembers` (`plugins/sovereign-plugin-kanban.local/app/_db/schema.ts:50-134`).                                                                                                                             | Same as Sheets — unaddressed by omission, not by design.                                                                                                                                                                                      |
| **Warden** | Hard-deletes the user's own private chat history. No sharing model — not comparable.                                                                                                                                                                                    | None.                                                                                                                                                                                                                                         |
| **Ledger** | Every table scoped by `user_id`, no membership/sharing table anywhere.                                                                                                                                                                                                  | None — genuinely single-user.                                                                                                                                                                                                                 |

Three of six plugins with any `provideDelete` handler touch this pattern in some
form; two more (Sheets, Kanban) have collaborative data models with no handler at
all. That's a recurring shape, not a one-off — Tally's own `SPEC.md` §7 reached the
same conclusion independently, arguing this "requires a new platform-level RFC
extending RFC 0033 with a pre-deletion veto/check hook, generalized enough that any
plugin with similar joint-data concerns could use it."

## Options considered

**1. Synchronous pre-check hook** — `sdk.portability.provideDeletionCheck(handler)`,
called once, before `deleteUser()` begins, from both the self-service and admin
routes. Handler returns something like `{ allowed: boolean, reason?: string }`.

- Mirrors the existing sole-owner-check precedent almost exactly — same shape,
  proven to work.
- Needs a single, shared call site (unlike today's duplicated sole-owner check) so
  self-service and admin deletion can't drift out of sync — natural to centralize
  inside `deleteUser()` itself, or a helper both routes call before it.
- Needs an explicit answer for admin override: should `?deleteData=true` bypass a
  plugin veto, or must the admin acknowledge it too? "Operators own their instance"
  argues for an override, but a _silent_ one defeats the point — should probably
  require a second explicit flag and get logged.
- Needs an explicit answer for handler failure: if the check throws or times out,
  does deletion proceed (fail-open, matching how cleanup failures behave today) or
  block (fail-closed)? Fail-closed is the safer default for something whose entire
  job is preventing corruption, but it means a broken plugin can block every
  deletion on the instance — a real operational risk that needs a bound (e.g. still
  honor the existing 30s-timeout-then-treat-as-a-failure shape, but choose which way
  "failure" resolves deliberately, not by accident).

**2. Soft warning only, no real block** — a `provideDeletionWarning()` hook whose
text is surfaced in the confirmation UI (Account → Data / Console → Users) before the
user confirms, without blocking the API call itself.

- Much simpler — no override semantics, no fail-open/fail-closed question.
- Does not close the actual gap: a user could still call `DELETE /api/account`
  directly, bypassing whatever the UI showed them. This is the same soft-warning
  path Tally's own Portability task already found unbuildable in isolation (there is
  no such hook today either) — building only this without option 1 leaves the
  original problem (corruption, not just an unwarned user) unsolved.
- Worth having **as a complement** to option 1, reusing the same handler's `reason`
  text, not as a substitute for it.

**3. Status quo — leave it to each plugin's own handler design.**

- No platform work.
- Docs' own workaround already has a known gap despite real effort. Sheets and
  Kanban have zero protection today and no way to add real protection even if they
  wanted to. The pattern will keep recurring as more plugins with shared/joint data
  ship, each rediscovering the same missing platform capability independently.

**4. Manifest-declared veto capability + route-based check** instead of in-process
SDK registration — a plugin declares a permission (e.g. `deletion:veto`) in
`manifest.json`, and the runtime calls a fixed route on that plugin
(`POST /<routePrefix>/api/deletion-check`) instead of an in-process function.

- Avoids the registry's reset-on-restart fragility entirely — the manifest is
  always known, with no "hasn't served a request yet" gap.
- Real added complexity: a new route convention, HTTP-call timeout handling instead
  of an in-process `Promise.race`, and a second, structurally different pattern
  sitting alongside the three existing SDK-registration-based portability hooks
  (`provideExport`/`provideImport`/`provideDelete`) for no reason other than this
  one hook's own robustness need.

## Recommendation

Option 1 (a synchronous pre-check veto hook) as the core mechanism, complemented by
option 2's UI-surfaced warning sourced from the _same_ handler's returned reason —
not a second, separate hook. Keep the existing in-process SDK-registration model
(matching `provideExport`/`provideImport`/`provideDelete`) rather than jumping to
option 4's manifest+route model, for consistency with the three hooks it sits beside
— but treat the registry's reset-on-restart gap as a real, must-resolve design
question for this specific hook (see Open questions), not a pre-existing quirk to
quietly inherit, given how much higher the stakes are here than for export/import.

Refactor the platform's own sole-owner check to use the new hook once it exists,
rather than leaving it as a third, permanently-separate mechanism. This both
dogfoods the new hook against a real, already-shipped case and removes the existing
duplication between the two route handlers.

This is a recommendation, not a decision — nobody has signed off on building this
yet.

## Open questions

1. **Admin override semantics.** Does `?deleteData=true` bypass a plugin veto
   silently, require a second explicit flag, or never bypass at all (only the
   plugin's own data owner, e.g. reassigning ownership, can clear the veto)? Needs a
   real product decision, not just an API shape.
2. **Fail-open vs. fail-closed on handler error/timeout.** A broken or slow plugin
   check could either let deletions through unchecked (fail-open — quietly reintroduces
   the corruption risk this hook exists to prevent) or block every deletion on the
   instance (fail-closed — a real availability risk for an unrelated plugin bug).
   Needs a resolution before this ships, likely with an admin-visible signal either
   way (a broken veto should be loud, not silent in either direction).
3. **Registry timing.** Does this hook stay in-process/registration-based (matching
   the existing three) and accept the reset-on-restart gap with some mitigation
   (e.g. the runtime warms every installed plugin's registration once at startup by
   hitting a known route?), or does it need the more robust manifest+route model
   (option 4) specifically _because_ the stakes of a silently-missing veto are
   higher than for export/import? This is the one question most likely to change
   the hook's fundamental shape, not just its parameters.
4. **Docs' existing gap.** The sole-owner-folder-cascades-into-others'-documents case
   found during this research is a real, already-shipped bug, independent of whether
   this hook ever gets built. Worth its own fix regardless — not this research doc's
   scope, flagged here so it isn't lost.

## Next steps

Graduates into an RFC extending RFC 0033 (an amendment, not a rewrite — RFC 0033
stays "Implemented" for what it already covers) once open questions 1-3 have real
answers, since they change the wire-level hook signature and the runtime's call
sequence. The one thing that RFC needs to design precisely: the exact hook signature
(request/response shape), the single shared call site both deletion routes use
(replacing today's duplicated sole-owner check), and the resolution to the
registry-timing question above. Until then, Tally's own `SPEC.md` §7 continues to
document "warn, don't block" as the only buildable-today mitigation, and even that
turned out to need no SDK support that exists yet either — both remain blocked on
this graduating into a real RFC.
