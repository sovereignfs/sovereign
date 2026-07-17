# RFC 0070 — Per-user capability grants

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `runtime/src/capabilities.ts`, `packages/db`, `runtime/src/session-verify.ts`,
`runtime/middleware.ts`, `packages/sdk` (`hasCapability`), Console (capability grant UI), docs;
builds on RFC 0021 (platform roles & capabilities); is a dependency of RFC 0065 (self-service
plugin access)\
**Incorporated into plan:** Yes — epic task 1.16. Roadmap slot deferred; prioritized within
plugins-runtime alongside RFC 0065.

---

## Summary

Add a narrow per-user capability override on top of RFC 0021's role-preset model: an owner/admin
can grant one specific user a single named capability their role preset doesn't include, without
changing that user's role or defining a new custom role. The first consumer is RFC 0065's
plugin self-service opt-in (`plugins:self-manage`), but the mechanism is general — RFC 0021
already anticipated this exact gap and designed the model to accommodate it "without a schema
change."

## Motivation

RFC 0065 wants a specific, narrow permission: let an operator decide that certain users may
turn plugins on/off for themselves (within whatever they're already eligible for), without
making those users admins and without inventing a new role for what might be one or two people.
Today that's not expressible — `hasCapability(role, cap)` (`runtime/src/capabilities.ts:117`)
is a pure function of role alone, with no per-user dimension, by design (RFC 0021's Edge-gate
constraint: capabilities must be derivable offline from the signed session cookie).

RFC 0021 explicitly flagged this as future work: "Override granularity — per-role redefinition
vs per-user grants/revokes vs both — is an open question; the resolver is designed for both"
(RFC 0021 §"DB-driven override"), and separately lists "per-user overrides remain a later phase
on top of the same resolver" in its adoption path. This RFC is that later phase — scoped
narrowly to grants (adding a capability a role doesn't have), not full per-user capability
redefinition.

## Current state (what this builds on)

- `runtime/src/capabilities.ts:107-119` — `capabilitiesForRole(role)` / `hasCapability(role,
cap)` take a bare role string, no user ID. `ROLE_PRESETS` (line 91) is a static
  `Record<PlatformRole, Set<Capability>>`.
- Capabilities are carried in the signed `session_data` cookie cache alongside `role`
  (RFC 0021 "The Edge-gate wrinkle"), computed server-side and read offline by Edge middleware.
  This is the load-bearing constraint any per-user mechanism must respect.
- No `user_capability_grants` table or equivalent exists. There is no code path today that
  checks "does this specific user (regardless of role) have capability X."
- RFC 0065 needs exactly one such check (`plugins:self-manage`) to gate the self-service
  plugin opt-in described in its "Self-service opt-in" section.

## Proposed design

### Grant model

Add a `user_capability_grants` table:

```text
user_capability_grants(
  tenant_id,
  user_id,
  capability,
  granted_by_user_id,
  granted_at
)
```

A row grants exactly one additional capability to one user, additively on top of their role
preset — this RFC does not support revoking a capability a role preset already includes. If
that need arises later (e.g. a custom admin missing one specific capability) it's a natural
extension of this table (an explicit deny row), not a redesign, but is out of scope here.

### Resolution

```text
effectiveCapabilities(user):
  base = capabilitiesForRole(user.role)
  grants = user_capability_grants for user.id
  return base ∪ grants
```

`hasCapability` keeps its existing offline, role-only signature for Edge middleware use — that
code path is unaffected. A new `hasUserCapability(user, cap)` (or an overload taking an optional
grant set) is added for the Node-runtime call sites that need the per-user check, mirroring how
RFC 0021 already separates Edge-safe role checks from richer Node-runtime checks.

### Session cache propagation

Following RFC 0021's existing pattern exactly: a user's effective capabilities (role preset ∪
grants) are computed server-side at session-verify time and carried in the signed `session_data`
cookie cache alongside the existing capability list, so Edge middleware continues to read
everything it needs offline with no DB round-trip. Staleness is bounded by the existing
cookie-cache `maxAge` (300s) — identical trade-off to a role change today. No new cache
invalidation mechanism is introduced.

### Scope of what can be granted

Not every capability is a sensible per-user grant target. `role:assign` (owner-only,
RFC 0021) must remain excluded from this mechanism — granting role-assignment power to an
individual user outside the role system would undermine the owner-protection guarantee RFC 0021
established. The grantable set is an explicit allowlist starting with `plugins:self-manage`
(added by this RFC as a new `Capability` value, not present in any role preset by default),
extensible as concrete needs arise.

### Console UX

A capability grant UI, scoped to the grantable-capability allowlist:

- On a user's Console detail page, an admin/owner can add/remove individual capability grants
  for that user, from the allowlist only (not an open-ended capability picker).
- Grants are audited (RFC 0005), attributed to the granting admin.
- Effective capabilities (role preset + grants) are shown together so it's clear a grant is an
  addition on top of the role, not a role change.

## Alternatives considered

### Full per-user RBAC / arbitrary capability redefinition per user

Rejected for the same reason RFC 0021 rejected it for v1: the SRS and RFC 0021 both scope this
as a later, narrower phase — additive grants, not a general override/redefinition system. A
full system multiplies the surface that has to reason about "why does this user have this
capability" without a concrete need beyond the one RFC 0065 has today.

### A dedicated one-off boolean on the user record (e.g. `canSelfManagePlugins`)

Rejected — it solves RFC 0065's immediate need but doesn't generalize, and RFC 0021 already
designed the resolver to support per-user grants without a schema change; a bespoke boolean
would be exactly the kind of ad hoc field that mechanism was meant to avoid.

### Custom roles instead of per-user grants

An owner could already create a custom role (RFC 0021's DB-driven override, per-role
redefinition) with `plugins:self-manage` added, and assign specific users to it. This remains a
valid path for larger groups of users who need the same override, and doesn't require this RFC.
Per-user grants are for the case a custom role is overkill for — one or two individuals, or an
exception that doesn't warrant a new role in the role list. The two mechanisms are
complementary, not competing.

## Open questions

- Should grants ever be group-scoped (grant a capability to every member of a RFC 0065 user
  group) rather than strictly per-user? Deferred — per-user is sufficient for the immediate
  `plugins:self-manage` need, and group-scoped grants can be layered on later by resolving group
  membership at the same point role presets are resolved.
- Should the grantable-capability allowlist be config-driven (operator-extensible) or
  hardcoded per release? Leaning hardcoded for v1, consistent with RFC 0021's hardcoded-preset
  philosophy — revisit if real operator demand appears for granting other capabilities
  individually.

## Adoption path

1. Add `user_capability_grants` table and the allowlist-gated resolver.
2. Extend session-verify to fold grants into the cached effective-capabilities list.
3. Add the `plugins:self-manage` capability to the `Capability` union (grantable, not in any
   role preset by default).
4. Add Console grant/revoke UI on the user detail page, audited.
5. Wire RFC 0065's self-service opt-in to check `plugins:self-manage` via the per-user resolver.
6. Document the grant model and the "custom role vs per-user grant" guidance for operators.

No `@sovereignfs/sdk` surface change is required beyond what RFC 0021 already ships
(`hasCapability`/`requireCapability`); the per-user resolution happens server-side before
capabilities reach the client. `runtime` gets a minor version bump for the new capability value
and grant table.

## Changelog

| Version | Date     | Change                                                                                                                                  |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jul 2026 | Initial draft — per-user capability grants as RFC 0021's deferred "later phase," scoped to unblock RFC 0065 self-service plugin access. |
