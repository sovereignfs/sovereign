# Phase 1 security review

What was looked at before Phase 1 was called done (core-app §3.17), how, what it found, and what was
decided. The properties worth keeping are tests, in `apps/e2e/tests/09-hardening.spec.ts` for those that
need a running core and in the unit suites for the rest; this file records the reasoning, not the rules,
which are in `docs/architecture-rules.md`.

## Scope and method

The review read the code that decides who may do what, and then tried the things an attacker tries first
against a built core in a real browser (the acceptance suite's instance), on every supported database.

| Area                    | Looked at                                                                                                                                        | Result                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Content Security Policy | `src/csp.ts`, `proxy.ts`: nonce per request, no `'unsafe-inline'` in `script-src`, `frame-ancestors`, `form-action`, `object-src`, `base-uri`    | Sound                                           |
| Other response headers  | `nosniff`, framing, referrer, permissions, HSTS                                                                                                  | **Missing; fixed**                              |
| Sign-in, sign-up, reset | Origin and CSRF checks, the per-address limits, one answer for known and unknown addresses, the second step on every way of opening a session    | Sound; the limits behave as documented          |
| Sessions and cookies    | HttpOnly, SameSite, no readable cookie, no signed cache, ended at once on sign-out and deactivation                                              | Sound                                           |
| Redirects               | `returnTo` on sign-in, `redirect_uri` on authorize, `post_logout_redirect_uri` on end-session                                                    | Sound: only core's own and registered addresses |
| OpenID Connect provider | PKCE `S256` required for every client, no dynamic registration, exact redirect match, `roles` only to trusted apps, consent honoured             | Sound                                           |
| Tokens                  | Directory token checks (key, type, issuer, audience, expiry, scope, then account, app, session, revocation by time), refresh and secret rotation | Sound                                           |
| Authorisation           | Every server action and route asks for its capability (a test fails when one does not); the owner's rules held in one place                      | Sound                                           |
| Rate limits             | Authentication, second step, passkeys, token endpoint, Directory per app and per account                                                         | Sound; see the accepted points                  |
| Back-channel logout     | Signed `logout+jwt`, audience, `sid`, no `nonce`, sent once, no redirect followed                                                                | Sound                                           |

## Findings

1. **Hardening headers were missing (fixed).** No response said `nosniff`, `X-Frame-Options`, a referrer policy
   or a permissions policy, and HSTS was never sent. They are now on every response through the proxy's one
   exit; HSTS only over https. Tests: `proxy.test.ts` and the acceptance suite.
2. **An app's callback was requested twice (fixed).** better-auth's client followed a `{ redirect, url }` answer
   by itself and so did core's forms, so an authorization code was used by the first request and refused by the
   second. Not a vulnerability, but it made a correct sign-in look like a failure to any app that processes
   requests as they arrive. Test: `auth-client.test.ts`, and the acceptance suite counts the callbacks.
3. **How an app gets a Directory token was not written down (fixed in the contract and the spec).** A token
   asked for with a resource carries no ID token, so an app has to ask for it after signing in.

## Accepted, with the reason

- **The token endpoint's limit is per address.** Behind a reverse proxy that is not told it is one
  (`SV_AUTH_TRUSTED_PROXIES`), every caller shares the proxy's address and so one limit. That is the safe
  failure (too strict, never too lax) and `.env.example` says how to set it. The suite's apps ask
  from addresses of their own for the same reason.
- **A token issued in the same second as a revocation is refused.** A signed token leaves no row to mark, so
  revocation is by time and the doubt goes against the token. An app that is given a new token in that second
  asks again.
- **HSTS names no subdomains and is not preloaded.** Other services may share the domain; an operator who wants
  more sets it on their own proxy.
- **`style-src-attr 'unsafe-inline'`** stays, for the design system's custom properties. It cannot run script.
- **An email address can be reached by exact match through the Directory.** That is the feature (§3.9), limited
  per app and per account, with no listing and no partial matching.

## Not in this review

Phase 2 and later (encrypted backups, shared services); the dependency audit, which has its own CI job; and
the deployment's network (the operator's proxy, TLS and firewall), which `docs/deploying.md` covers.
