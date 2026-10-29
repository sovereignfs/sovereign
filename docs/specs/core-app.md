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
behaviour; those define the exact shapes.

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

| Phase | Theme                                                                                    | Status            |
| ----- | ---------------------------------------------------------------------------------------- | ----------------- |
| **1** | Identity, sign-in server, app registration                                               | Specified below   |
| 2     | Core services for apps: mail, notifications, activity, account-deletion fan-out, backups | Not yet specified |
| Later | Groups and access policies, export, recovery kit, relay, and more                        | Not yet specified |

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

- Session cookies are scoped to `SV_AUTH_COOKIE_DOMAIN` when it is set, so that
  core's subdomains share them.
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
- The authorization code flow, with refresh tokens, is the only flow. PKCE with
  `S256` is **required for every client**, confidential or public; `plain` is
  not accepted. The implicit, password and client-credentials grants are not
  offered.
- Refresh tokens are issued when the client requests `offline_access`.
- Token lifetimes: access tokens 15 minutes, ID tokens 1 hour, refresh tokens
  30 days from their last use. A refresh token is rotated on every use. If a
  refresh token that has already been used is presented again, core refuses it
  and removes **every** refresh token and access token that client holds for
  that account — a person signed in to the same app on several devices is
  signed out of all of them.
- Clients are registered by operators only; dynamic client registration is
  off.
- Redirect URIs and post-logout redirect URIs match exactly.
- ID tokens are signed (EdDSA) with keys published at the JWKS endpoint. The
  signing keys rotate every 90 days; the previous key stays published for a
  30-day grace period so tokens already issued keep verifying.
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
- A client that registers a back-channel logout URI or enables end-session
  receives a `sid` claim in its ID tokens.
- Core's public URL (`SV_URL`) MUST be reachable from the core process itself,
  because checking an `id_token_hint` fetches core's own signing keys from it.

### 3.7 App registration

Operators with `client:manage` register clients in the Console.

#### 3.7.1 Client settings

| Setting                   | Notes                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client type               | Confidential (has a secret) or public (no secret). PKCE is required for both                                                                                                            |
| Redirect URIs             | One or more; exact match. Must be `https`. `http` is accepted on `localhost` and `*.localhost` only when the instance's own URL (`SV_URL`) is `http`, that is on a development instance |
| Post-logout redirect URIs | Optional; the only addresses core returns a person to after sign-out                                                                                                                    |
| Back-channel logout URI   | Optional. Core sends a signed logout notice there when a person's session ends (§3.6.5)                                                                                                 |
| End-session               | Lets the app send people to core's sign-out (§3.6.5). On automatically when a post-logout redirect URI or a back-channel logout URI is set                                              |
| Allowed scopes            | Any of §3.6.2; `roles` only when trusted                                                                                                                                                |
| Trusted                   | Off by default                                                                                                                                                                          |
| Enabled                   | On by default                                                                                                                                                                           |

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

### 3.9 Directory API

The Directory API lets an app find accounts on the instance, for example to
share something with a person.

- It is called by a client with an access token issued for a signed-in person
  and carrying the `directory` scope. To get one, the app requests its token
  with `resource` set to the Core API address (`<SV_URL>/api/v1`), which makes
  the access token a signed JWT addressed to the Core API. Core accepts a call
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

### 3.11 Identity pages

Every person manages their own account here (capability `profile:manage`).
The identity pages open as an overlay above the page the person was on, and
closing them returns there (§1.3).

| Page           | Contents                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Profile        | Name and avatar. The email address is shown but cannot be changed in Phase 1                                      |
| Security       | Change password; manage passkeys; enrol or remove TOTP and backup codes; list sessions and end any of them        |
| Preferences    | Timezone and locale                                                                                               |
| Connected apps | Apps the person has allowed, with the scopes granted; **Remove access** revokes the app's tokens as well (§3.6.4) |
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

### 3.12 Console: instance settings

| Setting                                        | Capability                   | Notes                                                                                       |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Instance name                                  | `instance:configure`         | Shown in pages and emails                                                                   |
| Logo (light and dark), favicon                 | `instance:configure`         | Used by core's pages, the launcher and emails, and published for apps (§3.13)               |
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

### 3.13 Instance branding for apps

Core publishes the instance name, logos and favicon at a well-known address so
that apps can show the same branding. The address and format are defined in
`spec/core-api/`.

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
  - SVG is accepted for logos and the favicon only, and is sanitised before it
    is stored; it is never accepted for avatars;
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

| Variable                                                                                                                             | Required        | Purpose                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SV_URL`                                                                                                                             | yes             | Core's public URL, which is also the issuer (§3.6.1). It must be reachable from the core process itself (§3.6.5)                                                                                                                               |
| `SV_AUTH_SECRET` / `_FILE`                                                                                                           | yes             | Signing secret, at least 32 characters                                                                                                                                                                                                         |
| `SV_AUTH_COOKIE_DOMAIN`                                                                                                              | no              | Parent domain for session cookies. Apps signing in through OpenID Connect do not need it; it matters only when core's own pages or passkeys are shared across subdomains                                                                       |
| `SV_AUTH_TRUSTED_ORIGINS`                                                                                                            | no              | Extra origins accepted for requests                                                                                                                                                                                                            |
| `SV_AUTH_TRUSTED_PROXIES`                                                                                                            | no              | The reverse proxies in front of core (addresses or ranges). Sign-in limits count attempts per client address, read from `X-Forwarded-For` past these; without them only a single-address header is believed and other requests share one limit |
| `SV_AUTH_INVITE_ONLY`                                                                                                                | no              | Registration policy default (§3.3.1)                                                                                                                                                                                                           |
| `SV_AUTH_REQUIRE_EMAIL_VERIFICATION`                                                                                                 | no              | Default `true` (§3.3.3)                                                                                                                                                                                                                        |
| `SV_AUTH_PASSWORD_MIN_LENGTH`, `SV_AUTH_PASSWORD_REQUIRE_*`                                                                          | no              | Password policy (§3.3.2)                                                                                                                                                                                                                       |
| `SV_AUTH_WEBAUTHN_RP_ID`, `_RP_NAME`, `_ORIGIN`                                                                                      | no              | Passkey relying party (§3.4.2)                                                                                                                                                                                                                 |
| `SV_DB_DIALECT`, `SV_SQLD_URL`, `SV_SQLD_ADMIN_URL`, `SV_SQLD_NAMESPACE`, `SV_SQLITE_URL`, `SV_POSTGRES_URL`, `SV_POSTGRES_POOL_MAX` | yes, by dialect | Database                                                                                                                                                                                                                                       |
| `SV_FIELD_ENCRYPTION_KEYS` / `_FILE`                                                                                                 | yes             | Key ring for stored secrets: `id:key` entries, newest first (`spec/env.md`)                                                                                                                                                                    |
| `SV_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD` / `_PASSWORD_FILE`, `_FROM`                                                            | no              | Mail defaults (§3.12)                                                                                                                                                                                                                          |

Database variables name the engine (`SV_POSTGRES_URL`, `SV_SQLD_URL`,
`SV_SQLITE_URL`), not the component.

### 3.16 Not in Phase 1

Groups and per-app access policies; per-account capability grants;
verification levels; retrying a failed back-channel logout notice; social
sign-in; changing
an email address; editable email templates; theme presets, colours and text
size preferences; mail, notification and activity APIs for apps; account
deletion and export across apps; backups; end-to-end encryption and the
recovery kit; push relay; built-in clients for native shells; provisioning
databases for apps.

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
