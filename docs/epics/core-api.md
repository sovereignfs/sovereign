# Epic 10: Core API

> The HTTP contract apps call, the client generated from it, and the Phase 1
> endpoints: Directory and instance branding.

## Status

📋 Planned

## Overview

`spec/core-api/` is the canonical contract, written in OpenAPI 3.1.
`packages/api-client` is generated from it, and core is tested against it, so
the two cannot drift. Later phases add mail, notifications, activity and
account-deletion endpoints here.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.9, §3.13
- `spec/core-api/` (written in 10.1)

## Tasks

#### 📋 10.1 — Contract and generated client

**Goal:** The Core API has one canonical definition that both sides follow.

**Deliverables:**

- `spec/core-api/`: OpenAPI 3.1, versioned paths (`/api/v1/…`), bearer token
  authentication, error format
- `packages/api-client`: a typed client generated from the contract
- Contract tests that run core's handlers against the definition

**Dependencies:** 0.2

**Spec reference:** §3.9, §3.13

**Review checklist:**

- Changing a response shape without updating the contract fails CI

#### 📋 10.2 — Directory API

**Goal:** Apps can find accounts to share with, without exposing the list of
users.

**Deliverables:**

- Search by name (`sub`, `name`, `picture`; deactivated accounts excluded)
- Resolve by `sub` (`active: false` for deactivated; deleted omitted)
- Lookup by exact email address only; no listing or partial matching
- Requires an access token issued for a signed-in person with the `directory`
  scope; rate limited per client and per account

**Dependencies:** 10.1, 6.1

**Spec reference:** §3.9

**Review checklist:**

- A token without the `directory` scope is refused
- A partial email address returns nothing
- Exceeding the rate limit is refused

#### 📋 10.3 — Instance branding endpoint

**Goal:** Apps can show the instance's name and logos.

**Deliverables:**

- A well-known endpoint publishing instance name, logos (light and dark) and
  favicon, defined in the contract

**Dependencies:** 10.1, 8.4

**Spec reference:** §3.13

**Review checklist:**

- A change in the Console appears at the endpoint without a restart
