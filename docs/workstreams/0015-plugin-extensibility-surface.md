# Workstream 0015 — Plugin extensibility surface

**Status:** 🔄 In progress — legs 3 and 5 done, shipped together at platform
`0.87.0` (this PR rebased cleanly onto `main` — see leg 5's changelog entry
for the version reconciliation this required); legs 1 and 2 are each
separately implemented on their own not-yet-merged branches and will need
fresh version numbers picked against `main`'s post-merge state (no longer
`0.86.0`) when they rebase; leg 4 implemented on its own branch stacked on
workstream 0017 and has the same reconciliation ahead of it\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0046](../rfcs/0046-plugin-jobs.md) (leg 1), [0045](../rfcs/0045-plugin-events.md)
(leg 2), [0050](../rfcs/0050-public-plugin-webhooks.md) (leg 3),
[0047](../rfcs/0047-plugin-tools.md) (leg 4),
[0053](../rfcs/0053-plugin-flow-handoffs.md) (leg 5)\
**Epics touched:** 2 (Platform Shell), 3 (Plugins Runtime)

---

## Goal

Give plugins five related capabilities they currently lack: background
jobs/schedules that survive a browser tab closing, ephemeral realtime
pub/sub for UI sync, manifest-declared public webhook ingress with signature
and replay protection, platform-mediated tool contracts other plugins (and
eventually the assistant) can call with preview/confirm/audit, and signed
handoff tokens so one plugin can start a flow in another — including
public/anonymous flows, which the webhook work's route-validation pattern
makes safe to support. At the end: a plugin can enqueue a recurring job, two
browser sessions on the same resource see realtime updates, a plugin can
receive a signed provider webhook without exposing `/api/*` broadly, a
provider plugin can expose an auditable tool, and a checkout-style flow can
hand off between plugins — including to an anonymous visitor — with a
short-lived signed token.

## Definition of done

- [ ] `3.16` — `sdk.jobs` supports enqueue/schedule/cancel/status/handler
      registration; scheduled jobs survive a runtime restart; disabled
      plugins don't execute queued/scheduled jobs; long-running jobs can
      notify on completion without holding a request open.
- [ ] `3.17` — `sdk.events` publish/subscribe works with plugin/tenant/user
      context injected by the runtime; a user without resource access cannot
      subscribe to that resource's channel; events are not persisted as
      notifications or activity rows by default; a polling fallback exists.
- [ ] `2.15` — manifest `webhooks` declarations exist with path, methods,
      body limits, and signature metadata; only declared webhook paths
      bypass the session redirect; method/body-size limits apply before the
      plugin handler runs; HMAC signature verification and replay-check
      helpers exist server-side; webhook signing secrets are read through
      the plugin secret vault; undeclared paths, disabled plugins, invalid
      methods, oversized bodies, and bad signatures/replays are all
      test-covered.
- [ ] `3.18` — providers register tools via `sdk.tools.provide()`; callers
      preview via `sdk.tools.preview()` without mutating; execution requires
      a matching confirmation token for mutating/external effects; every
      execution logs provider, caller, actor, effect class, result, and
      error metadata.
- [x] `3.21` — `sdk.handoffs.create()`/`consume()` work with signed,
      expiry-bound, provider-scoped tokens; a provider can only consume
      tokens addressed to its own plugin ID and handoff name; expired,
      replayed, malformed, or wrong-provider tokens fail closed; public
      handoffs work for anonymous visitors only when explicitly declared on
      a provider-declared public route.

## Decisions locked

| Decision                   | Choice                                                                                                                             | Rejected alternative and why                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                      | 3.16, 3.17, 2.15, 3.18, 3.21 — five tasks                                                                                          | Leaving 2.15 as an external gate, as this workstream's first draft did — superseded on explicit developer instruction: 2.15 is a direct dependency of leg 5 (3.21) and has no other workstream, so it belongs here rather than as a standing unresolved gate                             |
| Leg order                  | 3.16, 3.17 first (either order), then 2.15, then 3.18 (gated on workstream 0017), then 3.21 (gated on legs 3 and 4)                | Placing 2.15 after 3.18 — rejected; 2.15 has no dependency on 3.18 or on workstream 0017, so sequencing it earlier shortens the critical path to leg 5 (3.21) without waiting on workstream 0017 unnecessarily                                                                           |
| 3.18's external dependency | Task 1.8/1.9 (progressive verification, [workstream 0017](0017-auth-security-hardening.md)) must ship before leg 4 starts          | Building 3.18 without a verification-level gate and retrofitting one later — rejected; the epic's own Dependencies line names 1.8/1.9 directly, and retrofitting an auth gate onto an already-shipped tool-execution path is a strictly harder change than building it in from the start |
| 3.21's dependencies        | Both now in-workstream: leg 3 (2.15) for public-route validation patterns, leg 4 (3.18) for later mutating actions after a handoff | Leaving either as an external gate — no longer applicable now that both are legs of this same workstream; this was the entire point of folding 2.15 in                                                                                                                                   |
| Workstream execution       | Legs — one branch, one draft PR, one review gate per leg                                                                           | A single combined PR — rejected for the standard reviewability reason; five independently designed RFCs bundled into one PR would be unreviewable                                                                                                                                        |

## Prerequisites

Leg 1 (3.16) and leg 2 (3.17): none blocking — all named dependencies (4.1,
4.3, 5.1, 3.13) are already ✅.

Leg 3 (2.15): none blocking — all named dependencies (Task 2.14 public
plugin page routes, RFC 0043 plugin secret vault, RFC 0049 plugin external
connections) are already ✅.

Leg 4 (3.18): **blocked** on workstream 0017's legs for Task 1.8/1.9
(progressive user verification) landing first — 3.18's own epic entry names
this dependency explicitly. Task 5.1 and RFC 0002 (cross-plugin data sharing)
are already ✅.

Leg 5 (3.21): blocked on leg 3 (2.15) of this workstream — leg 4 (3.18) was
originally listed here too, but turned out to be a soft/compositional
dependency only once leg 5's actual scope was re-checked directly (see leg
5's own "Correction" note in Leg detail below); RFC 0042 and RFC 0051 (2.14,
3.20) are already ✅.

## Legs

| Leg | Name                                 | Epic tasks | Epics | Gate?                       | Done when                                                                                                        |
| --- | ------------------------------------ | ---------- | ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin background jobs and schedules | 3.16       | 3     | No                          | A plugin can enqueue/schedule work that survives a restart and reports completion without holding a request open |
| 2   | Plugin events and realtime channels  | 3.17       | 3     | No                          | Two sessions on the same authorized resource get realtime updates; unauthorized users cannot subscribe           |
| 3   | Public plugin webhooks               | 2.15       | 2     | No — ✅ `0.87.0`            | Declared webhook paths work with signature/replay protection; undeclared paths stay protected                    |
| 4   | Plugin tool contracts                | 3.18       | 3     | **Yes — external**          | Providers can register tools; mutating/external execution requires a confirmation token                          |
| 5   | Plugin flow handoffs                 | 3.21       | 3     | No — internal — ✅ `0.87.0` | Signed, provider-scoped handoff tokens work for both authenticated and declared-public flows                     |

Legs 1–3 may run in any order or in parallel — none depends on another. Leg
4 is gated on workstream 0017 (external). Leg 5 depends on leg 3 of this
workstream (leg 4 was originally thought to be a hard dependency too — see
leg 5's "Correction" note in Leg detail below for why it turned out not to
be) and shipped after leg 3.

## Leg detail

### Leg 1 — Plugin background jobs and schedules

**Epic tasks:** 3.16

**Technical notes:**

- Platform job tables need queued/scheduled/running/completed/failed state
  — design the schema for that full lifecycle up front, not just
  queued→done.
- Single-process worker-loop semantics now, with an explicit, documented
  path to multi-process coordination later — don't build the multi-process
  version speculatively.
- Define disabled-plugin and uninstall behavior for in-flight
  queued/scheduled jobs explicitly; this is a real edge case, not an
  afterthought — a disabled plugin's jobs must not silently keep running.

**Do not proceed if:** N/A — this is new, additive platform surface.

### Leg 2 — Plugin events and realtime channels

**Epic tasks:** 3.17

**Technical notes:**

- Reuse or extend the existing notification transport model
  (polling/SSE/Redis) rather than inventing a second transport layer — Task
  4.3 already generalizes this.
- Channel authorization callbacks are the security-critical piece: a
  subscribe request must be checked against the resource, not just the
  channel name.
- Document explicitly, in code comments and `docs/plugin-development.md`,
  that events are ephemeral — not a durable queue, not a notification inbox,
  not an audit log. This is a repeated point of confusion risk given how
  close it sits to those three mechanisms.

**Do not proceed if:** the polling fallback doesn't work when SSE/Redis is
disabled — the epic requires it stay available, not degrade to "realtime
only."

### Leg 3 — Public plugin webhooks

**Epic tasks:** 2.15

**Why this leg matters to the workstream, not just on its own:** leg 5
(3.21) needs a proven, provider-declared public-route validation pattern to
scope public-anonymous handoffs safely — this leg is where that pattern gets
built.

**Technical notes:**

- Manifest `webhooks` declarations need path, methods, description, body
  limits, and signature-requirement metadata — this is the same declarative
  shape leg 5's `handoffs.receives`/`handoffs.sends` will echo, so keep the
  validation approach consistent between the two rather than diverging.
- Middleware must extend its route decisions so _only_ declared webhook
  paths bypass the session redirect — an undeclared path bypassing auth
  because of a routing bug is the primary failure mode to guard against.
- Method and body-size limits apply **before** the plugin handler executes
  — enforce this at the platform boundary, not inside plugin code, so a
  buggy or malicious plugin can't be relied on to self-limit.
- HMAC signature verification and replay-check helpers belong in the SDK as
  shared server-side helpers — every provider integration (Stripe-style,
  GitHub-style, etc.) needs the same primitives, don't make each plugin
  author reimplement them.
- Webhook signing secrets are read through the plugin secret vault (Task
  8.6, already ✅) — never accept a webhook secret as a plain manifest
  field or env var.

**Do not proceed if:** an undeclared webhook path can reach a plugin handler
without the session redirect applying — that's the exact hole this task
exists to close, and it fails closed, not open, by design.

### Leg 4 — Plugin tool contracts

**Epic tasks:** 3.18

**Why this leg is gated:** its own Dependencies line names Task 1.8/1.9
directly — tool execution needs a verification-level gate to exist before
it can be wired to it.

**Technical notes:**

- Manifest `tools` declarations need names, schemas, effect classes,
  confirmation requirements, and optional verification requirements — the
  effect-class taxonomy is what leg 5's confirmation flow will key off of,
  so get it right here rather than patching it per-consumer later.
- `sdk.tools.preview()` must be genuinely non-mutating — a preview that has
  side effects defeats the entire safety model this RFC exists to provide.
- Activity logging covers execution attempts and outcomes — keep the schema
  general-purpose rather than tailored to any one consumer. Warden (RFC
  0063, [workstream 0014](0014-warden-harness-engine-phase-1.md)) is the
  intended flagship future consumer of this exact contract, but tool
  execution is explicitly out of workstream 0014's current (phase 1)
  scope — it's an unscheduled future phase there, not a leg landing
  alongside this one. Don't assume synchronized timing between the two
  workstreams.

**Do not proceed if:** Task 1.8/1.9 hasn't shipped — this leg's confirmation
flow has nowhere to attach a verification-level check without it, and
building it against a stub would mean redoing the integration later.

### Leg 5 — Plugin flow handoffs

**Epic tasks:** 3.21

**Why this leg is last:** depends on leg 3 (2.15, public-route validation
pattern for public-anonymous handoffs) and leg 4 (3.18, RFC 0047, "for later
mutating actions after a handoff") — both now internal to this workstream.

**Technical notes:**

- Handoff tokens need signing, expiry, provider-scoping, payload hashing,
  and optional single-use replay protection — treat this as security-review
  surface, not routine CRUD. Leg 3's HMAC/replay helpers are the natural
  starting point rather than a second implementation of the same primitive.
- Return-URL validation must prevent open redirects — a classic vulnerability
  class for exactly this kind of "redirect back after a flow" mechanism.
- Public-anonymous handoffs are only valid against provider-declared public
  routes — never inferred, always explicit in the manifest, using the exact
  declaration pattern leg 3 established for webhooks.

**Do not proceed if:** public-anonymous handoffs can't be scoped to
provider-declared public routes using leg 3's validation pattern — shipping
authenticated-only handoffs under this task's name would silently
under-deliver its own spec; flag the gap and hold the leg instead.

**Correction — leg 4 turned out to be a soft dependency, not a hard one:**
this doc's own "Why this leg is last" line above and the Prerequisites
section both named leg 4 (3.18) as a blocking dependency. Re-reading leg 5's
actual scope directly against RFC 0053 and leg 4's shipped code before
starting found that leg 4 is named only as "for later mutating actions after
a handoff" — a compositional pattern (a handoff can hand off to a flow that
itself later calls a tool), not a literal code import; nothing in leg 5's
implementation reads from `packages/manifest`'s `tools` field, `sdk.tools`,
or `runtime/src/tool-schema.ts`/`tool-confirmation.ts`. Leg 5 was therefore
implemented stacked only on leg 3 (which _is_ a hard dependency — the
public-route validation pattern and the HMAC/atomic-claim idioms are reused
directly), avoiding an unnecessary and risky three-way merge across the
files leg 3 and leg 4 both touch (`schema.ts`, `host.ts`, `index.ts`,
`middleware.ts`, `sdk-host.ts`, `route-guard.ts`,
`docs/plugin-development.md`). This is a sequencing correction, not a scope
reduction — leg 5 still delivers everything 3.21's Definition of done line
requires.

## Risks

- **Leg 5 is genuinely security-sensitive** (signed tokens, replay
  protection, open-redirect prevention) — budget real review time, not just
  functional testing.
- **Leg 3 is the platform's first declared-public, unauthenticated ingress
  surface for plugins** — a routing bug here (an undeclared path bypassing
  the session redirect) is a direct auth-bypass risk, not a narrow bug.
- **Leg 4's effect-class taxonomy is a foundational decision** — Warden
  (workstream 0014) is the intended future flagship consumer once it
  reaches its own tool-execution phase, even though that phase isn't
  scheduled yet. Getting the taxonomy wrong here has a wider blast radius
  than this workstream alone, even without a synchronized timeline.
- **Leg 4 depends on work outside this workstream's control**
  (workstream 0017) — if that slips, leg 4 (and leg 5, transitively) slip
  with it. Legs 1–3 have no such exposure.

## Kill criteria

Legs 1–3 ship independently of everything else and stand on their own
value regardless of what happens to legs 4/5. If leg 4's external
prerequisite (workstream 0017) stalls, legs 1–3 still close three of the
five tasks. If leg 4 lands but leg 5 needs more design work, ship legs 1–4
and hold leg 5 rather than rushing the public-anonymous handoff validation.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 4 tasks (3.16, 3.17, 3.18, 3.21); Task 2.15 flagged as an unresolved external gate on leg 4 (then leg 4, "Plugin flow handoffs")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 0.2     | August 2026 | Folded Task 2.15 (RFC 0050, public plugin webhooks) in as leg 3, per explicit developer instruction — it was a direct dependency of the handoffs leg and had no workstream of its own. Legs renumbered: 2.15 → leg 3, tool contracts (3.18) → leg 4, flow handoffs (3.21) → leg 5. Flow handoffs' gate status changed from "external" to "internal," since both its dependencies are now legs of this same workstream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0.3     | August 2026 | Leg 3 (2.15, RFC 0050) shipped at platform `0.88.0` on this branch — see RFC 0050's own 0.2 changelog entry for full detail. Legs 1 (3.16) and 2 (3.17) were each implemented in parallel on their own separate, not-yet-merged branches targeting `0.86.0` and `0.87.0` respectively; this version number, and this changelog's own numbering, need reconciling against both legs' identically-numbered "0.3" entries at whichever leg merges last — not a collision to silently resolve by picking one arbitrarily. Leg 4 remains gated on workstream 0017; leg 5 remains gated on legs 3–4 (leg 3's own dependency is now satisfied on this branch, but leg 5 still needs leg 4 too)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0.4     | August 2026 | Leg 5 (3.21, RFC 0053) shipped at platform `0.88.1`, stacked on leg 3's branch rather than on leg 3 **and** leg 4 as this doc originally required — re-reading leg 5's actual scope found leg 4 (3.18) is only a soft/compositional dependency, not a hard code one; see leg 5's own "Correction" note above for the full reasoning. Workstream is now feature-complete across all five legs, each on its own uncommitted branch cut from a different `main` base commit as `main` advanced during implementation — root platform version claims across the five legs (`0.86.0`/`0.87.0`/`0.88.0`/`0.88.1` here, plus workstream 0017's own `0.89.0`/`0.90.0` and leg 4's `0.91.0` claimed on top of that) collide and need real reconciliation, not just renumbering on paper, at whichever branch is rebased onto `main` first — that branch's author inherits resolving this                                                                                                                                                                                                                                                                                                                                                                               |
| 0.5     | August 2026 | The combined legs 3+5 branch was the one that ended up rebasing onto `main` first (PR #445), which resolved the reconciliation the 0.4 entry flagged as pending. `main`'s actual state at rebase time (`0.86.0` root, `packages/sdk` already independently bumped to `1.38.0` by unrelated RFC 0093 work) didn't match any of the provisional numbers guessed above — this branch's version bumps were `0.86.0` and never touched `0.88.0`/`0.88.1` at all, since those were relative to a stale, disconnected base, not real `main`. Both legs now ship together as one root bump to **`0.87.0`** (one PR, one commit, since splitting them at the file-hunk level across two commits wasn't worth the risk — see PR #445's description). `packages/sdk` bumped to `1.39.0` (not `1.38.0`, which the rebase revealed `main` had already claimed independently — an actual collision, not just a numbering guess, caught by re-checking real values against `main` rather than trusting the pre-rebase plan). Legs 1, 2, and 4 remain on their own not-yet-merged branches and will need to repeat this same exercise — check `main`'s real current versions at rebase time, not carry forward a number picked against a stale base — when each of them lands |
