# Epic 12: Release and deployment

> An operator can pull a released image, and run it alone for any app or as part of a suite of apps.

## Status

⏳ In Progress

## Overview

Core has never been released: the repository holds no tag, and the image the compose files name has not been published.
This epic publishes it, writes what an operator needs to run it alone and connect their apps, and settles the design of
how operators deploy and manage it, in [RFC 0002](../rfcs/0002-deployment-strategies.md). Building that follows the RFC's
acceptance, in [epic 13](operator-cli.md).

## Related

- [docs/rfcs/0002-deployment-strategies.md](../rfcs/0002-deployment-strategies.md): how core is deployed, and the operator CLI
- [docs/deploying.md](../deploying.md), [docs/connecting-an-app.md](../connecting-an-app.md), [docs/releasing.md](../releasing.md)
- [docs/specs/core-app.md](../specs/core-app.md): §3.6, §3.7, §3.15, §3.16

## Tasks

#### ⏳ 12.1 — Publish the image

**Goal:** A tag on `main` publishes core's image, and nothing else can.

**Priority:** 1.

**Deliverables:**

- `.github/workflows/publish-image.yml`: a `vX.Y.Z` tag publishes to GHCR for `linux/amd64` and `linux/arm64`,
  tagged `X.Y.Z`, `X.Y` and `latest`, after the full CI, on a commit on `main`, with the tag matching
  the root `package.json`
- The workflow's rules held by `scripts/__tests__/publish-workflow.test.ts`
- `docs/releasing.md` covers the image

**Dependencies:** 0.5, 0.6

**Spec reference:** §3.15

**Review checklist:**

- Every third-party action is pinned to a commit
- Only the publishing job can write packages, and it uses the run's own token
- The build uses no cache
- `pnpm docker:smoke` passes, and CI's `acceptance` and `image` jobs pass in a run on GitHub

**Not here:** the first release itself (12.3).

#### ⏳ 12.2 — Guides for operators `[parallel]`

**Goal:** An operator can put core on a public name and connect an app of any kind, from the documents alone.

**Priority:** 2.

**Deliverables:**

- `docs/connecting-an-app.md`: what an app must support, registering it, the issuer, scopes, consent, signing out, the
  Directory, and what to check when it fails
- `docs/deploying.md`: a reverse proxy with TLS, trusted proxies, and why `SV_AUTH_COOKIE_DOMAIN` stays unset

**Dependencies:** 8.6

**Spec reference:** §3.6, §3.7, §3.15

**Review checklist:**

- The proxy example boots as written, and core reaches its own address through it
- What the guide says an app needs matches what core does
- No app is named

#### 📋 12.3 — First release

**Goal:** `docker compose up -d` works on a clean machine with the published image.

**Priority:** 3.

**Deliverables:**

- CI passes in full on `main`, in a run started by hand
- The repository renamed to `sovereignfs/sovereign`, once the legacy repository has given up the name and its publish
  workflows are retired
- A `vX.Y.Z` tag, and the package public on GHCR

**Dependencies:** 12.1, 12.2, 12.5, 12.6, 12.8

**Spec reference:** §3.15

**Review checklist:**

- The image pulls without logging in, on both architectures
- Following `docs/deploying.md` as written reaches a healthy core

#### ⏳ 12.4 — The deployment design `[parallel]`

**Goal:** The contract between core, the operator CLI and apps is agreed before any of it is built.

**Priority:** 4.

**Deliverables:**

- [RFC 0002](../rfcs/0002-deployment-strategies.md), reviewed, with its open questions answered
- [Epic 13](operator-cli.md) and its rows in `ROADMAP.md`, corrected to match what it accepts

**Dependencies:** none

**Spec reference:** §3.15, §3.16

**Review checklist:**

- Every decision that changes core is written as a change to the spec
- Core still names no app, and holds no database credential for one

#### ✅ 12.5 — Host-only cookies

**Goal:** An app on a subdomain cannot set a cookie that core reads as its own.

**Priority:** 5, but before the first release, so that nobody has to be signed out.

**Deliverables:**

- Core's cookies use the `__Host-` prefix when `SV_AUTH_COOKIE_DOMAIN` is unset and core is served over https. The prefix
  cannot be used with a cookie domain, or over http, where they stay as they are
- The proxy's session check, and anything else that names a cookie, follows
- §3.5 updated, with a changelog row

**Dependencies:** 12.4

**Spec reference:** §3.5; RFC 0002

**Review checklist:**

- A cookie set for the parent domain from a subdomain is not taken as a session
- Sign-out clears the cookies under both names
- The security check is run

#### 📋 12.6 — Try real third-party apps

**Goal:** What "any OpenID Connect app" means is known from trying it, before the first release says so.

**Priority:** 6, but before the first release, so the guide is true when people first read it.

**Deliverables:**

- A few widely used self-hosted apps, chosen to differ in language and sign-in library, each connected to a built image by following
  `docs/connecting-an-app.md` as written
- What each one needed and what stopped it, recorded, and the guide corrected to match: EdDSA, PKCE, how the secret is sent, and
  anything else that came up
- Whether `client_secret_post` works, which RFC 0002 left untested

**Dependencies:** 12.2

**Spec reference:** core-app §3.6, §3.7; RFC 0002

**Review checklist:**

- Three apps were tried (two Go stacks and a Django app). The Auth.js and PHP families were tried in 12.8, and
  [research 0002](../research/0002-third-party-app-compatibility.md) records both passes
- Each failure is traced to a cause, and either goes into 12.7 or is stated in the guide as a limit
- Core's documents describe what an app needs, and do not depend on any one app

#### 📋 12.7 — Compatibility settings

**Goal:** An ordinary app that 12.6 found could not connect can, without weakening anything for the others.

**Priority:** 7. Only what 12.6 shows is needed, and this does not hold up the first release.

**Deliverables:**

- What [research 0002](../research/0002-third-party-app-compatibility.md) decided (2026-10-30): a per-app choice to send the secret in
  the request body (Basic stays the default), and RS256 as an additional ID-token algorithm, off unless chosen. Whether better-auth
  can sign with a second algorithm for chosen apps only is part of the task. "This app can't send PKCE" is left out, since no app tried
  needed it, until one shows otherwise
- A scope core does not offer is ignored, not refused: it is dropped from the authorization request and the sign-in goes on with the
  scopes core knows, as OpenID Connect Core says it SHOULD (research 0002, decision 4). `oauthGuards`
  (`apps/core/src/oauth/guards.ts`) already rewrites the request's scopes for `roles` before the provider reads them, and is the likely place
- §3.6.1, §3.6.2 and §3.7.1 changed first, and the Console's technical settings saying what each gives up

**Dependencies:** 12.6

**Spec reference:** core-app §3.6.1, §3.7.1; RFC 0002

**Evidence after 12.8:** of six apps, two reject EdDSA outright (a Django app and a PHP app), one of them also needs the secret in the
body, one asks for a scope core does not offer (`groups`) by default, and none needed a way to turn PKCE off.

**Review checklist:**

- A public app is never given a secret method, and PKCE stays required
- An ignored scope appears nowhere: not on the sign-in or consent page, not in what consent remembers, and not in the token's `scope`
- The token response lists the scopes granted when they differ from those asked for (RFC 6749 §3.3), and a refresh that names an unknown
  scope is handled the same way
- A request for only `openid` plus unknown scopes still signs in, and a request with no `openid` is still refused
- A scope core knows but the app is not allowed behaves as it does today
- EdDSA stays the default, and no existing app changes behaviour
- The security check is run

#### ⏳ 12.8 — Try two more app families

**Goal:** The guide's claim about what connects is checked against the two common families that 12.6 left out, before the first
release makes it.

**Priority:** 8, but before the first release.

**Deliverables:**

- One app built on Auth.js (Next.js), the family nearest to apps built for Sovereign, and one PHP app, each connected to a built image by
  following `docs/connecting-an-app.md` as written, and tried as in 12.6
- A follow-up in [research 0002](../research/0002-third-party-app-compatibility.md): the same results table, what stopped each and why,
  and what it changes in the recommendation (12.7's scope in particular)
- The guide corrected where either shows it wrong

**Dependencies:** 12.6

**Spec reference:** core-app §3.6, §3.7

**Review checklist:**

- Each failure is traced to a cause taken from the app's own log or code
- The research note says which of the four common families (Go, Python, Auth.js, PHP) are now covered, and which are not
- Core's documents still name no app

**As run:** Homarr (Auth.js v5), BookStack (PHP) and, as the stack nearest to Sovereign's own apps, Karakeep (better-auth, which turned out
not to be Auth.js). Two of the three connect, one after two settings. Auth.js is covered by Homarr alone, and Java, .NET, Ruby and Rust
apps remain untried.
