# Sovereign Core — app specification

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
[`spec/core-api/`](../../spec/core-api/), and the environment variable
convention is in [`spec/env.md`](../../spec/env.md). This document describes
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
  their initials), which opens a menu with who they are, their account, the
  Console for an operator, and sign out. No page is a dead end, and none repeats
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
  other origins and open outside the window), `standalone` display, the page
  colour of the light theme, and the Sovereign mark as 192 and 512 pixel icons
  and a maskable one (`/icons/icon-192.png`, `/icons/icon-512.png`,
  `/icons/icon-maskable-512.png`, served with no session), or the operator's own
  app icons when they have set them (§3.12). Every page tells a
  device how to meet its screen: it runs to the edges (`viewport-fit: cover`),
  what matters stays clear of a notch and a home bar by the safe-area insets, the
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

| Phase | Theme                                                                                    | Status                            |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| **1** | Identity, sign-in server, app registration                                               | Specified below                   |
| 2     | Core services for apps: mail, notifications, activity, account-deletion fan-out, backups | Specified (§4); fan-out not built |
| Later | Groups and access policies, export, recovery kit, relay, and more                        | Not yet specified                 |

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
  the ten minutes have passed. A right answer clears the count. (better-auth's
  own rate limit guards its HTTP routes and does not see this server-side check.)
- A role that is not one of these holds no capability. A person's role is read
  from the database for what core guards, so a change shows at once.

#### 3.2.2 Capabilities

Capabilities are the unit every check uses. Roles are only named bundles of
them.

| Capability                   | Allows                                                     | Default roles      |
| ---------------------------- | ---------------------------------------------------------- | ------------------ |
| `profile:manage`             | Edit one's own profile, credentials and preferences        | user, admin, owner |
| `launcher:access`            | Use the launcher                                           | user, admin, owner |
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

#### 3.2.3 The capability matrix

- The set of capabilities and the default matrix are defined in code.
- The owner MAY edit the `platform:admin` and `platform:user` rows in the
  Console. The owner's row is fixed: the owner always holds every capability.
- Owner-only capabilities (`instance:configure-secrets`, `role:assign`,
  `capability:configure`, `ownership:transfer`) MUST NOT be granted to any
  other role.
- A change to the matrix MUST reach accounts that are already signed in within
  the session cookie cache lifetime (§3.5).
- The owner's edits are stored as differences from the default, for the admin
  and user rows only, and nothing else can be stored: the owner's row, a role
  or capability that does not exist, and an owner-only capability are refused,
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
  listed with no boxes, marked "Only the owner". Nothing is saved until the owner
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
  `…_REQUIRE_LOWERCASE`, `…_REQUIRE_NUMBER` and `…_REQUIRE_SYMBOL`. The server
  enforces the policy; the page only explains it.
- The server enforces the policy on every path that stores a password: sign-up,
  reset, change, and a server-side set. A password that breaks it is refused with
  the reason (`PASSWORD_DOES_NOT_MEET_POLICY`) and nothing is stored. The longest
  password is 128 characters.
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
- The verification link is single-use, expires after one hour, and signs the
  person in when followed. Following it a second time opens no session. A new
  link can be requested.
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
- Enabling, disabling and regenerating backup codes require the password again.
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
  and `SV_AUTH_WEBAUTHN_ORIGIN`. When core and its apps share a parent domain,
  the relying party ID SHOULD be that parent domain. Unset, they are core's own
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
  start so a change is live on the next visit, and registers only in production
  over https (or `localhost`). Nothing signed-in works offline.
- Requests are accepted only from core's own origin and the origins in
  `SV_AUTH_TRUSTED_ORIGINS`.
- `SV_AUTH_SECRET` is required (at least 32 characters, or read from
  `SV_AUTH_SECRET_FILE`); the server MUST NOT start without it.
- A health endpoint reports whether core and its database are up, and nothing
  else.

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
  back with `prompt=login` is shown the form.
- Signing keys are stored with their private half encrypted by better-auth with
  `SV_AUTH_SECRET`, so changing it makes the stored keys unreadable and new ones
  must be made (open point, like the authenticator keys in §3.4.1).
- Not offered in Phase 1: cross-origin requests from a browser to the token and
  userinfo endpoints (CORS), which a single-page app calling them directly
  would need.

#### 3.6.2 Scopes and claims

| Scope            | Claims or access                                                     |
| ---------------- | -------------------------------------------------------------------- |
| `openid`         | `sub`: stable, unique, never reused                                  |
| `profile`        | `name`, `picture`, `locale`, `zoneinfo`                              |
| `email`          | `email`, `email_verified`                                            |
| `roles`          | `roles`: the account's platform roles. Trusted clients only (§3.6.4) |
| `directory`      | Access to the Directory API (§3.9)                                   |
| `offline_access` | A refresh token                                                      |

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
- **Back-channel logout.** When a person's core session ends — they sign out of
  core, they end a session in their identity pages, an operator ends it, or the
  account is deactivated — core revokes the access tokens of that session and
  sends a signed _logout token_ (OpenID Connect Back-Channel Logout, carrying
  the `sub` and the session id `sid`) to the back-channel logout URI of every
  client that session was used with. A notice that fails is logged and not
  retried, so an app must also treat its own session as ending when its access
  tokens stop working.
- When the session ended by deactivation, core tells the apps once the
  deactivation has been committed: it reads which apps held tokens in each
  session before deleting the sessions, since deleting a session clears that
  link. A person ending a session in their identity pages, or all the others,
  goes through the same route as signing out, so the same notices and
  revocations follow.
- The logout token is a JWT signed with the key that signs ID tokens, typed
  `logout+jwt`, carrying `iss`, `aud`, `sub`, `sid`, `iat`, an `exp` two minutes
  on, a `jti` and the back-channel logout event, and no `nonce`. It is sent once,
  within five seconds, and a redirect is not followed.
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
| Secret                    | Confidential apps only. Sent in a header (HTTP Basic; the default) or in the request body (§3.6.1). A public app has none. Changing it needs the app reconfigured.                      |
| Token signature           | How ID tokens are signed: EdDSA (the default) or RS256, for an app that cannot verify EdDSA (§3.6.1). Either client type may choose it.                                                 |
| Allowed scopes            | Any of §3.6.2; `roles` only when trusted                                                                                                                                                |
| Trusted                   | Off by default                                                                                                                                                                          |
| Enabled                   | On by default                                                                                                                                                                           |
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
                [--back-channel URL] [--scope SCOPE ...] [--public] [--trusted]
                [--launch-url URL] [--description TEXT] [--icon URL] [--json]
sovereign-admin apps list [--json]
sovereign-admin apps rotate-secret KEY [--json]
sovereign-admin apps remove KEY
sovereign-admin instance restored [--json]
```

- **It goes through the registry.** Every rule of §3.7 applies, with the same
  refusals, and it adds no second way to write a client. (`instance restored` writes
  no client: it records a restore, §4.4.)
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
message`) and 2 when the command line is wrong or core is not configured. A
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
- It lists every enabled client with "show in launcher" on: icon, name and
  description, with search by name.
- Choosing an app opens its launch URL in the same tab, as an ordinary link,
  so a person can still open it in a new tab themselves. The app then signs
  the person in through core; because the person already has a session, this
  completes without a prompt unless consent is needed.
- In Phase 1 every signed-in person sees every listed app. **The launcher is
  not access control:** an app that should be restricted decides that itself,
  for example from the `roles` claim.
- The page has the instance's name and logo, a way to each of the person's
  own account pages (and the Console, for an operator), and one tile for each
  app: a link, so it works with the keyboard and opens in a new tab on request.
  Search matches the app's name, whatever the case, and says so when nothing
  matches. An app with no launch address has nothing to open and is not listed.
  A person without `launcher:access` sees no apps and is told so, with their
  account links.
- A tile's icon is the address an operator gave, or a drawn one from the name
  when there is none or it will not load. Only this page may load pictures from
  other addresses (`https`, and `http` on `localhost` on a development
  instance); every other page keeps to core's own, since a picture cannot run
  script but should still not be loadable from anywhere.
- With no apps, an operator who may add apps is offered to add the first one,
  and anyone else is told to ask whoever runs the instance.
- Only the fields of a tile leave the server for the launcher: name,
  description, icon address and launch address. It is a read of what the person
  is meant to see and is not the registry, which needs `client:manage` (§3.7.3).

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

How it is held to those words (the contract is `spec/core-api/openapi.yaml`,
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
shown the link to pass on, with a way to copy it. The Console lists the
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
own page lists them and every other page has a way back to it. A section is
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
| Connected apps | Apps the person has allowed, with the scopes granted; **Remove access** revokes the app's tokens as well (§3.6.4) |
| Activity       | What apps noted they did for the person, newest first, by app; delete one, an app's or all (§4.3)                 |
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

| Setting                                        | Capability                   | Notes                                                                                       |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Instance name                                  | `instance:configure`         | Shown in pages and emails                                                                   |
| Logo (light and dark), favicon                 | `instance:configure`         | Used by core's pages, the launcher and emails, and published for apps (§3.13)               |
| App icon, and one for masking (optional)       | `instance:configure`         | The icon an installed core takes (§1.3); the Sovereign mark until one is set                |
| Invite-only                                    | `instance:configure`         | Overrides `SV_AUTH_INVITE_ONLY` (§3.3.1)                                                    |
| SMTP: host, port, user, from address, password | `instance:configure-secrets` | Overrides the `SV_SMTP_*` variables; the password is stored encrypted and never shown again |

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
`spec/core-api/`.

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

What an app may call on core is defined once, in `spec/core-api/openapi.yaml`
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
  override - are in [`spec/env.md`](../../spec/env.md):

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
| `SV_FIELD_ENCRYPTION_KEYS` / `_FILE`                                                                                                 | yes             | Key ring for stored secrets: `id:key` entries, newest first (`spec/env.md`)                                                                                                                                                                                                |
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
  chooses sqld, and `pnpm seed` makes an owner, an admin and an ordinary person
  to try it with. The seed refuses any address that is not on the machine it
  runs on.

### 3.16 Not in Phase 1

Groups and per-app access policies; per-account capability grants;
verification levels; retrying a failed back-channel logout notice; social
sign-in; changing
an email address; editable email templates; theme presets, colours and text
size preferences (a choice of light, dark or the system's is in Preferences, §3.11); mail, notification and activity APIs for apps; account
deletion and export across apps; backups; end-to-end encryption and the
recovery kit; push relay; built-in clients for native shells; provisioning
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

None. The questions raised while drafting Phase 1 are answered in §3.6.1
(token lifetimes), §3.7.3 (secret rotation), §3.8 (how the launcher opens
apps) and §3.15 (image storage, secrets from files).

---

## 4. Phase 2 — Core services for apps

Phase 2 is what core offers an app beyond signing people in. Each service is specified here before it is built, and its operations
are added to the contract (`spec/core-api/openapi.yaml`) marked `x-planned` until they are served (§3.13.1). Telling apps that an account
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

**The operations** (`spec/core-api/openapi.yaml`, all `x-planned`):

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

**The operation** (`spec/core-api/openapi.yaml`, `x-planned`):

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

**The operation** (`spec/core-api/openapi.yaml`, `x-planned`):

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
- **Core's Console shows nothing about backups.** An operator who wants to know the state of them asks `sv`.

### 4.5 Account deletion: telling the apps

Specified; not built. When a person deletes their account, each app that holds something of theirs is told, so that it can delete it. This
runs from core to an app, unlike every other service in this phase, and it is the one place where an app being down must not lose
something: a person who deleted their account must not find their data still held by an app because it was restarting that day.

**Who is told.** Every app with an account-deleted address (§3.7.1) that the person had **used**: a consent, an access token or a
refresh token of theirs, revoked or not, in the same sense as §4.1. Core reads that list inside the deletion's own transaction, before
the same transaction deletes the consents and tokens, since afterwards nothing says which apps they were. An app without an
account-deleted address is not told, and is as it was before: it has its back-channel logout at most. An operator deleting an account
(§3.3, §3.11) and a person deleting their own go through the same transaction and so the same notices. Deactivating an account is not
deleting it, and tells no one.

**What is kept so that it is not lost.** One row for each notice, written in the deletion's transaction: the app, the person's `sub`,
when the account was deleted, and where the notice stands (`pending`, `delivered`, `given_up` or `resolved`), with the number of
attempts, when the next is due and the kind of the last failure (never a response body). A notice is not tied to the account, which is
gone, and the `sub` is never reused (§3.3). A delivered notice is kept for 90 days after delivery, which is how far back a restore is
expected to reach (below), and then deleted with its `sub`. Deleting an app deletes its notices.

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

**After a restore.** A restore returns the database to the time of the backup, deleted accounts and the list of notices with it, so the
list cannot be what remembers a deletion made after the backup. `sv restore` therefore asks the running core for its deletions
before it restores (`sovereign-admin instance deletions export`: each deleted account's `sub`, when it was deleted and the apps it had
used) and, once the database is back and the restore marker is recorded (§4.4), gives them to the restored core
(`sovereign-admin instance deletions apply`). Core deletes any of those accounts the restored database brought back, the way an
operator's deletion would, and makes a notice for each app of each of them again, whether or not that app was told before. Apps are
told again for the reason a restore ends sessions: what was done is not undone by going back. An account the restored database does not
have is not made again, and its apps are still told. The file holds `sub`s and nothing else about a person, is made for this and
removed after it, and is never written outside the server's own state. **A server that is lost before its deletions can be exported
cannot remember them**: a person deleted after the last backup reappears when the backup is restored on a new machine, and the
operator's guide says so.

**Decided here, so that it can be built.**

- **Its own address, not the back-channel logout address.** The two make different promises: a logout notice says a session ended and is
  sent once; this one says to delete what is held and is sent until it is answered. An app that wants only one has only one.
- **No acknowledgement of what was deleted.** Core asks for the app's word that it is done and takes nothing more, because anything more
  would be a way for an app to be asked about a person.
- **No retry of the logout notice.** §3.6.5 stands: a logout notice is sent once. Only this one is kept.
- **Not an export.** What a person may take with them is the "Later" row (§2), and the SDK's legacy `portability` waits for it.

---

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-26 | First draft: principles, terminology, phase overview, Phase 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-26 | Added §1.3 (pages built from `@sovereignfs/ui`); the owner chooses their role when transferring ownership; environment variable names marked provisional, with database variables named by engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-26 | Answered the open questions: token lifetimes and refresh rotation (§3.6.1), secret rotation choice (§3.7.3), launcher opens apps in the same tab (§3.8), images stored in the database and `_FILE` for every secret (§3.15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-26 | §1.3: core's UI follows the established Sovereign UI page by page; §3.11: identity pages open as an overlay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-27 | Applied research 0001 (better-auth's OAuth provider): issuer is the instance URL with discovery at the root, PKCE required for every client, signing-key rotation, reuse detection removes all of a client's tokens for the account (§3.6.1); claims in the ID token as well as userinfo (§3.6.2); deactivation and deletion revoke every token including `offline_access` (§3.3.6, §3.6.3); Remove access revokes tokens (§3.6.4, §3.11); new §3.6.5 on sign-out and back-channel logout, now in Phase 1 (§3.16); redirect URI rule with development `http` (§3.7.1); secret rotation is immediate (§3.7.3); Directory API tokens are resource-scoped JWTs with a revocation check (§3.9); acceptance criteria 7–12 (§3.17). |
| 2026-10-27 | §3.15: the environment variable names are no longer provisional; the rules they follow are in `spec/env.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-27 | §3.15: added `SV_SQLD_NAMESPACE` (the sqld namespace core uses, default `default`, so apps can share one sqld server) and `SV_POSTGRES_POOL_MAX`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-27 | §3.15: the format of `SV_FIELD_ENCRYPTION_KEYS` is a key ring of `id:key` entries, newest first, in `spec/env.md`; rotation puts a new key in front and keeps the old ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
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
