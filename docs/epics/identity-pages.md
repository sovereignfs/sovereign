# Epic 9: Identity Pages

> The pages where a person manages their own account: profile, security,
> preferences, connected apps, and deleting the account.

## Status

📋 Planned

## Overview

Core is the sign-in server, so a person's identity settings live here. They
require `profile:manage`, are built from `@sovereignfs/ui`, and follow the
Sovereign Account screens: they open as an overlay above the current page and
close back to it (spec §1.3, §3.11).

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.11

## Tasks

#### 📋 9.1 — Profile

**Goal:** A person can set their name and avatar.

**Deliverables:**

- Name and avatar; the email address shown but not editable
- Avatars stored in the database per spec §3.15: at most 1 MB, PNG, JPEG or
  WebP (no SVG); cropped and scaled in the browser to about 512 pixels square
  before upload
- Changes reflected in the `name` and `picture` claims

- A name's rules on every path that sets one; the picture's address set only
  by uploading; `/profile`, until the identity pages share one overlay

**Not here:** the `name` and `picture` claims themselves and the userinfo call
(the provider epic reads `users.name` and `users.image`, so a change shows at
once), and the overlay that the identity pages open in.

**Dependencies:** 4.1

**Spec reference:** §3.11, §3.6.2

**Review checklist:**

- After a change, a client's next userinfo call returns the new name (here: the
  person's session and `users` show it at once; the call arrives with the
  provider)

#### 📋 9.2 — Security

**Goal:** A person manages their own credentials and sessions.

**Deliverables:**

- Change password; manage passkeys; enrol or remove TOTP and backup codes
- List sessions and end any of them

**Dependencies:** 4.5, 4.6, 4.7

**Spec reference:** §3.11

**Review checklist:**

- Ending a session from the list signs that browser out

#### 📋 9.3 — Preferences `[parallel]`

**Goal:** A person sets their timezone and locale.

**Deliverables:**

- Timezone (validated as IANA) and locale, reflected in the `zoneinfo` and
  `locale` claims

**Dependencies:** 4.4

**Spec reference:** §3.11, §3.6.2

**Review checklist:**

- An invalid timezone is refused by the server

#### 📋 9.4 — Connected apps

**Goal:** A person sees which apps they have allowed and can remove an app's
access.

**Deliverables:**

- The list of apps with consent and the scopes granted
- **Remove access** calls the revocation routine from 6.3: it deletes the
  consent and revokes the app's access and refresh tokens for the account in
  one step (it never calls the plugin's consent deletion on its own)

**Dependencies:** 6.2, 6.3

**Spec reference:** §3.11, §3.6.4

**Review checklist:**

- After Remove access, the app's refresh token is rejected and the next
  sign-in asks for consent again

#### 📋 9.5 — Delete account

**Goal:** A person can delete their own account.

**Deliverables:**

- Deletion confirmed with the password; the owner is told to transfer
  ownership first
- All sessions end and all tokens are revoked; the `sub` is never reused

**Dependencies:** 5.3, 6.3

**Spec reference:** §3.3.6, §3.11

**Review checklist:**

- The owner cannot delete their account while still owner
- After deletion, no token for the account is accepted
