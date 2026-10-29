# Epic 11: Installable app (PWA)

> Core installs as an app on a phone or a desktop, and says so plainly when the
> network is down, without ever storing a page that belongs to a person.

## Status

📋 Planned

## Overview

[RFC 0001](../rfcs/0001-installable-core.md) proposes a web app manifest, mobile
metadata, and a small hand-written service worker that keeps only what is the
same for everyone (the built scripts, styles and fonts, and the icons) and
answers a navigation that fails offline with a page of its own. It stores no
signed-in page, offers no offline use, and adds no dependency or file to the
image. The tasks are in the order they are worth doing; the first two are
useful alone.

## Related

- [docs/rfcs/0001-installable-core.md](../rfcs/0001-installable-core.md): the design, the alternatives, the open questions
- [docs/specs/core-app.md](../specs/core-app.md): §1.3 (the interface), §3.5 (sessions and security), §3.13 (instance branding)
- [docs/architecture-rules.md](../architecture-rules.md): _the service worker never stores a per-user page_
- Epic 8's instance settings (task 8.4) hold the favicon and logos that 11.4 would build icons from

## Tasks

#### ✅ 11.1 — Manifest, icons and mobile metadata

**Goal:** A browser offers to install core, and an installed core is named, iconed and coloured as the instance.

**Priority:** 1. Valuable alone: an install prompt and a named home-screen icon, with no service worker.

**Deliverables:**

- Write the accepted outcome of RFC 0001 into the spec (§1.3 for the manifest and metadata, §3.5 for the worker's
  rules) and a changelog row, before any code
- `app/manifest.ts`: dynamic, public (public in the proxy, named in the authorization coverage test), taking the
  instance's name from `getInstanceIdentity`; `id`, `start_url` and `scope` `/`, `display: standalone` with
  `minimal-ui` as the fallback, background and theme colours, 192 and 512 pixel icons and a maskable one; nothing that
  varies by who asks
- The legacy 192, 512 and maskable PNGs added to `src/branding/default-icons.ts` and served from
  `/icons/icon-192.png`, `/icons/icon-512.png` and `/icons/icon-maskable-512.png`, like the others
- Root metadata: `appleWebApp` (capable, the instance's name, a translucent status bar), `viewportFit: 'cover'`,
  `themeColor` for the light and dark schemes, and `manifest-src 'self'` in the policy
- Safe-area insets respected by the header and the Console's sidebar where they meet an edge

**Dependencies:** 0.6

**Spec reference:** §1.3, §3.5, §3.13; RFC 0001

**Review checklist:**

- The manifest parses, every icon it names is served with no session, and its name follows the instance's
- Chrome's installability check passes and "Install" is offered; an iPhone's home-screen icon opens without Safari's bars
- The manifest and icons are public and the authorization coverage test says why
- No file is added to the image: the Dockerfile and `docker-compose*.yml` are unchanged

**Not here:** the service worker (11.2), an install button inside core, and icons made from an operator's own logo (11.4).

#### ✅ 11.2 — Service worker and offline page

**Goal:** Core says "you're offline" in its own words, and keeps its built files, without ever storing a page that
belongs to a person.

**Priority:** 2.

**Deliverables:**

- `/sw.js` from a route handler (public in the proxy; `Cache-Control: no-cache`, `Service-Worker-Allowed: /`, the
  hardening headers): cache first for `GET` requests to core's own origin under `/_next/static/`, `/icons/` and the
  font files only (an allow-list, in one bounded cache with a version in its name), and no handler for anything else
- The worker's decision (request → cache or pass through) as a plain function with a unit test table, including every
  case that must pass through: a navigation, `/api/`, `/consent`, a token in a query string, an `Authorization`
  header, a `POST`, another origin
- An offline answer for a navigation whose fetch fails or takes more than eight seconds, built by the worker from a
  string with its own policy (`default-src 'none'; style-src 'unsafe-inline'`), with a way to try again, naming no instance
- A client component in the root layout that registers it (`scope: '/'`, `updateViaCache: 'none'`) only in production,
  in a secure context, where the browser supports it
- `worker-src 'self'` in the policy (settling in a browser test whether `strict-dynamic` makes it necessary)
- Acceptance tests: the worker registers; after a signed-in tour of the launcher, the account pages and the Console the
  cache holds only allow-listed paths; offline, a navigation shows the offline page and no signed-in content appears;
  back online the address loads. The architecture rule's wording is updated to name the allow-list

**Dependencies:** 11.1

**Spec reference:** §3.5; RFC 0001; `docs/architecture-rules.md`

**Review checklist:**

- A signed-in session leaves nothing but allow-listed files in any cache, on each database leg of the acceptance suite
- A change to the worker is live on the next visit, and the previous cache is deleted
- The development server is unaffected (nothing registers outside production)
- No new dependency, no new file in the image

**Not here:** offline use of any signed-in page, push notifications and background sync (a later phase, with its own RFC), and caching anything of an app.

#### ⏳ 11.3 — Standalone polish, guide and checks

**Goal:** An installed core behaves on the devices people use, and an operator knows what it needs.

**Priority:** 3.

**Deliverables:**

- Verify on an iPhone (home-screen standalone), an Android phone and a desktop Chromium install: the viewport height at
  launch, the status and title bars in both themes, the back gesture, and a sign-in that bounces to an app and back;
  add the legacy viewport-height correction only if iOS standalone needs it
- `meta theme-color` that also follows a theme chosen in core's preferences, if RFC 0001's first open question is
  answered that way
- `docs/deploying.md`: installing needs https; a reverse proxy must not cache `/sw.js` or the manifest; what an
  installed core does with apps on other origins
- The by-hand checklist from the RFC kept in the epic's task notes, with the results of this run

**Dependencies:** 11.1, 11.2

**Spec reference:** §1.3; RFC 0001

**Review checklist:**

- The manual checklist is run on the three platforms and its results recorded
- The deployment guide states the https requirement and the two paths a proxy must not cache

**Not here:** an install button in core (an RFC open question, not committed), and Apple splash images.

**Done so far:** the `theme-color` follows a saved theme as well as the system's (the pre-paint script sets it, with
tests; note that core has no theme preference yet, so today the system's scheme decides both); the deployment guide
says what installing needs (https, a proxy that does not cache `/sw.js` or the manifest, what is and is not stored,
that apps open outside the window); Chromium's registration, caches and offline page are covered by the acceptance
suite.

**Outstanding, which needs a person with the devices:** the checklist below. Nothing in it has been run, and the
review checklist above is not met until it has.

| Check                                                                                            | Chrome or Edge, desktop | Android Chrome | iPhone Safari |
| ------------------------------------------------------------------------------------------------ | ----------------------- | -------------- | ------------- |
| An "Install" or "Add to Home Screen" offer is made, over https                                   |                         |                |               |
| The installed icon is the Sovereign mark (or masked cleanly), named for the instance             |                         |                |               |
| It opens in a window of its own, with no browser bars (iPhone: no Safari bars)                   |                         |                |               |
| The title or status bar takes the page's colour, in the light and the dark theme                 |                         |                |               |
| Nothing is hidden by a notch, a rounded corner or the home bar; no strip below the page          |                         |                |               |
| The viewport height is right at launch (iPhone standalone: the legacy viewport sync only if not) |                         |                |               |
| Sign in, open the launcher, open an app on another address, and come back                        |                         |                |               |
| With the network off, a page shows "You're offline"; back on, "Try again" loads it               |                         |                |               |
| After signing out, no page of the person can be opened offline                                   |                         |                |               |
| Renaming the instance renames the installed app (after the next launch)                          |                         |                |               |

#### 📋 11.4 — Icons made from the instance's own logo `[parallel]`

**Goal:** An instance with its own logo installs with its own icon, not the Sovereign one.

**Priority:** 4, after the rest, and optional: it needs a decision first.

**Deliverables:**

- Decide how an operator's favicon or logo becomes a 192 pixel, a 512 pixel and a maskable (padded) PNG: an image
  library in core (a native dependency, so a Dockerfile and image-size change to flag), or only an operator-supplied
  PNG of the right size in the Console's settings; record the decision as an ADR
- The chosen path, the manifest taking the instance's icons when it has them and the defaults otherwise, and a version
  in the icons' addresses so a changed logo is a new address
- The same validation the pictures already have (type judged by its bytes, size limits, an SVG rebuilt by `sanitiseSvg`)

**Dependencies:** 11.1, 8.4

**Spec reference:** §3.12, §3.13; RFC 0001

**Review checklist:**

- An instance with a logo has a manifest whose icons are its own, and one without has the defaults
- If a native dependency was chosen, the image builds and boots on all three databases (`pnpm docker:smoke`)

**Not here:** anything for an instance that has set no logo.
