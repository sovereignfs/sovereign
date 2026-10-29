# Epic 7: Apps & Launcher

> Registered clients and how people reach them: the client registry with its
> launcher entries, and the launcher page.

## Status

⏳ In Progress

## Overview

Core knows clients, never particular apps. A client may carry a launcher entry
(name, description, icon, launch URL). The Console pages for registering
clients are task 8.6; this epic owns the model and the launcher.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.7, §3.8

## Tasks

#### ✅ 7.1 — Client registry

**Goal:** Clients can be registered, changed, disabled and deleted with the
right effects on tokens and the launcher.

**Deliverables:**

- Client settings from spec §3.7.1 (type, redirect URIs, post-logout URIs,
  back-channel logout URI, end-session, allowed scopes, trusted, enabled)
- Launcher entry from spec §3.7.2, stored in the client's `metadata`
- **A registry module that is the only writer of client rows** (research 0001,
  B3–B5): it registers the client through the plugin so the secret is hashed and
  defaults apply, then writes core's own fields (trusted flag, launcher entry,
  development redirect URIs) through the plugin's adapter — never through
  Drizzle's schema objects, which return the plugin's JSON columns as strings.
  `clientReference` is set so every account passing `clientPrivileges` (owner
  or admin) can manage every client, not only its creator
- Redirect URI validation of our own (`https`; `http` on `localhost` and
  `*.localhost` only when `SV_URL` is `http`); refuses `roles` on an untrusted
  client and removes it when a client stops being trusted
- Secrets: generated, shown once, stored hashed; rotation takes effect at once
  (spec §3.7.3)
- Disabling stops new authorizations and refreshes and hides the entry;
  deleting revokes every token and consent for the client
- Every change requires `client:manage`

**Dependencies:** 6.1

**Spec reference:** §3.7

**Review checklist:**

- A disabled client cannot complete sign-in or refresh a token
- After deletion, no token issued to the client is accepted
- `roles` cannot be allowed on an untrusted client
- After rotating a secret the old one fails at once and the new one works
- A second admin can rotate, edit, disable and delete a client the first
  created; a plain user can do none of it
- A plain `http` redirect is refused on a production instance and accepted for
  `*.localhost` on a development instance

**Not here:** the Console pages and forms that call the registry (the Apps task
in the Console epic) and the launcher page (7.2); the registry offers
`list`, which the launcher will filter to enabled apps shown in it.

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
