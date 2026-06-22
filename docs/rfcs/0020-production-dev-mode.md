# RFC 0020 — Production dev-mode & diagnostics

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/db` (request-scoped DB resolution), runtime middleware (dev-mode detection + gating + request context), `apps/auth` (parallel dev-DB path — the crux), env (`SOVEREIGN_DEV_MODE_ENABLED`, dev-DB URLs, a dev-mode secret, `LOG_LEVEL`), structured logging + `runtime/app/api/admin/health`, `docs/security.md` + `docs/self-hosting.md`; builds on RFC 0019 (seed for the mock DB), RFC 0005 (audit), RFC 0008 (security / no-telemetry)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.8.3; documentation-first. This RFC specifies a way to exercise features on a production deployment against mock data, plus operator-owned diagnostics; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Let an operator validate a feature on a **real production deployment** without
touching real user data, and give them local, no-telemetry-safe **diagnostics**.
Rather than a separate staging environment, a prod instance can be toggled — **per
request** — into **dev-mode**, where the data layer resolves to a **mock database**
(mock users + data, seeded by RFC 0019) for that request only. Plus: **structured
logging** with an operator-set level and a richer **admin diagnostics** report.

The design's spine is safety: the switch is **request-scoped** (`AsyncLocalStorage`,
never a global swap), **off unless explicitly enabled**, **secret-authenticated**,
**visibly flagged**, and **audited** — and everything stays on the operator's box,
so the no-telemetry guarantee holds.

## Relationship to RFC 0019

RFC 0019 defines the dev/prod mode concept, the idempotent seed, and the dev/test
database. This RFC extends "dev mode" to a **prod instance**: the dev-mode request
points at the **mock database** that `sv seed` (RFC 0019) populated. No new
notion of test data — same seed, used on prod against a separate DB.

## Motivation

A self-hoster sometimes needs to confirm a feature works on the _actual_
production deployment (its real config, reverse proxy, TLS, data layer) — but must
never poke real user data to do it, and Sovereign sends nothing off-box to help
debug. There is also **no logging at all** today, so when something misbehaves in
prod there's nothing to look at. This RFC closes both gaps without a second
deployment and without breaking the privacy stance.

## Current state (what this builds on)

- **DB access is a process-global singleton keyed off env.** `getPlatformDb()`
  opens from `DATABASE_URL`; there is no per-request notion of "which database."
- **Auth is a separate server.** It issues/verifies session cookies against its own
  `AUTH_DATABASE_URL` — independent of the runtime's data layer.
- **Admin surface is `SOVEREIGN_ADMIN_KEY`-gated.** Diagnostics today are just
  `/api/health` (liveness) and `/api/admin/health` (dialect, DB ping, auth
  reachability, uptime, version).
- **No logging / telemetry, by design.** No logger, no request logging, no error
  tracking. `docs/security.md` states the **no-telemetry guarantee** verbatim:
  _"Sovereign sends no analytics, telemetry, or usage data anywhere… a guarantee,
  not a default you can toggle."_ — the binding constraint here.
- **Mode + seed** come from RFC 0019 (dev vs prod; `sv seed`; the dev/test DB).

## Proposed design

### The request-scoped dev-mode switch (core)

A request that carries an **authenticated dev-mode header** (secret-gated, below) is
marked dev-mode; for **that request only**, the data layer resolves to the **mock
database** instead of the real one. Implementation spine:

- A small **`AsyncLocalStorage`** request context carries the dev-mode flag, set in
  the runtime middleware after the header is validated.
- `getPlatformDb()` / `sdk.db` **consult the context** to pick the real vs mock
  client (two cached clients), **defaulting to real**. This is the one real
  data-layer change: resolution becomes context-aware instead of a bare singleton.
- It is **never a global mutation** — concurrent real requests carry no dev-mode
  flag and are wholly unaffected. (This is the single most important safety
  property: a global swap could serve real users from the mock DB.)

### The auth crux (flagged prominently)

The runtime's data layer is switchable per request, but **auth is a separate
server** that issued the session cookie against the real auth DB. For mock **users**
to log in on a prod instance in dev-mode, the auth server needs a **parallel dev-DB
path** keyed off the same dev-mode signal (session issuance + verification against a
mock auth DB). This is the **hardest part** and the primary open question. Two
framings:

- **Full mock users on prod** — wire the dev-mode signal through to the auth server's
  DB resolution too. Most capable, most work.
- **Data-only mock (recommended v1 scope)** — dev-mode swaps only the **platform**
  data layer; the operator authenticates as a **real** account but operates on
  **mock platform data**. Simpler, avoids touching auth/session issuance, and still
  meets "test features without reading/writing real user data." Full mock-user login
  on prod can follow later.

### Guardrails (non-negotiable)

1. **Off by default** — `SOVEREIGN_DEV_MODE_ENABLED` (env). When unset, the prod
   instance **ignores the dev-mode header entirely**; the feature does not exist.
2. **Secret-authenticated** — the switch header must carry a strong secret (a
   dedicated dev-mode secret, or `SOVEREIGN_ADMIN_KEY`); **no default** (the no-
   secrets-with-defaults rule). An unauthenticated header is ignored.
3. **Hard isolation** — a dev-mode request can **never** read/write the real DB, and
   a normal request can never reach the mock DB. The resolver fails closed.
4. **Visibly obvious** — a persistent **dev-mode banner/marker** in responses so no
   one mistakes mock data for real.
5. **Audited** — entering dev-mode is recorded in the RFC 0005 activity log (who,
   when).
6. **Disposable mock DB** — the mock database is the RFC 0019 seed target, separate
   (`SOVEREIGN_DEV_DATABASE_URL` / `AUTH_DEV_DATABASE_URL`), wiped/re-seeded freely.

### Operator-owned diagnostics (no-telemetry-safe)

Independently useful, and the answer to "there's nothing to look at in prod":

- **Structured logging with an operator-set level** — introduce a logger and a
  `LOG_LEVEL` env; logs go to the instance's **own stdout only**. No egress, no
  third party.
- **Richer admin diagnostics** — extend the `SOVEREIGN_ADMIN_KEY`-gated
  `/api/admin/health` into a fuller report (DB stats, plugin/registry state, a config
  snapshot, recent errors). Operator-only, on-box.

Both are explicitly reconciled with `docs/security.md`: this is **logging, not
telemetry** — everything stays on the operator's infrastructure; nothing is sent
anywhere; the guarantee is intact.

## UI / flows

**Enable + test on prod** — operator sets `SOVEREIGN_DEV_MODE_ENABLED` + the
dev-mode secret + the mock DB URLs, then `sv seed`s the mock DB → sends a request
with the authenticated dev-mode header → sees the **dev-mode banner**, exercises the
feature against mock data → real users/data are never touched → the toggle is
audited.

**Diagnose** — operator sets `LOG_LEVEL=debug` to get verbose local logs, and/or
hits `/api/admin/health` for the diagnostics report. Nothing leaves the box.

## Alternatives considered

1. **A separate staging deployment.** Rejected per the design goal — a same-instance
   per-request toggle is lighter than running and maintaining a parallel stack.
2. **A global mode switch.** Rejected — unsafe for concurrent real traffic; the
   switch must be request-scoped (`AsyncLocalStorage`), never a process-wide flip.
3. **Admin "view as user" impersonation.** Rejected — it still operates on **real**
   data; mock-DB dev-mode achieves "test without touching real data" more safely.
4. **Shipping logs / errors to a third party (Sentry, etc.).** Rejected — violates
   the no-telemetry guarantee. Diagnostics stay local.

## Open questions

1. **The auth mock-DB path (the crux)** — full mock users on prod vs the recommended
   data-only-mock v1 scope.
2. **Header + secret model** — header name, dedicated secret vs `SOVEREIGN_ADMIN_KEY`.
3. **`AsyncLocalStorage` coverage** — that every data path (server components, route
   handlers, server actions) reads the context; **Edge middleware limitations**
   (the session middleware runs on Edge) and how the flag crosses into the Node
   render.
4. **Cache interactions** — dev-mode vs the better-auth session cookie cache and any
   response caching.
5. **Requirement IDs** — proposed entries, deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).**
2. **When accepted & scheduled (after RFC 0019):** request-scoped DB resolution +
   the middleware gating + the env/secret wiring + the dev-mode banner + audit; the
   structured logging + admin diagnostics (independently shippable). The auth
   mock-DB path is sequenced explicitly — or v1 ships **data-only mock** and defers
   full mock-user login on prod.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                             |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; request-scoped (AsyncLocalStorage) prod dev-mode pointing at an RFC 0019-seeded mock DB, six safety guardrails, the auth crux, plus local no-telemetry diagnostics (structured logging + richer admin health); documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.8.3.                                                                                                                                                                                                  |
