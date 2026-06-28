# RFC 0021 — Platform roles & capabilities

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `apps/auth` (role default → owner, first-user hook, role-change guards), a centralized roles/capabilities module, `runtime/src/route-guard.ts` + `runtime/middleware.ts` + `runtime/src/session-verify.ts` (capability gate + capabilities in the session cache), `runtime/src/launcher-plugins.ts` + `(platform)/layout.tsx` (chrome gating), `packages/sdk` (`SessionUser` + `hasCapability`/`requireCapability`), `packages/manifest` (`adminOnly` → capability, the reserved `admin:*`), Console (role management UI), SRS §3.4 / AUTH-08 / PLT-03 / CON-05; builds on RFC 0005 (audit), RFC 0008 (security)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.6.0; documentation-first. This RFC specifies the platform role/capability model and the end-to-end flows; SRS requirement IDs, scheduling, and task allocation are deferred. **Plugin-declared capabilities are RFC 0022**, which builds on this one.

---

## Summary

Grow Sovereign's two-role model (`platform:admin` / `platform:user`) into a
**capability-based** model so an owner can delegate _some_ administration without
handing over everything:

- **Capabilities are the enforcement unit** (`console:access`, `user:manage`,
  `plugin:manage`, `tenant:configure`, `health:view`, …).
- **Roles are named presets** = capability bundles, with **hardcoded defaults** that
  work with zero config and an optional **DB-driven override** layer for
  customization.
- Built-in roles: **owner**, **admin**, **auditor**, **user**.
- A protected **`platform:owner`** super-admin sits on top — the first user, the sole
  holder of role assignment, and impossible to lock out (which also fixes today's
  missing last-admin guard).

This is not a new direction: **SRS §3.4 already specified a Role & Capability Model**
and explicitly designed the data model "to support database-driven capability
assignment in a future version without requiring a schema change." This RFC is that
future version.

## Motivation

A growing self-hosted instance needs middle-ground administrators — a read-only
**auditor** for oversight, an operational helper who can manage plugins but not
users — and a protected **owner** so admins can be added without risking lockout.
Today everything is binary: you're `platform:admin` (can do everything) or
`platform:user` (can do nothing administrative), and an admin can demote or
deactivate the last admin with no guard. The capability model the SRS already
sketched closes this gap.

## Current state (what this builds on)

- **Two roles, binary enforcement.** `role` is a better-auth `additionalField`
  defaulting to `platform:user`; the first user becomes `platform:admin`
  (`apps/auth/src/auth.ts`). Enforcement is `role === 'platform:admin'` in ~6 places:
  `route-guard.ts` (`adminOnly && role !== 'platform:admin' → 403`), the launcher
  filter (`launcher-plugins.ts`), and `(platform)/layout.tsx` (`isAdmin` chrome).
- **Role is a bare string, scattered.** `'platform:admin'` / `'platform:user'` are
  hardcoded literals in ~50 sites — **not centralized, not a typed union**. Step one
  is centralizing.
- **Propagation.** Verified role → signed `session_data` cookie cache →
  `x-sovereign-user-role` header → `sdk.auth.getSession().user.role`. Plugins
  **string-compare** (`role === 'platform:admin'`); there is **no helper**.
- **Mutation, no last-admin guard.** Console → admin-key API
  (`apps/auth/app/api/admin/users/[id]` PATCH) changes role with **no** check against
  demoting/deactivating the last admin.
- **Two distinct "admin" concepts — do not conflate.** `SOVEREIGN_ADMIN_KEY` is a
  **server-to-server secret** (runtime↔auth, `admin-guard.ts`); `platform:admin` is a
  **user role**. This RFC concerns only the role.
- **SRS §3.4 is the anchor.** It defines the capability matrix (`console:access`,
  `user:manage`, `plugin:manage`, `tenant:configure`, `plugin:access`,
  `profile:manage`), states _"capabilities are hardcoded per role in v1… the data
  model is designed to support database-driven capability assignment in a future
  version without requiring a schema change,"_ defers _"granular per-user capability
  overrides,"_ and chose `platform:` namespacing to _"scale to plugin-level roles."_
  The reserved `admin:*` manifest permission was noted for "future fine-grained
  plugin admin scopes."

## Proposed design

### Capabilities (the enforcement unit)

Define a capability set with **read/write granularity** so an auditor is meaningful,
derived from the SRS matrix + the four Console areas (users / plugins / settings /
health):

`plugin:access`, `profile:manage`, `console:access`, `user:view`, `user:manage`,
`plugin:manage`, `tenant:view`, `tenant:configure`, `health:view`,
`activity:view` (the RFC 0005 audit log), `role:assign` (owner-only).

### Built-in role presets (hardcoded defaults)

| Capability         | user | auditor | admin | owner |
| ------------------ | :--: | :-----: | :---: | :---: |
| `plugin:access`    |  ✓   |    ✓    |   ✓   |   ✓   |
| `profile:manage`   |  ✓   |    ✓    |   ✓   |   ✓   |
| `console:access`   |      |    ✓    |   ✓   |   ✓   |
| `user:view`        |      |    ✓    |   ✓   |   ✓   |
| `tenant:view`      |      |    ✓    |   ✓   |   ✓   |
| `health:view`      |      |    ✓    |   ✓   |   ✓   |
| `activity:view`    |      |    ✓    |   ✓   |   ✓   |
| `user:manage`      |      |         |   ✓   |   ✓   |
| `plugin:manage`    |      |         |   ✓   |   ✓   |
| `tenant:configure` |      |         |   ✓   |   ✓   |
| `role:assign`      |      |         |       |   ✓   |

- **owner** — every capability, incl. `role:assign`; protected.
- **admin** — all operational + `*:view`; **not** `role:assign` (the owner assigns).
- **auditor** — read-only oversight; no mutations.
- **user** — the floor (use plugins, manage own profile).

### DB-driven override (customization)

Effective capabilities resolve as: **the role's hardcoded default preset →
overridden by DB-stored customizations** when present. Zero config yields the
presets; customization is optional. `devops` is the worked example of a **custom
role** an owner creates by granting `plugin:manage` + `tenant:configure` +
`health:view` (no user management) — demonstrating the override layer without
hardcoding the role. _Override granularity — per-role redefinition vs per-user
grants/revokes vs both — is an open question; the resolver is designed for both._

### The Edge-gate wrinkle (key design point)

The route gate runs in **Edge middleware, which cannot read the database**, so
DB-driven overrides can't be consulted there. Proposed mechanism: compute a user's
**effective capabilities server-side** (where the role preset + DB overrides are
known) and **carry them in the signed `session_data` cookie cache** alongside `role`,
so the Edge middleware reads them **offline** — the same trust model as role today
(AUTH-05). Staleness is bounded by the cookie-cache `maxAge` (300s), exactly like a
role or active-status change. Trade-off: a slightly larger signed cookie. (Rejected
alternative: a coarse role gate at the Edge with fine capability checks only in Node
— it can't enforce capability _reductions_ at the route boundary.)

### `platform:owner` specifics

The **first user becomes `platform:owner`** (amends AUTH-08). The owner holds every
capability, is the **sole holder of `role:assign`**, and is **protected** — cannot be
demoted, deactivated, or locked out, which closes today's last-admin gap. _Open:
exactly one owner vs several; an ownership-**transfer** operation; migration for
existing instances (the current first admin becomes owner)._

### Enforcement changes

- **Centralize** role + capability constants and a `hasCapability(user, cap)` /
  `requireCapability(cap)` resolver, replacing the ~50 string literals and the 6
  binary checks.
- `route-guard`'s `adminOnly` → requires a generic admin capability
  (`console:access`); the launcher filter and chrome gating switch to capability
  checks.
- _Future/extension:_ a plugin may declare which capability its `adminOnly` requires
  (ties to the reserved `admin:*`).

### SDK surface

`SessionUser` gains `capabilities` (keeping `role`); `sdk.auth` adds
`hasCapability(cap)` / `requireCapability(cap)` so plugins stop string-comparing.
Additive **minor** SDK bump.

## UI / flows

The **owner** opens Console → Users → assigns a role (owner / admin / auditor / user)
and optionally customizes capabilities → the assignment is **audited** (RFC 0005). An
**auditor** sees a read-only Console (no mutate controls; mutations 403). A user
lacking a capability is **403**'d at the gate. The **owner row is un-editable** by
anyone else.

## Alternatives considered

1. **Fixed named roles only** (no capability layer). Rejected — every new admin-area
   gate would hardcode a role list, drifting from the SRS capability model; rejected
   by the user.
2. **Full per-user RBAC with no presets.** Rejected for v1 — the SRS defers per-user
   overrides, and zero-config presets are the simpler default. (Per-user overrides
   remain a later phase on top of the same resolver.)
3. **Keep flat admin + only add a last-admin guard.** Rejected — no delegation, no
   auditor; the owner tier subsumes the guard anyway.
4. **Resolve capabilities by DB at the Edge.** Rejected — middleware can't read the
   DB; hence capabilities-in-the-cookie.

## Open questions

1. **Override granularity** — per-role redefinition vs per-user grants/revokes vs
   both; v1 scope.
2. **Owner** — single vs multiple; transfer operation; existing-instance migration.
3. **Capabilities in the cookie** — size/staleness trade-off vs alternatives.
4. **Assignment scope** — may `admin` assign roles below itself, or only the owner?
5. **Plugin-level roles** (`tasks:admin`) — how they layer on (→ RFC 0022).
6. **Requirement IDs** — AUTH-/PLT-/CON- successors, deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).**
2. **When accepted & scheduled:** centralize roles/capabilities + the resolver +
   carry capabilities in the session cache; introduce `platform:owner` (+ the AUTH-08
   amendment + migration); the auditor preset; capability-based gating; the SDK
   helper; and the Console assignment UI. The **DB-override customization** layer and
   **per-user overrides** are sequenced as later phases.
3. **RFC 0022 — Plugin-declared capabilities** builds on this foundation.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                     |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; capability-based model with owner/admin/auditor/user presets (hardcoded defaults + DB-driven override), a protected `platform:owner`, capabilities carried in the session cache for Edge gating; anchored on SRS §3.4; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.6.0.                                                                                                                                                                                                          |
