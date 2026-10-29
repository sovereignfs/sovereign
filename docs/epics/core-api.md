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

#### ✅ 10.1 — Contract and generated client

**Goal:** The Core API has one canonical definition that both sides follow.

**Deliverables:**

- Delete the `spec/core-api` entry from `PLANNED_TARGETS` in
  `scripts/lib/doc-links.ts` once the directory exists
- `spec/core-api/`: OpenAPI 3.1, versioned paths (`/api/v1/…`), bearer token
  authentication, error format
- `packages/api-client`: a typed client generated from the contract
- Contract tests that run core's handlers against the definition

**Dependencies:** 0.2

**Spec reference:** §3.9, §3.13

**Review checklist:**

- Changing a response shape without updating the contract fails CI

**Not here:** serving any operation (the Directory API is 10.2 and the branding
endpoint 10.3, which are in the contract already, marked `x-planned`), and
publishing the client to npm (it is release-ready and private, like the bridge).

#### ✅ 10.2 — Directory API

**Goal:** Apps can find accounts to share with, without exposing the list of
users.

**Deliverables:**

- Search by name (`sub`, `name`, `picture`; deactivated accounts excluded)
- Resolve by `sub` (`active: false` for deactivated; deleted omitted)
- Lookup by exact email address only; no listing or partial matching
- Requires an access token issued for a signed-in person with the `directory`
  scope; rate limited per client and per account
- Token check: the app requests its token with `resource=<SV_URL>/api/v1`
  (a `resources` entry whose allowed scope is `directory`,
  `enforcePerClientResources: false`), which makes the access token a signed
  JWT. Core verifies signature, audience and scope against its own keys **and**
  looks the token up to confirm it has not been revoked

**Dependencies:** 10.1, 6.1, 6.3

**Spec reference:** §3.9

**Review checklist:**

- A token without the `directory` scope is refused
- A token with a valid signature but revoked (by deactivation or Remove
  access) is refused
- A token issued without `resource` is refused by the Directory API
- A partial email address returns nothing
- Exceeding the rate limit is refused

**Not here:** cross-origin calls from a browser (the API is for an app's server;
only the branding document allows any origin), listing or counting accounts, and
searching by anything but name or whole email.

#### ✅ 10.3 — Instance branding endpoint

**Goal:** Apps can show the instance's name and logos.

**Deliverables:**

- A well-known endpoint publishing instance name, logos (light and dark) and
  favicon, defined in the contract

**Dependencies:** 10.1, 8.4

**Spec reference:** §3.13

**Review checklist:**

- A change in the Console appears at the endpoint without a restart

**Not here:** a way for an app to be told when the branding changes (it
revalidates), and per-app branding.
