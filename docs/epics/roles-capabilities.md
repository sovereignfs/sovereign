# Epic 5: Roles & Capabilities

> Who may do what in core: platform roles, the capability matrix, the owner's
> guarantees, and ownership transfer.

## Status

⏳ In Progress

## Overview

Capabilities are what every check uses; roles are named bundles of them. The
matrix starts from defaults in code, and the owner can edit the admin and user
rows. Later phases add groups and per-account grants on top.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.2

## Tasks

#### ✅ 5.1 — Roles, capabilities and checks

**Goal:** Every protected action checks a capability, and the owner's
guarantees always hold.

**Deliverables:**

- Roles `platform:owner`, `platform:admin`, `platform:user` (`scope:role-name`)
- The capability registry and default matrix from spec §3.2.2
- Server-side helpers: require a session, require a capability; used inside
  every server action and route, not only in page guards
- Invariants: exactly one owner; only the owner changes roles; only the owner
  acts on operator accounts

- `changeRole` (admin and user only, by the owner), `mayActOn` for the rule
  on the other account, and a seam (`getCapabilityMatrix`) where the owner's
  edits will be read

**Not here:** editing the matrix (next task), transferring ownership, and the
Console screens that call these.

**Dependencies:** 4.1

**Spec reference:** §3.2.1, §3.2.2

**Review checklist:**

- A matrix test over roles × capabilities matches spec §3.2.2
- A server action called directly by a role lacking the capability is refused
- No path leaves the instance without an owner

#### 📋 5.2 — Editable capability matrix

**Goal:** The owner can change what admins and users may do, safely.

**Deliverables:**

- Stored overrides for the `platform:admin` and `platform:user` rows
- Owner-only capabilities can never be granted to another role
- Changes reach signed-in sessions within the cookie cache lifetime (a matrix
  version carried in the session)

**Dependencies:** 5.1

**Spec reference:** §3.2.3

**Review checklist:**

- Granting an owner-only capability to admins is refused by the server
- A change takes effect for an already signed-in admin within 300 seconds

#### 📋 5.3 — Ownership transfer

**Goal:** The owner can hand the instance to an admin.

**Deliverables:**

- Transfer to an existing `platform:admin`, with password confirmation
- The previous owner chooses their new role: `platform:admin` (default) or
  `platform:user`
- The transfer is atomic: there is never zero or two owners

**Dependencies:** 5.1

**Spec reference:** §3.2.1

**Review checklist:**

- After transfer, exactly one owner exists and capabilities follow the roles
- Concurrent transfers cannot produce two owners
