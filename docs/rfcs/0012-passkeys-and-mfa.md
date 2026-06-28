# RFC 0012 — Passkeys & TOTP multi-factor auth

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `apps/auth` (better-auth plugins + login flow), runtime middleware & `/api/verify`, `plugins/account` (Security tab), `bin/sv` (break-glass), Console admin API, `packages/sdk` (auth surface), `.env.example`, Docker (new dependency), docs, SRS\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.27; documentation-first. This RFC records the feasibility findings, the technical design against the existing better-auth stack, and the end-to-end UI flows. Scheduling, SRS requirement IDs (proposed AUTH-09+), and task allocation are deferred; prioritization comes later.

---

## Summary

Add a second factor and a phishing-resistant primary credential to Sovereign's
sign-in:

- **TOTP multi-factor auth — authenticator apps only.** No SMS, no email OTP. A
  user scans a QR code into an authenticator app (Aegis, 1Password, Google
  Authenticator, …) and confirms a 6-digit code on every subsequent login.
- **Passkeys (WebAuthn).** Usable **two ways**: as a second factor _and_ as a
  **passwordless primary credential** ("Sign in with a passkey").
- **Backup codes** generated at TOTP enrollment as the everyday recovery net,
  backed by an **admin reset** path and a last-resort **`sv` CLI break-glass**.

Both are built on better-auth's **first-party** plugins — core
`better-auth/plugins/two-factor` and the companion `@better-auth/passkey` package
(SimpleWebAuthn under the hood). Sovereign owns the **policy, recovery, and UX**;
it does **not** hand-roll WebAuthn ceremonies or TOTP/HMAC. This complements
RFC 0008 (transport + at-rest hardening) with **account-level** hardening.

## Motivation

Sovereign authenticates with **email + password only** (SRS AUTH-01). For a
privacy-first, self-hosted workspace that holds a user's whole working life, a
single password is the weakest link: credential phishing and password reuse are
the realistic attack, not a stolen disk. RFC 0008 hardens the transport and the
data at rest; it does nothing for a stolen or phished password. This RFC closes
that gap.

The design constraints follow directly from Sovereign's positioning:

- **No SMS / no email OTP.** SMS is phishable and SIM-swappable, requires a paid
  gateway, and leaks the user's phone number to a third party — incompatible with
  the no-telemetry, self-host ethos. Authenticator-app TOTP needs no external
  service. (Email OTP is also declined: it is no stronger than the password-reset
  channel it would share, and it makes the inbox a single point of failure.)
- **Passwordless via passkeys** is the modern, phishing-resistant default and
  costs the user nothing recurring.
- **Recovery must work without a support desk.** A self-hoster who loses their
  authenticator has no one to call — recovery is a first-class part of the design,
  not an afterthought.

There is **no prior mention** of MFA, 2FA, passkeys, WebAuthn, TOTP, or OTP
anywhere in the SRS, the other RFCs, or the code — this is a clean addition.

## Current state (what this builds on)

- **better-auth 1.6.16** is installed; only `nextCookies()` is wired today
  (`apps/auth/src/auth.ts:89`). Email+password is enabled with `autoSignIn`
  (`apps/auth/src/auth.ts:30`).
- **First-party MFA plugins are available in the installed version** (see
  Feasibility): TOTP + backup codes ship in core better-auth; passkeys are a
  separate package.
- **Schema is created at startup, idempotently.** `apps/auth/instrumentation.ts`
  runs `getMigrations(getAuthOptions())` (better-auth's own tables) plus
  `ensureAuthTables()` (Sovereign's `invites` / `auth_settings`). better-auth's
  `getMigrations()` **auto-discovers plugin tables**, so enabling the two-factor /
  passkey plugins creates their tables with no bespoke DDL — but it does exercise
  the dialect-agnostic SQLite/Postgres path and the standalone Docker migrate flow.
- **Session / cookie-cache flow (AUTH-05/06).** The runtime middleware verifies a
  signed `better-auth.session_data` snapshot offline
  (`runtime/src/session-verify.ts`), falling back to `/api/verify` and forwarding
  the re-issued `Set-Cookie`. Anything that changes a user's session-visible state
  must invalidate that cache cookie or it stays stale up to `cookieCache.maxAge`
  (300s, `apps/auth/src/auth.ts:28`).
- **`freshAge: 0` is deliberately set** (`apps/auth/src/auth.ts:22`) so day-old
  sessions can still list/manage themselves; a regression test pins it. This has a
  direct consequence for MFA (see §4e).
- **Server-to-server calls to better-auth need an `Origin` header** equal to the
  auth base URL; the SDK already does this via `authFetch` (`packages/sdk/src/auth.ts`).
- **The Account Security tab** (`plugins/account/app/security/page.tsx`) already
  renders password-change and active-session sections — the natural home for MFA
  management. The session-cache-invalidation pattern lives in
  `plugins/account/app/actions.ts`.

## Feasibility (verified against the installed packages)

- **TOTP + backup codes — core better-auth.** `better-auth/plugins/two-factor`
  is present in 1.6.16 (the `TOTP`, `backupCode`, `OTPOptions`, `trustDevice`
  symbols are in the shipped types). We enable `totp` + `backupCodes` and **omit
  the `otp` (email/SMS) option entirely** → authenticator apps only, exactly as
  required.
- **Passkeys — separate dependency.** The passkey plugin is **not** in the core
  package; it is `@better-auth/passkey` (server) + `@better-auth/passkey/client`
  (browser), SimpleWebAuthn-backed. It supports passwordless `signIn.passkey()`
  (with conditional-UI autofill) and `addPasskey()` for an already-authenticated
  user. Server config: `rpID`, `rpName`, `origin`. **This is a new runtime
  dependency on `apps/auth`** with Docker/build impact (see §4h).
- **Multi-step login is supported.** The two-factor plugin returns a
  `twoFactorRedirect` signal after a correct password when 2FA is enabled, which
  drives a dedicated challenge step.

## Locked decisions

1. **Passkey role:** both — second factor **and** passwordless primary login.
2. **Enforcement:** opt-in per user for the first cut; **admin-mandated MFA** is
   specified as an explicit **later phase** (§4f), not phase one.
3. **Recovery (priority order):** backup codes → admin reset → `sv` CLI
   break-glass (§4g).
4. **Status:** Implemented, pre-v1 intent, prioritization deferred.

## Proposed design

### 4a. TOTP (authenticator apps only)

Enable better-auth's two-factor plugin with TOTP and backup codes, and **without**
the `otp` (email) option:

```ts
// apps/auth/src/auth.ts — illustrative
import { twoFactor } from 'better-auth/plugins/two-factor';

twoFactor({
  issuer: 'Sovereign', // shown in the authenticator app
  totp: { digits: 6, period: 30 },
  backupCodes: { amount: 10 },
  // NOTE: no `otp: {...}` — email/SMS OTP is intentionally not enabled.
});
```

**Enrollment** (in the Account Security tab): the user clicks _Enable two-factor_,
re-enters their password, and is shown a **QR code + the secret in text**. They
scan it, enter one generated code to prove the pairing works, and only then is
TOTP marked active — at which point the **backup codes are revealed once** with a
copy/download prompt and a "I've saved these" confirmation. **Disabling** TOTP
requires a password re-prompt (§4e).

### 4b. Passkeys (WebAuthn)

Add `@better-auth/passkey` on the server and `@better-auth/passkey/client` on the
auth client, configured with the relying-party identity:

```ts
passkey({
  rpID: env.webAuthnRpId, // e.g. 'localhost' (dev) or 'example.com' (prod)
  rpName: 'Sovereign',
  origin: env.webAuthnOrigin, // the browser-facing origin of the ceremony page
});
```

- **Add a passkey** from the Account Security tab via `addPasskey()` (the user is
  already authenticated). Enrolled credentials are listed with a friendly
  device name, created/last-used timestamps (mirroring the existing session list),
  and **rename / remove** controls.
- **Passwordless sign-in** on the login page: a _Sign in with a passkey_ button
  calling `signIn.passkey()`, plus **conditional-UI autofill** so a passkey is
  offered inline on the email field when the platform supports it.
- **Passkey as a second factor:** when a user has both a password and a passkey,
  the passkey can satisfy the post-password challenge (§4c).

See §4h for the relying-party / origin deployment constraint — it is the single
most important operational detail in this RFC.

### 4c. Multi-step login

```
                 ┌─────────────────────────┐
   /login  ──────▶  email + password submit │
                 └───────────┬─────────────┘
                             │ correct credentials
                 ┌───────────▼─────────────┐
                 │  any second factor set?  │
                 └─────┬──────────────┬─────┘
                    no │              │ yes (twoFactorRedirect)
            ┌──────────▼───┐   ┌──────▼───────────────────────────────┐
            │ issue session│   │  /login/2fa challenge:                │
            └──────────────┘   │   • TOTP 6-digit code                 │
                               │   • or "use a passkey" (WebAuthn)     │
                               │   • or "use a backup code"            │
                               └──────┬───────────────────────────────┘
                                      │ verified
                               ┌──────▼───────┐
                               │ issue session│
                               └──────────────┘

   Passwordless path: "Sign in with a passkey" → signIn.passkey() → issue session
   (skips password and the challenge step entirely).
```

The challenge page lives in `apps/auth/app/` alongside the existing login page.
The passwordless path bypasses both the password field and the challenge step.

### 4d. Session / cache interaction

Enabling or disabling any factor changes the user's security posture but **not**
the `session_data` snapshot's currently-cached fields — yet a stale snapshot must
not let a just-disabled factor linger or hide a just-enabled one in chrome state.
Any factor mutation must **invalidate both `better-auth.session_data` cookie
variants** (plain + `__Secure-`, `maxAge: 0`) exactly as profile mutations already
do (`plugins/account/app/actions.ts`), forcing the next request to re-verify via
`/api/verify`. The session token itself is untouched (no forced logout).

### 4e. The `freshAge: 0` tension

Sovereign deliberately disables better-auth's fresh-session gate
(`apps/auth/src/auth.ts:22`) so long-lived self-host sessions can manage
themselves. The conventional way to protect security-sensitive changes — "your
session must be fresh (re-authenticated recently)" — is therefore **unavailable
by design**. Instead, security-sensitive actions **re-prompt for the password**
inline:

- enabling or disabling TOTP,
- removing the **last** passkey (removing a non-last one is lower-risk),
- viewing or regenerating backup codes.

This keeps the protection local to the action without re-introducing a freshness
gate (the regression test that pins `freshAge === 0` stays valid).

### 4f. Enforcement (phased)

- **Phase 1 (first cut): opt-in per user.** Each user enables MFA for themselves;
  no platform mandate. Matches a single-admin self-host.
- **Later phase: admin-mandated MFA.** A Console **`require_mfa`** toggle,
  **dual-written** like `invite_only` (platform `platform_settings` for
  `sdk.platform.getConfig()` + the auth server's `auth_settings`, the auth copy
  authoritative for enforcement). When on, a user without a second factor is sent
  through a **setup gate** on next login before reaching the workspace. This is
  specified, not built in phase one.

### 4g. Recovery (priority order)

1. **Backup codes (everyday net).** Generated at TOTP enrollment, single-use,
   shown once. A backup code is accepted at the challenge step in place of a TOTP
   code. Regenerating invalidates the old set (password re-prompt, §4e).
2. **Admin reset (a second person can help).** An admin clears another user's MFA
   factors via the Console admin API, `SOVEREIGN_ADMIN_KEY`-gated, mirroring the
   existing `apps/auth/app/api/admin/users/*` routes. The user falls back to
   password-only and can re-enroll. Surfaced in the Console user-management UI.
3. **`sv` CLI break-glass (the sole admin's last resort).** A command —
   e.g. `sv user reset-mfa <email>` — that disables/clears a user's factors
   directly against the auth DB. This is the **only** rescue for a sole admin who
   has locked themselves out, because no one above them can run the admin reset.
   Documented explicitly as a last resort requiring host/DB access.

### 4h. Deployment & the WebAuthn relying-party constraint

WebAuthn binds credentials to a **relying-party ID (`rpID`)** — a registrable
domain — and validates the **origin** of each ceremony. Sovereign serves the
**login/challenge pages from `apps/auth`** but lets a logged-in user **add a
passkey from the runtime** (the Account plugin). These can be different origins:

- **Dev:** runtime is `localhost:3000`, auth is `localhost:3001`. WebAuthn ignores
  the port for `rpID`, so both share `rpID = localhost` and it "just works".
- **Production:** the auth and runtime **browser-facing** origins **must share a
  registrable domain.** E.g. `app.example.com` (runtime) + `auth.example.com`
  (auth) → `rpID = example.com`. A deployment that exposes them on unrelated
  domains cannot use passkeys. This must be stated prominently in
  `docs/self-hosting.md`.

New env vars (final names TBD): **`AUTH_WEBAUTHN_RP_ID`**,
**`AUTH_WEBAUTHN_RP_NAME`**, and an origin (derivable from `AUTH_BASE_URL` /
`NEXT_PUBLIC_RUNTIME_URL`, or explicit). On implementation this carries **Docker
and docs impact**: a new `@better-auth/passkey` (+ SimpleWebAuthn) dependency on
the auth app affects the image build, and `.env.example` + `docs/self-hosting.md`

- the `runtime/src/docs-parity.test.ts` env-var parity check must be updated in
  the same change. (Flagged here; nothing changes in this doc-only draft.)

### 4i. CSP / headers

WebAuthn uses the `navigator.credentials` browser API, which is **not** governed
by CSP `connect-src` (no relaxation needed), and the TOTP/passkey ceremonies are
same-origin. RFC 0008's strict nonce-based CSP (no `'unsafe-inline'` scripts)
stands unchanged; any client JS the challenge page needs uses the per-request
nonce. No CSP changes are anticipated.

## UI flows

**Enroll TOTP** — Account → Security → _Enable two-factor_ → password re-prompt →
QR + secret shown → enter one code to confirm → backup codes revealed once
(copy/download + confirm saved) → TOTP active; session cache invalidated (§4d).

**Enroll passkey** — Account → Security → _Add a passkey_ → browser WebAuthn
prompt (`addPasskey()`) → name the credential → appears in the passkey list with
created/last-used; rename/remove available (removing the last passkey re-prompts
for password, §4e).

**Passwordless login** — `/login` → _Sign in with a passkey_ (or autofill on the
email field) → `signIn.passkey()` → session issued, redirect to runtime. No
password, no challenge step.

**2FA challenge at login** — `/login` → email+password → `twoFactorRedirect` →
`/login/2fa` → enter TOTP code _or_ choose "use a passkey" _or_ "use a backup
code" → session issued.

**Backup-code use** — at the 2FA challenge, _Use a backup code_ → enter one
unused code → session issued; that code is now spent. (When codes run low, prompt
to regenerate.)

**Admin reset** — Console → Users → pick user → _Reset MFA_ (admin-key-gated) →
the user's factors are cleared; they sign in with password and may re-enroll.

**CLI break-glass** — operator with host access runs `sv user reset-mfa <email>`
→ factors cleared directly in the auth DB → the locked-out (sole) admin can sign
in again.

## SDK surface

MFA enrollment, challenge, and management are **UI + auth-server concerns**, not
plugin-facing capabilities. **Phase one adds no new `sdk.auth.*` methods.** The
existing surface (`getSession`, `requireSession`, `changePassword`,
`listSessions`, `revokeSession`, `signOut`) is unchanged; a session is a session
regardless of how many factors produced it.

If a later need arises (e.g. a plugin wanting to read whether the current user has
MFA enabled), it follows the established **reserved-stub pattern**
(`packages/sdk/src/unimplemented.ts` — throw `NotImplementedError`, additive
**minor** bump) rather than expanding the surface speculatively now.

## Alternatives considered

1. **Hand-rolled TOTP / WebAuthn.** Reinvents audited cryptographic ceremonies
   for no benefit. Rejected in favour of better-auth's first-party plugins.
2. **SMS OTP.** Phishable, SIM-swappable, requires a paid gateway, and leaks a
   phone number to a third party — fundamentally at odds with the self-host,
   no-telemetry stance. Rejected (and the explicit requirement).
3. **Email OTP.** No stronger than the password-reset channel it shares, and it
   makes the inbox a single point of failure. Declined; authenticator TOTP only.
4. **Third-party IdP / SSO (OIDC, social login).** Useful for orgs, but out of
   scope for v1's single-tenant model and adds an external dependency. Possible
   future RFC, not this one.
5. **Passkeys as second factor only (no passwordless).** Simpler, but forfeits the
   main benefit of passkeys (phishing-resistant passwordless primary auth).
   Rejected per the locked decision to support both.

## Open questions

1. **Requirement IDs.** Proposed **AUTH-09+** (highest existing is AUTH-08) — not
   assigned in the SRS until this RFC is accepted and scheduled.
2. **`trustDevice` ("remember this device for 30 days").** better-auth supports
   it; in scope, or does it weaken the guarantee too much for a security feature?
3. **Admin-reset UX.** Exact placement/confirmation in Console user management,
   and whether it should also force-revoke the user's active sessions.
4. **`@better-auth/passkey` packaging.** It is a new runtime dependency on
   `apps/auth` (Docker/build impact) — confirm the standalone image trace and
   `allowBuilds` implications for any native SimpleWebAuthn bits.
5. **Production origin guidance.** Best default for `rpID` derivation, and whether
   to fail-fast at startup when passkeys are enabled but the auth/runtime origins
   can't share a registrable domain.
6. **Mandatory-MFA grace flow.** When `require_mfa` is later turned on, how much
   grace before existing password-only users are forced through setup?

## Adoption path

1. **Documentation-first (this RFC).** Feasibility + design + UI flows captured;
   no code, no SRS edits, no scheduling.
2. **When accepted & scheduled** (a security task, sibling to RFC 0008's Tier 0/1
   line): enable two-factor (TOTP + backup codes), add `@better-auth/passkey`,
   build the Account Security UI, the multi-step login + challenge page, backup
   codes, and admin reset + `sv` break-glass. Assign AUTH-09+ and a decision-log
   row at that point.
3. **Later phase:** admin-mandated MFA (`require_mfa` toggle + setup gate) and any
   `trustDevice` decision.

## Changelog

| Version | Date     | Change                                                                                                                                                                              |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; TOTP (authenticator-only) + passkeys (2FA and passwordless) on better-auth's first-party plugins; recovery + UI flows; documentation-first, prioritization deferred. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.27.                                                                                                                                  |
