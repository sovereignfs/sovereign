# RFC 0023 — SDK distribution & the plugin isolation boundary

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/sdk` (contract vs host-provided implementation), `packages/db` + `packages/mailer` (stay private), `.github/workflows/publish.yml` (`sdk-v*`), CLAUDE.md (the "not npm-installable" caveat + "published" designation), the SRS decision log, Task 0.5.20; **amends RFC 0017** (its publish prerequisite); contrasts `@sovereignfs/ui` (portable)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.21; documentation-first. This RFC settles what a plugin can do in isolation and, from that, the SDK's distribution model; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Decide whether and how to publish `@sovereignfs/sdk` by first answering the question
underneath it: **what can a plugin actually do in isolation?** The answer —
**author and type-check, yes; build-as-an-app and run, no** — determines that the
SDK has no meaningful _runtime_ existence outside the host. So:

- **Drop the "bundle the private `db`/`mailer` into the SDK via `noExternal`" plan**
  (the standing follow-up). It would ship platform internals — including a native
  dependency — that never usefully run for a consumer.
- If isolated _authoring_ is a goal, **publish the SDK as a types-first contract**
  (host-provided/guarded implementations, **zero `db`/`mailer` dependency**), which
  also dissolves the private-deps blocker entirely. Otherwise **don't publish** and
  standardise on develop-in-a-checkout.
- Either way, **state plainly that plugins are host-hosted**: there is no standalone
  build or run; the dev/test loop always uses a runtime (RFC 0017's `sv`/checkout
  flow).

## Motivation

A standing follow-up — "make `@sovereignfs/sdk` npm-installable" (CLAUDE.md Task
0.5.07 caveat; an RFC 0017 prerequisite) — assumed the fix was to bundle the private
`@sovereignfs/db`/`@sovereignfs/mailer` into the SDK's `dist`. Before doing that, the
real question is whether publishing the SDK is _meaningful_ at all. As the user put
it: with no centralised service layer, the SDK has no existence outside the main
codebase — so is publishing pointless? Validating that requires settling the plugin
**isolation boundary** first; the distribution model falls out of it.

## Current state / evidence

The SDK is **in-process host glue with no service layer** — every surface is bound to
the running host:

- `sdk.auth.getSession()` reads middleware-injected `next/headers`
  (`packages/sdk/src/auth.ts:10`) — `x-sovereign-user-*` exist only because the
  runtime injected them; elsewhere it returns `null`. The mutating methods `fetch`
  the host's auth server at `SOVEREIGN_AUTH_URL` with a forwarded session cookie.
- `sdk.db.getClient()` calls `getPlatformDb()` (`db.ts:12`) — opens the platform DB
  **in the current process**, pulling the native `better-sqlite3` dep through the
  private `@sovereignfs/db`.
- `sdk.platform.getConfig()` (`platform.ts:35`) reads the platform DB directly and
  the workspace-root `package.json` — its own comment returns `'0.0.0'` "in
  standalone contexts" (`platform.ts:18-26`).
- `sdk.mailer.send()` (`mailer.ts`) instantiates the private `@sovereignfs/mailer`
  from `process.env`.

And **composition shadows the plugin's SDK**: a plugin's `app/` is copied into the
runtime and compiled by the runtime's `next build` (`scripts/generate-registry.ts`),
so `@sovereignfs/sdk` resolves to the **host's** workspace copy — the plugin's own
installed SDK is **never executed** in the real path.

**The UI contrast:** `@sovereignfs/ui` is presentational (React components + `--sv-`
tokens). It renders anywhere, has no host binding, and is already publishable. The
SDK is host-bound; UI is not. This asymmetry is why UI publishing was never the
problem and the SDK question is real.

The current docs assume the SDK will be published with bundled implementations:
CLAUDE.md flags the private-deps caveat as "a separate follow-up before any `sdk-v*`
tag"; the SRS decision log lists `sdk`+`ui` as published and claims "the published
SDK has no runtime dependencies."

## The plugin isolation boundary

The crux question — _can a plugin be developed completely in isolation?_ — resolves
per lifecycle stage:

| Stage               | Isolated (own repo, no checkout)? | Why                                                                                                                                                                                                                                 |
| ------------------- | :-------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author / edit       |                ✅                 | TS/TSX against `@sovereignfs/sdk` + `@sovereignfs/ui` types only.                                                                                                                                                                   |
| Type-check / lint   |                ✅                 | `tsc --noEmit` / ESLint need only those types.                                                                                                                                                                                      |
| Build **as an app** |                ❌                 | The plugin's `app/` is a route-group **fragment** — no root `<html>` layout, no `next.config`, no middleware, no `(platform)` shell. Not a buildable Next app alone.                                                                |
| Run / test          |                ❌                 | Needs the host: middleware-injected headers (else `getSession()` is null), `getPlatformDb()`, the auth server, the composed route group, shell chrome, theme/tokens. The SDK is in-process glue with nothing to talk to standalone. |

**Conclusion: full isolation is architecturally impossible** — it is a property of
the composition model + the in-process SDK, not a packaging gap. Only **isolated
authoring** (write + type-check + lint) is possible; running/testing is always
**runtime-hosted** (a Sovereign checkout, or `sv plugin add`, per RFC 0017).

It follows that publishing the SDK's **implementations** is pointless (they never run
for the consumer), and a **types-first contract** is the only meaningful artifact —
and only if isolated authoring is a goal.

## Proposed distribution model

**Publish `@sovereignfs/sdk` as a types-first contract** (recommended, conditional on
wanting isolated-authoring repos):

- The published package is the **typed API surface**. Its implementations are
  **host-provided/guarded** — when (mistakenly) executed outside a Sovereign runtime
  they throw a clear error (e.g. `"@sovereignfs/sdk runs inside the Sovereign
runtime"`), because in the real path the host's copy is what executes.
- **Zero `db`/`mailer` dependency** in the published package → `@sovereignfs/db` and
  `@sovereignfs/mailer` **stay private**, and the "bundle private deps" blocker
  **disappears**. The SRS claim "the published SDK has no runtime dependencies"
  becomes literally true.
- **`@sovereignfs/ui` stays as-is** (already portable).
- The **dev/test loop remains runtime-hosted** — RFC 0017's `sv plugin new` →
  `sv plugin add` / checkout flow. Publishing changes authoring ergonomics, not the
  fact that a runtime hosts the plugin.

(If isolated authoring is _not_ a goal, the alternative is **don't publish**: keep the
SDK workspace-internal, develop plugins in a checkout via `workspace:*`, and drop the
"published" designation — see Alternatives.)

## What changes (when this is accepted)

- **CLAUDE.md** — the Task 0.5.8 caveat is rewritten: the blocker is dissolved by
  the types-first split, not by bundling private deps; the SDK's "published" status
  is qualified as a types-first contract.
- **SRS decision log** — "the published SDK has no runtime dependencies" is made
  literally true by the restructure.
- **RFC 0017** — its publish **prerequisite** is amended from "bundle/publish the
  private deps" to "restructure the SDK types-first" (cross-referenced; a one-line
  note added now so the two RFCs don't contradict).
- **A task owns the restructure** — Task 0.5.20 (stable SDK & semver) or a small new
  task; it splits the SDK into the published contract + the host-provided impls.

## Alternatives considered

1. **Don't publish at all.** Keep the SDK workspace-internal; plugins develop inside
   a Sovereign checkout (`workspace:*`). Simplest and fully valid **if** isolated
   authoring isn't a goal — but it forces every third-party author to clone the
   platform to get types. Documented as the fallback.
2. **Publish the full bundle via `noExternal`** (the original assumption). Rejected —
   ships platform internals + a native dependency that never run for the consumer,
   and `@sovereignfs/ui`-style "just works" is impossible because the SDK is
   host-bound.
3. **Publish an `@sovereignfs/runtime` dev-harness** so a plugin repo could pull in a
   runtime and run "isolated." Heavier (the runtime isn't published and is large);
   the `sv`/checkout run loop already covers testing. Noted as a possible future, not
   required.

## Open questions

1. **Guarded impls** — throw vs no-op when the published SDK is executed outside a
   runtime; the exact error contract.
2. **Types entrypoint** — does the types-first split warrant a separate types-only
   export, or is one entrypoint with guarded impls enough?
3. **Task ownership** — fold the restructure into Task 0.5.20 or a new small task.
4. **Dev-harness** — whether a published runtime harness is worth it post-v1.
5. **Requirement IDs** — deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC)** — settles the isolation boundary + the
   distribution decision; corrects the assumptions in CLAUDE.md / SRS / RFC 0017.
2. **When accepted & scheduled:** restructure the SDK types-first (host provides the
   impls; `db`/`mailer` stay private), update `publish.yml`/docs, and reconcile RFC
   0017 — _or_, if don't-publish is chosen, drop the "published" designation and
   update the same docs. Either way the `noExternal`-bundle plan is dropped.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                              |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; establishes that plugins cannot run in isolation (composed fragments + in-process host-glue SDK), so publishing the full-impl SDK is meaningless; recommends a types-first contract (or not publishing), dropping the `noExternal`-bundle plan; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.21.                                                                                                                                                                                                                                  |
