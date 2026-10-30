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

#### 📋 14.5 — App tokens in core

**Goal:** An app can act with no person present, for what an operator allowed.

**Deliverables:**

- The client-credentials grant, app scopes on a client through `ClientRegistry` and the Console, and core-app §3.6.6's checks in
  `apps/core/src/api/token.ts`, whose principal is a person today
- `sv.app` in the SDK
- The first capability that needs it

**Dependencies:** 14.2. 15.5 builds the first capability that needs an app scope, notifications, and the two meet in `notifications:send`: whichever is built first leaves the other's operation unserved

**Spec reference:** core-app §3.6.6, §3.7.1; sdk §4, §5.2

**Review checklist:**

- A public app is refused, and an app with no app scopes is refused
- Rotating, switching off and deleting each stop an app token at once
- `directory` can never be given to an app token
- `docs/connecting-an-app.md` says the grant exists
- The security check is run

#### 📋 14.6 — Account-deletion fan-out

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
