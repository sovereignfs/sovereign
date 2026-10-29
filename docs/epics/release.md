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

**Dependencies:** 12.1, 12.2, 12.5

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
