# Research 0011 — Streamlining sign-in across core and its apps

|            |                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | For review                                                                                                                                                                    |
| **Date**   | November 2026                                                                                                                                                                 |
| **Author** | Claude Code                                                                                                                                                                   |
| **Scope**  | `docs/specs/core-app.md` §3.3–§3.7, §3.16; `docs/specs/sdk.md` §9; `contracts/app-manifest.md` §2.1; `docs/building-an-app.md` §6; `apps/core/app/(auth)`; `packages/sdk/src` |

---

## Question

Signing in works: every Phase 1 acceptance item passes, and the rules in `AGENTS.md` hold. But the way
a person moves through it, between core's own pages and between core and its apps, has rough edges.
Some paths drop what the person was doing. Some steps ask for a proof the person has already given.
Sessions in core and in apps don't line up. Where does the flow lose people or ask too much, which
of those are bugs and which are design, and what should be changed, in what order?

## Method

The code on `develop` was read end to end: core's sign-in pages and forms (`apps/core/app/(auth)`),
better-auth's configuration and hooks (`apps/core/src/auth`), the OIDC provider (`apps/core/src/oauth`),
the client registry, the SDK (`packages/sdk/src/auth.ts`, `tokens.ts`, `next/`), the app template
(`tools/create/template/app`) and the `sv` code that registers apps. The specs and guides were read for
what they promise. The most consequential findings were checked again in the source.

**Not verified:** nothing here was run in a browser. What a person sees is inferred from the code. The
behaviour of installed web apps on iPhone (separate cookies per installed app) is from platform
documentation, not tested.

## How it works today

- **Core** holds the only identity session: better-auth, a host-only `__Host-` cookie, read from the
  database on every request (no cookie cache). The proxy sends anyone without the cookie to `/sign-in`
  with a `303`; each protected page then checks the session itself.
- **Signing in** derives a sign-in value in the browser (§5.2), then either opens a session or hands
  over to `/sign-in/two-factor`. A passkey replaces both steps. An app's authorization request travels
  as a signed query (`sig`) that `oauthProviderClient` sends with every sign-in call, and
  `continuationUrl` takes the person back to the app.
- **Apps** are OIDC clients registered by `sv apply` from the manifest's `signIn` section. Hosted apps
  are trusted and skip consent. The SDK's `nextAuth()` mounts
  `/auth/{login,callback,logout,backchannel-logout,account-deleted,key-secret}`, keeps its own session
  (30 days, fixed), and `getSession` never asks core.
- **Single sign-on** is a redirect: an app with no session sends the person to core, core has its
  cookie and hands back a code, about four hops the person doesn't see.
- **Single logout** is a back-channel notice to each app that registered an address for it, sent once.

## Findings

### A. Paths that lose the app's request

An app's authorization request is carried by `sig` on `/sign-in` and `/sign-in/two-factor` only.
Every other page loses it, and the person ends up on core's launcher instead of back in the app:

- **"Create account"** links to `/sign-up?returnTo=…` (`app/(auth)/sign-in/sign-in-form.tsx:209`).
  When an app sent the person, `returnTo` is `/` and `sig` is not passed.
- **"Forgot password?"** links to `/forgot-password` with nothing (`:159`). After the reset the person
  is sent to `/sign-in?reset=1`.
- **Email not verified** mid-authorize: resend uses `afterVerification(returnTo)`, which is `/sign-in`.
- **An invitation link** redirects to `/sign-up?invite=<id>` and drops any `returnTo`.

A new person arriving from an app is the one most likely to take these paths, so the people who most
need a smooth first sign-in get the worst one.

### B. Steps that ask for what is already proven

- **An invited person verifies their email twice.** The invitation is emailed to the address with an
  unguessable link (§3.10). Signing up from it then sends a second email to the same address to prove
  the same thing. The reason it can't be skipped today: the invite id from the link never reaches the
  server. `app/(auth)/sign-up/page.tsx` uses it only to fill in and lock the address field, and the
  `user.create.before` hook asks `hasValidInvite(database, user.email)`, by address
  (`apps/core/src/auth/auth.ts:194-201`). An address-only check proves nothing about the mailbox:
  anyone who knows an invited address could sign up without the link.
- **The verification link stops at `/sign-in`.** `afterVerification` sends the verified person to
  `/sign-in`, which sees the new session and redirects on. It could go to the destination directly.
  If a session already exists, an expired link's error is never shown, because the page redirects
  before it reads `error`.

### C. Inconsistencies within core

- **A passkey on `/sign-in/two-factor` doesn't unlock the person's keys.**
  `two-factor-form.tsx:68-78` calls `signIn.passkey()` without the PRF extension and without
  `afterPasskeyAccepted` or `afterSecondStep`; the same passkey on `/sign-in` does all three. The keys
  stay locked and the password secret handed over by the first step is left behind.
- **A session opened by the verification link sets up no keys**, since `afterPasswordAccepted` never
  runs. They are set up at the next password sign-in.
- **Sign-out's result is not checked** (`app/account-menu.tsx`). If it fails, the session lives on and
  `/sign-in?signedout=1` silently redirects to `/`.
- **The page guard is hand-written about fifteen times**, each a `getSession()` and a Next
  `redirect()` (307, relative) with its own `returnTo`, while the proxy uses a 303 to an absolute
  address. The `sig`-or-session check is also copied between `/sign-in` and `/sign-in/two-factor`.
- **Two ways of asking for the password again**: `confirmPassword` (account deletion, ownership
  transfer), which counts wrong answers, and better-auth's own check (turning two-factor on or off),
  which doesn't count them the same way.
- **Duplicated form logic**: sign-up and reset share policy, confirmation, derivation and error
  messages by copy; the reset page and its form each have an expired-link card.
- **Leftovers from the cookie cache**: a docstring at `auth.ts:108` still describes a 300-second
  cache; `disableCookieCache` in `session.ts` and `sessionCacheCookieNames` in `cookies.ts` guard
  against a cache that is off.
- **Logout tokens have two senders**: the provider plugin's session-delete hook (sign-out, ending a
  session) and core's `src/oauth/logout.ts` (deactivation, deletion). Two implementations can drift.

### D. Core and app sessions don't line up

- **Lifetimes differ.** Core's session is better-auth's default of 7 days (`session` in `auth.ts` sets
  no `expiresIn` or `updateAge`). An app's session is a fixed 30 days
  (`DEFAULT_SESSION_SECONDS`, `packages/sdk/src/auth.ts:20`) and never checked against core.
- **Expiry is silent.** When a core session expires, no row is deleted, so no logout notice is sent;
  every app stays signed in until its own 30 days pass.
- **Single logout is best-effort.** Each notice is sent once with a 5-second timeout and never retried
  (§3.6.5; retrying is listed in §3.16 as out of Phase 1). An app that missed it stays signed in.
- **A logout notice leaves the refresh token.** `handleBackChannelLogout` deletes sessions but not the
  stored refresh token; only `handleAccountDeleted` does. The template asks for `offline_access`, so
  the app can still call core as the person (allowed by §3.6.3, but rarely what's meant).
- **A refresh that fails doesn't end the app session.** `SessionEndedError` is thrown and the
  template doesn't handle it; the person stays "signed in" to an app that can no longer act for them.
- **Claims go stale.** Name, email and `roles` are copied from the ID token at sign-in and kept for the
  life of the app session. A role change in the Console doesn't reach an app for up to 30 days.
- **The logout `jti` replay check** writes `seen:<jti>` and deletes sessions as two steps after
  verification; two concurrent deliveries of one notice both pass. Harmless today (deleting twice is
  idempotent) but not what the rule in `AGENTS.md` describes.

### E. What apps can't ask for

The provider supports `prompt=none`, `prompt=login` and `max_age`; the SDK sends none of them.

- **No silent renewal.** An expired app session is always a full top-level redirect.
- **No step-up.** `acr` is always `"0"`, there is no `amr`, and the SDK can't send `max_age`, so an app
  can't ask "has this person signed in in the last five minutes" or "with a second factor".
- **No account switching.** `select_account` is refused; there is no account picker.
- **RS256 apps can't verify logout tokens**, which are always EdDSA (§3.6.1).

### F. Paths and scopes kept in step by hand

An app's auth addresses live in three places that must agree: the manifest's `signIn` paths,
`createSovereign`'s defaults and `nextAuth`'s `basePath`. The scopes are listed in the manifest and
again in the SDK's options. The docs show three conventions: the SDK's `/auth/callback`, the manifest
example's `/api/auth/callback/sovereign` (`contracts/app-manifest.md` §2), and Tusk's
`/api/sovereign/backchannel-logout` (`docs/building-an-app.md` §3). `building-an-app.md` §6 lists four
routes and omits `account-deleted` and `key-secret`.

### G. Installed web apps and native apps

Nothing is designed. On iPhone each installed web app keeps its own cookies, so each signs in to core
again and core's session in Safari doesn't help. A native app has no valid redirect: §3.7.1 allows
`https` only (`http` loopback on development instances), yet `docs/connecting-an-app.md` lists "a
native app" as a supported client. §3.16 defers built-in clients for native shells.

### H. Documentation drift found on the way

- §3.6.2's scope table has no `notifications`, which `OAUTH_SCOPES`, §4.1 and the contract use.
- Encryption is "specified, not built" in §2, the §5 introduction and §3.16, and "Built" in §5.2–§5.8.
- §3.18 says there are no open questions; §3.6.1 names the `SV_AUTH_SECRET` signing-key point as open.
- `contracts/env.md` §7's example declares `AUTH_INVITE_ONLY` with `default: false`, against §3.3.1.
- §3.4.2 and §3.5 describe a shared parent domain for passkeys and cookies; RFC 0002 forbids it.
- `contracts/suite.md`'s external-app table lacks the account-deleted and key-return fields the
  Console and `sovereign-admin` support.

## Options

### 1. Carrying the app's request

- **a. Pass `sig` along by hand** on each link and form (sign-up, forgot, reset, resend, invite).
  Smallest change, but every new page must remember it, and the reset email's link must carry it.
- **b. One continuation helper**: a single `continuation` value (either a safe `returnTo` or the
  signed query) that every auth page reads and every auth link writes, through one function. Emails
  (verification, reset) carry it in their callback address. The signed query has its own expiry, so a
  continuation that has expired falls back to `/` with a message saying the app's sign-in must start
  again.
- **c. Keep it server-side**: store the pending request under a short-lived cookie when `/sign-in` is
  first reached, and resume it after any path that ends in a session. Survives email round trips
  without putting it in the link, but adds state and has to be cleared carefully.

### 2. Invitation and verification

- **a. Skip verification when the sign-up presents the invite.** The form sends the invite id;
  the create hook checks id, address and expiry together, uses the invite in the same transaction, and
  marks the email verified. An invite whose email was never sent (mail off, or sending failed, so the
  operator passed the link on by hand) is either still verified (the operator vouched) or not, which
  needs a recorded `sent` on the invite to tell apart.
- **b. Keep verification, but make it one click**: the verification email lands the person straight
  in the app they came from. Keeps the rule simple; still two emails.

### 3. Lining up sessions

- **a. Set core's lifetime and match the SDK's default to it.** Explicit `expiresIn` and `updateAge`
  in core; the SDK's default session no longer than core's. Simple; still no link between the two.
- **b. Short app session, renewed silently.** The app session lasts, say, an hour; when it ends the
  SDK sends `prompt=none`. If core still has a session, the person never notices and the claims are
  fresh; if not, the app gets `login_required` and asks the person to sign in. Ties every app to
  core's session without polling, and fixes stale claims and missed logouts within the hour. Costs one
  invisible round trip per app per hour.
- **c. Check on refresh.** Apps that hold a refresh token renew the access token every 15 minutes;
  core could refuse a refresh when the person has no live session (a stricter reading of
  `offline_access`). Only covers apps that refresh.

### 4. Dependable single logout

Retry notices from a small queue (§3.16 already names this), have the SDK delete the refresh token on
a logout notice, treat `SessionEndedError` as sign-out in `requireSession`, and make one sender of
logout tokens.

### 5. One source for an app's auth settings

- **a. The SDK reads the manifest**: `createSovereign` takes paths and scopes from
  `sovereign.manifest.json`, so there is one place to change them. The docs settle on `/auth/*`.
- **b. Fix the docs only** and keep the duplication.

## Recommendation

In this order:

1. **Fix the bugs now, as tasks, without waiting for an RFC**: the passkey on the second-step page
   (C), checking sign-out's result (C), and the cookie-cache leftovers. Each is small and has an
   obvious right answer.
2. **Invitation (option 2a), as its own task.** It removes a step for every invited person, and
   doing it properly (the id reaches the server) also closes the address-only check. Recommend: an
   invite delivered by email marks the address verified; one passed on by hand keeps verification,
   and the invite records whether it was sent. Changes core-app §3.3.1 and §3.3.3.
3. **An RFC for the core flow (option 1b)**: one continuation carried through every auth page and
   email, one page guard (`requireSignedIn`), and the shared password-form logic. Include the
   verification link going straight to the destination and setting up keys.
4. **An RFC for sessions across apps (options 3a + 3b, and 4)**: core's lifetime set explicitly; the
   SDK's session short and renewed with `prompt=none`; dependable logout; claims refreshed on renewal.
   This is a change to `@sovereignfs/sdk`'s contract, so it needs a version and an upgrade note.
5. **SDK and manifest (option 5a)** alongside 4, then one pass over the docs in H.
6. **Not now**: step-up (`acr`/`amr`), account switching, and installed or native sign-in. Each needs
   its own research; step-up first, since it is what an app holding someone's encrypted data will
   ask for.

## Open questions

- For an invite whose email failed to send, does the operator's hand-over count as verification?
- How short can an app session be before the `prompt=none` round trips are noticeable, and what does
  an app do with `login_required` in the middle of a form?
- Should core refuse a refresh once the person's core session has ended (option 3c), or is
  `offline_access` meant to outlive it?
