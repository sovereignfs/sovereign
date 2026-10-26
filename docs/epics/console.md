# Epic 8: Console

> The operators' administration area: accounts, invites, instance settings,
> the capability matrix, ownership, and apps.

## Status

📋 Planned

## Overview

Every Console page checks capabilities on the server, in each action, not
only at the page. All pages are built from `@sovereignfs/ui`.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.2, §3.7, §3.10, §3.12

## Tasks

#### 📋 8.1 — Console shell

**Goal:** Operators have a Console to work in, and nobody else can enter it.

**Deliverables:**

- Console layout and navigation, showing only sections the account's
  capabilities allow
- Entry requires `console:access`

**Dependencies:** 5.1

**Spec reference:** §3.2.2

**Review checklist:**

- A `platform:user` cannot reach any Console page or action

#### 📋 8.2 — Accounts

**Goal:** Operators can find and manage accounts within the role rules.

**Deliverables:**

- List with search by name or email; detail view; copy `sub`
- Change role (owner only); deactivate, reactivate, delete; reset MFA (the
  account holder is emailed)
- Only the owner acts on operator accounts

**Dependencies:** 8.1, 4.5, 4.6, 4.7

**Spec reference:** §3.2.1, §3.4.3, §3.10

**Review checklist:**

- An admin cannot deactivate, delete or reset the MFA of another admin or the
  owner, by a direct request as well as through the page

#### 📋 8.3 — Invites `[parallel]`

**Goal:** Operators can invite people by email.

**Deliverables:**

- Invite by address with optional expiry in days; list pending; cancel
- An "invite link invalid" page for expired, cancelled or used links

**Dependencies:** 8.1, 4.2, 3.2

**Spec reference:** §3.10

**Review checklist:**

- An invited person can sign up while invite-only is on; an expired invite is
  refused

#### 📋 8.4 — Instance settings `[parallel]`

**Goal:** Operators can name and brand the instance and configure registration
and mail.

**Deliverables:**

- Instance name; logo (light and dark) and favicon uploads, stored in the
  database per spec §3.15 (at most 1 MB; PNG, JPEG, WebP, or sanitised SVG)
- Invite-only toggle
- SMTP settings, behind `instance:configure-secrets`; the password is never
  shown again

**Dependencies:** 8.1, 3.1

**Spec reference:** §3.12

**Review checklist:**

- An admin cannot read or change SMTP settings
- Uploaded images outside the allowed types or size are refused
- An SVG carrying a script is sanitised before it is stored

#### 📋 8.5 — Capability matrix and ownership

**Goal:** The owner can edit the matrix and transfer ownership from the
Console.

**Deliverables:**

- A matrix editor for the admin and user rows; owner-only capabilities shown
  but locked
- The ownership transfer screen

**Dependencies:** 8.1, 5.2, 5.3

**Spec reference:** §3.2.3, §3.2.1

**Review checklist:**

- Only the owner sees and uses either screen

#### 📋 8.6 — Apps

**Goal:** Operators can register and manage clients in the Console.

**Deliverables:**

- List, register, edit, enable, disable, delete; rotate secret with a
  show-once dialog offering "end the old secret now" (default) or "keep it
  for 24 hours"
- "Client" appears only in these technical settings; elsewhere the text says
  "app"

**Dependencies:** 8.1, 7.1

**Spec reference:** §1.3, §3.7

**Review checklist:**

- A newly registered client signs a person in through core
