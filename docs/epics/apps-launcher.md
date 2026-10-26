# Epic 7: Apps & Launcher

> Registered clients and how people reach them: the client registry with its
> launcher entries, and the launcher page.

## Status

📋 Planned

## Overview

Core knows clients, never particular apps. A client may carry a launcher entry
(name, description, icon, launch URL). The Console pages for registering
clients are task 8.6; this epic owns the model and the launcher.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.7, §3.8

## Tasks

#### 📋 7.1 — Client registry

**Goal:** Clients can be registered, changed, disabled and deleted with the
right effects on tokens and the launcher.

**Deliverables:**

- Client settings from spec §3.7.1 (type, redirect URIs, post-logout URIs,
  back-channel logout URI stored for later, allowed scopes, trusted, enabled)
- Launcher entry from spec §3.7.2
- Secrets: generated, shown once, stored hashed; rotation with the operator's
  choice of ending the old secret at once (default) or after 24 hours
  (spec §3.7.3). First confirm that `@better-auth/oauth-provider` can hold two
  secrets for one client; if it cannot, ship immediate rotation only and
  record the gap in the spec
- Disabling stops new authorizations and refreshes and hides the entry;
  deleting revokes every token and consent for the client
- Every change requires `client:manage`

**Dependencies:** 6.1

**Spec reference:** §3.7

**Review checklist:**

- A disabled client cannot complete sign-in or refresh a token
- After deletion, no token issued to the client is accepted
- `roles` cannot be allowed on an untrusted client
- With the 24-hour choice both secrets work until the overlap ends; with the
  default the old secret fails immediately

#### 📋 7.2 — Launcher

**Goal:** Signed-in people land on a page listing the apps they can open.

**Deliverables:**

- Core's `/` for people with `launcher:access`: every enabled client with
  "show in launcher" on, with icon, name and description; search by name
- An icon drawn from the name when none is set
- Choosing an app opens its launch URL in the same tab, as an ordinary link
  (no `target="_blank"`)

**Dependencies:** 7.1, 2.3

**Spec reference:** §3.8

**Review checklist:**

- Disabled clients and clients with "show in launcher" off do not appear
- Opening an app with an existing session completes sign-in without a prompt
  (trusted client)
- The page works at phone width and in both themes
