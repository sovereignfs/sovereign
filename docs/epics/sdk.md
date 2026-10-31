# Epic 14: SDK

> A JavaScript app signs people in and calls core through one published package, which hides tokens and failure and has no
> capability of its own.

## Status

⏳ In Progress

## Overview

The legacy SDK ran inside the platform. Apps are now separate programs, so [`@sovereignfs/sdk`](../specs/sdk.md) wraps the generated
API client with what is tedious to do by hand: tokens, failure, version support and sign-in. The contract stays
`spec/core-api/openapi.yaml`, and the SDK never offers what it lacks. Capabilities beyond today's Directory and instance document
are added when core's Phase 2 specifies them.

## Related

- [docs/specs/sdk.md](../specs/sdk.md): what the SDK does
- [docs/specs/core-app.md](../specs/core-app.md): §3.6.1, §3.6.6, §3.9, §3.13
- [spec/core-api/](../../spec/core-api/): the contract
- [spec/env.md](../../spec/env.md) and [spec/app-manifest.md](../../spec/app-manifest.md): how an app is configured

## Tasks

#### ✅ 14.1 — The specification

**Goal:** What the SDK does is written down before any of it is built.

**Deliverables:**

- `docs/specs/sdk.md`, and core's side in `docs/specs/core-app.md`: app tokens (§3.6.6) and what the instance document says it serves
- A test that holds the specification's capabilities to the contract

**Dependencies:** 10.1

**Spec reference:** sdk; core-app §3.6.6, §3.13

**Review checklist:**

- Every legacy namespace has a place
- Nothing is offered that the contract lacks
- No app is named

#### ✅ 14.2 — Tokens, failure and today's capabilities

**Goal:** An app calls the Directory through the SDK, and two refreshes can never race.

**Deliverables:**

- `packages/sdk`, in the workspace and CI's change classification, with its licence
- `createSovereign`, actors, the token store contract, one refresh at a time, access-token caching, and every error of §6
- `directory` and `instance` (§8), and `/testing`
- The instance document's `api` field in core and the contract, and §7's version check
- `@sovereignfs/api-client` and the parts of `@sovereignfs/config` it needs usable from a published package: both are private today

**Dependencies:** 14.1

**Spec reference:** sdk §2 to §8, §11; core-app §3.13

**Review checklist:**

- Twenty parallel calls make one refresh, in one process and across two
- A lost refresh answer does not resend the old token
- The browser entry throws
- No token reaches a log

#### ✅ 14.3 — Signing in, and the Next.js adapter

**Goal:** An app's sign-in, session and sign-out are a few lines.

**Deliverables:**

- `sv.auth`, on `openid-client`, with a session store contract
- `hasRole`, and addresses for core's own pages
- The back-channel logout receiver
- `@sovereignfs/sdk/next`

**Dependencies:** 14.2

**Spec reference:** sdk §9; core-app §3.6.5

**Review checklist:**

- A logout token that is wrong in each way is refused
- The session cookie is host-only over https
- `getSession` makes no call to core

#### ✅ 14.4 — Publishing

**Goal:** An app installs the SDK from npm.

**Deliverables:**

- `sdk-v*.*.*` in `publish.yml`, and what the SDK depends on published with it
- `docs/releasing.md` and a guide for app developers
- Stable and experimental exports marked, as the specification lists
- Each release stating the core versions it supports

**Dependencies:** 14.3

**Spec reference:** sdk §12

**Review checklist:**

- `pnpm packages:check` covers it
- A new app using only the published package meets §14 of the specification

#### ✅ 14.5 — App tokens in core

**Goal:** An app can act with no person present, for what an operator allowed.

**Deliverables:**

- The client-credentials grant, app scopes on a client through `ClientRegistry` and the Console, and core-app §3.6.6's checks in
  `apps/core/src/api/token.ts`, whose principal is a person today
- `sv.app` in the SDK: the token side is there since 14.2, and has no method until a capability needs one
- The first capability that needs it is notifications, built in 15.5

**Dependencies:** 14.2. 15.5 builds the first capability that needs an app scope, notifications, and the two meet in `notifications:send`: whichever is built first leaves the other's operation unserved

**Spec reference:** core-app §3.6.6, §3.7.1; sdk §4, §5.2

**Review checklist:**

- A public app is refused, and an app with no app scopes is refused
- Rotating, switching off and deleting each stop an app token at once
- `directory` can never be given to an app token
- `docs/connecting-an-app.md` says the grant exists
- The security check is run

#### ✅ 14.6 — Account-deletion fan-out

**Goal:** When a person deletes their account on core, each app they used finds out and deletes what it holds.

**Priority:** 6.

**Deliverables:**

- A design, in core's specification and the SDK's. This runs from core to an app, unlike every other call, so it needs deciding how
  an app is told, what happens when it is down, and how a backup restored later learns of it
- Legacy `portability`'s place in `docs/specs/sdk.md` §10 settled
- Build tasks added here once it is designed

**Dependencies:** 14.3

**Spec reference:** core-app §2; sdk §8, §10

**Review checklist:**

- A person's deletion cannot be lost because an app was down
- An app that never answers is visible to an operator

#### 📋 14.7 — Deletion notices: keep them

**Goal:** Deleting an account records, in the same transaction, a notice for each app that must be told, and an app can say where.

**Priority:** 7.

**Deliverables:**

- The table and a `DeletionNotices` service that is the only writer, and the deletion transaction (a person's own and an operator's) writing
  one notice for each app the person used that has an account-deleted address, read before the same transaction deletes the consents and
  tokens (core-app §4.5)
- The account-deleted address on a client: in `ClientRegistry`, the Console's form, `sovereign-admin apps ensure --account-deleted`, and
  the same address rules as a redirect address. It is not a Core API operation, so the contract does not change
- Deleting an app deletes its notices; a delivered notice is deleted 90 days after delivery

**Dependencies:** 14.6

**Spec reference:** core-app §4.5, §3.7.1

**Review checklist:**

- A deletion that rolls back leaves no notice, and one that commits always has them
- An app that was not used by the person, and an app with no address, get none
- A notice holds no name, address or other detail of the person
- The security check is run

#### 📋 14.8 — Deletion notices: send them

**Goal:** Each notice is sent until the app answers, and an operator can see one that is not.

**Priority:** 8.

**Deliverables:**

- The delivery: the signed `account-deleted+jwt`, the form `POST`, the schedule of core-app §4.5, a lease so two instances do not send
  one notice at once, picking up what is due when core starts and every minute, and giving up after 30 days with a log line that names the
  app and not the person
- The Console's list of notices not yet delivered (with `client:manage`), the first eight characters of the `sub`, the count given up, and
  marking one resolved

**Dependencies:** 14.7

**Spec reference:** core-app §4.5

**Review checklist:**

- A notice survives core stopping between attempts, and is sent again after it starts
- An app that is down for a day is told when it is back, and one that never answers appears in the Console
- A redirect is not followed; a body in the app's answer is never kept or logged
- The security check is run

#### 📋 14.9 — The SDK's part of the deletion

**Goal:** An app handles a deletion notice in one function and cannot answer it before it is done.

**Priority:** 9.

**Deliverables:**

- `sv.auth.handleAccountDeleted(request, handler)` as sdk §9.1 describes, in the Next.js adapter too, and the fake core able to send one
  (and a wrong one, as it does for logout tokens)
- `accountDeleted` in the app manifest's schema is read by `sv`; the guide (`docs/using-the-sdk.md`) shows the handler and says what it
  must delete

**Dependencies:** 14.6, 14.3

**Spec reference:** sdk §9, §9.1

**Review checklist:**

- A token for another app, an expired one, a logout token and a replayed one are each refused
- The SDK answers `200` only after the handler resolved, and `500` when it throws
- The SDK's tests hold the fake core to core's token

#### 📋 14.10 — Deletions across a restore

**Goal:** A person who deleted their account after the backup is deleted again when the backup is restored, and their apps are told again.

**Priority:** 10.

**Deliverables:**

- `sovereign-admin instance deletions export` and `apply` (core-app §4.5), going through the registry's system actor and the same deletion
  transaction as any other deletion
- The call from `sv restore` is built with that command, in task 13.8, using operator-cli §10.2

**Dependencies:** 14.7, 15.8

**Spec reference:** core-app §4.5, §4.4; operator-cli §10.2

**Review checklist:**

- An account the restored database brought back is deleted again, and one it does not have is not made
- Applying the same file twice changes nothing the second time
- The file holds `sub`s and nothing else about a person
- The security check is run
