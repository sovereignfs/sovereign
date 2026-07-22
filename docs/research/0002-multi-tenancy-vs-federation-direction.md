# Research 0002 — Multi-tenancy vs. multi-instance federation direction

**Status:** Decided\
**Date:** July 2026\
**Author:** Claude Code (recording a developer decision)\
**Scope:** Strategic direction only — no code/doc changes implied beyond this note\
**Related:** [0001](0001-enterprise-architecture-assessment.md), `docs/rfcs/0066-sovereign-chat-p2p-identity.md`, `docs/rfcs/0069-bring-your-own-database.md`

---

## Question

[Research 0001](0001-enterprise-architecture-assessment.md) flagged
multi-tenancy as a large workstream for an enterprise offering. Should
Sovereign build it out, given the `tenant_id`-everywhere scaffolding already
in the schema?

## Decision

**Defer multi-tenancy, possibly permanently.** The enterprise/scale direction
is **multi-instance federation** — many independently operated instances that
can optionally interoperate — not multiple tenants sharing one instance's
database.

This is not a new direction so much as one already reserved in the codebase:
the `@sovereignfs` npm scope was chosen specifically because "`fs` denotes
federated systems — reflecting the project's long-term federated direction"
(`CLAUDE.md`, `docs/sovereign-proposal-plan-srs.md:1198`). RFC 0069
(bring-your-own-database, withdrawn) already named federation as the thing
that would need to become "an active, funded initiative" before certain
per-user data-residency features made sense.

## Findings — existing groundwork toward federation

- **RFC 0066** (`docs/rfcs/0066-sovereign-chat-p2p-identity.md`) is the most
  developed federation design so far: cross-instance identity via issuer
  keys, three trust modes (local-only / allowlisted / open federation with
  user approval), and an explicit non-goal of a central Sovereign-run address
  directory.
- **Epic task 23.10** (`docs/epics/p2p-chat.md:370-398`) tracks "Cross-instance
  federation and trust policy" as 📋 planned, gated behind portability work,
  with the constraint that same-instance behavior must keep working when
  federation is disabled.
- `sdk.platform.getConfig().instanceId` (RFC 0039) already gives every
  deployment a stable identity — the primitive federation needs to address
  instances to each other.
- RFC 0069 names the concrete blocker for real federation: **a federation
  strategy for every cross-user aggregate query** — anything today that does
  a platform-wide join (Console user list, activity log, admin health
  dashboard) implicitly assumes one shared DB and breaks the moment data
  lives across instances.

## Implications for prior recommendations

Revises [Research 0001](0001-enterprise-architecture-assessment.md)'s
priority list:

1. **Multi-tenancy work is dropped.** The `tenant_id` scaffolding stays (it's
   already there, zero ongoing cost) but no engineering effort should go into
   activating it.
2. **SSO/OIDC still matters — arguably more.** Federated instances trusting
   each other's identity is a harder version of the same problem as trusting
   an external IdP. Building OIDC support for enterprise login now would also
   lay groundwork for instance-to-instance trust later (same
   token-verification machinery).
3. **HA/horizontal scaling becomes a per-instance concern**, not a
   shared-cluster concern — simpler than the multi-tenant version, since each
   customer's instance scales independently. See
   [Research 0003](0003-horizontal-scaling-strategy.md).
4. **The real open design gap** is the one RFC 0069 flags: every
   admin/aggregate feature is written assuming a single DB. If federation
   means "an org runs multiple linked instances," someone needs to decide
   whether cross-instance admin views are ever a goal, or whether each
   instance stays administratively opaque to the others (matching the P2P
   chat model's "no central directory" stance).

## Next steps

Item 4 above is unresolved and worth its own research doc before RFC 0066's
epic task 23.10 is scheduled. SSO/OIDC has no research doc yet — next
candidate for `docs/research/0004-*`.
