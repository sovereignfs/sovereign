# Epic 15: Core services

> What core offers apps beyond sign-in is specified, so it can be built and the SDK can wrap it.

## Status

📋 Planned

## Overview

[Core's specification](../specs/core-app.md) §2 leaves Phase 2 unspecified: mail, notifications, activity, account-deletion fan-out and
backups. Each task here writes one into the specification and the contract. Building each is added here once its specification
exists, and account-deletion fan-out is task 14.6, since it needs its own design across core and the SDK.

## Related

- [docs/specs/core-app.md](../specs/core-app.md): §2, §3.6.6, §3.16
- [docs/specs/sdk.md](../specs/sdk.md): §8 reserves the names
- [spec/core-api/](../../spec/core-api/): each adds its operations here

## Tasks

#### ✅ 15.1 — Notifications

**Goal:** What an app may send a person, and how it reaches them, is specified.

**Priority:** 1. The first capability an app uses with nobody present, so app tokens wait for it.

**Deliverables:**

- A Phase 2 section in core's specification: sending, listing, reading and dismissing, what a person controls, and the panel apps show
- Whether push is part of it, and what relays it
- Which calls an app may make for itself, as an app scope (§3.6.6), and limits on them
- Its operations in the contract, marked `x-planned`
- Whether legacy `messages` is part of this (`docs/specs/sdk.md` §10)

**Dependencies:** none

**Spec reference:** core-app §2, §3.6.6

**Review checklist:**

- An app cannot send to someone who has never used it, or the specification says why it may
- A person can stop an app's notifications

#### 📋 15.2 — Mail for apps

**Goal:** An app can email a person without being given their address.

**Priority:** 2.

**Deliverables:**

- A Phase 2 section: sending to a person by `sub`, templates, and what core says about delivery
- What this is for, given that an app can run its own mail with `@sovereignfs/mailer`
- Its operations in the contract, marked `x-planned`, and limits

**Dependencies:** 15.1

**Spec reference:** core-app §2, §3.14

**Review checklist:**

- An app never learns an address it was not granted
- A person's address cannot be found from whether a send worked

#### 📋 15.3 — Activity `[parallel]`

**Goal:** What apps record about a person, and what that person can see of it, is specified.

**Priority:** 3.

**Deliverables:**

- A Phase 2 section: what is logged, who reads it, and how long it is kept
- Its operations in the contract, marked `x-planned`

**Dependencies:** none

**Spec reference:** core-app §2

**Review checklist:**

- A person can see what is recorded about them
- What is kept has a limit

#### 📋 15.4 — Backups `[parallel]`

**Goal:** What core's own backups are, apart from an operator's, is specified.

**Priority:** 4.

**Deliverables:**

- A Phase 2 section: what a person or an operator can back up through core, and where it goes
- How it relates to `sv backup` (operator-cli §10.2), so the two do not overlap

**Dependencies:** none

**Spec reference:** core-app §2; operator-cli §10.2

**Review checklist:**

- Backups are encrypted, and the keys are never inside them
- An operator knows which tool is for what

#### 📋 15.5 — Notifications: build

**Goal:** An app with the app scope `notifications:send` can tell a person something, and the person sees it in core.

**Priority:** 5. It is what 14.5's app tokens wait for.

**Deliverables:**

- The tables (`notifications`, and a per-person per-app switch) in a migration on every dialect, and a `NotificationService` that is
  the only writer: send (with the rules of who may be written to, the dropped send that answers like a delivered one, `key`
  de-duplication, the limits and the keeping), list, read, dismiss, clear
- The bell and panel in the account header, and the per-app switches and "Clear all" in Preferences, as the specification says
- Removing an app's access, deactivating or deleting an account, and deleting an app clean up what they should
- The six operations of the contract served, with `x-planned` removed and the instance document's `api.capabilities` listing
  `notifications`; the app scope `notifications:send` and the person scope `notifications` in `ClientRegistry` and the Console

**Dependencies:** 15.1, 14.5 for the app token that sends (the person-token operations and the panel do not wait for it)

**Spec reference:** core-app §4.1, §3.6.6, §3.7.1, §3.13

**Review checklist:**

- A send to a person who never used the app, who turned it off, or whose account is inactive answers exactly as a delivered one does
- An app never sees another app's notifications, and a person's token never sends
- The security check is run
