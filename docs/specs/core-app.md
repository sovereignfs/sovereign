# Sovereign core — app specification

|                      |                    |
| -------------------- | ------------------ |
| **Status**           | Draft              |
| **Covers**           | `apps/core`        |
| **Phases specified** | Phase 1 of the MVP |

This document is the single source of truth for what the core app does. Where
code, another document or an issue disagrees with it, this document wins until
it is changed. Each phase adds its own section; a later phase may amend an
earlier one, and says so where it does.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are
used as described in RFC 2119.

The wire contract for anything an app calls over HTTP is in
[`contracts/core-api/`](../../contracts/core-api/), and the environment variable
convention is in [`contracts/env.md`](../../contracts/env.md). This document describes
behaviour; those define the exact shapes. How operators deploy core is in
[`operator-cli.md`](operator-cli.md), and how a JavaScript app calls it in
[`sdk.md`](sdk.md).

---

## 1. What core is

Core is a self-hostable identity and foundation service. Anyone can deploy it
and point any application that speaks OpenID Connect at it for sign-in. In
later phases it also offers shared services (mail, notifications, activity,
backups) that apps may use.

### 1.1 Principles

1. **Core is generic.** It knows about OAuth clients, and optionally a launcher
   entry for each, never about a particular application. Nothing in core may
   depend on a specific app existing. An off-the-shelf OIDC application that
   has never heard of Sovereign MUST be able to use core as its sign-in server.
2. **Apps decide what an account may do inside them.** Core proves who someone
   is and which platform role they hold; authorization within an app is that
   app's business.
3. **Configuration is by environment variable,** prefixed `SV_`. Where the
   Console can also change a setting, the environment provides the default and
   a value saved in the Console overrides it, without a restart.
4. **Secure by default.** No secret has a default value; the server refuses to
   start without required secrets. A setting left unset never opens access.
5. **One design system.** Every page core serves is built from
   `@sovereignfs/ui` (§1.3), the same design system apps use, so that core and
   apps look and behave as one product.

### 1.3 User interface

- All of core's pages (sign-in, sign-up, consent, identity pages, the Console,
  the launcher, error pages) MUST be built from `@sovereignfs/ui`
  (`packages/ui`): its components and its `--sv-*` design tokens.
- Core's UI follows the established Sovereign UI as it is: each kind of page
  keeps the layout and behaviour of its Sovereign predecessor.

  | Core page                                                                                 | Follows the Sovereign                                |
  | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
  | Sign-in, sign-up, forgot and reset password, second step, verify email                    | sign-in pages                                        |
  | Consent                                                                                   | consent page                                         |
  | The frame around signed-in pages: header, navigation, mobile header and footer, user menu | platform shell                                       |
  | Launcher                                                                                  | Launcher                                             |
  | Console                                                                                   | Console                                              |
  | Identity pages                                                                            | Account, opened as an overlay above the current page |
  | Privacy Policy and Terms of Service                                                       | legal pages                                          |

- Core's typeface is the design system's: Hanken Grotesk, served by core itself
  from the files the design system ships (no request to another site), with the
  stack `'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
Roboto, Helvetica, Arial, sans-serif`. A page or component names a family only
  through the design system's token, and the design system's check fails when it
  does not.
- The pages before sign-in (sign-in, sign-up, forgot and reset password, the
  second step, an invitation link that does not work) and the pages that stand
  alone (consent, a missing address, a failure) are one card, 360 pixels wide
  and centred on the screen, with the instance's mark above its title: its logo,
  or the first letter of its name in a badge. The sign-in page is titled "Sign
  in to" the instance's name and offers "Forgot password?" beside the password,
  a passkey below an "or", and the legal links at the foot; a person who has just
  signed out is told so. Labels sit above the boxes, small and muted, with no
  asterisk. Sign-up and a new password ask for the password twice; the second
  step is one box for each digit of the code (pasting fills them), and offers a
  passkey instead.
- Every signed-in page, the launcher, the identity pages and the Console alike,
  has the same header. On the left, the instance's mark (its logo, or the first
  letter of its name in a badge, a little larger than on the sign-in pages) and
  its name, which lead home. On the right, the person's avatar (their picture, or
  their initials), which opens a menu with who they are, their account and sign
  out; an operator reaches the Console from its tile on the launcher, where the
  name leads. No page is a dead end, and none repeats
  the header's links of its own. The pages before sign-in show the instance's
  mark above their title, so a person can tell whose sign-in it is.
- An address that leads nowhere, and a page that fails, show a page of the same
  design (a plain sentence and one way onward), never the framework's own. A
  Console page someone may not open shows the first, saying nothing of what is
  there.
- An action that goes to another page ("Add an app") is a link made to look like
  a button (`ButtonLink`), not an unstyled link and not a button that navigates.
- Until the operator sets a favicon of their own, an instance has the Sovereign
  one, an `S` in white on a dark rounded square, as the established Sovereign app
  has: core serves it (`/icons/favicon.svg`, `/icons/favicon.ico`,
  `/icons/apple-touch-icon.png`, and `/favicon.ico`, which a browser asks for
  whatever a page links) with no session, and the operator's favicon replaces it
  as soon as it is set.
- Core installs as an app (RFC 0001). A browser finds a web app manifest at
  `/manifest.webmanifest`, which is public and the same for everyone: the
  instance's name (so renaming it renames the app), core's launcher as its start
  address and its scope (core's origin and no wider; the apps in the launcher are
  other origins, opened as §3.8 says), `standalone` display, the page
  colour of the light theme, and the Sovereign mark as 192 and 512 pixel icons
  and a maskable one (`/icons/icon-192.png`, `/icons/icon-512.png`,
  `/icons/icon-maskable-512.png`, served with no session), or the operator's own
  app icons when they have set them (§3.12). The manifest also carries what a
  fuller install needs, none of it varying by who asks (RFC 0001 A1): a fixed `id`
  of `/` (a browser knows an installed app by it), a launch handler that brings a
  window already open forward rather than starting another, shortcuts to the
  launcher and the account page only (pages every signed-in person has; never the
  Console), a narrow and a wide picture of the sign-in page for the install sheet
  (`/icons/screenshot-narrow.png`, `/icons/screenshot-wide.png`, served with the
  icons), its categories, and its language. Where the device allows it, the
  account pages offer to install core (RFC 0001 A2): the browser's own prompt
  where it has one, the words for Add to Home Screen on an iPhone or iPad, nothing
  in an installed window, and nothing again on a device where the person said
  "Not now". Every page tells a
  device how to meet its screen: it runs to the edges (`viewport-fit: cover`),
  what matters stays clear of a notch and a home bar by the safe-area insets, a
  strip of the page's colour holds the status bar of an installed app so that a
  page that scrolls does not slide under the clock, the
  browser's bar takes the page's colour in the person's chosen theme, or else in the
  system's colour scheme, and an
  iPhone opens a page added to its home screen as an app, named for the instance.
- Core MUST NOT use another component library, Tailwind, or runtime CSS-in-JS.
  Its own styles are CSS Modules that reference the design system's semantic
  tokens; colours, spacing and radii are never hard-coded.
- When a page needs something the design system does not have, it is added to
  `packages/ui` first and then used by core, not built locally in core.
- Pages work at phone width and in both light and dark themes.
- Text a person reads says "app". "Client" appears only in the Console's
  technical settings for registering one.

### 1.2 Terminology

| Term               | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| **Account**        | A person's identity in core: email address, credentials, profile.            |
| **Role**           | A named set of capabilities assigned to an account. Named `scope:role-name`. |
| **Capability**     | A single permission that is checked in code. Named `resource:action`.        |
| **Owner**          | The account holding `platform:owner`. There is exactly one.                  |
| **Operator**       | An account holding `platform:owner` or `platform:admin`.                     |
| **Client**         | An application registered with core as an OAuth/OIDC client.                 |
| **App**            | A client as presented to users, through its launcher entry.                  |
| **Trusted client** | A client whose users are not asked for consent (§3.6.4).                     |
| **Console**        | Core's administration area, for operators.                                   |
| **Identity pages** | Core's pages where a person manages their own account.                       |
| **Launcher**       | Core's home page for signed-in users, listing apps.                          |

---

## 2. Phase overview

| Phase | Theme                                                                                           | Status                                       |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **1** | Identity, sign-in server, app registration                                                      | Specified below                              |
| 2     | Core services for apps: mail, notifications, activity, account-deletion fan-out, backups, files | Specified and built (§4); files on disk only |
| Keys  | Encryption the server cannot read: signing in with a derived value, the vault, the recovery kit | Specified (§5) and built; not yet audited    |
| Later | Groups and access policies, import, relay, and more                                             | Not yet specified                            |

---

## 3. Phase 1 — Identity and app registration

### 3.1 Goal

An operator can deploy core, people can sign up and sign in to it, and
operators can register any OIDC application so that its users sign in through
core and see it in the launcher.

### 3.2 Roles and capabilities

#### 3.2.1 Roles

| Role             | Who                                           |
| ---------------- | --------------------------------------------- |
| `platform:owner` | The one account responsible for the instance. |
| `platform:admin` | Operators appointed by the owner.             |
| `platform:user`  | Everyone else. The default for a new account. |

- Role names MUST follow `scope:role-name`. Phase 1 defines only the
  `platform` scope; other scopes are reserved for later use.
- There MUST be exactly one owner at all times. The first account created on
  an instance becomes the owner.
- Only the owner can change an account's role, and only the owner can transfer
  ownership, to an existing `platform:admin`. When transferring, the owner
  chooses their own new role, `platform:admin` (the default) or
  `platform:user`. No action may leave the instance without an owner.
- Only the owner can act on an operator account (change, deactivate, delete,
  reset MFA). Admins act on `platform:user` accounts only.
- A role is changed only between `platform:admin` and `platform:user`, and only
  by the owner: nobody is made the owner by a role change, and the owner's role
  cannot be changed. Ownership moves only by transfer (§3.2.3's owner row is
  fixed), which swaps two accounts in one step. The owner cannot be deactivated.
- A transfer asks the owner for their password again. The new owner must be an
  existing, active `platform:admin` other than the owner. The two changes are one
  step, each conditional on what it expects to find (the owner still the owner,
  the admin still an active admin), so two transfers at once, or one racing a
  role change or a deactivation, cannot leave two owners or none: the loser
  changes nothing. Capabilities follow the roles at once.
- Asking for a password again is limited: five wrong answers within ten minutes
  for an account, and every answer after that is refused, a right one too, until
  the ten minutes have passed. A right answer clears the count. The count is one
  per account wherever the password is asked: handing over ownership, deleting
  the account, turning two-factor sign-in on or off, its backup codes and key,
  and changing the password, whose better-auth routes are checked through it
  before better-auth checks the password itself.
- A role that is not one of these holds no capability. A person's role is read
  from the database for what core guards, so a change shows at once.

#### 3.2.2 Capabilities

Capabilities are the unit every check uses. Roles are only named bundles of
them.

| Capability                   | Allows                                                     | Default roles      |
| ---------------------------- | ---------------------------------------------------------- | ------------------ |
| `profile:manage`             | Edit one's own profile, credentials and preferences        | user, admin, owner |
| `launcher:access`            | Use the launcher                                           | user, admin, owner |
| `files:manage`               | Keep one's own files in core (§4.6)                        | user, admin, owner |
| `console:access`             | Enter the Console                                          | admin, owner       |
| `user:view`                  | View the account list                                      | admin, owner       |
| `user:manage`                | Invite, deactivate, reactivate, delete accounts; reset MFA | admin, owner       |
| `client:manage`              | Register, edit, disable and delete clients; rotate secrets | admin, owner       |
| `instance:view`              | View instance settings                                     | admin, owner       |
| `instance:configure`         | Change instance settings other than secrets                | admin, owner       |
| `instance:configure-secrets` | View and change instance secrets (SMTP credentials)        | owner only         |
| `role:assign`                | Change another account's role                              | owner only         |
| `capability:configure`       | Edit the capability matrix                                 | owner only         |
| `ownership:transfer`         | Transfer ownership                                         | owner only         |
| `instance:diagnose`          | Open the lock check on a production instance (§3.15.1)     | owner only         |
| `instance:export`            | Take the owner's export of core's data (§4.7.1)            | owner only         |

#### 3.2.3 The capability matrix

- The set of capabilities and the default matrix are defined in code.
- The owner MAY edit the `platform:admin` and `platform:user` rows in the
  Console. The owner's row is fixed: the owner always holds every capability.
- Owner-only capabilities (`instance:configure-secrets`, `role:assign`,
  `capability:configure`, `ownership:transfer`, `instance:diagnose`, `instance:export`) MUST NOT be granted to any
  other role.
- Operator-only capabilities (`console:access`) MUST NOT be granted to
  `platform:user`: the Console, its tile on the launcher and what the launcher
  tells about the instance are for the owner and, while the matrix gives it,
  admins. The owner MAY take it from admins.
- A change to the matrix MUST reach accounts that are already signed in within
  the session cookie cache lifetime (§3.5).
- The owner's edits are stored as differences from the default, for the admin
  and user rows only, and nothing else can be stored: the owner's row, a role
  or capability that does not exist, an owner-only capability, and an
  operator-only one given to users are refused,
  and a request with any one of them saves nothing. A change that only restates
  the default removes the stored difference, so a matrix nobody edited has no
  rows and a capability added to core later reaches everyone as its default
  says. The owner can put both rows back to the defaults.
- Core's own checks read the matrix from the database, not from the session
  cookie, so an account already signed in sees a change at once on the instance
  that saved it and within a few seconds on another; there is no per-session
  version to carry. If the matrix cannot be read, the check fails.

The Console edits the matrix on **Permissions** (`/console/permissions`, needing
`capability:configure`, so the owner alone) and hands the instance over on
**Ownership** (`/console/ownership`, needing `ownership:transfer`). Neither is
listed for, or opens for, anyone else.

- **Permissions** lists every capability in words, never by its name in code, with
  a box for admins and a box for users. A capability only the owner may hold is
  listed with no boxes, marked "Only the owner"; an operator-only one has a box for
  admins and none for users, marked "Not for users". Nothing is saved until the owner
  saves the whole table, and what is saved is what was shown: every box the owner
  may edit is sent, ticked or not, so an owner-only capability or an unknown role
  in a forged request is never reached. The page is read from the database, not
  from the matrix cache, since it is the table being edited. Saving says how many
  changes it made; "Back to the defaults" asks first and is offered only while
  the table differs from them. The owner has no boxes: the owner's row is fixed.
- **Ownership** offers the active admins other than the owner, what the owner
  becomes (an admin or an ordinary user), and asks for the owner's password; a
  question names who will own the instance before anything is sent. A wrong or
  limited password is shown in that question with what was typed kept. When the
  hand-over succeeds the page leaves for the Console, where the previous owner
  now sees what an admin sees. With no admin to hand it to, the page says to make
  someone an admin first and sends nothing.

### 3.3 Accounts: sign-up and sign-in

#### 3.3.1 Registration policy

- `SV_AUTH_INVITE_ONLY` sets the default: `true` means sign-up needs a valid
  invite, `false` means anyone can sign up. A value saved in the Console
  overrides the variable. When neither is set, sign-up needs an invite: a
  setting left unset never opens access (§1.1).
- The first account on an instance is exempt from invite-only and becomes the
  owner.
- With invite-only on, a sign-up without a valid, unexpired invite for that
  email address MUST be refused by the server, not only hidden in the page.
- The refusal is the same whether the address has no invite, or its invite has
  expired, been cancelled or already been used, so it does not reveal which
  addresses have been invited. A sign-up that an invite admits uses that invite
  up.
- "First" means no account exists at all. Once any account exists, an instance
  that has lost its owner does not hand ownership to the next visitor. When two
  sign-ups arrive together on an empty instance, one becomes the owner and the
  other fails.
- A role is set by core and never by a request: sign-up and profile edits ignore
  or refuse a `role` the person supplies.
- The sign-up page says what applies: that the account made now is the owner,
  that sign-up is by invitation, or nothing when it is open.

#### 3.3.2 Email and password

- Sign-up asks for name, email address and password, and the acceptance of the
  instance's terms (§3.3.5). The browser's timezone is captured and MUST be
  validated as an IANA timezone before it is stored: a name such as
  `Europe/London` (kept in its proper spelling), never a fixed offset or free
  text. One that is not is refused with `INVALID_TIMEZONE` and nothing is
  stored; none at all is allowed. A time zone changed later is checked the
  same way.
  The language (`locale`) is the same: a BCP 47 tag such as `en-GB`, kept in
  its proper spelling, refused with `INVALID_LOCALE` when it is not one (a list,
  `und`, free text); none at all is allowed, and one changed later is checked the
  same way.
- Passwords follow the policy set by `SV_AUTH_PASSWORD_MIN_LENGTH` (default 8)
  and, each off by default, `SV_AUTH_PASSWORD_REQUIRE_UPPERCASE`,
  `…_REQUIRE_LOWERCASE`, `…_REQUIRE_NUMBER` and `…_REQUIRE_SYMBOL`. Core never
  receives a password (§5.2), so the policy is checked in the browser, before the
  sign-in value is derived, with the reason in one sentence, and nothing is sent.
- The server refuses, on every path that stores a password (sign-up, reset,
  change, and a server-side set), anything that is not a sign-in value
  (`PASSWORD_NOT_DERIVED`), and nothing is stored. Signing in with anything else
  is answered as a wrong password is, before any account is looked up. The
  longest password is 128 characters.
- Repeated sign-in or sign-up attempts from one client address are refused with
  `429` and a `Retry-After`; the counters are kept in the database, so every
  instance shares them.
- Core cannot run without a database: accounts and sessions live in it, and
  start-up stops when none is configured.
- An "account created" email is sent once the account is usable: at sign-up, or
  when the address is verified when verification is required (§3.3.3), so
  nobody is told about an account on an address that has not been shown to be
  theirs.

#### 3.3.3 Email verification

- `SV_AUTH_REQUIRE_EMAIL_VERIFICATION` (default `true`) blocks sign-in until the
  address is verified. Sign-up then makes the account, signs nobody in and
  sends the link; a person who gives the right password before verifying is
  told to verify and can ask for a new link. Signing in does not itself send
  one.
- A sign-up made from the link of an invitation that core emailed to that very
  address (§3.10) needs no second email: holding the link's unguessable id
  shows the person reads the address, as a verification link would. The
  sign-up page sends the id with the sign-up; the account is made verified,
  no verification link is sent, the account-created email is, and the person
  is signed in straight away. The address alone never counts, and neither
  does the link of an invitation passed on by hand because its email was not
  sent: those sign-ups are verified by email as any other.
- The verification link is single-use, expires after one hour, and signs the
  person in when followed. Following it a second time opens no session. A new
  link can be requested.
- A verification link that does not work (expired, or already used) lands on
  the sign-in page, which says so; someone already signed in in that browser is
  told too, and then goes on to where they were going.
- Sign-up and a request for a new link answer the same whether or not the
  address already has an account, and send nothing to an address that does.
  (An uninvited address is still refused outright when invite-only is on
  (§3.3.1): a person who mistypes an invited address needs to be told.)
- Email is sent in the background and a failed send is logged, never shown:
  neither the time an answer takes nor what it says depends on whether an
  address has an account. While email is not set up (§3.14), sign-up that
  needs verification, a request for a new link and a password-reset request
  are refused with a clear message, the same for every address.
- Requests for a link are limited to 3 a minute per client address.

#### 3.3.4 Password reset

- A forgotten password is reset through a single-use link sent by email,
  valid for one hour.
- Completing a reset MUST end every existing session of that account. Core's
  own pages check the database (§3.5), so a session opened before the reset
  stops working at once.
- The reset request answers the same way, in the same time, whether or not the
  address has an account, and sends nothing when it has none.
- Completing a reset does not verify an address that was not verified: that is
  what the verification link is for.

#### 3.3.5 Terms and privacy

Core ships default Privacy Policy and Terms of Service pages, at `/privacy` and
`/tos`, readable without signing in. They say only what is true of the software
itself, for any instance: no operator, jurisdiction or particular app is named.
Editing them is not part of Phase 1.

- Sign-up requires accepting them, and the **server** refuses a sign-up that
  does not (`TERMS_NOT_ACCEPTED`), whatever the page did, including the first
  account and a sign-up made without a page.
- The acceptance is recorded with the account: that it was accepted, when, and
  which text, as a digest of the two documents as shipped. The server sets all
  three; a request cannot name a version or a time, and an update of the
  account cannot rewrite them.
- An account made before the terms were asked has no acceptance on record.

#### 3.3.6 Account states

- **Active:** can sign in.
- **Deactivated:** cannot sign in; all sessions end and every token issued to
  clients for the account is revoked, including refresh tokens obtained with
  `offline_access` (§3.6.3). Clients that registered a back-channel logout URI
  are notified (§3.6.5). Reactivation restores sign-in only.
  - Deactivating ends every session of the account in **one transaction** with
    the work that must go with it (revoking the tokens issued to apps joins
    there), so an account is never deactivated with a token still alive. Notices
    to apps follow once it has committed; one that fails is logged and does not
    undo it. Doing it twice is safe.
  - No way of signing in opens a session for it: the check is made on creating
    any session, so the password, a passkey, the second step and a verification
    link are all refused. The person is told the account is deactivated, but
    only after proving who they are. A session opened at the same moment is
    refused by core's own pages as well.
  - A session that is open stops working at once for what core guards (§3.5),
    and through the session endpoint's cache within its lifetime.
  - The owner cannot be deactivated: no action may leave the instance without
    someone who can sign in as its owner.
  - Reactivating does not bring back the sessions that were ended.
  - Who may deactivate is the Console's (`user:manage`, within §3.2.1).
- **Deleted:** the account and its credentials are removed. Its `sub` is never
  reused.
  - A person deletes their own account on **Delete account** (`/delete-account`,
    §3.11). It needs the password again, counted and limited like every other
    time it is asked for (§3.2.1), and a question that says what is lost comes
    before anything is sent; a wrong password is shown in that question with
    what was typed kept. Deleting is the same single step an operator's deletion
    is: the account, its credentials and its sessions, every token and consent
    for it, in one transaction, then the apps that registered a back-channel
    logout address are told. It is whole or not at all. The same transaction
    records, for each app the person used that has an account-deleted address, a
    notice that the app is to be told, and core keeps trying until it is (§4.5).
  - **The owner cannot delete their account.** They are told to hand the
    instance to another admin first, with the way to do it, and are not offered
    the form; a request made by hand is refused the same way, by the role the
    database holds and not the one the request says. No instance is ever left
    without an owner.
  - On success the person is sent to sign-in, which says their account is
    deleted. The account to delete is always the session's own.

### 3.4 Two-factor authentication and passkeys

#### 3.4.1 TOTP

- A person can enrol an authenticator app (QR code and a key to type). It is
  turned on only once a valid code has been entered.
- Enrolment produces ten single-use backup codes.
- Enabling, disabling and regenerating backup codes require the password again,
  counted with every other time it is asked (§3.2.1).
- With TOTP on, sign-in asks for a code (or a backup code) as a second step.
- Turning it on needs an address that has been verified (§3.3.3), so an account
  that never proved its address cannot later be signed in by a verification
  link without the second step.
- The key and the backup codes are shown once. The backup codes are withheld
  until the first valid code has turned TOTP on. A backup code works once and is
  then spent; regenerating retires every old one.
- After the password is right, **no session exists** until the second step is
  answered. A challenge allows five tries and then the person signs in again;
  ten wrong codes lock the second step for 15 minutes, even against the right
  code; the second step is also rate limited per client address.
- Core offers no "trust this device": a request asking for one is refused, so
  the second step is never skipped for a period.
- Codes sent by email or text are not offered.
- The key and the backup codes are stored encrypted by better-auth with
  `SV_AUTH_SECRET`, not with the field encryption key ring (§3.15), because
  better-auth does the encrypting. Changing `SV_AUTH_SECRET` therefore ends
  everyone's authenticator enrolment as well as signing everyone out.
- Enrolling, regenerating backup codes and turning TOTP off are at
  `/security/two-factor`, reached from the Security page (§3.11).

#### 3.4.2 Passkeys

- A person can add, name and remove passkeys, and sign in with a passkey
  without a password.
- The relying party is set by `SV_AUTH_WEBAUTHN_RP_ID`, `SV_AUTH_WEBAUTHN_RP_NAME`
  and `SV_AUTH_WEBAUTHN_ORIGIN`. For a suite whose apps sign in through core,
  the relying party ID stays unset ([RFC 0002](../rfcs/0002-deployment-strategies.md)):
  apps never run a passkey ceremony, so passkeys stay on core's host. Unset, they are core's own
  host, the name `Sovereign` and core's own address. A domain that is not core's
  host or a parent of it, or an origin that is outside the domain or is not
  https (localhost aside), stops core starting, saying which, because no passkey
  could ever be made. Changing the relying party ID makes existing passkeys stop
  working.
- A passkey must be unlocked on the device (a PIN or a biometric) both when it
  is made and when it is used, and an answer that was not is refused. A passkey
  is therefore possession plus something the person knows or is, and counts as
  two factors: signing in with one does not ask for the authenticator app's code
  as well (§3.4.1).
- Passkeys are discoverable: signing in with one needs no email address typed.
- A passkey opens a session only where a password would: an account whose
  address is not verified is refused while verification is required (§3.3.3).
- Asking to sign in with a passkey is rate limited per client address.
- The password is never removed: a person with no passkey, or whose last passkey
  was removed, signs in with their password as before.
- Adding, naming and removing passkeys is at `/security/passkeys`, reached from
  the Security page (§3.11), and the sign-in page offers "Sign in with a
  passkey" in a browser that has them.

#### 3.4.3 Reset by an operator

An operator with `user:manage` can reset another account's MFA (TOTP and
passkeys), subject to §3.2.1. The account holder is told by email.

### 3.5 Sessions and security

- A session lasts **seven days without use**, and its end is pushed back once a day while it is used (`SESSION_LIFETIME`). It is set in
  core, not left to the library's default, because apps check their sessions against core's (sdk §9.7, RFC 0006 A1); it is not an
  operator's setting.
- Session cookies are **host-only** unless an operator shares them. Served over
  https with `SV_AUTH_COOKIE_DOMAIN` unset, core's cookies carry the `__Host-`
  prefix (`__Host-better-auth.session_token`), which a browser keeps only if the
  cookie is `Secure`, has `Path=/` and has no `Domain`: no other host can set a
  cookie core would take as its own, so an app on a subdomain cannot plant one
  with `Domain=<parent>`. With `SV_AUTH_COOKIE_DOMAIN` set they are scoped to it
  so that core's subdomains share them, carry only `__Secure-`, and every host
  under that domain receives them, which is why a suite of apps leaves it unset.
  Over http, a development instance, they carry no prefix. A cookie under any
  other name is not a session: the proxy looks for the one name the instance
  sets, and better-auth reads no other. The names are decided in one place
  (`src/auth/cookies.ts`), and a test fails when another file names one.
- Sessions are verified against the database on every request: there is no
  signed cookie cache. A session that has ended (a password reset, a sign-out
  elsewhere, an operator ending it, a deactivation) stops working at once for
  core's pages and for every better-auth endpoint, the OpenID Connect
  authorize endpoint included, which would otherwise have gone on issuing
  authorization codes to an ended session for a few minutes.
- Sensitive actions do not depend on session age (no "fresh session"
  requirement); they ask for the password instead where this spec says so.
- Authentication endpoints are rate limited, with the counters stored in the
  database.
- Every page is served with a nonce-based Content Security Policy;
  `script-src` MUST NOT include `'unsafe-inline'`.
- Every response, pages, API routes and static files alike, also carries
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a
  `Referrer-Policy` of `strict-origin-when-cross-origin` (so an invitation or
  reset address does not leave core in a referrer), a `Permissions-Policy`
  that withholds the camera, microphone, location, payment and USB, and, only
  when core is served over https, `Strict-Transport-Security` for a year
  without naming subdomains.
- Core keeps nothing of a person on their device for the sake of an installed or
  offline core (RFC 0001). Its service worker stores only files that are the same
  for everyone and never change at their address (the built scripts, styles and
  fonts under `/_next/static/`, and the icons under `/icons/`), on an allow-list
  that a new path joins only by being added to it, and nothing else: no page, no
  response to an API call, nothing for a request with an `Authorization` header or
  one that is not a `GET`, and nothing with a query string. A navigation that fails because the network is down is
  answered with a page the worker builds itself, saying so and offering to try
  again; it needs no script and names no instance. The worker is served by core
  with the same hardening headers as every response, under a policy that names
  `worker-src 'self'`, is fetched afresh on every
  start and whenever a page comes back into view, and registers only in production
  over https (or `localhost`). A new version is announced, not swapped in silently
  (RFC 0001 A3): a new worker waits while an older one controls the pages, a page
  says "A new version of _instance_ is ready" with **Reload** and **Later**, and
  Reload asks the waiting worker to take over (the one message the worker accepts)
  and reloads once it has. Nothing signed-in works offline.
- Requests are accepted only from core's own origin and the origins in
  `SV_AUTH_TRUSTED_ORIGINS`.
- `SV_AUTH_SECRET` is required (at least 32 characters, or read from
  `SV_AUTH_SECRET_FILE`); the server MUST NOT start without it.
- A health endpoint reports whether core and its database are up, and nothing
  else.

#### 3.5.1 The lock

A person may lock core on a device, so that coming back to it after a while asks for their passkey (Face ID, Touch ID, a fingerprint or
the device's PIN) or their password (RFC 0006 part B). Signing in does not change; the lock is their own choice, never an operator's.

- **Turning it on.** On the Security page, under "Lock on this device", once signed in. It needs one of the account's passkeys, answered
  on this device with the person verified: the page asks for it after a tap, and core checks the answer (`src/lock/passkey.ts`) the way
  a passkey sign-in is checked (one of the account's own, a challenge core gave this session and takes back once, within five minutes,
  the instance's relying party and origins, the person verified), without opening a session. An account with no passkey is sent to add
  one. Changing the setting, or turning it off, needs only the unlocked session.
- **The device** is the browser: a random id in a host-only, `HttpOnly` cookie (`__Host-sv_device` over https, `sv_device` over http),
  kept 400 days, made the first time the lock is turned on there. The setting is kept per account and device (`device_locks`): another
  account in that browser has none.
- **The settings:** lock after **15 minutes** without use by default, or 1, 5 or 60; and **"Also lock when I leave the app"**, off by
  default.
- **A session under a lock.** The first time a session is seen with the cookie of a device that has a lock for its account, it is put
  under that lock (`session_locks`), and from then on the lock follows the session, not the cookie: a browser that drops the cookie, or
  the session's token used from another browser, is still locked. Turning the lock off frees the device's sessions; turning it on again starts their idle time afresh. The Security page changes, or turns off, the lock the session is under, and gives a browser that lost the cookie its device id again.
- **When it locks.** A request of the session is its use: a page opened, or the watcher on every signed-in page telling core that the person is there as it opens and is using it (a tap, a key, a scroll), at most every 15 seconds, all of which core writes, so what it knows is never more than about 15 seconds behind. A session idle longer than the lock's time is locked by its next
  request, before it is answered; the watcher also shows the lock page once the time has passed, so a screen left open stops showing
  the person's data. With "Also lock when I leave the app", hiding the page tells core it was left, and the session locks unless a page of it is back within 15 seconds (`LEAVE_GRACE_MS`): a page is hidden by going to another page as much as by leaving the app, and the next page says it is there as soon as it opens. Coming back to a page asks core, and shows the lock page if it locked.
  Core decides from its stored times, never from what a page remembers.
- **What a locked session gets: nothing of the person.** `getSession` (`src/auth/session.ts`) gives no session for it, so every page,
  server action and route treats it as signed out; a guarded page sends it to `/lock?returnTo=…` instead of to sign in, and so do the
  pages before signing in. better-auth's routes refuse a browser's request from it (`401`, `SESSION_LOCKED`), `get-session` included, except signing out (here, or from an app through the end-session endpoint), signing in afresh, which asks for everything signing in asks for and gives a new session, and the emailed links, which carry their own proof (verifying an address, and resetting a password, which ends every session). Core's own server code calls better-auth only after reading the session through `getSession`, and a test lists every place that does. The authorization endpoint sends it to the
  lock page with the app's request as the way back, `prompt=none` included, so an app's sign-in or hourly check (sdk §9.7) waits for
  the unlock and then carries on. The session's secret, which opens what the browser kept of the person's keys, is refused (§5.4).
- **The lock page** (`/lock`) says whose session it is and offers **Unlock**, which asks for a passkey after the tap (never a prompt that
  appears by itself, which the devices could not be relied on to show; research 0012), **Use your password**, and **Sign out**. The
  password goes through `confirmPassword` (§3.2.1), counted with every other time it is asked. Either unlocks the **same session**, so
  no app's session that hangs from it ends. The session's secret is given again, so what the browser kept of the keys opens as before
  (§5.4); where nothing was kept, a passkey that answers PRF opens them (§5.5), and the password with its secret.
  The password always unlocks, so someone whose passkey does not work on a device is never locked out.

### 3.6 Sign-in server (OpenID Connect provider)

#### 3.6.1 Endpoints and flows

- The **issuer is the instance URL** (`SV_URL`, with no path). Core publishes
  its OpenID Connect discovery document at `/.well-known/openid-configuration`
  (and the OAuth equivalent at `/.well-known/oauth-authorization-server`), with
  authorization, token, userinfo, JWKS and end-session endpoints, so an app can
  be configured with the instance URL alone. Every token's `iss` equals the
  issuer.
- The authorization code flow, with refresh tokens, is the flow for people. PKCE
  with `S256` is **required for every client**, confidential or public; `plain`
  is not accepted. The implicit and password grants are not offered. The
  client-credentials grant is for an app acting for itself (§3.6.6), and an app has
  it only when an operator gave it an app scope.
- Refresh tokens are issued when the client requests `offline_access`.
- Token lifetimes: access tokens 15 minutes, ID tokens 1 hour, refresh tokens
  30 days from their last use. A refresh token is rotated on every use. If a
  refresh token that has already been used is presented again, core refuses it
  and removes **every** refresh token and access token that client holds for
  that account — a person signed in to the same app on several devices is
  signed out of all of them.
- Clients are registered by operators only; dynamic client registration is
  off.
- A confidential client authenticates at the token endpoint with HTTP Basic
  (`client_secret_basic`) or, when an operator has chosen it for that app, with
  its secret in the request body (`client_secret_post`; §3.7.1). Discovery lists
  the methods the provider knows, but a client is registered for one, and a
  request that uses another (the other method, or none) is refused with
  `invalid_client`. A public client uses none, and PKCE.
- Redirect URIs and post-logout redirect URIs match exactly.
- ID tokens are signed (EdDSA) with keys published at the JWKS endpoint. The
  signing keys rotate every 90 days; the previous key stays published for a
  30-day grace period so tokens already issued keep verifying.
- An app that cannot verify EdDSA can be set to **RS256** (§3.7.1). Its ID
  tokens, from the authorization-code and the refresh grants alike, are then
  RS256 with an `at_hash` computed for that algorithm; every other app is
  unchanged. The RSA key is published at the JWKS endpoint as soon as an app is
  set to RS256 (and whenever the key set is read while one is), not when its
  first token is issued, since an app reads the key set before any token
  exists. The key is published as an RSA key only, with no curve. It rotates
  like the other key. Discovery then lists both algorithms. Access tokens (the
  Directory API, §3.9) and logout tokens (§3.6.5) stay EdDSA, so an RS256 app
  that also takes a back-channel logout cannot verify its notices.
- Only an operator can register a client: creating, changing and listing them
  needs the `client:manage` capability in the matrix in force, and every client
  belongs to the instance, so any operator can manage any client. A client's
  allowed grant types must include `refresh_token` for it to refresh.
- Discovery lists the claims core can give (`name`, `picture`, `locale`,
  `zoneinfo`, `email`, `email_verified`, `roles` and the standard ones), and the
  `picture` claim is an absolute address on the instance, since the stored one
  is core's own path.
- A redirect address that is not registered is never followed: core answers on
  its own error page. This holds for a registered `http` loopback address on
  another port too.
- When an app sends someone to sign in, core's sign-in page carries the app's
  request through the password, the second step and a passkey, and sends the
  browser back to the app with its code. Someone already signed in who is sent
  back with `prompt=login` is shown the form. An app that asks with `prompt=create`
  (OpenID Connect Prompt Create 1.0) sends the person to core's sign-up instead,
  with its request signed into the address as the sign-in page has it; the
  sign-up page carries it on as its return address, so the new account ends in
  the app's sign-in. Registration's rules (an invitation, the first account) are
  the sign-up's, unchanged.
- A sign-in page left open longer than the ten minutes the provider signs the
  app's request for is refused with `invalid_signature` before anything else
  is looked at. The page then says the sign-in waited too long and offers to
  start again, from the app's own request to the authorization endpoint, rather
  than saying the password was wrong.
- The app's request also survives the pages its signed form does not reach
  (it lasts ten minutes, and only on the sign-in page and its second step):
  creating an account, verifying the address by email, and forgetting the
  password and setting a new one. The sign-in page turns the signed request
  back into the app's own request to the authorization endpoint, without the
  signature and with `login` and `create` taken out of `prompt`, and carries that as the
  page to return to through each of those pages and their emails. Once the
  person has a session it is opened, and the provider checks the whole request
  again, so it can send the browser nowhere the app's own request could not.
- Signing keys are stored with their private half encrypted by better-auth with
  `SV_AUTH_SECRET`, so changing it makes the stored keys unreadable and new ones
  must be made (open point, like the authenticator keys in §3.4.1).
- Not offered in Phase 1: cross-origin requests from a browser to the token and
  userinfo endpoints (CORS), which a single-page app calling them directly
  would need.

#### 3.6.2 Scopes and claims

| Scope            | Claims or access                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `openid`         | `sub`: stable, unique, never reused                                                      |
| `profile`        | `name`, `picture`, `locale`, `zoneinfo`                                                  |
| `email`          | `email`, `email_verified`                                                                |
| `notifications`  | The app's own notifications for the person: list, mark read, dismiss (§4.1)              |
| `roles`          | `roles`: the account's platform roles. Trusted clients only (§3.6.4)                     |
| `directory`      | Access to the Directory API (§3.9)                                                       |
| `keys`           | Encryption the server cannot read (§5.6). Only an app with a key return address holds it |
| `offline_access` | A refresh token                                                                          |

A client receives only the scopes it is allowed (§3.7) and the user has
granted (§3.6.4).

A scope core does not offer (one not in the table above, such as `groups`) is
**ignored**, as OpenID Connect Core says an unrecognised scope SHOULD be: it is
taken out of the request when it is made, so the sign-in and consent pages, the
consent that is remembered and the token's `scope` never mention it, and the
sign-in goes ahead with the scopes core knows. This holds for a refresh request
too. A request with no `openid` is still refused, and a scope core offers but
the app is not allowed behaves as it did.

The claims of the granted scopes appear both in the **ID token** and at the
userinfo endpoint, so an ordinary relying party can read them from either.
`locale` and `zoneinfo` are the person's saved preferences (§3.11).

**How the person signed in.** Not built, and parked (task 6.6): better-auth's provider (1.7.18) owns `acr` and `amr`, sends `acr` as
`"0"` in every ID token and removes both from any claims core adds; core could set them only by signing its tokens itself, which the
provider allows only with keys kept elsewhere. What follows is the design, for when that changes. ID tokens and userinfo carry `amr`, the ways the session was opened (RFC 8176):
`pwd` for the password, `otp` added for the second step's code or a backup code, `hwk` and `user` for a passkey, which is always
user-verified (§3.4.2), and `mfa` when two of these were used. `acr` says the same as a level: `"1"` for one factor (the password
alone), `"2"` for two (the password and the second step) or a passkey, and `"0"` for a session opened some other way, such as an
emailed link. Both are recorded on the session when it is opened, and unlocking it (§3.5.1) changes neither. The discovery document's
`claims_supported` lists only the claims core sends; `given_name` and `family_name` are not among them (built).

#### 3.6.3 Account state and tokens

A deactivated or deleted account MUST NOT obtain new tokens, and tokens already
issued for it MUST stop being accepted by core's own endpoints.

Deactivating or deleting an account therefore revokes **every** access token
and refresh token issued for it, in the same operation that ends its sessions.
This includes refresh tokens obtained with `offline_access`: ending a session
revokes that session's access tokens but, by design, leaves such refresh tokens
alone, so revoking them is core's own step.

- One routine does it, for deactivation now and deletion when it exists, and for
  one app's tokens when a person removes its access (§3.6.4): it marks every
  access and refresh token revoked on the same transaction as the rest of the
  operation, on every database, so a deactivation that fails revokes nothing. A
  revoked token is refused by core's token, introspection and userinfo
  endpoints. An authorization code issued just before a deactivation gets no
  token either.
- Ending a session (not deactivating) revokes that session's access tokens and
  the refresh tokens that were not obtained with `offline_access`; refresh
  tokens obtained with `offline_access` outlive the browser session, as OpenID
  Connect Back-Channel Logout says they may.

#### 3.6.4 Consent

- Every client is untrusted unless an operator marks it **trusted**. Users of a
  trusted client are not asked for consent.
- The first time a person signs in to an untrusted client, core shows which
  scopes the client asks for and lets them allow or refuse.
- Consent is remembered per account, per client and per set of scopes. A
  client asking for a scope the person has not granted asks again.
- Only trusted clients may receive the `roles` scope.
- The trusted flag is the operator's, and a client has it only if an operator
  set it: nothing a client or a person sends can. A client nobody marked is
  untrusted.
- Consent is asked on core's own page (`/consent`), after sign-in and before the
  app gets anything. It shows the app's name, who is signed in, one plain
  sentence for each permission, and the address the person is sent back to, with
  **Allow** and **Don't allow**. It shows only what core signed: an address
  someone altered or let expire says the request has expired, and names nothing.
  Refusing sends the person back to the app with `access_denied` and no code,
  and remembers nothing.
- `roles` is taken out of an untrusted client's request when it is made, so it
  is never shown, never asked about, never remembered as consent, and the
  client is not asked again each time it asks for it. A trusted client keeps it.
  The claim is also withheld from an untrusted client's ID token and userinfo
  answer, even for tokens already issued: an operator who stops trusting a
  client takes `roles` from it at once.
- A person can remove an app's access in Connected apps (§3.11). Removing
  access deletes the consent **and** revokes every access token and refresh
  token that client holds for the account, in one step; the next sign-in asks
  again.
  Core's own routine does this in one transaction; the provider's endpoints
  that delete or narrow a consent are switched off, because they leave the
  app's refresh tokens alive.

#### 3.6.5 Sign-out and logout notices

- **Sign-out from an app.** An app that has end-session enabled (§3.7.1) can
  send the person to core's end-session endpoint with the `id_token_hint` it
  received. Core ends the person's core session and returns them to the app's
  post-logout redirect URI with the app's `state` — but only if that URI is
  registered for the client; an unregistered one is never followed.
- **Whose app it is decides what signing out ends** (RFC 0007). Each app has a setting, "Signing out of this app signs out of
  Sovereign" (§3.7.1). On, end-session does what the bullet above says, and so, by the notices below, signs the person out of
  every other app of that session: the suite is one account. Off, end-session ends nothing of core's: it returns the person to the
  app's registered post-logout address with the app's `state`, and the app's own session is the only one that ends. `sv apply` turns
  it on for a hosted app (`contracts/suite.md`); it is off for an external app and for one registered in the Console. The change turns it on for every app that exists, which is what
  they do today; the next `sv apply` then sets it for each app of `suite.yml`, and an app registered in the Console before keeps it on
  until an operator turns it off. Off, core answers only an `id_token_hint` it signed (EdDSA or RS256, however old) for an app that
  exists, is enabled and has end-session on (`src/oauth/app-only-sign-out.ts`); a post-logout address that is not registered sends the
  person to core's own page instead, still signed in to core. Anything else is the provider's, as the bullets around this one say: no
  hint or one core did not sign ends nothing and shows a confirmation, which, if the person confirms it, ends core's session as
  signing out of core does. The setting is kept with core's own settings for the app (`keepCoreSession`), only when off.
- **Back-channel logout.** When a person's core session ends — they sign out of
  core, they end a session in their identity pages, an operator ends it, or the
  account is deactivated — core revokes the access tokens of that session and
  sends a signed _logout token_ (OpenID Connect Back-Channel Logout, carrying
  the `sub` and the session id `sid`) to the back-channel logout URI of every
  client that session was used with. Core is the only sender: an app's
  back-channel address is kept with core's own settings for the app, not in the
  provider's field, so the provider sends none of its own; an address kept there
  before is moved at start-up. Each notice is kept (`logout_notices`), one for
  each app and session, written once the session is gone (for a deactivation or
  a deletion, in the same transaction), and sent at once and then by a timer
  every minute. As the specification asks (§2.5), it is sent again only after a
  failure that may be temporary (a timeout, an app that cannot be reached, a
  `5xx` or a `429`), after 1, 5 and 30 minutes and then 2 and 6 hours, and given
  up after any other answer, or a day after the session ended. An attempt is
  claimed with a lease, so two instances of core do not send one notice twice.
  An app must still treat its own session as ending when its access tokens stop
  working, for a notice that was given up.
- When the session ended by deactivation, the notices are written in the
  deactivation's transaction and sent once it has been committed: core reads which apps held tokens in each
  session before deleting the sessions, since deleting a session clears that
  link. A person ending a session in their identity pages, or all the others,
  goes through the same route as signing out, so the same notices and
  revocations follow.
- The logout token is a JWT signed with the key that signs ID tokens, typed
  `logout+jwt`, carrying `iss`, `aud`, `sub`, `sid`, `iat`, an `exp` two minutes
  on, a `jti` and the back-channel logout event, and no `nonce`. Each attempt is a
  new token; an attempt waits five seconds at most, and a redirect is not
  followed.
- An end-session request core cannot match to the person's session (no hint, a
  hint core did not sign, or one for another browser's session) ends nothing: it
  shows a confirmation. A client that has not enabled end-session cannot use the
  endpoint at all.
- A client that registers a back-channel logout URI or enables end-session
  receives a `sid` claim in its ID tokens.
- Core's public URL (`SV_URL`) MUST be reachable from the core process itself,
  because checking an `id_token_hint` fetches core's own signing keys from it.

#### 3.6.6 App tokens

A scheduled reminder has no person present, and a
token for a person is the wrong thing for it: it fails when that person's token
lapses, and it says the person did what the app did. So an app MAY get a token
for itself, with the client-credentials grant.

- **Confidential apps only.** A public app has no secret to prove who it is, and
  never gets one.
- **Nothing by default.** An app may hold only the app scopes an operator gave it
  (§3.7.1). There is no consent, because no person is involved, so that is the only
  gate.
- **App scopes are a separate, short list.** A capability says whether it can be
  used by an app, in its own section. `directory` and `offline_access` can never be
  one: looking people up needs a person, and an app token has no refresh token. The
  first is `notifications:send` (§4.1), the second `email:send` (§4.2) and the third `activity:write` (§4.3); each is listed
  and can be given.
- **What it is.** A signed JWT addressed to the Core API (§3.9), lasting 15 minutes
  like an access token, with the app as its subject, and no person, no session and
  no refresh token. Nothing marks it as being on a person's behalf.
- **What a call checks.** The signature, audience, expiry and scope, as for a
  person's token; that the app exists and is switched on; and that the token was
  not revoked. There is no account or session to check.
- **Ending one.** Rotating an app's secret, switching it off and deleting it each
  stop its app tokens at once, by recording the time as Remove access does (§3.9).
- **Limits.** Calls count against the app's limit (§3.9). An app token has no
  person's limit to count against.
- **A call made as the app says so.** What core records of it names the app, and
  never a person.

### 3.7 App registration

Operators with `client:manage` register clients in the Console.

#### 3.7.1 Client settings

| Setting                   | Notes                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client type               | Confidential (has a secret) or public (no secret). PKCE is required for both                                                                                                            |
| Redirect URIs             | One or more; exact match. Must be `https`. `http` is accepted on `localhost` and `*.localhost` only when the instance's own URL (`SV_URL`) is `http`, that is on a development instance |
| Post-logout redirect URIs | Optional; the only addresses core returns a person to after sign-out                                                                                                                    |
| Account-deleted address   | Optional, `https` like a redirect address. Core sends a signed notice there when a person who used the app deletes their account, and keeps trying until the app answers (§4.5)         |
| Back-channel logout URI   | Optional. Core sends a signed logout notice there when a person's session ends (§3.6.5)                                                                                                 |
| End-session               | Lets the app send people to core's sign-out (§3.6.5). On automatically when a post-logout redirect URI or a back-channel logout URI is set                                              |
| Sign out of Sovereign     | Whether signing out of the app also ends the person's core session (§3.6.5). On for a hosted app, off for a new external or Console app; under the technical settings                   |
| Secret                    | Confidential apps only. Sent in a header (HTTP Basic; the default) or in the request body (§3.6.1). A public app has none. Changing it needs the app reconfigured.                      |
| Token signature           | How ID tokens are signed: EdDSA (the default) or RS256, for an app that cannot verify EdDSA (§3.6.1). Either client type may choose it.                                                 |
| Allowed scopes            | Any of §3.6.2; `roles` only when trusted                                                                                                                                                |
| Trusted                   | Off by default                                                                                                                                                                          |
| Enabled                   | On by default                                                                                                                                                                           |
| Export address            | Optional, `https` like a redirect address. Core asks it for a person's part of their export (§4.7.2)                                                                                    |
| Key return address        | Optional, `https` like a redirect address. Set, the app may use encryption the server cannot read and holds `keys` (§5.6)                                                               |
| App scopes                | What a confidential app may do for itself (§3.6.6). None by default; a public app cannot have any                                                                                       |

#### 3.7.2 Launcher entry

| Setting          | Notes                                                  |
| ---------------- | ------------------------------------------------------ |
| Name             | Required                                               |
| Description      | Optional, short                                        |
| Icon             | Optional; a default is drawn from the name when absent |
| Launch URL       | Where the launcher sends people                        |
| Show in launcher | On by default                                          |

#### 3.7.3 Secrets and lifecycle

- A confidential client's secret is generated by core, shown once, and stored
  only as a hash.
- An operator can rotate the secret; the new one is shown once and **the old
  one stops working at once**. A client has one secret at a time, so the app is
  redeployed with the new secret as part of the rotation.
- **Disabling** a client stops new authorizations and token refreshes and hides
  it from the launcher; enabling it again restores both.
- **Deleting** a client revokes every token and consent issued for it.
- Every change is made by writing the client through core's own registry, which
  applies the rules above (for example, `roles` is refused for an untrusted
  client, and the trusted flag is core's to set). Launcher entries (§3.7.2) are
  stored with the client.
- The registry is the only thing that writes a client, and every method of it
  needs `client:manage` in the matrix in force, or the system actor of §3.7.4. The provider's own routes for
  registering, changing, deleting or rotating a client are switched off, so
  nothing reaches a client around the rules. It says everything wrong with what
  was entered at once, each beside its field, and makes nothing when anything is
  wrong.
- An address (a redirect address, a post-logout address, the back-channel
  address, the launcher's icon and launch address) is `https`, or `http` on
  `localhost` and `*.localhost` on a development instance; it has no user name,
  no fragment and no wildcard. An app has up to twenty of each list, none twice.
- A public app cannot become confidential or back: register another. Stopping
  trust takes `roles` from the app's allowed scopes at the same time; asking for
  `roles` for an untrusted app is refused.
- Deleting an app removes its tokens and consents first, explicitly, then the
  app, so the result does not depend on a database's cascade.

Apps that have not yet answered an account-deletion notice (§4.5) are listed on **Deletions** (`/console/deletions`, needing
`client:manage`).

The Console lists apps on **Apps** (`/console/apps`, needing `client:manage`), where
an operator adds, changes, switches off and on, gives a new secret to, and
deletes an app. In the Console an app is an "app"; the protocol's word "client"
appears only as the app's **Client ID** and in its technical settings.

- **Adding** asks for the name and the sign-in addresses (one per line), and
  offers the launcher entry (§3.7.2: description, launch address, icon,
  whether it shows) and the kind of app, which cannot be changed afterwards. The
  settings an app author needs (the addresses after sign-out, the back-channel
  logout address, whether the app may send people to core's sign-out, what the
  app may ask to see, and whether it is trusted) are folded away under
  "Technical settings", each with a line saying what it does. Asking for the
  `roles` scope is possible only while the app is trusted, and unticking trust
  unticks it.
- **Every thing wrong is shown at once, each beside its field**, with what was
  typed kept; the registry's refusal (§3.7.3) is shown, never replaced.
- **A secret is shown once**, in the answer to the request that made it: when an
  app is added and when a new one is made, with a line saying only a scrambled
  copy is kept. Making a new secret asks first and says the old one stops
  working at once; a public app has no secret and is not offered one.
- **Switching off** asks first and says what it does (the app stops signing
  people in and refreshing, and leaves the launcher); switching on does not ask.
  **Deleting** asks first and says that what the app was given is taken back.
- The list shows each app's name, whether it is on, whether it appears in the
  launcher, and when it was added.

#### 3.7.4 Managed apps and `sovereign-admin`

A deployment must register apps when nobody can sign
in to the Console: on a first deployment no account exists. So core's image
ships **`sovereign-admin`**, a command run inside core's container. The operator
CLI calls it ([operator-cli §6](operator-cli.md)), and it is not run by hand.

```text
sovereign-admin apps ensure KEY --name NAME --redirect URL ... [--post-logout URL ...]
                [--back-channel URL] [--account-deleted URL] [--key-return URL] [--scope SCOPE ...] [--public] [--trusted]
                [--keep-core-session]
                [--launch-url URL] [--description TEXT] [--icon URL] [--hide] [--json]
sovereign-admin apps list [--json]
sovereign-admin apps rotate-secret KEY [--json]
sovereign-admin apps remove KEY
sovereign-admin instance restored [--json]
sovereign-admin seed [--local] [--json]
sovereign-admin accounts reset-link EMAIL
```

- **It goes through the registry.** Every rule of §3.7 applies, with the same
  refusals, and it adds no second way to write a client. (`instance restored` writes
  no client: it records a restore, §4.4. `accounts reset-link` writes none either: it
  makes a reset link for an account when mail cannot be sent, §5.2, prints it once
  and logs only that one was made, and exits 1 when there is no such account.)
- **The managed key.** A client MAY have a key, which `ensure` uses to find it
  again on the next run. It is a DNS label, unique on the instance, set only here,
  and never shown to an app or a person using it. A client made in the Console
  has none.
- **`ensure`** makes the client when none has the key, and otherwise changes it to
  match. Run twice with the same arguments it changes nothing, and it makes one
  client. A list given is the whole list, so an address left out is removed.
- **A secret is returned once**, when `ensure` makes a confidential client or
  `rotate-secret` makes a new one. `ensure` on a client that already exists
  returns none. With `--json` the answer is `{ "key", "clientId", "secret" }`, and
  `secret` is absent when there is none to give.
- **The system actor.** The registry accepts an account with `client:manage` or a
  system actor. A system actor is built in one place, this command's entry point,
  which no route or action imports, and a test holds that. Its trust comes from
  running inside the container: whoever can do that already holds
  `SV_AUTH_SECRET`, so it grants nothing new.
- **Every write is logged** to the container's output: what was done, and the
  key. A secret is never logged.
- **Output and exit codes.** The answer goes to standard output and the log to
  standard error, so `--json` output can be read as it is. The exit code is 0
  when it worked, 1 when core refused (each thing wrong is a line `field:
message`), 2 when the command line is wrong or core is not configured, and 3 when `seed` is
  refused (§3.15.1). A
  list flag takes every word after it up to the next flag, so the key comes first.
- **What `ensure` asks for is the whole app.** An option left out is its default,
  not what the app had: no `--scope` is `openid profile email`, no `--post-logout`
  is none, no `--trusted` is untrusted, and the app is on.
- **The key is kept beside the app**, in a table of its own (`managed_clients`),
  so the provider's table holds only what the provider writes. Removing the app
  removes the key.
- **No HTTP route does this.** One would need a stored credential that can make
  clients, to do what running a command inside the container does without one.
- **In the Console**, a managed app says it is managed from the command line, and
  that a change made there is overwritten on the next deployment. Deleting one
  works, and the next deployment makes a new client with a new secret.

### 3.8 Launcher

- The launcher is core's `/` for signed-in people with `launcher:access`.
- It lists every enabled client with "show in launcher" on, and the person's
  shortcuts (§3.8.1): icon, name and description, with search by name.
- Choosing an app opens its launch URL in the same tab, as an ordinary link,
  so a person can still open it in a new tab themselves. In an installed core
  (a display mode of `standalone`, `minimal-ui`, `fullscreen` or
  `window-controls-overlay`, read when the tile is clicked, never while the page
  renders) a plain click opens it in a new window instead, which desktop Chrome
  and Edge hand to the app when it is installed too, and Android Chrome is
  expected to; on an iPhone, an iPad and in Safari it is a browser view that
  closes back to core (RFC 0001 A5, research 0010). The app then signs
  the person in through core; because the person already has a session, this
  completes without a prompt unless consent is needed.
- In Phase 1 every signed-in person sees every listed app. **The launcher is
  not access control:** an app that should be restricted decides that itself,
  for example from the `roles` claim.
- The page has the instance's name and logo, a way to each of the person's
  own account pages, and one tile for each
  app: a link, so it works with the keyboard and opens in a new tab on request.
  Search matches the app's name, whatever the case, and says so when nothing
  matches. An app with no launch address has nothing to open and is not listed.
  A person without `launcher:access` sees no apps and is told so, with their
  account links.
- A tile is an `AppTile`: the icon in a rounded box, the name, the description, and beneath a divider what kind of app it is. Core's
  own apps are **platform** apps and every app an operator added is a **Sovereign** app. For a person with `console:access` the
  Console is a platform app and the first tile after "Add", before the apps operators added; it is not in the registry, is found by search like any other, and is shown to no one
  else. Tiles are the size of the earlier launcher's, in a grid whose columns are at least 260px; the heading and its line are on the
  left and the search on the right (stacked on a phone). The first tile is a dashed "Add", not shown while searching: for a person who
  may add apps (`client:manage`) it leads to a choice (`/launcher/add`) of a shortcut of their own, a shortcut for everyone or an app
  that signs in here; for anyone else, straight to a shortcut of their own. Its kind, beneath the divider like every tile's, is
  **new**. Then the Console, then the apps and shortcuts together in name order. Every tile's icon is drawn in greys (`AppTile`'s `monochrome`), so pictures from elsewhere look like one set.
- At the foot, a person with `console:access` reads what the instance runs, in one muted line:
  "Sovereign 0.108.0 / 0.70.0 (Core) · PostgreSQL · Node 24.15 · up 3 days" (the platform version, core's own,
  the database, Node's major and minor version, and how long this core process has run, in its largest whole
  unit). Anyone else is not sent it: naming versions to everyone would tell an attacker what to try, which is why
  the health endpoint says only up or down.
- A tile's icon is the address an operator gave, or a drawn one from the name
  when there is none or it will not load. Only this page may load pictures from
  other addresses (`https`, and `http` on `localhost` on a development
  instance); every other page keeps to core's own, since a picture cannot run
  script but should still not be loadable from anywhere.
- With no apps or shortcuts, an operator who may add apps is offered to add the
  first one, and anyone else to add a shortcut of their own.
- Only the fields of a tile leave the server for the launcher: name,
  description, icon address and launch address. It is a read of what the person
  is meant to see and is not the registry, which needs `client:manage` (§3.7.3).

#### 3.8.1 Shortcuts

A **shortcut** is a tile for any site: a name, an address, an optional line
about it and an icon. It is **not an app**: it signs nobody in, is never a
client, and nothing about it reaches the registry or the provider, so core stays
generic. It is kept in `launcher_shortcuts`, written only by `ShortcutManager`.

- **For everyone:** added, changed and removed in the Console, on Apps (`/console/apps/shortcuts/…`), by a person with
  `client:manage`; every person with `launcher:access` sees it, tagged **shortcut**.
- **A person's own:** added, changed and removed on the account page **Shortcuts** (`/shortcuts`) by anyone with
  `launcher:access`; seen by nobody else, tagged **yours**. The owner is always the session's account, never an id from the
  request: another person's shortcut, or one that does not exist, is "not found" (and a page that is not there). A person keeps
  up to 50. They are deleted with the account, in its one transaction; those for everyone stay with the instance.
- **The address** follows the rule for an app's addresses (§3.7.1): `https`, or `http` on `localhost` only on a development
  instance; no user name or password, no fragment. The tile opens it in a new tab with `rel="noopener noreferrer"` and says so.
- **An app's own address** (optional, RFC 0001 A6): an address in a native app's scheme (`spotify:…`, `obsidian://…`), kept in
  `app_url`. It must match `scheme:rest` with no space or control character, at most 2,048 characters; `http` and `https` belong in the
  address, and `javascript`, `data`, `vbscript`, `file`, `blob`, `about`, `intent`, `filesystem`, `view-source`, `ws` and `wss` are
  refused in any case. It is never rendered as a link: when the tile is clicked from an installed core or a phone (a coarse pointer), the
  launcher goes to it, and opens the address in a new tab after a second if no app came forward.
- **The icon** is one of three: a letter drawn from the name; an icon picked from a curated set of the design system's outline
  icons; or an uploaded picture of at most 256 KB, judged by its bytes (PNG, JPEG or WebP as they are, an SVG rebuilt by
  `sanitiseSvg`). A picture is kept in core and served from `/api/shortcuts/<id>/icon?v=<version>` to a signed-in person with
  `launcher:access` who may see the shortcut, privately cached, with `nosniff` and a sandbox; it is never fetched from the site.

### 3.9 Directory API

The Directory API lets an app find accounts on the instance, for example to
share something with a person.

- It is called by a client with an access token issued for a signed-in person
  and carrying the `directory` scope. To get one, the app requests its token
  with `resource` set to the Core API address (`<SV_URL>/api/v1`), which makes
  the access token a signed JWT addressed to the Core API. A token asked
  for with a resource is for that resource alone and comes with no ID token, so
  an app signs its people in as usual and then asks for this one, with its
  refresh token (`offline_access`) or a second authorization request that names
  the resource. Core accepts a call
  only if the token's signature, audience and `directory` scope are valid
  **and** the token has not been revoked — a signature alone is not enough,
  because a revoked token would otherwise keep working until it expires.
- **Search** takes a text query and a limit, matches names, and returns for each
  account: `sub`, `name` and `picture`. Deactivated accounts are not returned.
- **Resolve** takes a list of `sub` values and returns the same fields for each,
  with `active: false` for a deactivated account; deleted accounts are omitted.
- **By email**, an account is returned only on an exact match of the whole
  address. The API MUST NOT allow listing or partial matching of email
  addresses.
- Calls are rate limited per client and per account.

How it is held to those words (the contract is `contracts/core-api/openapi.yaml`,
§3.13.1):

- The token is a JWT the provider issued with `resource=<SV_URL>/api/v1`: core
  declares that address as a protected resource whose only scope is `directory`,
  any app may ask for it (the scope is still the app's to be allowed and the
  person's to grant), and a token asked for without it is opaque and is refused.
  Core checks the signature against its **own** keys with EdDSA, that the type is
  `at+jwt` (an ID token is not one), the issuer, the audience, the expiry, and
  the scope. A missing or bad token is a `401` with `WWW-Authenticate`, the same
  whichever way it is bad, except that an expired one says so; a token without
  the scope is a `403` naming it.
- It then checks what a signature cannot: the account exists and is active, the
  app exists and is switched on, the session it was got with is still open, and
  the token was not **revoked**. A signed token leaves no row to mark, so
  revoking records when: deactivating or deleting an account, and Remove access
  (§3.6.4), write the time into the same transaction (`token_revocations`, one
  row for the account and one for each app), and a token issued up to that second
  is refused. A token issued in the same second as a revocation counts as
  revoked; the doubt goes against the token. Reactivating an account does not
  bring its tokens back (§3.3.6).
- **Search** matches names only, whatever the case, with `%`, `_` and `\` as the
  characters they are; no part of an email address finds anyone. It returns at
  most the `limit` (1 to 25, ten when not given), a name that is exactly the
  text first, then those that start with it, then the rest in name order, and
  an empty list when nobody matches. The text is 1 to 100 characters.
- **Resolve** takes 1 to 100 `sub` values and returns each person found in the
  order asked, once, with `active`; a deleted account is left out.
- **By email** compares the whole address, whatever the case, and returns
  nobody for part of one or for a wildcard. A deactivated account is not
  returned, by search or by email.
- Every person is `sub`, `name` and `picture` (an absolute address on the
  instance, or null), and nothing else is ever returned, an email address
  least of all.
- Calls are counted in a one-minute window, against the app (600) and against
  the person (120), in the database so every instance shares them; over either
  is a `429` with `Retry-After`. A call with a bad token is never counted, so
  it cannot use up a real caller's allowance. A refused call is counted, so
  asking again does not make it pass.
- The routes are `/api/v1/directory/...`. The proxy lets them through without a
  cookie (a call carries a token and none), and each asks for its own token and
  scope before it does anything.

### 3.10 Console: accounts and invites

Operators manage accounts in the Console, within §3.2.

- **Accounts:** list with search by name or email; a detail view; copy the
  account's `sub`; change role (owner only); deactivate and reactivate; delete;
  reset MFA.
- **Invites:** invite by email address with an optional expiry in days; list
  pending invites; cancel an invite. The invitation is sent by email. An
  invite link that is expired, cancelled or already used shows a clear "invite
  link invalid" page.
- **Ownership:** the owner can transfer ownership to an admin.

The accounts list is newest first, 25 to a page, and its search matches part of
a name or an email address as typed, whatever the case: `%`, `_` and `\` are
characters, never patterns. An account's page shows its ID (its `sub`, which can
be copied), role, state, whether its address is verified, two-factor sign-in and
passkeys, how many devices it is signed in on, and its preferences. What an
operator can do to an account is held by the server for a direct request as
much as by the page that offers it:

- It needs `user:manage` in the matrix in force. Changing a role needs
  `role:assign`, which only the owner holds, and the owner's role is never
  changed.
- Only the owner acts on an operator account; an admin acts on ordinary accounts
  only. Nobody deactivates, deletes or resets the sign-in of their own account
  here: that is for their own pages, with their password.
- **Delete** removes the account and everything that belongs to it in one
  transaction: its sessions, credentials, passkeys, picture, tokens and
  consents. The apps to tell are read first and told once it has committed; an
  invite it sent stays, with no sender. Apps an operator registered stay, even
  when it was the deleted account that registered them. Its `sub` is never
  reused.
- **Reset two-factor sign-in** removes the authenticator app and the passkeys, so
  the account signs in with its password alone and can enrol again, and emails
  the holder. When email is not set up the reset still happens and the operator
  is told to tell the holder. Sessions are left open.

An invitation is made by an operator who holds `user:manage`, for an email
address and, optionally, a number of days from 1 to 365 (left empty, it does not
expire). The address is kept in lower case and must look like an address; one
that already has an account is refused, and the operator is told so. Only one
invitation is open for an address: a new one cancels the one before, so a link
sent earlier stops working. The invitation is emailed with a link on core's own
address, `/invite/<id>`, where the id is random and unguessable. When email is
not set up, or sending fails, the invitation still exists and the operator is
shown the link to pass on, with a way to copy it. Someone already signed in who opens a link that can still be
used is told whose account they are in and whom the invitation is for, and
may go on or sign out to use it; a link that does not work shows the same page
to everyone. Core records whether the
email was sent, since only an emailed link verifies the address (§3.3.3). The Console lists the
invitations that have been neither used nor cancelled, newest first, with who
made them and when each ends; one past its expiry is listed as expired, so it
can be seen and cancelled. Cancelling takes the link out of use at once; an
invitation that was used cannot be cancelled.

The link is public. One that can still be used goes on to sign-up, which starts
with the address it was sent to; every other link (unknown, expired, cancelled,
used) shows the same "this invitation link does not work" page, so it says nothing
about invitations other people hold. The page and the link only help: whether a
sign-up is admitted is decided by the server from the address (§3.3.1).

The Console is at `/console`, and entering it takes `console:access`. Its
navigation lists only the sections the person's role may open, judged by the
matrix in force, and a role that cannot enter sees none. Someone who is not
signed in is sent to sign in and back; someone who is signed in but may not
enter is shown a page that is not there, not one that says what is missing.
Every page checks again for itself, since the frame is not rendered again when
someone moves between its pages, and every action checks its own capability. On
a wide screen the sections are a list beside the page; on a phone the Console's
own page lists them. Every other page has one way back, to the page above it
("Add an app" to Apps, Apps to the Console), drawn by the frame and never by the
page; on a wide screen, where the list already leads to each section, only a page
beneath a section has it. A section is
listed only when its page exists. Operators reach the Console from the home page.

### 3.11 Identity pages

Every person manages their own account here (capability `profile:manage`).
The identity pages open as an overlay above the page the person was on, and
closing them returns there (§1.3).

| Page           | Contents                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Profile        | Name and avatar. The email address is shown but cannot be changed in Phase 1                                      |
| Security       | Change password; manage passkeys; enrol or remove TOTP and backup codes; list sessions and end any of them        |
| Preferences    | Timezone and locale; appearance; notifications and, where an app they use can send it, email from apps            |
| Files          | The files the person keeps in core, how much of their space they use; add one, open one, delete one (§4.6)        |
| Connected apps | Apps the person has allowed, with the scopes granted; **Remove access** revokes the app's tokens as well (§3.6.4) |
| Activity       | What apps noted they did for the person, newest first, by app; delete one, an app's or all (§4.3)                 |
| Your data      | Download everything of theirs, from core and from every app they use (§4.7.2)                                     |
| Delete account | Requires the password. The owner must transfer ownership first                                                    |

- A name is 1 to 100 characters, trimmed, with no line breaks or other control
  characters, on every path that sets one (sign-up and the profile).
- A picture's address is set only by uploading a picture: no request can name
  an address, since an address in a person's profile is shown in other
  people's pages. Uploading and removing a picture are checked for where the
  request came from, as well as for a session.
- Preferences are the time zone and the language and region, each optional:
  "Not set" saves nothing. The page offers the platform's list of time zones
  and common languages named in English, with an option to use the browser's
  time zone; the server checks whatever it is sent (§3.3.2), so a request that
  names another is refused. A value already saved that the list does not name is
  kept and shown. They are what other apps read as `zoneinfo` and `locale`
  (§3.6.2).
- Preferences also hold **Appearance**: light, dark, or the system's (the
  default), for core on this device. It applies as it is chosen, needs no saving,
  and is kept in the browser only (`localStorage`), not in the account: it is about
  the screen in front of the person, no app needs it, and another device keeps its
  own. "System" is no saved choice and goes on following the system's colour
  scheme as it changes; a choice is there from the first paint on the next visit,
  follows into other tabs, and gives the browser's bar the page's colour in that
  theme.
- The Security page gathers the password, two-factor sign-in, passkeys and the
  person's sessions; the two-factor and passkey pages stay under it
  (`/security/two-factor`, `/security/passkeys`). Profile and Security share one
  heading and tab bar.
- Changing the password asks for the current one, and ends every other session
  of the person's: whoever else was signed in is signed out, this browser stays.
- The sessions list shows, for each open session, a device label read loosely
  from the browser ("Chrome on macOS"), when it began and was last used, and
  the address when it says something (a loopback address does not). It never
  carries the session's token. A session is ended by its id and only ever one
  of the caller's own; ending the one in use signs that browser out, and ending
  another signs that browser out at its next request. "Sign out everywhere
  else" ends all but the one in use.

- **Connected apps** (`/connected-apps`) lists the apps the signed-in person has
  allowed, each with what it can do in the same plain sentences consent used
  (§3.6.4), and when they first allowed it. An app that asked for more later is
  one app, with everything it was allowed. It is read for the session's own
  account only: nothing in a request names whose apps to list. An app an
  operator trusts is never asked about, holds no consent and is not listed;
  the page says so when it is empty. **Remove access** asks first, says that the
  app stops working at once and will ask again, and then does what §3.6.4
  describes in one step (the consent and every token the app holds for the
  account), for the session's own account and the app named, and nothing else.
  A removal that finds nothing says there was nothing to remove.

### 3.12 Console: instance settings

| Setting                                        | Capability                   | Notes                                                                                                                |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Instance name                                  | `instance:configure`         | Shown in pages and emails                                                                                            |
| Logo (light and dark), favicon                 | `instance:configure`         | Used by core's pages, the launcher and emails, and published for apps (§3.13)                                        |
| App icon, and one for masking (optional)       | `instance:configure`         | The icon an installed core takes (§1.3); the Sovereign mark until one is set                                         |
| Invite-only                                    | `instance:configure`         | Overrides `SV_AUTH_INVITE_ONLY` (§3.3.1)                                                                             |
| SMTP: host, port, user, from address, password | `instance:configure-secrets` | Overrides the `SV_SMTP_*` variables; the password is stored encrypted and never shown again                          |
| Export recipients                              | `instance:configure-secrets` | The age recipients the owner's export is encrypted to (§4.7.1); public keys, shown as saved; no environment variable |

How a setting resolves: the value **saved in the Console**; otherwise the
**environment variable**; otherwise the built-in default (the instance name is
`Sovereign`; invite-only is on; the SMTP settings have none and are simply off).
Clearing a saved value returns the setting to the environment. A change applies
without a restart: at once on the instance that saved it, and on others within
a few seconds. A saved secret is stored encrypted, bound to its setting, and is
never shown again: the Console learns that one is saved, not what it is. A
saved secret that cannot be decrypted (its key left the key ring) is reported
as unreadable and is **not** replaced by the environment's value; the Console
asks for it again.

The Console's **Settings** page (`/console/settings`, needing
`instance:view`) shows and changes these. Someone who can view but not configure
sees the values and no controls. Each value says where it comes from (saved
here, the environment, or the default), and a value saved here can be cleared
back to the environment's. Every change is made by `InstanceManager`, which asks
for the capability in the matrix in force, so a direct request is held to it as
the page is; the SMTP settings need `instance:configure-secrets`, and for anyone
without it the page does not load them at all.

- **Name**: 1 to 100 characters on one line, trimmed. A line break is refused,
  since the name reaches page titles and email subjects. It is the title of every
  page (`<page> · <name>`), and appears in emails.
- **Invite-only**: saved as true or false only; a request that says neither saves
  nothing, so a missing field never opens sign-up. The first account is exempt
  whatever it says (§3.3.1).
- **Logo (light and dark) and favicon**: each is judged by its bytes (§3.15) and
  kept in the database. A new picture replaces the old and is served at a new
  address, so nothing stale is cached. When only one logo is set it is used for
  both light and dark pages; the logo is shown on the sign-in and sign-up pages.
  An email shows the light logo only when it is PNG, JPEG or WebP: an SVG is
  never put in an email. Pictures are public (§3.13): they are read with no
  session, by pages, emails and apps.
- **App icon and App icon for masking** (ADR 0001): the icons an installed core
  takes (§1.3). Each is a **square PNG between 512 and 1024 pixels on a side**,
  judged by its bytes and kept as it is; a picture that is not that, an SVG
  included, is refused with the same words the Console shows beside the upload.
  Core does not resize, crop or convert them. The manifest names the app icon
  for both the 192 and the 512 pixel sizes and the masking one as `maskable`
  only if there is one; with no app icon set, the Sovereign icons are named, and
  an operator's masking icon is never mixed with the Sovereign one. The same
  icon is an iPhone's home-screen icon. They are served like the other
  pictures, public and at a versioned address.
- **SMTP**: a host is a host name, the port is a whole number from 1 to 65535,
  the user name is one line of at most 255 characters, the from address is an
  address or a name followed by one in angle brackets, and the password is at most
  1024 characters. A blank field returns that value to the environment's. A blank
  password keeps the one saved; typing replaces it; removing it is its own choice.
  The password is stored encrypted and is never sent to the page. Without a field
  encryption key a password cannot be saved, and the operator is told to set the
  key or use `SV_SMTP_PASSWORD`; the other fields still save. A refusal saves
  nothing.

### 3.13 Instance branding for apps

Core publishes the instance name, logos and favicon at a well-known address so
that apps can show the same branding. The address and format are defined in
`contracts/core-api/`.

- The address is `/.well-known/sovereign-instance`. It is public: it needs no
  account and no token, and any origin may read it, since an app's pages fetch
  it from the browser and it carries nothing private.
- It also says what this core serves, as `api`, with `versions` (such as
  `["v1"]`) and `capabilities` (such as `["directory"]`), so that an app can tell
  a capability this core lacks from a failure ([sdk §7](sdk.md)). A capability is
  listed when every call of it is served. A core that does not publish `api`
  serves the Directory and this document, and nothing else.
- It answers with the instance's name, its own address, a logo for light pages
  and one for dark pages, and its favicon. Each picture is an absolute address
  on the instance, carrying the picture's version, so a changed picture is a new
  address; one that is not set is `null`; when only one logo is set it is given
  for both.
- It shows what the operator has set **now**: it is read on every request and
  always revalidated, so a change in the Console is there at once, with no
  restart (on another instance within a few seconds, as any setting, §3.12). It
  carries an ETag, and a request whose `If-None-Match` matches is answered `304`
  with no body.

### 3.13.1 The Core API contract

What an app may call on core is defined once, in `contracts/core-api/openapi.yaml`
(OpenAPI 3.1), and nowhere else:

- Paths are versioned (`/api/v1/...`); a change that could break an app that
  already calls them is a new version, never an edit. The one unversioned path
  is a public document under `/.well-known/`.
- A call that needs authentication carries a bearer access token that core
  issued to the app for a signed-in person (§3.9), or for itself (§3.6.6); the
  scope each operation needs is on it in the contract.
- Every failure has one body (`error` and `message`) and a status that says what
  kind: 400, 401 (missing, expired, revoked or not for this API; with
  `WWW-Authenticate`), 403 (no scope), 404, 429 (with `Retry-After`).
- The typed client (`packages/api-client`) is **generated** from the contract
  and committed; a test fails when it is not what the contract produces.
- Core is **tested against** the contract: every answer a handler gives is
  checked against the schema of its operation and status, a route the contract
  does not describe fails, and an operation the contract describes as served
  without a route fails. An operation marked `x-planned` is part of the contract
  and not yet served.

### 3.14 Email

- Core sends: invitation, email verification, password reset, account created,
  and MFA reset.
- Each uses a default English template carrying the instance name and logo,
  sent as HTML and as plain text. Every link in an email is on core's own public
  address (`SV_URL`), never one built from a request's headers, so a forged
  `Host` header cannot redirect a reset or verification token. The invitation
  states its expiry date only when it has one. Editing templates is not part of
  Phase 1.
- Credentials are sent only over an encrypted connection: implicit TLS, or a
  STARTTLS upgrade that is required, never merely offered. A server that does
  not offer TLS makes the send fail instead of receiving the password, and the
  server's certificate is verified.
- When no SMTP server is configured, core logs a warning at start-up, and any
  flow that needs to send email fails with a clear message rather than
  silently. With email verification required and no SMTP, sign-up cannot be
  completed, and the warning says so.

### 3.15 Data and configuration

- Core stores its data in sqld, PostgreSQL or a SQLite file, chosen by
  environment variables.
- The SMTP password and other stored secrets are encrypted with the field
  encryption key from the environment. Client secrets are hashed, not
  encrypted.
- **Images** (avatars, logos, favicon) are stored in core's database, so core's
  containers hold no state of their own:
  - at most 1 MB each; PNG, JPEG or WebP;
  - an app icon is a square PNG, 512 to 1024 pixels on a side, and nothing else;
  - SVG is accepted for logos and the favicon only, and is sanitised before it
    is stored; it is never accepted for avatars;
  - an SVG is not scanned for what is dangerous: it is read and a new document
    is written holding only what is known to be a picture (shapes, paths,
    gradients, text, clipping and the attributes that style them). A script, a
    handler, anything that would fetch another address, a style sheet, an
    external entity or a document type declaration is dropped or refused, and what
    cannot be read as a picture is refused with a message;
  - served from core with `X-Content-Type-Options: nosniff`, an ETag and long
    cache lifetimes;
  - not resized on the server. Avatars are cropped and scaled in the browser,
    to about 512 pixels square, before upload.
  - judged by their bytes, never by a name or the type the client claimed, and
    served as the kind the bytes proved to be; the longest side accepted is
    4096 pixels, which refuses a picture built to exhaust a browser;
  - an avatar is public and versioned: it is shown by apps in an image with no
    credentials from the address in the `picture` claim, which carries the
    picture's version, so it is cached for a year and a changed picture is a new
    address. The picture of a deactivated account is not served.
- **Secrets from files:** every variable that holds a secret also accepts a
  `_FILE` form naming a file to read it from. Setting both forms of the same
  variable is a start-up error.
- Phase 1 environment variables. The rules every variable follows - the prefix,
  the `_FILE` form, value syntax, start-up validation and what the Console may
  override - are in [`contracts/env.md`](../../contracts/env.md):

| Variable                                                                                                                             | Required        | Purpose                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SV_URL`                                                                                                                             | yes             | Core's public URL, which is also the issuer (§3.6.1). It must be reachable from the core process itself (§3.6.5)                                                                                                                                                           |
| `SV_AUTH_SECRET` / `_FILE`                                                                                                           | yes             | Signing secret, at least 32 characters                                                                                                                                                                                                                                     |
| `SV_AUTH_COOKIE_DOMAIN`                                                                                                              | no              | Parent domain for session cookies. Apps signing in through OpenID Connect do not need it; it matters only when core's own pages or passkeys are shared across subdomains Unset (the default), the cookies are host-only (§3.5): leave it unset when apps run on subdomains |
| `SV_AUTH_TRUSTED_ORIGINS`                                                                                                            | no              | Extra origins accepted for requests                                                                                                                                                                                                                                        |
| `SV_AUTH_TRUSTED_PROXIES`                                                                                                            | no              | The reverse proxies in front of core (addresses or ranges). Sign-in limits count attempts per client address, read from `X-Forwarded-For` past these; without them only a single-address header is believed and other requests share one limit                             |
| `SV_AUTH_INVITE_ONLY`                                                                                                                | no              | Registration policy default (§3.3.1)                                                                                                                                                                                                                                       |
| `SV_AUTH_REQUIRE_EMAIL_VERIFICATION`                                                                                                 | no              | Default `true` (§3.3.3)                                                                                                                                                                                                                                                    |
| `SV_AUTH_PASSWORD_MIN_LENGTH`, `SV_AUTH_PASSWORD_REQUIRE_*`                                                                          | no              | Password policy (§3.3.2)                                                                                                                                                                                                                                                   |
| `SV_AUTH_WEBAUTHN_RP_ID`, `_RP_NAME`, `_ORIGIN`                                                                                      | no              | Passkey relying party (§3.4.2)                                                                                                                                                                                                                                             |
| `SV_DB_DIALECT`, `SV_SQLD_URL`, `SV_SQLD_ADMIN_URL`, `SV_SQLD_NAMESPACE`, `SV_SQLITE_URL`, `SV_POSTGRES_URL`, `SV_POSTGRES_POOL_MAX` | yes, by dialect | Database                                                                                                                                                                                                                                                                   |
| `SV_FIELD_ENCRYPTION_KEYS` / `_FILE`                                                                                                 | yes             | Key ring for stored secrets: `id:key` entries, newest first (`contracts/env.md`)                                                                                                                                                                                           |
| `SV_STORAGE_DRIVER`, `SV_STORAGE_PATH`, `SV_STORAGE_QUOTA_MB`, `SV_STORAGE_FILE_QUOTA`                                               | no              | People's own files (§4.6): `fs`, the folder (default `/data/s3/core`), and each person's quota (default 204800 MB and 1000 files)                                                                                                                                          |
| `SV_STORAGE_SIGNING_KEY` / `_FILE`                                                                                                   | no              | Signs addresses that serve a file without a session (§4.6). At least 32 characters                                                                                                                                                                                         |
| `SV_ENVIRONMENT`                                                                                                                     | no              | `development`, `staging` or `production`; default `production`. What the instance is for (§3.15.1)                                                                                                                                                                         |
| `SV_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD` / `_PASSWORD_FILE`, `_FROM`                                                            | no              | Mail defaults (§3.12)                                                                                                                                                                                                                                                      |

Database variables name the engine (`SV_POSTGRES_URL`, `SV_SQLD_URL`,
`SV_SQLITE_URL`), not the component.

#### Running core

How an operator runs core is in `docs/deploying.md`; what is promised:

- Core ships as **one image** built from the repository's `Dockerfile`:
  multi-stage on `node:24-alpine`, holding only the traced server, its static
  files and the migrations it applies when it starts. It holds **no environment**
  (no `.env`, no secret, no address), runs as an unprivileged user, listens on
  `3000`, and reports its health (the app and the database) to Docker. Started
  with nothing, it refuses and says what is missing.
- The image is **published** to `ghcr.io/sovereignfs/sovereign` for
  `linux/amd64` and `linux/arm64` when a `vX.Y.Z` tag on `main` matches the
  root `package.json` and the full CI passes on that commit; it is tagged
  `X.Y.Z`, `X.Y` and `latest`.
- Three compose setups start it on each database, from the documented variables
  alone: sqld (the default), PostgreSQL (an overlay), and a SQLite file in one
  container. Only core is published; the database servers are pinned and keep
  their data in volumes.
- **Core's own public address must be reachable from inside its container**:
  checking an `id_token_hint` makes core fetch its own signing keys from
  `SV_URL` (§3.6.5). `http://localhost:3000` is, since core listens there; behind
  a proxy on a public name the operator makes the name reach the proxy from
  inside (a host entry or a network alias).
- The image ships `sovereign-admin` (§3.7.4), so a deployment needs nothing
  installed beside it. It holds no package manager and no `tsx`.
- For development, `pnpm dev` starts a persistent sqld when the environment
  chooses sqld, and `pnpm seed` makes an owner, an admin, an ordinary person
  and a sample app to try it with (§3.15.1). The seed refuses any address that is
  not on the machine it runs on.

#### 3.15.1 Environment and the seed

Core is told what the instance is for, and a development or staging instance can be given the accounts and the app to try it with,
which a production instance never can ([workstream 0002](../workstreams/0002-test-instances.md)).

- **`SV_ENVIRONMENT`** is `development`, `staging` or `production`, and `production` when it is not set. Any other value is a start-up
  error, since a misspelling must never read as a permission. It changes nothing in how core runs for anyone using it; it decides only
  whether the seed below may run, and whether the lock check below is served to everyone signed in or to the owner alone. The operator CLI sets it from `environment` in `suite.yml` ([contracts/suite.md](../../contracts/suite.md) §1.1.1), and an
  operator cannot set it in `core.env`.
- **`sovereign-admin seed [--local] [--json]`** is run in core's container (§3.7.4). It exits 3 when it is refused, which it is before it
  writes anything, and 1 when it stops partway (running it again is safe). It MUST refuse, making nothing, when `SV_ENVIRONMENT` is
  `production` or unset, and when the database holds any account that is not one of the seed accounts. The two are separate checks, so
  a mistake in one is not a hole: a variable set wrongly cannot seed a real instance, and an instance made by hand cannot be seeded by
  setting the variable. It MUST be safe to run again: it makes what is missing, leaves what is there, and says which.
- **The lock check** (`/lock-check`, task 4.15, [research 0012](../research/0012-biometric-lock.md)) tries on a device what a biometric
  lock would need: making a passkey there, asking for one after a tap and with none, its PRF output, and how long the device keeps an
  installed core in the background. On a `development` or `staging` instance it is for anyone signed in; on `production`, only for
  someone who holds `instance:diagnose`, which is the owner's alone (§3.2.2), and anyone else gets a page that is not there. It sends
  nothing to the server; a passkey it makes is kept by the device only and registered with nothing.
- **What it makes:** an owner, an admin and an ordinary person (`owner@sovereign.local`, `admin@sovereign.local`,
  `user@sovereign.local`), the owner first since the first account always is, each with a verified address and its role, made through core's
  own sign-up so that every rule applies; and one public sample app, a client with a managed key, made through the registry as the system
  actor (§3.7.4), so that signing in to core from an app can be tried at once. The sample app has no secret to leak, since it is public and
  signs in with PKCE.
- **Passwords.** On `development` every seeded account has one documented password, `SEED_PASSWORD` when it is set. On `staging`, which may
  be reachable from the internet, each account gets a random password of at least 24 characters, written once, to the command's output
  and nowhere else, when the account is made. A password is never shown again, and an account that was kept keeps what it had. A
  documented password on a server anyone can reach would be a way in for anyone who read the documentation.
- **The sample app's address** follows core's own: `http://localhost:3001/callback` when core's address is `http` (a development machine, the
  only instance that may send an app to `localhost`, §3.7.1), and `https://sample.<core's host>/callback` otherwise, which nothing serves.
- **`pnpm seed`** is `sovereign-admin seed --local`, run on a development machine. It sets the environment to `development` itself and keeps
  its other rule: it refuses unless core's address is on the machine it runs on. `SEED_PASSWORD` is read there, and by nothing on a server.

### 3.16 Not in Phase 1

Groups and per-app access policies; per-account capability grants;
verification levels; social
sign-in; changing
an email address; editable email templates; theme presets, colours and text
size preferences (a choice of light, dark or the system's is in Preferences, §3.11); mail, notification and activity APIs for apps; account
deletion and export across apps; backups; end-to-end encryption and the
recovery kit (§5, built after Phase 1); push relay; built-in clients for native shells; provisioning
databases for apps, which the operator CLI does and core takes no part in
([operator-cli §6.4](operator-cli.md)).

### 3.17 Phase 1 is done when

1. A fresh instance starts from the documented variables on each supported
   database, and refuses to start without the required secrets.
2. The first account signs up and becomes `platform:owner`.
3. The owner turns invite-only on in the Console, invites a person, and makes
   them `platform:admin`. An uninvited sign-up is refused by the server.
4. The owner edits the capability matrix, and no admin can change their own or
   another operator's role or capabilities.
5. A person enrols TOTP and a passkey, signs in with each, and recovers with a
   backup code. An operator's MFA reset removes both.
6. An operator registers two clients, one of them an off-the-shelf OIDC
   application. Both sign people in through core, appear in the launcher, and
   receive only the claims their scopes allow.
7. An untrusted client shows the consent screen once; removing its access in
   Connected apps revokes its tokens and the next sign-in asks again. A trusted
   client never shows it, and only a trusted client receives `roles`.
8. Deactivating an account ends its sessions and every token issued for it
   stops working, including a refresh token obtained with `offline_access`.
9. A client with the `directory` scope can search by name, resolve by `sub`,
   and look up an exact email address, and cannot list addresses. A token that
   has been revoked is refused even though its signature is still valid.
10. Signing out of core sends a back-channel logout notice to a client that
    registered one, and revokes that session's access tokens. A client's
    end-session request returns the person only to a registered post-logout
    redirect URI.
11. Rotating a client's secret makes the old secret fail at once.
12. The same behaviour holds on sqld, PostgreSQL and a SQLite file.

### 3.18 Open questions

One: changing `SV_AUTH_SECRET` makes the stored signing keys (§3.6.1) and the
authenticator enrolments (§3.4.1) unreadable, and how to rotate it without that
is not decided. The other questions raised while drafting Phase 1 are answered
in §3.6.1 (token lifetimes), §3.7.3 (secret rotation), §3.8 (how the launcher
opens apps) and §3.15 (image storage, secrets from files).

---

## 4. Phase 2 — Core services for apps

Phase 2 is what core offers an app beyond signing people in. Each service is specified here before it is built, and its operations
are added to the contract (`contracts/core-api/openapi.yaml`) marked `x-planned` until they are served (§3.13.1). Telling apps that an account
was deleted (§4.5) is the one service that runs from core to an app, so it is not an operation of the contract.

### 4.1 Notifications

An app can tell a person something: a task is due, a share arrived. Core keeps it, shows it in its own panel, and
lets the person act on it, so every app's notices are in one place and under the person's control.

**What a notification is.** A short, plain-text message from one app to one person:

| Field       | Notes                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`        | Made by core.                                                                                                            |
| `app`       | The app that sent it, shown by its name and icon. Never chosen by the sender: core takes it from the token.              |
| `title`     | Required, 1 to 120 characters. Text, never markup.                                                                       |
| `body`      | Optional, up to 500 characters. Text.                                                                                    |
| `url`       | Optional. Where choosing the notification goes: `https`, and on the origin of one of the app's own registered addresses. |
| `category`  | `info` (the default), `success`, `warning` or `error`. It only changes how the notification looks.                       |
| `expiresAt` | Optional. When it stops being shown. At most 90 days on, and 30 when not given.                                          |
| `key`       | Optional, up to 100 characters. A send with a `key` the app used for this person in the last 24 hours is the same send.  |
| `createdAt` | When core accepted it.                                                                                                   |
| `readAt`    | When the person opened it or marked it read, or null.                                                                    |

**Who may send.** Only an app acting for itself (§3.6.6) with the app scope `notifications:send`, which an operator gives it
(§3.7.1). This is the first app scope. Sending is how an app acts with nobody present, such as a reminder, so it needs no
person's token and no consent at the time. It is limited instead by who may be written to:

- An app can write only to a person who has used it: one with a consent for the app, or who has signed in to it and not removed its
  access (§3.6.4, Connected apps). Removing an app's access deletes its notifications for that person and ends the right to send.
- A deactivated or deleted account receives nothing.
- A person who has switched the app's notifications off (below) receives nothing from it.
- **A send to someone who may not receive it is accepted and dropped, and answers exactly as a delivered one does.** Otherwise a
  send would tell an app whether a person uses it, has turned it off, or has an account. Core logs the drop for the operator,
  without the text.

**What a person controls.** In Preferences (§3.11), a list of the apps that can send them notifications, each with a switch (on by
default), and "Clear all". In the panel: open one, mark one or all read, dismiss one or all. An operator cannot read a person's
notifications.

**The panel.** The bell in the account header, which is there when an app can write to the person or has, shows the number unread and opens a list, newest first, each with the app's icon and
name, the title, the body, the time and a dot while unread. Choosing one marks it read and goes to its `url` in the same tab. The
panel reads core's own routes with the person's session. It asks when a page loads and every minute while the page is visible; there
is no push in Phase 2 (below).

**What an app may do as the person.** An app with a person's token and the person scope `notifications` can list its own
notifications for that person, mark them read and dismiss them, so that reading one in the app clears it in core. The scope lets it
manage only what it sent; it never sees another app's, and it can send nothing with a person's token.

**Limits and keeping.**

- Sends are counted in a one-minute window, 600 for an app, and 60 an hour for one app to one person. Over either is a `429` with
  `Retry-After`. A refused send counts.
- A person keeps at most 200 notifications from one app; a new one past that removes the oldest. An expired one is not shown and is
  deleted with the next send; a dismissed one is deleted after seven days.
- Deleting an account deletes its notifications. Deleting an app deletes what it sent.

**The operations** (`contracts/core-api/openapi.yaml`, all `x-planned`):

| Operation                  | Who                  | Scope                | What                                                                       |
| -------------------------- | -------------------- | -------------------- | -------------------------------------------------------------------------- |
| `sendNotification`         | the app, for itself  | `notifications:send` | `POST /api/v1/notifications`: answers `202` with the `id`                  |
| `listNotifications`        | the app, as a person | `notifications`      | `GET /api/v1/notifications`: the app's, newest first; `unread` and `limit` |
| `markNotificationRead`     | the app, as a person | `notifications`      | `POST /api/v1/notifications/{id}/read`                                     |
| `markAllNotificationsRead` | the app, as a person | `notifications`      | `POST /api/v1/notifications/read-all`                                      |
| `dismissNotification`      | the app, as a person | `notifications`      | `POST /api/v1/notifications/{id}/dismiss`                                  |
| `dismissAllNotifications`  | the app, as a person | `notifications`      | `POST /api/v1/notifications/dismiss-all`                                   |

The panel and Preferences use core's own routes under the session, not these; they are the same data, checked the same way.

**Decided here, so that it can be built.**

- **No push in Phase 2.** Delivering to a phone or a closed browser needs a relay core does not have. A notification waits in the
  panel. Push belongs to the relay in "Later" (§2), and this service is what it would deliver.
- **No email fallback.** Mail for apps is its own service (task 15.2).
- **No threads.** Legacy `messages` is not carried over: a notification with a `url` points at the thing, and a conversation is the
  app's own.
- **No categories to switch off, no quiet hours, no templates.** One switch for each app. They can be added without changing this.

---

### 4.2 Mail for apps

Built. An app can email a person without being given their address. This is for an app that has no mail server of its own, and
for one that must not hold addresses: it names the person by `sub`, core looks up the address and sends from the instance's own
mail (§3.14), and the address never leaves core. An app that runs its own mail (`@sovereignfs/mailer`) can go on doing so; this is
not a replacement for it, and an app that was granted `email` can still read the address and use whichever it likes.

**What a message is.** Plain text from one app to one person:

| Field     | Notes                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `to`      | The person's `sub`. Required.                                                                                           |
| `subject` | Required, 1 to 150 characters. Text. Core puts the app's name before it: `Reminders: Your task is due`.                 |
| `body`    | Required, up to 5 000 characters of plain text; line breaks are kept and nothing is interpreted as markup.              |
| `link`    | Optional. One link, `https` and on the origin of one of the app's own registered addresses, shown as a button.          |
| `key`     | Optional, up to 100 characters. A send with a `key` the app used for this person in the last 24 hours is the same send. |

Core draws it in its own mail template (§3.14): the instance's name and logo, then the app's name ("From Reminders, through
Acme"), the subject, the text and the link, and a footer saying why the person is getting it and how to stop (below). An app cannot
change the template, set the sender or a reply address, add an attachment, or send HTML.

**Who may send.** Only an app acting for itself (§3.6.6) with the app scope `email:send`, which an operator gives it (§3.7.1), and
only when the instance can send mail at all. The rules about whom match notifications (§4.1): the person must have used the app,
have an active account and a verified address, and not have switched the app's mail off. **A send that may not be delivered is
accepted and dropped, and answers exactly as a delivered one does**, so an app learns nothing about the person, their address or
whether it is verified. What core reports of delivery is that it accepted the send: never "delivered", "bounced" or "opened", which
would be a way to test an address. The operator sees failures in core's own logs, without the text.

**What a person controls.** In Preferences (§3.11), beside notifications, a switch for each app that can mail them (on by default,
since it is how an app reaches someone who is not there). Every message ends with a line naming the app and a link to those
switches. Core adds the `List-Unsubscribe` header pointing at them.

**When there is no mail.** An instance with no SMTP server configured does not list `email` in its instance document (§3.13), and
the operation answers `404`. An SDK sees the capability is missing and raises `NotSupportedError` without sending.

**Limits.** Sends are counted in a window, 100 a minute for an app, and for one app to one person 5 an hour and 20 a day. Over
is a `429` with `Retry-After`. A message that cannot be used (too long, a bad link) is a `400` before anything is counted. Nothing
is queued past a restart: a message core could not hand to the mail server is dropped and logged, not kept.

**The operation** (`contracts/core-api/openapi.yaml`, `x-planned`):

| Operation   | Who                 | Scope        | What                                                         |
| ----------- | ------------------- | ------------ | ------------------------------------------------------------ |
| `sendEmail` | the app, for itself | `email:send` | `POST /api/v1/email`: answers `202` with an `id` of the send |

**Decided here, so that it can be built.**

- **No HTML and no attachments.** The template is core's and keeps every message looking like it came from this instance.
- **No delivery reports.** See above: a report is an address oracle.
- **No sending to an address.** An app that has an address and wants to mail it uses its own mail; `to` is a `sub` only.
- **One switch for each app**, as for notifications. No per-message categories.

**As built.**

- `MailForAppsService` (`src/mail/apps.ts`) is the only sender. It draws a message in the mailer's `appMessage` template (the
  instance's name and logo, "From Reminders, through Acme", the subject, the text as written, one button for the link, why the person is
  getting it and a link to the switches in Preferences) and sends it from the instance's own mail. The sender and recipient are
  never the app's to choose.
- The answer is given before the mail server has the message, so a delivered send takes no longer than a dropped one. A message
  the mail server will not take is dropped and logged (the app's id and the kind of failure, never the person, the address or the
  text); nothing is kept or retried.
- The limits are counted before a person is looked at, so a limit says nothing of the person either: 100 a minute for the app, 5
  an hour and 20 a day for one app to one person. A message that cannot be used is a `400` before anything is counted.
- A person's address must be **verified** for them to be written to; an account that is not, one that is deactivated, one that has
  not used the app and one that switched it off are all dropped, and the operator's log says which in a word.
- The only thing kept is the `key` of a send that carried one, for a day (`app_mail_keys`), and the person's switch
  (`app_mail_settings`). Remove access, deleting the app and deleting the account remove both.
- Preferences lists "Email from apps" only while the instance can send mail and the person uses an app that holds `email:send`.
  The unsubscribe line and the `List-Unsubscribe` header both carry the link to it (a page that asks for a sign-in, not a
  one-click unsubscribe: nothing a link in an email does changes a person's switch).

---

### 4.3 Activity

Built. An app can record that something happened to or for a person ("Reminders: you completed Water the plants"), and the
person can see, in core, everything that is recorded about them. This is the person's own record, not an operator's audit log: the
operator cannot read it, and it is not a way for an app to learn anything.

**What an entry is.** One line of plain text, recorded by an app:

| Field     | Notes                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `id`      | Made by core.                                                                                               |
| `app`     | The app that recorded it, from its token, never from the sender.                                            |
| `summary` | Required, 1 to 200 characters. Text. What happened, in the words the person should read.                    |
| `link`    | Optional. `https`, on the origin of one of the app's own registered addresses.                              |
| `at`      | When it happened, at most a day in the past or a minute in the future; when it was recorded when not given. |
| `key`     | Optional. A record with a `key` the app used for this person in the last 24 hours is the same record.       |

**Who may record.** Only an app acting for itself (§3.6.6) with the app scope `activity:write`, which an operator gives it (§3.7.1),
about a person who has used it and has an active account. A record about anyone else is accepted and dropped, and answers exactly as
a kept one does (as §4.1 does for a notification). There is no switch to stop an app recording about a person: what is recorded is
only what the app did with their account, and the person can delete it.

**What the person sees and can do.** Core's Activity page (`/activity`, in the identity pages, §3.11), newest first, each entry with
the app's name, the text, when and the link, searchable by app. They can delete one entry or all of them, or all of one app's. Deleting
an app's access (Remove access, §3.6.4) deletes what it recorded. An entry is deleted 90 days after it happened, and a person keeps at
most 500 in all, the oldest going first.

**Limits.** 600 a minute for an app, and 120 an hour for one app about one person; over is a `429` with `Retry-After`.

**The operation** (`contracts/core-api/openapi.yaml`, `x-planned`):

| Operation     | Who                 | Scope            | What                                                       |
| ------------- | ------------------- | ---------------- | ---------------------------------------------------------- |
| `logActivity` | the app, for itself | `activity:write` | `POST /api/v1/activity`: answers `202` with the entry `id` |

**Decided here, so that it can be built.**

- **App only.** Legacy `activity.log` could be called as a person; now an app records what it did, and acts for itself to do so. An
  app that wants a person's own action recorded records it with the person's `sub`.
- **No reading by apps.** An app cannot list what any app recorded: the page is the person's.
- **No export in Phase 2.** Export is the "Later" row (§2), and this is part of what it would hold.

**As built.**

- `ActivityService` (`src/activity/service.ts`) is the only writer and the only reader, and reads only for the account its caller
  names. The Activity page and its actions name the session's own account; no route lets an app, or an operator, read an entry, and
  the Console has no page for it.
- The limits are counted before the person is looked at, so a limit says nothing of the person; a record that cannot be used is a
  `400` before anything is counted. The record is dropped, answering as a kept one, when the account is missing or deactivated or has
  not used the app. There is no verified-address condition, because nothing is sent to the address.
- Retention is by when it happened: entries older than 90 days are not shown and are removed with the next record about the person, and
  the 500 are the newest by that time across all apps.
- Remove access, deleting an app and deleting the account remove what was recorded. The summary and the link are shown as text and
  as a link with `rel="noopener noreferrer"`; the link was checked against the app's own origins when it was recorded.
- The page lists "All apps" or one app, which it offers only when more than one app has recorded something, and shows times in the
  person's own time zone, or UTC until they set one.

### 4.4 Backups

Core makes no backup of its own in Phase 2. This is a decision, and the reason is that two backup tools would overlap and one of them
would be wrong about the keys.

- **The instance's backup is `sv backup`** ([operator-cli §10.2](operator-cli.md)): every database, each hosted app's data, the state and
  the secrets, encrypted to the operator's key alone. It is the only way an instance is backed up and restored. Core, which runs
  inside the container, has no key of the operator's and no place to put a file, and is never asked to.
- **What a backup of core needs** is the database (accounts, apps, consents, tokens' revocations, notifications, activity, settings and
  the instance's pictures, which are rows) together with the secrets core starts with: `SV_AUTH_SECRET` and the field encryption key ring
  (§3.15). Without them an encrypted setting cannot be read and every TOTP enrolment ends (§3.3). They are in `secrets/`, not in the
  database, and a backup that has both is as sensitive as the operator's key: it is encrypted, and the key is never inside it.
- **A person's own copy of their data** is export, in "Later" (§2). It is a different thing for a different person, and is not specified
  here.
- **After a restore, what was revoked since is alive again**: a session ended, a consent removed and a token revoked after the backup was
  taken are back in the database as they were. So a restore records the time (`restored_at`, an instance setting, written by the
  restore itself), and from then on core refuses every session and token issued before it: people sign in again, and apps ask for tokens
  again. An account deleted after the backup comes back with the backup, and this does not remove it: `sv restore` carries the
  deletions across the restore, and core deletes those accounts again and tells their apps again (§4.5, "After a restore"). The restore is
  `sv restore`'s to make and core's to honour.
- **How core honours it** (built). `sovereign-admin instance restored` (§3.7.4), which `sv restore` runs in core's container after the
  database is back and before core starts for people, records `restored_at` and, in the same transaction, ends what the backup brought
  back: it deletes every session and revokes every access and refresh token the provider keeps a row for. A signed access token and an
  app's own token leave no row, so the Core API refuses any issued before `restored_at` (`authenticate`, `authenticateApp`), and a
  person's token whose session opened before it. Consents stay, so a person signs in again and the apps they allowed are still allowed.
  A token issued in the same second as the marker counts as before it, as it does for any revocation (§3.9). The marker only moves
  forward: recording a time at or before the one held changes nothing and ends nothing, so running the last step of a restore twice does
  not sign out the people who came back in between. The marker is in `instance_settings` under `instance.restored_at`, is not one of the
  settings the Console shows, and nothing in core writes it but this command. Core's own pages ask the database for the session every
  time (§3.3), so they need no check of their own: a session the command removed is gone.
- **Core's Console takes no backup.** An operator who wants to know the state of the instance's backups asks `sv`. The Console's Data
  page offers an owner's **export** of core's data (§4.7.1), and says there that it is not a backup and does not restore the instance.

### 4.5 Account deletion: telling the apps

Built, except `sv`'s call of the restore commands (task 13.8). When a person deletes their account, each app that holds something of theirs is told, so that it can delete it. This
runs from core to an app, unlike every other service in this phase, and it is the one place where an app being down must not lose
something: a person who deleted their account must not find their data still held by an app because it was restarting that day.

**Who is told.** Every app with an account-deleted address (§3.7.1) that the person had **used**: a consent, an access token or a
refresh token of theirs, revoked or not, or the record that their access to it was removed (Remove access leaves one, which is all
a signed access token leaves behind), in the same sense as §4.1. Core reads that list inside the deletion's own transaction, before
the same transaction deletes the consents and tokens, since afterwards nothing says which apps they were. An app without an
account-deleted address is not told, and is as it was before: it has its back-channel logout at most. An operator deleting an account
(§3.3, §3.11) and a person deleting their own go through the same transaction and so the same notices. Deactivating an account is not
deleting it, and tells no one.

**What is kept so that it is not lost.** One row for each notice, written in the deletion's transaction: the app, the person's `sub`,
when the account was deleted, and where the notice stands (`pending`, `delivered`, `given_up` or `resolved`), with the number of
attempts, when the next is due and the kind of the last failure (never a response body). A notice is not tied to the account, which is
gone, and the `sub` is never reused (§3.3). A delivered notice is kept for 90 days after delivery, which is how far back a restore is
expected to reach (below), and then deleted with its `sub`. Deleting an app deletes its notices. So that a deletion which had no app to
tell is also remembered, the same transaction writes the `sub` and the time to `deleted_accounts`, which goes after the same 90 days.

**What an app is sent.** A `POST` to its account-deleted address with the form field `account_deleted_token`, a JWT typed
`account-deleted+jwt`, signed with the key that signs logout tokens (§3.6.5) and carrying `iss`, `aud` (the app's client ID), `sub`,
`iat`, an `exp` two minutes on, a fresh `jti` for each attempt, and `events` holding the single event
`urn:sovereignfs:event:account-deleted`. It carries nothing else of the person: no name, no address. A redirect is not followed and an
attempt is given five seconds. **Any `2xx` is an answer; anything else, and no answer, is a failure.** The app answers `2xx` only once
it has deleted what it holds, so a `2xx` is the app's word that it is done, and the SDK handler (sdk §9.1) does exactly this.

**Trying again.** The first attempt is made as soon as the deletion has committed. After a failure core tries again after 1 minute, 5
minutes, 30 minutes, 2 hours, 6 hours and 12 hours, and then every 24 hours, until 30 days after the account was deleted; a notice
still unanswered then is `given_up`. A process that stops keeps its notices: what is due is read from the table when core starts and
every minute after, and an attempt is claimed with a conditional update so that two instances of core do not send the same notice at
once. Core logs a notice given up, naming the app and not the person.

**What an operator sees.** The Console lists the notices that are not yet delivered, to someone with `client:manage` (§3.7): the app,
when the account was deleted, the attempts, the state and the kind of the last failure, and the **first eight characters** of the `sub`,
which let the owner of an app find the person in the app's own records and which are not enough to find anyone in core's. An operator
can mark a notice `resolved` once the app's owner says the data is gone by other means. The list shows nothing of an account that
still exists. The count of notices given up appears on the page, so that an app that never answers is not only in a log.

**As built (delivery).** `DeletionDelivery` (`src/accounts/deletion-delivery.ts`) reads what is due from the table at start-up and every
minute, and again straight after a deletion commits. It claims a notice with a conditional update that sets a lease of two minutes, makes
one attempt (the token, a form `POST`, five seconds, no redirect followed, the answer's body never read), and writes the result with a
condition on the notice still being pending, so a notice an operator marked done meanwhile is not undone. The last attempt is made at
the 30 days and not skipped when the usual wait would run past them. A failure is kept as a kind (`http_<status>`, `timeout`,
`network` or `no_address`), and the Console says it in words.

**After a restore.** A restore returns the database to the time of the backup, deleted accounts and the list of notices with it, so the
list cannot be what remembers a deletion made after the backup. `sv restore` therefore asks the running core for its deletions
before it restores (`sovereign-admin instance deletions export`: each account in `deleted_accounts` with its `sub`, when it was deleted and the apps that
were to be told, as JSON on standard output) and, once the database is back and the restore marker is recorded (§4.4), gives them to the restored core
(`sovereign-admin instance deletions apply`). Core deletes any of those accounts the restored database brought back, the way an
operator's deletion would, and makes a notice for each app of each of them again, whether or not that app was told before. Apps are
told again for the reason a restore ends sessions: what was done is not undone by going back. An account the restored database does not
have is not made again, and its apps are still told. An owner is never deleted by it. The notices it makes start their 30 days when
they are made, and the deletion keeps the date it had. `apply` reads standard input or a file, is done once for a given export (the time
of the newest export applied is kept as `instance.deletions_applied`, and a file at or before it changes nothing), and sends nothing
itself: the notices wait in the table and core sends them when it starts. The file holds `sub`s and nothing else about a person, is made for this and
removed after it, and is never written outside the server's own state. **A server that is lost before its deletions can be exported
cannot remember them**: a person deleted after the last backup reappears when the backup is restored on a new machine, and the
operator's guide says so.

**After a restore of one app.** Restoring one app (`sv restore --app`) puts back that app's database and files and leaves core alone, so
core still knows who was deleted after the backup and the app does not: those people are back in it. `sovereign-admin instance deletions
resend --app KEY --since TIME` makes a notice for that app (the same notice, with its 30 days from now) of every account in
`deleted_accounts` deleted after `TIME` that it is not already waiting to be told of, whether or not it was told before. `TIME` is when the
backup was taken, and `sv restore` runs it once the app is up. Core remembers a deletion for 90 days, so a backup older than that cannot
be made whole, and `sv restore` says so. An app with no account-deleted address is not told, as at any other time.

**Decided here, so that it can be built.**

- **Its own address, not the back-channel logout address.** The two make different promises: a logout notice says a session ended and is
  tried for a day; this one says to delete what is held and is sent until it is answered. An app that wants only one has only one.
- **No acknowledgement of what was deleted.** Core asks for the app's word that it is done and takes nothing more, because anything more
  would be a way for an app to be asked about a person.
- **The logout notice is kept as well, since 6.4** (§3.6.5): for a day, and only after a failure that may be temporary.
- **Not an export.** What a person may take with them is the "Later" row (§2), and the SDK's legacy `portability` waits for it.

---

### 4.6 Files

Built ([RFC 0004](../rfcs/0004-file-storage.md)). Core keeps files a person uploads to their own account the way every app keeps its
people's files, through `@sovereignfs/storage`.

- **Where.** `SV_STORAGE_PATH`, default `/data/s3/core`: a folder per person, named by their `sub`, holding each file under an id core
  makes (128 random bits) and a record beside it (the name they gave it, cleaned of any path; the type; the size; when). On an instance
  that folder is core's part of the `sovereign-data` volume (operator-cli §6.4); no app can see it. `SV_STORAGE_DRIVER` is `fs`; other
  stores follow (RFC 0004 §3).
- **Quota.** Per person: `SV_STORAGE_QUOTA_MB` (default 204800, 200 GB) and `SV_STORAGE_FILE_QUOTA` (default 1000). Room for a file is
  reserved before a byte is written and what was not used is given back, so two uploads at once cannot together pass it.
- **Routes**, each calling `requireCapability('files:manage')` (§3.2.2), and `requireSameOrigin` for upload and delete:
  - `POST /api/files`: the body is the file, its name in `X-File-Name` (percent-encoded). The request MUST say its length (`411`
    otherwise), at most **100 MB** (`413`): core's proxy copies a body into memory and keeps only `proxyClientMaxBodySize` of it, which `next.config.ts` sets to the same number when core is built, and a body shorter than
    it said is refused rather than kept. Answers `201` with the record and its address.
  - `GET /api/files`: the person's files, newest first, with their usage and quota.
  - `GET /api/files/{id}`: the file, to its owner's session, or to an address signed with `SV_STORAGE_SIGNING_KEY` (`?u=&expires=&signature=`,
    at most an hour, compared in constant time; `403` once it has run out). A file of someone else's is `404`, the same as none.
  - `DELETE /api/files/{id}`: `204`, and its space is given back.
- **Refusals** carry a code a page can act on: `too_large` (`413`), `over_quota` (`507`), `not_found` (`404`), `invalid` and `empty`
  (`400`), each with a message.
- **Serving.** The type is judged by the file's bytes, never its name or the type sent. Images (PNG, JPEG, GIF, WebP, AVIF) are shown;
  everything else is sent as `application/octet-stream` to download, so nothing uploaded runs as script. Every answer carries `nosniff`,
  `Content-Disposition` and `Content-Security-Policy: default-src 'none'; sandbox`.
- **The Files page** (`/files`, in the identity pages, §3.11) is how a person uses all of this: their usage against their quota, a
  dropzone that sends the file to `POST /api/files` and shows the server's own words when it is refused, the list with each file's size and
  date, and a delete that asks first. A role without `files:manage` is told so, not sent to sign in again. A file the browser would
  otherwise run is offered as a download. Nothing on it is shared: there is no link to give someone.
- **A file is served with `Range`**: `206` with `Content-Range` for one span, `416` past the end, and the whole file for a header it cannot read as
  one span, so a video can be sought in and a large download resumed. `Accept-Ranges: bytes` is on every answer.
- **A partial upload** (`<id>.part`) that nothing has written to for a day is deleted the next time the person's folder is read.
- **Deleting an account** deletes the person's folder, once the deletion has committed, whoever deletes it and including a deletion a
  restore carries across (§4.5). A failure to delete it is logged and does not undo the deletion.

### 4.7 Exports

Specified ([RFC 0008](../rfcs/0008-exports-and-backups.md), milestone 1; epic [18](../epics/exports.md)). The owner's export (§4.7.1), a person's
export with apps' parts (§4.7.2) and the jobs (§4.7.3) are built. An owner can
download core's data, and anyone can download their own, from core and from every app they use. An export is a copy to keep, in the
format of [`contracts/export.md`](../../contracts/export.md); it is never imported, and it is not a backup: the instance's backup is
`sv backup` (§4.4).

**What is at rest is what is exported.** Records and files are exported as they are stored. What a person keeps end-to-end encrypted
(§5) is exported as its ciphertext, with their vault's records, and opens with their own keys and nothing else; what is not encrypted is
exported as stored. An export never encrypts a person's data to that person's key on its own account.

**Never exported**, by any export: what `contracts/export.md` §6 lists (passwords' stored hashes, TOTP secrets and backup codes,
passkeys' credentials, sessions and every token, verification and reset tokens, client secrets in the clear), and the instance's own
secrets (`SV_AUTH_SECRET`, the field encryption key ring, signing keys). A test lists the tables and columns each export carries and fails
when a table or column is added that it has not decided.

#### 4.7.1 The owner's export

- **Where:** Console > Data (`/console/data`), for whoever holds `instance:export` (owner-only, §3.2.2); anyone else gets a page that is
  not there.
- **The recipients.** The export is encrypted with age to the X25519 recipients (`age1…`) saved in the instance setting **Export
  recipients** (§3.12): one or more, on one line separated by spaces or commas, each checked for its shape by `InstanceManager`, which
  alone writes it, with `instance:configure-secrets`. They are public keys; the server never holds what opens them. `sv key export`
  prints the instance's own (operator-cli §9.6), and any other age recipient is accepted. **Without recipients there is no owner's
  export**, and the page says how to set them.
- **Taking one** asks for the password again (`confirmPassword`, §3.2.1) and calls `requireCapability('instance:export')` itself. Before
  it starts, the page says that the file holds every account there now, that it does not restore the instance, and that `sv backup` does.
  It is logged with who took it, when, and the fingerprints of the recipients, and nothing of what it holds.
- **What it holds** (`kind: "instance"`): core's records, as stored, of accounts (address, name, picture's address, role, state, time
  zone, language, when made), roles and the edited matrix, apps as registered (with no client secret), consents, invitations (with no
  token), instance settings (a saved secret as its stored ciphertext), the branding pictures, notifications, activity, deletion records,
  and the vault's records (`key_accounts`, `key_apps`, `key_wraps`, and the files of §5.3); and every person's files (§4.6). Sessions,
  revocations, `restored_at` and logout and deletion notices are left out.
- **One at a time** for the instance.

#### 4.7.2 A person's export

- **Where:** the identity page **Your data** (`/data`, §3.11), for the session's own account; nothing in a request names whose. It needs
  `profile:manage`. Taking one asks for the password again (`confirmPassword`, §3.2.1).
- **Core's part** (`core/`): the person's account (address, name, picture, role, time zone, language, when made), the apps they have
  allowed with the scopes and when (and each app's name and address, `connected_apps`), their notifications and notification preferences, their activity, their files, and their vault's
  records. Nothing of another person.
- **Apps' parts** (`apps/<name>/`, the name the toolkit manages the app by, or one made from its name; never two alike): for each app the person has used, in §4.5's sense ("Who is told"), that has an **export address**
  (§3.7.1), core sends a `POST` to it with the form field `export_request_token`: a JWT typed `export-request+jwt`, signed with the key
  that signs logout tokens (§3.6.5), with `iss`, `aud` (the app's client ID), `sub`, `iat`, an `exp` two minutes on, a fresh `jti`, and
  `events` holding the single event `urn:sovereignfs:event:export-requested`. It carries nothing else of the person.
  - The app answers `200` with its part as an export of its own (`contracts/export.md`, `kind: "person"`, `app` its `prefix`, `sub` the
    same), as `application/x-tar`. A redirect is not followed. An app is given **five minutes** and **2 GiB**; its answer is written to
    disk as it arrives, checked whole (`contracts/export.md` §5, and `app` and `sub` as asked), and only then placed in the person's
    export.
  - An app with no export address, one that does not answer in time, answers otherwise than `200`, sends more than allowed or sends what
    fails the check is listed in `contents.json` as missing with its reason, and the page names it. The rest of the export is complete.
  - Apps are asked one after another. Core calls only the export address registered for the app, never one from a request.
- **Not encrypted.** It is the person's, made in their session; the page says that the file is readable by whoever has it. It is a zip by
  default, and a tar on request.
- **One at a time** per person.

#### 4.7.3 Running an export

- An export is a **job**: a row recording whose it is (the instance's, or a person's `sub`), the session that asked, its state
  (`pending`, `running`, `ready`, `failed`), when it was asked for, when it ended and the file's name and size. It is claimed with a
  conditional update, as logout notices are (§3.6.5), so that two instances of core do not run one twice, and it is picked up when core
  starts and every minute, so a job a stopped process left is run again from the start.
- **The file** is written, as it is made, to `.exports/` under core's storage path (§4.6; `SV_STORAGE_PATH`), which every instance of
  core shares and which is no person's folder. An owner's export is encrypted as it is written: nothing of it is ever on disk in the clear.
- **The page shows the job's state** (looking again every few seconds while it is made) and, when it is ready, a download: a
  `POST` to `/api/exports/{id}` (`?kind=instance` for the owner's). The download is served **once**, to the session that asked,
  with `Cache-Control: no-store` and `Content-Disposition: attachment`, by a route that calls the same capability and `requireSameOrigin`
  (it is a `POST`), and the file is deleted when it has been sent. A ready export not downloaded within **an hour** is deleted, and so is
  a failed one's partial file. The service worker stores none of this (§1.3).
- **A failure** is recorded with its kind, never with what it was writing, and the page offers to try again.
- **Deleting an account** deletes the person's jobs and files with it; **deactivating** one leaves no way to take an export, since there
  is no session.

## 5. Keys — encryption the server cannot read

Specified and built ([RFC 0005](../rfcs/0005-end-to-end-encryption.md), epic [16](../epics/encryption.md), run as
[workstream 0003](../workstreams/0003-encryption.md)), and not yet audited by a cryptographer. Each part below says whether it is built
and names the sections it changes; core's own files (§4.6) and a recovery kit for everyone are still to come (epic 16).

### 5.1 What is promised

- Data an app encrypts this way cannot be read by anyone who **reads** the server: a copy of its disk, its database or a backup; the
  hosting provider; an intruder or an operator who looks and changes nothing. Core never receives a password.
- It is **not** promised against an operator, or an intruder, who changes the code core or an app sends: that code handles the keys.
  Nothing core says to a person or an operator claims more, and none of it uses the word "zero-knowledge".
- What the server still sees: who has keys for which app, who shares with whom, sizes and times. Core's own data (names, addresses,
  roles) is not covered (§3.15).
- Until a code audit, every guide and screen that describes this says it is not yet audited.

### 5.2 Signing in with a derived value

Built (task 16.3), on every instance, in §3.3.2, §3.3.4, §3.5 and §3.15.1.

- **The instance id** is 32 random bytes that core makes once, at start-up when there is none, keeps as a setting, and MUST NOT make
  again: it is never rewritten, two cores starting at once keep one, and a stored id that is not one stops core rather than be
  replaced. An instance that has accounts and no id is one upgraded from before this: start-up says so, since those accounts set
  their passwords again. It is in the instance document (§3.13) as `instanceId`, base64url, which is where core's own pages read
  it.
- **The browser derives two values** from the password, the address (trimmed, lower case) and the instance id, by one run of Argon2id
  (RFC 0005 §1.1): the **sign-in value**, `svp1.` and 43 base64url characters, sent where the password was; and the **unlock key**,
  which never leaves the browser. Every form that sets or asks for a password does this: sign-up, sign-in, accepting an invitation, the
  reset, the change, and every place the password is asked again.
- **Core never receives a password.** better-auth hashes the sign-in value as it hashed the password. The server refuses, wherever a
  password is set, any value that is not the derivation's shape (`PASSWORD_NOT_DERIVED`).
- **The policy is the browser's.** The page checks the policy of §3.3.2 before deriving, with the same words, and does not send a
  password that breaks it. The server cannot check what it never receives; a person who goes round the page weakens their own account
  only.
- **The reset page** is told, when it is rendered, the address of the account its link belongs to, and shows it ("For …"). A link
  that is not valid shows the address of no one.
- **An operator makes a reset link** with `sovereign-admin accounts reset-link EMAIL` when mail cannot be sent: the link a mailed one
  would be, working once, for an hour, printed once and never logged.
- **The seed and `sovereign-admin`** derive in the same way, from the address and the instance id read from the database.
- **The policy of §3.5** adds `'wasm-unsafe-eval'` to `script-src`, which allows WebAssembly to be compiled and nothing else.
  `'unsafe-eval'` and `'unsafe-inline'` stay out.
- **Accounts from before** cannot sign in with their old password, which is answered as a wrong one, and set it again through a reset
  link, mailed or made by an operator. Core keeps no second way of signing in.
- **The cost** of Argon2id is the same for every account on an instance, and the number after `svp` names the derivation with its
  cost. A later change sends a value for each derivation in use, in one request, and stores the newest (RFC 0005 §1.4).

### 5.3 The vault

Built (task 16.6), apart from the kit's page, which comes with §5.7. Core keeps, for each account, what opens its keys, and can open
none of it.

| Kept            | What                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Account         | The suite, the unlock salt, the account's signing public key, and its private half wrapped                                        |
| Ways in         | The account key, wrapped once for each: `password`, each `passkey`, the `kit`, and `escrow` when on                               |
| Apps            | For each app the person has opened: the app key wrapped, its two public keys, their signature, and the two private halves wrapped |
| Session secrets | For each session, 32 random bytes (§5.4), gone with the session                                                                   |

- **Setting up** happens in the browser, silently, the first time a person signs in with their password after this ships, or at
  sign-up: the account key and the signing key are made there and wrapped by the unlock key. Signing in says nothing about keys.
- **The recovery kit** is shown the first time the person opens an encrypted app, on core's page that gives the app its key (§5.7),
  and nothing more happens there until they confirm they kept it; only then is the kit's way in stored. Until they confirm, a new kit
  is made each time it is shown: core keeps whether the kit was confirmed, never the kit. A person who never opens an encrypted app
  is never shown one. (Decided with the goal owner on 2026-11-16, over showing it at the first sign-in, which would have put a
  blocking screen in every sign-in, an app's included.) What the kit says depends on escrow (§5.8): without it, the kit is the only
  way back and nobody else can get the data back; with it, the kit is the person's own way back and the owner can also recover it.
  No screen tells a person on an instance with escrow that nobody else can.
- **The recovery kit** is 32 random bytes, written as groups of four letters and digits from an alphabet with no `I`, `L`, `O` or `U`
  (Crockford's base32), ending in a check group. A mistyped kit is refused as mistyped. Typing it ignores case, spaces and hyphens,
  and reads `O` as `0` and `I` and `L` as `1`. It is shown once.
- **Unlocking** with the password happens in the browser: the account key opens or it does not. Nothing is sent to check it.
- **Changing the password** cannot share a transaction with better-auth's, so it holds this instead: the account key is wrapped for
  the new password beside the old wrap, the password is changed, and then the old wrap goes (or the new one, if the change was
  refused). The current password must open the old wrap first. At every moment the keys open with whichever password the account
  has.
- **A reset by email** leaves the `password` way in stale: the new password does not open it, and nothing depends on a hook to remove
  it. The reset page says so to an account that has keys, before the reset: the account comes back, its encrypted data does not,
  until a passkey that unlocks (§5.5), the kit, or escrow (§5.8) opens it. Then the new password is given its way in.
- **Unlocking with the kit**: the unlock step of key release offers "Use your recovery kit", which asks for the kit and the password the
  person signs in with now. The kit opens the account key; the password is given a new way in and the ones that no longer open are
  removed, so the password unlocks again from then on. A mistyped kit is told apart from one that is not this account's.
- **Signing in** with a password the server has just accepted sets the keys up or opens them, and nothing else does: a way in is never
  made from a password the server has not accepted. Across the second step (§3.4.1) the password's secret waits in the browser, once,
  for ten minutes at most, as a key that cannot be exported.
- **Deleting an account** removes all of it in the transaction that deletes the account (§3.3.6), so everything encrypted for that
  person is unreadable, backups included.
- **Only core's own pages** read and write the vault, through server actions for the session's own account. Apps read what §5.7 says.

### 5.4 Staying unlocked

Built (task 16.7). A session's secret is given only through a check that the session is live and the account's own, not trusted to a
cascade; deleting an account deletes the secrets of its sessions in its transaction.

- A browser stays unlocked until its session ends. A reload or a new tab asks nothing.
- A key is kept in the browser's IndexedDB wrapped twice: by a device key that cannot be exported, and by a key made from the
  session's secret, which the server gives only to that session. A page that loads with a session unwraps it into memory as a key that
  cannot be exported; a page with none deletes what was kept.
- When a session ends, however it ends, its secret is deleted with it, so what a browser kept can never be opened again, whether or not
  a page was open at the time.
- The service worker (§3.5) never stores or sees any of it.
- A locked session (§3.5.1) is refused its secret, so what the browser kept stays closed until the session is unlocked.

### 5.5 Passkeys that unlock

Changes §3.4.2. Built (task 16.8).

- Every passkey ceremony of core's pages asks for the WebAuthn PRF extension, with one input for the instance (made from its id): a
  discoverable sign-in cannot be given one per passkey. better-auth's client leaves the extension's results out of what it sends, so
  the output never leaves the browser.
- A passkey added while the browser is unlocked gets its own way in: its output through HKDF, with a random salt made for that
  passkey. A device that gives the output only when the passkey is used is asked for one more touch, whose answer is sent nowhere.
  The way in names the passkey, and a person can give a way in only to their own. Removing the passkey removes it, and one whose
  passkey is gone is never read.
- Signing in with such a passkey unlocks with the same touch, on the sign-in page and on its second step alike. A passkey used on the
  second step drops the secret the password left for that step unused, since the passkey may be another account's.
- A passkey that does not answer the extension signs in as before, and the browser stays locked: the person is asked for their
  password when something needs unlocking.
- A browser already signed in is unlocked by a passkey through a ceremony whose answer is sent nowhere; the page checks itself that
  the passkey was unlocked on the device, as core's hooks do for every answer sent to them.
- `/security/passkeys` marks the passkeys that unlock and offers to let one that does not (asking for the password first when the
  browser is locked), and warns before one that unlocks is removed.

### 5.6 Apps that use encryption

Built (task 16.9), in §3.6.2 and §3.7.1.

- An app says it uses encryption in its manifest (manifest 4, `contracts/app-manifest.md` §2.8), and the operator allows it: `sv app
add` says so, and `sv apply` registers the app's key return address (`sovereign-admin apps ensure --key-return`). People are not
  asked app by app: an app only ever receives its own key.
- **One setting decides it, the key return address** (§3.7.1): `https`, checked like a redirect address, written only by
  `ClientRegistry`, kept with the app's other settings core adds. An app may use encryption exactly when it has one.
- **The scope `keys`** (§3.6.2) follows it: the registry gives an app `keys` when it has a key return address and takes it away when
  the address is cleared, whatever was asked for. The Console shows the scope as following the address, never as a box to tick.
- Clearing the address stops new releases and grants. It makes nothing stored readable or unreadable.

### 5.7 Key release and sharing

Built (tasks 16.10, 16.11). Core's OpenID Connect provider is unchanged.

- **Key release** (RFC 0005 §4). An app's page that has no key for this browser session sends the browser to
  `/keys/release?client_id=…&return_to=…&request=…&state=…`. Core's page requires a session; checks that the app exists, is on, may use
  encryption, and that `return_to` is its key return address exactly, and answers anything else with the page that is not there;
  unlocks if it must; makes the app's keys on a person's first time in it; and returns the app's key sealed to `request`, signed by
  the account, in the address fragment. It is rendered per request, never cached and never framed, and sends no referrer.
- **Silently only when the app asked.** A request whose `Referer` is not the return address's origin is asked about first ("Continue
  to …"): a site that sent the person here with a public key of its own would otherwise get an answer it could open, if anything on
  the app's page read the fragment before the SDK removed it.
- **What the person sees**: "Opening…" and nothing else when the browser is unlocked, the kit kept and the app asked. A locked browser asks for the
  password or a passkey, both checked in the browser alone (§5.5). At the first encrypted app the kit is shown and must be kept
  (§5.3). The answer names the account's signing public key, so an app's page that has never seen it can remember it.
- **The answer** is HPKE (§1 of RFC 0005) of `{ app key, sub, client id, state, time, signing public key }` with the client id, the
  return address and the `state` as `info`, and an Ed25519 signature over the encapsulated key and ciphertext:
  `return_to#sv_key=<enc>.<ciphertext>&sv_sig=<signature>&state=<state>`, all base64url.
- **What an app's page checks**: that the answer opens with the key it made for this request, names this app and the `state` it kept,
  is for the person signed in to it, is under two minutes old, and is signed by the signing key it remembers for that person, or the
  first it sees. Anything else is refused. The `state` and its key are used once.
- **Two calls** in the Core API, with a person's token carrying `keys`:
  - `GET /api/v1/keys/me`: the caller's own public keys for this app, their signature, the private halves wrapped, and the account's
    signing public key.
  - `GET /api/v1/keys/people/{sub}`: another person's public keys for this app, their signature and that account's signing public key;
    `404` when that person has not opened the app.
    Both are behind their guard (a token with `keys`, counted per app and per person as the Directory is), act for the token's app only,
    and answer `404` alike for no such person, a deactivated account, or someone who has not opened the app. `keys` is listed in the
    instance document's capabilities.
- **The app's page remembers** each person's account signing key and refuses a changed one until the person says to go on (sdk §9.4).
- Document keys are the app's, beside its documents. Core's vault knows nothing of documents.

### 5.8 Escrow

Built (task 16.12). Off unless the owner turns it on.

- `sv key escrow` makes a key pair on the operator's machine, keeps the private half there (as `sv key recovery` does, operator-cli
  §9.4) and prints the public half as one line. The owner pastes it into the Console (Settings, Recovery of encrypted data): an instance
  setting, changed only by `InstanceManager` with the owner-only `instance:configure-secrets`, checked for its shape there.
- **A person is told before they are covered.** The next time they open an app that uses encryption, key release (§5.7) says the owner
  can now recover their data, and only when they continue does their browser add the escrow way in: the account key sealed with HPKE to
  the escrow key, bound to the `sub` and the escrow key's id. Unlocking alone covers nobody. Their Security page says whether recovery
  is on, and whether they are covered; the Console tells the owner how many accounts are not covered yet.
- Turning it off stops new ways in; those made before stay, since the key that opens them is the owner's, offline.
- **Recovering someone**: `sovereign-admin accounts escrow-record EMAIL` gives the escrow way in; `sv key escrow open` opens the
  account key offline and wraps it for a new kit; `sovereign-admin accounts put-kit EMAIL` stores the kit's way in, refusing one made
  for another account; the person sets a password through a reset link and unlocks with the kit (§5.3). Core opens nothing.

### 5.9 What an encrypted app must do

- Put nothing of a document into a notification, an activity entry or mail it sends through core (§4.1–§4.3): core keeps their text.
- Never show ciphertext. Show `LockedState` (design-system) where this browser cannot open something.
- When a reader is removed, remove their document key and make a new document key at the next write, and say that what was already
  read cannot be taken back.
- Delete a person's document keys when told their account was deleted (§4.5).

### 5.10 This is done when

Each item has a test in `apps/e2e`, named for it (`§5.10.N:`), run on each database.

1. No request of any password flow (sign-up, sign-in, invitation, reset, change, asking again) carries a password.
2. A person signs up, keeps the kit, and opens an encrypted app in a second browser with the password alone, then with a passkey that
   unlocks.
3. A reset by email gives back the account and not the data; the kit gives back the data.
4. A session ended from another browser leaves the first browser holding nothing that opens, with no page of it open at the time.
5. An app receives its own key and never another's; a release replayed, sent to another app, or to a page that did not ask is refused.
6. A person shares a document with a second, who opens it; a third cannot; a public key the server changed is refused.
7. With escrow on, the owner recovers a person's data offline; with it off, no account has an escrow way in.
8. The test instance's database, files and backup hold no plaintext of a document, its name or its type.

---

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-26 | First draft: principles, terminology, phase overview, Phase 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-26 | Added §1.3 (pages built from `@sovereignfs/ui`); the owner chooses their role when transferring ownership; environment variable names marked provisional, with database variables named by engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-26 | Answered the open questions: token lifetimes and refresh rotation (§3.6.1), secret rotation choice (§3.7.3), launcher opens apps in the same tab (§3.8), images stored in the database and `_FILE` for every secret (§3.15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-26 | §1.3: core's UI follows the established Sovereign UI page by page; §3.11: identity pages open as an overlay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-27 | Applied research 0001 (better-auth's OAuth provider): issuer is the instance URL with discovery at the root, PKCE required for every client, signing-key rotation, reuse detection removes all of a client's tokens for the account (§3.6.1); claims in the ID token as well as userinfo (§3.6.2); deactivation and deletion revoke every token including `offline_access` (§3.3.6, §3.6.3); Remove access revokes tokens (§3.6.4, §3.11); new §3.6.5 on sign-out and back-channel logout, now in Phase 1 (§3.16); redirect URI rule with development `http` (§3.7.1); secret rotation is immediate (§3.7.3); Directory API tokens are resource-scoped JWTs with a revocation check (§3.9); acceptance criteria 7–12 (§3.17). |
| 2026-10-27 | §3.15: the environment variable names are no longer provisional; the rules they follow are in `contracts/env.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | §3.15: added `SV_SQLD_NAMESPACE` (the sqld namespace core uses, default `default`, so apps can share one sqld server) and `SV_POSTGRES_POOL_MAX`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | §3.15: the format of `SV_FIELD_ENCRYPTION_KEYS` is a key ring of `id:key` entries, newest first, in `contracts/env.md`; rotation puts a new key in front and keeps the old ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-27 | §3.3.1, §3.12: a setting left unset never opens access, so invite-only is on when neither the Console nor `SV_AUTH_INVITE_ONLY` sets it; §3.12 describes how a setting resolves and what an unreadable saved secret does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-27 | §3.14: SMTP credentials are sent only over an encrypted connection (implicit TLS, or STARTTLS that is required), and the server's certificate is verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-27 | §3.14: every email is sent as HTML and plain text, and every link in it is on core's public address (`SV_URL`); an invitation states its expiry only when it has one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-28 | §3.3.1: an invite is used up by the sign-up it admits; every way an invite can fail is refused alike; "first account" means no account exists at all; a role is never taken from a request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-28 | §3.3.2–§3.3.4, §3.5: the "account created" email waits for verification when it is required; sign-up and resend answer alike for known and unknown addresses; email is sent in the background and refused up front while it is not set up; core's own session checks bypass the cookie cache so a reset ends sessions at once.                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-28 | §3.3.2, §3.3.5: the terms must be accepted at sign-up, enforced by the server, and recorded with when and which text; the time zone is stored in its canonical IANA spelling, refused when it is not one, and checked on every later change; the default legal pages are at `/privacy` and `/tos`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-28 | §3.4.1: what enrolling, the second step and the backup codes do, that a verified address is needed, that no "trust this device" is offered, and that the key and codes are encrypted with `SV_AUTH_SECRET`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-28 | §3.4.2: a passkey must be unlocked on the device and so counts as two factors; passkeys are discoverable; an unverified account is refused; the relying party defaults and is checked at start-up; the password is never removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-28 | §3.3.6: what deactivating does (one transaction with the work that goes with it, notices after), that every way of opening a session is refused, that the owner cannot be deactivated, and that reactivating restores sign-in only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-28 | §3.2.1: a role is changed only between admin and user, by the owner; the owner's role is fixed and the owner cannot be deactivated; a role that is not known holds no capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-28 | §3.11, §3.15: a name's rules; the picture's address is set only by uploading; avatars are judged by their bytes, public and versioned; the longest side accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-29 | §3.11, §3.4.1, §3.4.2: the Security page and what it does: change password ends the other sessions; the sessions list never carries a token and ends a session only by its id, only the caller's own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-29 | §3.3.2, §3.11: the language is validated and kept like the time zone (`INVALID_LOCALE`); what the Preferences page offers and that "Not set" saves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-29 | §3.2.3: the matrix is stored as differences from the default, what can never be stored, that a change shows within seconds without a per-session version, and that an unreadable matrix fails the check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-29 | §3.2.1: what a transfer of ownership requires (the password again, an active admin), that it is one conditional step so two transfers cannot make two owners or none, and the limit on wrong passwords.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-29 | §3.5: no signed cookie cache, so an ended session stops working at once everywhere, authorize included. §3.6.1: who may register a client, claims advertised in discovery, redirect addresses never followed when unregistered, the sign-in page carrying an app's request through every step, signing keys encrypted with `SV_AUTH_SECRET`, and what is not offered yet.                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-29 | §3.6.4: where and how consent is asked, what the page shows and refuses to show, that refusing sends `access_denied`, and that `roles` is removed from an untrusted client's request and withheld from its tokens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-29 | §3.6.3–§3.6.5: one revocation routine on the operation's own transaction, that an authorization code issued before a deactivation gets no token, what ending a session revokes, Remove access as the only way consent is removed, how apps are told on deactivation and on ending a session in the identity pages, what the logout token carries, and what end-session refuses.                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-29 | §3.7: the registry is the only writer and needs `client:manage`; the provider's own client routes are off; what an address may be; the limits on lists; public and confidential cannot be exchanged; stopping trust takes `roles` away; deleting removes tokens and consents explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-29 | §3.10: where the Console is, who may enter and what they are shown when they may not, that each page checks for itself, and how the sections are laid out on a wide screen and on a phone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-29 | §3.10: how accounts are listed and searched, what an account's page shows, and the rules every operator action is held to by the server: capability, who may act on whom, not on oneself; what deleting removes and tells; what resetting two-factor sign-in does and does not do.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-29 | §3.10: how an invitation is made, replaced, sent, listed and cancelled; what an operator is shown when email is not set up; that the invitation link is public and shows one page for every link that does not work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-29 | §3.12, §3.15: what the instance settings page shows and who sees what, where each value comes from, what each setting accepts and refuses, how pictures are used on pages and in emails, that a missing sign-up choice never opens sign-up, and how an SVG is rebuilt rather than scanned.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-29 | §3.2.3, §3.2.1: where the owner edits the matrix and hands over ownership, that the owner has no boxes, that owner-only capabilities are listed but never offered, that the whole table is saved as it was shown, and what the hand-over page asks and shows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-29 | §3.7.3: where apps are added, changed, switched off and on, given a new secret and deleted in the Console; that a secret is shown once and only in the answer to the request that made it; that each thing wrong is shown beside its field; what each action asks and says first; and that "client" appears only in the technical settings.                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-29 | §3.8: what the launcher page holds, that only a tile's own fields reach it, search by name, the icon drawn from the name, the empty states, and that only this page may load pictures from other addresses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-29 | §3.11: what Connected apps lists and for whom, that an app asked about twice is one app, that an app an operator trusts is not listed, and what Remove access asks and says.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-29 | §3.3.6, §3.11: how a person deletes their own account (the password again, a question first, one whole step, the apps told), that the owner cannot and is told how to hand over first, and where they are sent afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-29 | §3.13.1: that the Core API is defined once, in an OpenAPI 3.1 contract; how its paths are versioned, how a call is authenticated, the one error body and its statuses; that the typed client is generated from it, and that core is tested against it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-29 | §3.13: where the branding document is, that it is public and readable from any origin, what it holds, that pictures are absolute and versioned, that one logo serves both themes, and that it is always current and revalidated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-29 | §3.9: how the Directory API is held to its words: the resource and the checks made of a token (key, type, issuer, audience, expiry, scope), what a signature cannot say (account, app, session, revocation, recorded by time), what search, resolve and by-email match and return, and how calls are counted and refused.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-29 | §3.15: how core is run: the one image (no environment baked in, a non-root process, migrations shipped, a health check), the three compose setups, the address core must be able to reach from inside its container, and the development seed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-30 | §3.5: every response carries `nosniff`, `X-Frame-Options`, a referrer policy that sends other sites an origin and never a path, a permissions policy that withholds the camera, microphone, location, payment and USB, and, over https only, `Strict-Transport-Security`; found by the Phase 1 security review.                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-30 | §3.9: how an app gets a Directory token: a token asked for with a resource is for that resource alone and carries no ID token, so an app signs in as usual and then asks for it, with its refresh token or a second authorization request; found by the acceptance suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-30 | §1.3: every signed-in page has one header (name, Apps, Account, Console, sign out) with the current part marked; the pages before sign-in show the logo or else the name; a missing address and a failed page have pages of the design system's own; going to another page is a `ButtonLink`. Found by looking at every screen.                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-30 | §1.3: the pages before sign-in and the pages that stand alone are one centred card with the instance's mark (its logo, or its initial), titled for the instance on sign-in; labels above the boxes with no asterisk; the password asked twice at sign-up and reset; the second step as one box for each digit, with a passkey offered instead; a person who has signed out is told so. Matches the established Sovereign sign-in pages.                                                                                                                                                                                                                                                                                       |
| 2026-10-30 | §1.3: the typeface is Hanken Grotesk, shipped by the design system and served by core itself, with the stated fallback stack; no component or page may name another family, and the design-token check enforces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-30 | §1.3: the header has the instance's mark (larger than on the sign-in pages) and name on the left and the person's avatar on the right, whose menu holds their account, the Console for an operator, and sign out; until an operator sets a favicon an instance has the Sovereign one, served with no session.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-30 | §1.3, §3.5: core installs as an app (a public manifest naming the instance, the Sovereign icons, how a page meets a device's screen), and what its service worker may keep (only files that are the same for everyone, on an allow-list, never a page), with the offline page it builds itself. The outcome of RFC 0001.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-30 | §3.5: how the service worker is held to its words: the allow-list (built files and icons, a `GET`, no query string, no `Authorization` header), one bounded versioned cache, no handler for anything else, the offline page it builds itself with a policy of its own, and the policy's `worker-src`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-30 | §1.3, §3.12, §3.15: an operator may set an app icon, and one for masking, which an installed core and an iPhone's home screen take in place of the Sovereign mark: a square PNG, 512 to 1024 pixels, kept as it is (ADR 0001: supplied, not generated).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-30 | §3.11, §1.3: Preferences gain Appearance, a choice of light, dark or the system's for core on this device, applied as it is chosen and kept in the browser only; the system's is the default and is followed as it changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-30 | §3.15: the image is published to the GitHub Container Registry for `linux/amd64` and `linux/arm64` from a `vX.Y.Z` tag on `main`, once the full CI passes on that commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-30 | §3.5: session cookies are host-only (`__Host-`) over https when no cookie domain is set, so an app on a subdomain cannot plant a cookie core reads as its own; with a cookie domain they are `__Secure-` and shared; the proxy looks for the one name the instance sets; the names are decided in `src/auth/cookies.ts`. §3.15: the cookie domain's row says to leave it unset when apps run on subdomains.                                                                                                                                                                                                                                                                                                                   |
| 2026-10-30 | §3.7.3, §3.7.4: `sovereign-admin` in the image, a managed key on clients, and a system actor for the registry, from RFC 0002. §3.15: the image ships it. §3.16: the operator CLI, not core, provisions apps' databases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-30 | §3.6.1, §3.6.6, §3.7.1, §3.13.1: app tokens, with the client-credentials grant, for an app acting with no person present. §3.13: the instance document says what this core serves. Both are built; no capability uses an app scope yet (§4.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-30 | §3.6.1: a confidential client authenticates with HTTP Basic only, and a secret in the body is refused although discovery lists it (research 0002).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-30 | §3.6.1, §3.6.2, §3.7.1: three compatibility settings from research 0002: a confidential app's secret in the request body, an ID-token algorithm of RS256 for chosen apps, and ignoring a scope core does not offer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-30 | §3.7.4: `sovereign-admin` is built: the managed key, kept in a table of its own, the system actor, the output and the exit codes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-30 | §3.13: the instance document says what this core serves, as `api` (`versions`, `capabilities`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-30 | §4.1: notifications for apps, specified: what one is, who may send (an app acting for itself, only to someone who has used it, and a send core drops answers like one it delivered), what a person controls, the panel, the operations, the limits, and what is left out (push, email, threads). §2 and §3.6.6 updated to match. Not built.                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-30 | §3.6.1, §3.6.6, §3.7.1: app tokens are built. The grant is offered to an app that holds an app scope, the Console and `sovereign-admin` give them, the token's subject is the app, and the Core API checks it separately from a person's (`authenticateApp`). Rotating the secret and switching the app off end its tokens by recording the time (`app_token_revocations`); taking a scope away stops it at once.                                                                                                                                                                                                                                                                                                             |
| 2026-10-30 | §4.1: notifications are built: the service and its tables, the six Core API operations (the instance document lists `notifications`), the person scope `notifications`, the bell and panel, the Preferences switches, and what Remove access, deleting an app and deleting an account take with them.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-30 | §4.2: mail for apps, specified: a plain-text message by `sub` through the instance's own mail, only from an app with `email:send` to a person who has used it, dropped without a trace when it may not go, no delivery reports, a switch for each app in Preferences, limits, and no mail when the instance has none. Not built.                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-30 | §4.3, §4.4: activity (a person's own record of what apps did, recorded only by an app acting for itself, readable only by the person) and backups (core makes none of its own; `sv backup` is the one; a restore records a time before which sessions and tokens are refused) are specified. Not built.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-31 | §4.2: mail for apps is built: the service and its two small tables, `sendEmail` served (the instance document lists `email` only while the instance can send mail, and the operation is a `404` without it), the app scope `email:send`, the mailer's app-message template and `List-Unsubscribe` header, the Preferences switches, and what Remove access, deleting an app and deleting an account take with them. The address is read only when a send is made and never leaves core.                                                                                                                                                                                                                                       |
| 2026-10-31 | §4.3: activity is built: the service and its table, `logActivity` served (the instance document lists `activity`), the app scope `activity:write`, core's Activity page (all apps or one, delete one, one app's or all), and what Remove access, deleting an app and deleting an account take with them. Only the person reads it: no operator page, no call for an app.                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-31 | §4.4, §3.7.4: the restore marker is built: `sovereign-admin instance restored` records `restored_at`, ends every session and every token the provider keeps a row for, and the Core API refuses any signed access token or app token issued before it. The marker only moves forward.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-31 | §4.5, §3.3, §3.7.1, §4.4, §2: account deletion is specified: each app the person used that has an account-deleted address is sent a signed notice, kept in a table written by the deletion's own transaction and retried (1 minute up to 24 hours, for 30 days) until the app answers `2xx`; an operator sees what is not delivered, with eight characters of the `sub`; `sv restore` carries deletions across a restore. Not built.                                                                                                                                                                                                                                                                                          |
| 2026-10-31 | §4.5, §3.7.1, §3.7.4: the notices are recorded: an app can be given an account-deleted address (the Console, `sovereign-admin apps ensure --account-deleted`), and deleting an account, a person's own or an operator's, writes a notice in its transaction for each app the person used that has one. A notice is not sent yet.                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-31 | §4.5, §3.10: account-deletion notices are sent: each is tried at once after the deletion and again from the table on the schedule, with a lease so two instances do not send it twice, until the app answers `2xx` or the 30 days end; the Console's Deletions page lists those not delivered and lets an operator mark one done. Only the restore commands remain.                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-31 | §4.5: deletions across a restore are built: every deletion is written to `deleted_accounts` (90 days), `sovereign-admin instance deletions export` and `apply` carry them across a restore, deleting a brought-back account again and making its apps' notices, once for a given export. `sv` calls them with `sv restore` (task 13.8).                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-01 | §3.15.1: `SV_ENVIRONMENT`, and a seed for development and staging instances (accounts, a sample app, passwords by environment), specified and not built: [workstream 0002](../workstreams/0002-test-instances.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-12 | §4.6: files a person keeps in core, through `@sovereignfs/storage` (RFC 0004); §3.2.2: `files:manage`, held by every role.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-12 | §4.5: `sovereign-admin instance deletions resend`, which tells one app again of the accounts deleted after its backup, for `sv restore --app`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-15 | §2: Phase 2 is built, files included (on disk only); the overview no longer says the deletion fan-out is not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-16 | §5: keys, encryption the server cannot read, specified and not built (RFC 0005, epic 16, workstream 0003): signing in with a derived value and an instance id, the vault and the recovery kit, staying unlocked, passkeys that unlock, apps that use encryption, key release and sharing, escrow, and an acceptance list; §2 and §3.16 say so.                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-16 | §5.6, §3.6.2, §3.7.1: apps that use encryption are built, with one setting where §5.6 had two: the key return address, which the `keys` scope follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-16 | §5.2, §3.3.2, §3.5: signing in with a derived value is built: core never receives a password, the policy is checked in the browser, the instance id is made at start-up (an upgraded instance says so) and read from the instance document, and `sovereign-admin accounts reset-link` makes a reset link without mail.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-17 | §5.3, §5.4: the vault and staying unlocked are built. A password change wraps the key for the new password beside the old and drops the old after, since it cannot share better-auth's transaction; a reset leaves the password's way in stale rather than depend on a hook.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-17 | §5.5: passkeys that unlock are built. Changed from the spec: the PRF input is one per instance and each passkey has its own HKDF salt instead, since a discoverable sign-in cannot be given an input per passkey; a passkey's way in names one of the person's own passkeys and is not read once the passkey is gone; the page offers to let a passkey unlock, and asks a device that gives the output only on use for one more touch.                                                                                                                                                                                                                                                                                        |
| 2026-11-17 | §5.7: key release is built: what the person sees, and the answer's format; the page sends no referrer. The kit is shown there, at the first encrypted app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-17 | §5.7: sharing is built: the two key calls in the Core API, behind their guard, `404` alike for anyone without keys for the app, and `keys` among the capabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-17 | §5.8: escrow is built, turned on in the Console by the owner; a person is told before they are covered, not covered silently at the next unlock. §5.3: unlocking with the kit, which gives the current password its way in again, built here as escrow recovery ends in it.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-17 | §5.3: the recovery kit says what escrow changes: with escrow on it is the person's own way back, and the owner can also recover their data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-17 | §1.3, §3.8: the Console is reached from its tile on the launcher, now the last tile after the apps operators added ("Add an app" is the first), and is no longer in the avatar's menu; the launcher's line no longer names the person.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-17 | §3.8: a person who may open the Console reads, at the foot of the launcher, the platform and core versions, the database, Node's version and the uptime; no one else is sent them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-17 | §3.10: every Console page but its own has one way back, to the page above it, drawn by the frame; on a wide screen only a page beneath a section has it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-17 | §3.2.2, §3.2.3: `console:access` is operator-only: never granted to `platform:user`, whatever the matrix says, so the Console, its launcher tile and the instance details line are for the owner and admins only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-11-17 | §3.8, §3.8.1: shortcuts, tiles for any site that sign nobody in: for everyone from the Console, or a person's own from Shortcuts; one dashed "Add" tile; apps and shortcuts together by name; every tile icon in greys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-18 | §1.3, §3.5: a fuller install (RFC 0001 amendment 1): the manifest's fixed `id`, launch handler, shortcuts to pages everyone has, screenshots, categories and language; an offer to install on the account pages; a new version announced with Reload instead of swapped in silently.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-11-18 | §3.8: in an installed core, a plain click on an app's tile opens it in a new window, decided when it is clicked, which a device that can hands to the installed app (RFC 0001 A5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-18 | §3.8.1: a shortcut may have an app's own address, checked against a pattern and a list of refused schemes, tried when its tile is clicked from an installed core or a phone, with the web address as the fallback (RFC 0001 A6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-11-18 | §3.3.3, §3.10: a sign-up from the link of an invitation core emailed to that address is verified by it, with no second email; core records whether an invitation's email was sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-18 | §3.6.1: an app's sign-in request is carried, as the way back to the authorization endpoint, through sign-up, email verification and a password reset, so each ends in the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-18 | §5.5: a passkey used on the second sign-in step unlocks with the same touch, as on the sign-in page, and the password's waiting secret is dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-18 | §3.3.3: a verification link that did not work is said even to someone already signed in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-18 | §3.2.1, §3.4.1: one count of wrong passwords per account wherever the password is asked again, better-auth's two-factor and change-password routes included.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-18 | §3.6.5, §3.16, §4.5: logout notices are core's alone, kept and sent again after a failure that may be temporary, for a day; an app's back-channel address moves to core's own settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-19 | §3.15.1: the lock check, a development and staging page that tries on a device what a biometric lock needs (research 0012).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-19 | §2, §3.6.2, §3.16, §3.18, §3.4.2, §5: the `notifications` scope in the table; keys said to be built and not yet audited; the one open question named; the passkey relying party stays core's host for a suite (RFC 0002).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-19 | §3.5: a session lasts seven days without use, extended daily, set in core (RFC 0006 A1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-19 | §3.2.2, §3.2.3, §3.15.1: `instance:diagnose`, owner-only; the lock check is served on production to whoever holds it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-19 | §3.6.1: a sign-in page whose app request ran out says so and starts the app's sign-in again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-19 | §3.10: an invitation link opened while signed in says so, and offers to go on or to sign out and use it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-19 | §3.5.1: the lock, per device once signed in, with a passkey checked by core on the session; a locked session gets nothing of the person, and is unlocked in place with a passkey or the password; §5.4: its secret is refused while locked (RFC 0006 part B).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-19 | §3.6.2, §3.6.5, §3.7.1: `amr` and `acr`, and a per-app setting for whether signing out of an app ends the core session (on for hosted apps), written ahead of tasks 6.6 and 6.5 (RFC 0007). Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-19 | §3.6.5, §3.7.1, §3.7.4: signing out of an app ends core's session only when the app's setting says so: on for a hosted app, off for an external one (`--keep-core-session`) and a new one in the Console. Built. §3.6.2: `claims_supported` lists only the claims core sends; `amr` and `acr` are parked.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-20 | §4.7: exports (RFC 0008, milestone 1): the owner's export of core's data, encrypted to the export recipients, and a person's export from core and every app they use, run as jobs and downloaded once; §2: export leaves "Later"; §3.2.2, §3.2.3: `instance:export`, owner-only; §3.7.1: an app's export address; §3.11: Your data; §3.12: Export recipients; §4.4: the Console offers an export, not a backup. Not built.                                                                                                                                                                                                                                                                                                    |
| 2026-11-21 | §3.8: the Console is the first tile after "Add", before the apps operators added; "Add" has a divider and the kind **new** like every other tile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
