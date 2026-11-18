# Epic 11: Installable app (PWA)

> Core installs as an app on a phone or a desktop, and says so plainly when the
> network is down, without ever storing a page that belongs to a person.

## Status

⏳ In Progress

## Overview

[RFC 0001](../rfcs/0001-installable-core.md) proposes a web app manifest, mobile
metadata, and a small hand-written service worker that keeps only what is the
same for everyone (the built scripts, styles and fonts, and the icons) and
answers a navigation that fails offline with a page of its own. It stores no
signed-in page, offers no offline use, and adds no dependency or file to the
image. The tasks are in the order they are worth doing; the first two are
useful alone.

Amendment 1 to the RFC adds 11.5 to 11.13: manifest members that do not vary by person, an install
hint, an announced update, tiles that open the person's installed apps where the device allows, shortcuts
that name a native app, and the shared `@sovereignfs/pwa` package that the app template and the deployed
apps use.

## Related

- [docs/rfcs/0001-installable-core.md](../rfcs/0001-installable-core.md): the design, the alternatives, the open questions
- [docs/specs/core-app.md](../specs/core-app.md): §1.3 (the interface), §3.5 (sessions and security), §3.13 (instance branding)
- [docs/architecture-rules.md](../architecture-rules.md): _the service worker never stores a per-user page_
- Epic 8's instance settings (task 8.4) hold the favicon and logos that 11.4 would build icons from
- [docs/research/0010-opening-installed-apps.md](../research/0010-opening-installed-apps.md) and [workstream 0006](../workstreams/0006-pwa.md): amendment 1

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

#### 🚧 11.3 — Standalone polish, guide and checks

**Parked** (November 2026): what is left needs a person with the devices: the Chrome or Edge and Android columns of the checklist
below, and the iPhone rows marked "not run", on a real phone over https. Re-read the checklist and RFC 0001's open questions before
resuming; everything else this task asked for is done (**Done so far**).

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

**Done so far:** the `theme-color` follows a saved theme as well as the system's (set once the page is ready, with
tests; Preferences now has an Appearance choice for it to follow); the deployment guide
says what installing needs (https, a proxy that does not cache `/sw.js` or the manifest, what is and is not stored,
that apps open outside the window); Chromium's registration, caches and offline page are covered by the acceptance
suite.

**Run on an iPhone simulator** (iPhone 17 Pro, iOS 26.5, a built core on `http://localhost:3000`, so not a real device and
not over https): the iPhone column below. It found two defects, both fixed: page text scrolled under the clock and the Dynamic
Island of an installed app (the body's safe-area padding scrolls away with the page; a fixed strip of the page's colour now
holds the status bar, `globals.css`), and the offline page's "Try again" button took the browser's link colour (purple, as the
link points at its own page) instead of the text colour (`color: inherit`, `sw/source.ts`). Each has a test that failed before.
The simulator would not take a typed password (only the first character arrived), so the signed-in rows were not run.

**Run on an Android emulator** (Pixel-class image with Google APIs, Chrome, a built core on `http://localhost:3200` through
`adb reverse`, November 2026): Chrome offers to install, its sheet shows the description and the narrow screenshot, the maskable icon
is masked cleanly to a circle, and the installed core opens in a window of its own with no browser bars. The image has no Play Store,
so Chrome made a home-screen shortcut rather than a WebAPK; the WebAPK rows still need a real phone.

**Outstanding, which needs a person with the devices:** the Chrome or Edge and Android columns, the iPhone rows marked "not
run", and a run of the iPhone column on a real phone over https. The review checklist above is not met until they are run.

| Check                                                                                            | Chrome or Edge, desktop | Android Chrome | iPhone Safari                   |
| ------------------------------------------------------------------------------------------------ | ----------------------- | -------------- | ------------------------------- |
| An "Install" or "Add to Home Screen" offer is made, over https                                   |                         |                | ✅ (simulator, http)            |
| The installed icon is the Sovereign mark (or masked cleanly), named for the instance             |                         |                | ✅                              |
| It opens in a window of its own, with no browser bars (iPhone: no Safari bars)                   |                         |                | ✅                              |
| The title or status bar takes the page's colour, in the light and the dark theme                 |                         |                | ✅ (after the fix)              |
| Nothing is hidden by a notch, a rounded corner or the home bar; no strip below the page          |                         |                | ✅ (after the fix)              |
| The viewport height is right at launch (iPhone standalone: the legacy viewport sync only if not) |                         |                | ✅ (sign-in and legal pages)    |
| Sign in, open the launcher, open an app on another address, and come back                        |                         |                | not run                         |
| With the network off, a page shows "You're offline"; back on, "Try again" loads it               |                         |                | ✅ (core stopped, then started) |
| After signing out, no page of the person can be opened offline                                   |                         |                | not run                         |
| Renaming the instance renames the installed app (after the next launch)                          |                         |                | not run                         |

#### ✅ 11.4 — Icons made from the instance's own logo `[parallel]`

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

**Spec reference:** §3.12, §3.13; RFC 0001; ADR 0001

**Review checklist:**

- An instance with a logo has a manifest whose icons are its own, and one without has the defaults
- If a native dependency was chosen, the image builds and boots on all three databases (`pnpm docker:smoke`)

**Done:** decided in [ADR 0001](../adrs/0001-app-icons-are-supplied-not-generated.md): the operator supplies a square PNG
(512 to 1024 pixels) as an App icon, and optionally one for masking; core resizes nothing, so there is no native
dependency and the image is unchanged. The manifest and an iPhone's home-screen icon take them, and fall back to the
Sovereign icons.

**Not here:** anything for an instance that has set no logo.

### Amendment 1: a fuller install, opening installed apps, and the apps' side

[RFC 0001 amendment 1](../rfcs/0001-installable-core.md#amendment-1--a-fuller-install-and-opening-installed-apps-november-2026)
and [research 0010](../research/0010-opening-installed-apps.md). The order and the gates are in
[workstream 0006](../workstreams/0006-pwa.md). 11.11 to 11.13 change the template and the app repositories; core is unchanged by them.

#### ✅ 11.5 — Manifest members that do not vary by person

**Goal:** Core's manifest carries what a fuller install needs, still the same for everyone.

**Deliverables:**

- `launch_handler`, `shortcuts` (the launcher and the account page only), `screenshots` (one narrow, one wide, served like the
  icons), `categories`, `lang` and `dir` in `app/manifest.ts` (RFC 0001 A1); spec §1.3 updated first
- `id: '/'` held by a test, with the reason (changing it orphans every install)
- The screenshots shipped as code like the icons, so no file is added to the image

**Dependencies:** 11.3 (its doc corrections; the device rows can follow)

**Spec reference:** §1.3; RFC 0001 A1

**Review checklist:**

- The manifest parses and every address it names is served with no session; nothing in it varies by request
- Chrome's installability check passes and its install sheet shows the screenshots

**Not here:** shortcuts that depend on a role, such as the Console.

**Done:** the manifest carries `launch_handler`, two shortcuts (`/`, `/profile`), a narrow and a wide screenshot (made by `apps/e2e/scripts/capture-screenshots.ts`, kept in `src/branding/screenshots.ts` and served under `/icons/`), `categories`, `lang` and `dir`; tests hold `id: '/'` and that the Console is never a shortcut. Seen on an Android emulator: Chrome's install sheet shows the description and the narrow screenshot.

#### ✅ 11.6 — Install this app `[parallel]`

**Goal:** A person learns that core can be installed, from the place they manage their account.

**Deliverables:**

- An install hint component in `@sovereignfs/ui` (a story, a gallery entry): the browser's prompt where `beforeinstallprompt`
  fires, Share → Add to Home Screen words on iPhone and iPad Safari, nothing in an installed window; dismissal kept on the device
- Used on the Account pages (RFC 0001 A2); a `ui` minor bump

**Dependencies:** 11.5

**Spec reference:** §1.3; RFC 0001 A2

**Review checklist:**

- No browser global is read in render or a state initializer; the component renders nothing until the browser says it can install
- Installed, it shows nothing; dismissed, it stays dismissed on that device only

**Not here:** a hint anywhere but the Account pages.

**Done:** `InstallPrompt` (with `InstallHint`, `useInstallPrompt`, `isInstalledDisplay`) in `@sovereignfs/ui` 0.100.0, shown by the identity layout. Seen on an iPhone simulator (the Add to Home Screen words in Safari, nothing in the installed window) and an Android emulator (Install opens Chrome's sheet; nothing in the installed window).

#### ✅ 11.7 — A new version, announced `[parallel]`

**Goal:** A new release reaches an open window without throwing away what a person was doing.

**Deliverables:**

- The worker waits instead of `skipWaiting` on install, and takes over when a page tells it to (a message), then `clients.claim()`
- An update notice in `@sovereignfs/ui` (a story, a gallery entry) and the registration component showing it when a worker waits;
  **Reload** activates it and reloads once `controllerchange` fires (RFC 0001 A3)
- The acceptance test of 11.2 extended: a changed worker waits, the notice appears, Reload brings the new one

**Dependencies:** 11.2

**Spec reference:** §3.5; RFC 0001 A3

**Review checklist:**

- The previous cache is still deleted on activation; nothing new is cached
- A page with no notice shown still gets the new worker on the next start

**Not here:** background or periodic updates.

**Done:** the worker has no `install` handler and takes the one message `sv-take-over`; `UpdateNotice` in `@sovereignfs/ui`; the registration shows it while a worker waits, reloads on `controllerchange`, and checks for an update when the page comes back into view. Acceptance test: a release waits, is announced, and Reload brings it. Seen in an installed core on an Android emulator.

#### 🚧 11.8 — Opening installed apps, seen on devices

**Goal:** What each platform does with a link from an installed core to another installed app is observed, not assumed.

**Deliverables:**

- A throwaway pair of installable pages on two https hosts (not shipped in any image), the target declaring `id`, `launch_handler`
  and `handle_links`; links same-tab, `target="_blank"` and `window.open`
- Run on desktop Chrome and Edge, Android Chrome, an iPhone and macOS Safari, target installed and not; the results recorded in
  research 0010, and RFC 0001 A5 confirmed, narrowed or withdrawn

**Dependencies:** none. Needs a person with the devices.

**Spec reference:** RFC 0001 A5; research 0010

**Review checklist:**

- Every cell of the matrix is filled with what was seen, with the browser and OS versions

**Not here:** any change to core.

**Done so far:** the spike (`docs/research/0010-spike/serve.mjs`); the iPhone row (simulator, iOS 26.5): every link from an
installed hub opens a Safari view, never the installed app; and the desktop Chrome row (macOS, by hand): `target="_blank"`,
`window.open` and the click-time choice open the installed target, the same-tab link does not. the macOS Safari row (by hand): every link
opens the default browser. RFC 0001 A5 is confirmed for desktop Chromium. **Outstanding:** Android on a phone with Play services; the matrix is in research 0010, "Device run".

#### 📋 11.9 — Tiles open installed apps

**Goal:** In an installed core, a tile opens the installed app where the device allows; in a browser tab nothing changes.

**Deliverables:**

- `AppTile` takes the consumer's click behaviour (still framework-agnostic); a `ui` minor bump, a story for the variant
- The launcher's app tiles decide at click time: an installed display mode opens the launch address in a new top-level context
  (`noopener`), a browser tab keeps the same-tab navigation (RFC 0001 A5); the `intent:` fallback only if 11.8 showed Android needs it
- Spec §1.3 and the deployment guide's "Apps open outside the window" rewritten, including what iPhone and Safari do

**Dependencies:** 11.8 (A5 confirmed), 11.12 (apps declare what the handoff needs)

**Spec reference:** §1.3; RFC 0001 A5

**Review checklist:**

- Rendered markup is identical in a tab and installed; `matchMedia` is read only in the click handler
- Acceptance: in a browser context a tile navigates the same tab; with the display mode emulated as standalone it opens a new page

**Not here:** detecting whether an app is installed.

#### 📋 11.10 — Shortcuts that open a native app

**Goal:** A shortcut can name a native app, and opens it from an installed core or a phone.

**Deliverables:**

- An optional open-in-app address on shortcuts, for every dialect (schema, migrations, the parity test), checked by its own
  function beside `urlProblem` (the pattern, the refused schemes, no control characters, a length cap; RFC 0001 A6)
- The shortcut forms and the Console's shared shortcuts take it; the tile opens it at click time and falls back to the main address
- Contract and spec updates where shortcuts are described; `sv-security-check`

**Dependencies:** 11.9

**Spec reference:** §1.3; RFC 0001 A6

**Review checklist:**

- A table test of accepted and refused addresses, including every refused scheme in upper and mixed case
- The main address stays `https`-only; nothing renders the open-in-app address as an `href` in a browser tab

**Not here:** opening a native app from an app tile.

#### ✅ 11.11 — `@sovereignfs/pwa`

**Goal:** What core and seven apps each copy (the manifest, the worker's allow-list, its registration, the metadata) is one
published package.

**Deliverables:**

- `packages/pwa`, published (`docs/releasing.md`, `packages:check`, a changelog section with the first version), working with no
  core present: a manifest builder that always sets `id`, `scope`, `start_url`, standalone display, icons with a maskable one,
  light and dark colours, `launch_handler` and `handle_links`; the worker's source from options (an allow-list of built files,
  fonts, icons and a person-free `/shell`, the build id as the cache's version, its own offline page, the A3 update flow); the
  `/sw.js` route's headers; a registration component; Next `metadata`/`viewport` helpers (`appleWebApp`, the apple-touch icon,
  `theme-color` for each scheme, `viewportFit: 'cover'`); the `worker-src` and `manifest-src` directives
- The worker's request decision as a plain function with a table test, as core's is

**Dependencies:** 11.7 (the update flow it carries), research 0010 (what the manifest declares)

**Spec reference:** RFC 0001 A7; `docs/architecture-rules.md` (the worker never stores a per-user page)

**Review checklist:**

- The tarball holds only the built files and the README; types resolve for ESM consumers
- No page of a person can enter the cache: the decision function's table says so

**Not here:** core adopting the package (a later task).

**Done:** `packages/pwa` 0.1.0 (MPL-2.0), listed wherever a published package is (Dockerfile, promotion units, the publish workflow,
`docs/releasing.md`). The manifest's `id` defaults to its start address, so an app that had none keeps its identity; the worker takes an
optional person-free `shell`, which the template does not use (its only page is a person's) and which ledger's fix in 11.13 can. The
main entry has no React or Node built-in; the registration is `@sovereignfs/pwa/client`. 37 tests, the worker evaluated as served.

#### ✅ 11.12 — The app template installs `[parallel]`

**Goal:** An app made by `npm create @sovereignfs` installs, says it is offline, and is ready to be opened from core.

**Deliverables:**

- The template depends on `@sovereignfs/pwa`: `app/manifest.ts`, `app/sw.js/route.ts`, the registration in the layout, the layout's
  `viewport` and `metadata`, placeholder icons (192, 512, maskable 512, apple-touch 180, an SVG) and a `/shell` page;
  `sovereign.manifest.json` names the icon
- A nonce-based content security policy in a `proxy.ts`, with `worker-src 'self'` and `manifest-src 'self'` (the template has none)
- `tools/create/src/app.test.ts` asserts each of them; a `create` version bump; `docs/building-an-app.md` gains a section on
  installing, replacing the one line in §10

**Dependencies:** 11.11

**Spec reference:** RFC 0001 A7; `docs/building-an-app.md`

**Review checklist:**

- A generated app builds, its manifest parses, its worker registers and the install check passes, in the browser
- The CSP has no `'unsafe-inline'` in `script-src`

**Not here:** moving the deployed apps (11.13).

**Done:** the template's manifest, worker route, layout and icons (drawn from the app's initial with `next/og`, prerendered at build:
the template is filled as text, so it carries no PNG), the icon in `sovereign.manifest.json`, with and without `--encryption`; a section
"Installing the app" in `docs/building-an-app.md`. Checked on an app generated from it, with `ui` and `pwa` from local tarballs (neither
is on npm yet): it builds, the built server runs on PostgreSQL, Chromium finds nothing missing to install it, the worker keeps only
allow-listed files, and offline it answers with its own page. **Moved out:** the content security policy, to 11.14, since it touches
sign-out and the encrypted variant's key flow and needs both run against a core.

#### ✅ 11.13 — The deployed apps, audited and fixed

**Goal:** Every deployed app installs well and can be opened from core.

**Deliverables:**

- One change per app repository (fjord-web, tusk, ledger, shopper, tally, wallet, waymark), on its own version: a manifest `id`
  (`/`, seen first on a device to keep an existing install), `launch_handler` and `handle_links`, `appleWebApp` where missing
  (ledger, shopper, tally), `theme-color` per scheme (shopper), a `/shell` offline page (ledger), one `theme_color` convention
- Each app moved to `@sovereignfs/pwa` where it fits, in the same change or a following one
- The audit's findings, per app, recorded in this task's notes

**Dependencies:** 11.11; 11.8 for what the handoff needs

**Spec reference:** RFC 0001 A5, A7

**Review checklist:**

- Each app's own tests and its offline acceptance test pass; Chrome's install check passes for each
- An app installed before the change is still the same installed app after it

**Not here:** the planned apps (foundry, loom, papertrail, haven), which start from the template.

**Done:** one commit in each app's `develop` (not pushed), with its version and changelog section: fjord-web 0.6.0, tusk 0.4.0,
ledger, shopper, tally, wallet and waymark 0.2.0. Every manifest has `launch_handler` (`navigate-existing`, `auto`) and
`handle_links: 'preferred'`, and the six that had none an explicit `id: '/'`, the identity a browser derived from `start_url: '/'`, so
existing installs stay the same app (reasoned from how browsers derive it; not yet seen on a device with an install from before). Ledger,
shopper and tally gained `appleWebApp`; shopper's bar takes the page colour of each scheme, as the others'. Each has a manifest test; each
app's format, lint, typecheck and full suite pass.

**Audit findings, decided:** ledger needs no `/shell`: its worker's own offline page answers a failed navigation, which is all the rule
asks. The manifests' `theme_color` stays each app's own (fjord's surface white, the rest grey 900), a design choice of each app, not a
defect; the bar of every page now follows the scheme. Moving the apps onto `@sovereignfs/pwa` waits until it is published: task 11.15.

#### ✅ 11.14 — A content security policy in the app template `[parallel]`

**Goal:** An app made from the template sends every page with a nonce-based content security policy, as the deployed apps do.

**Deliverables:**

- A `proxy.ts` and `lib/csp.ts` in the template, after the deployed apps' `src/security/csp.ts`: a nonce per request, `'strict-dynamic'`,
  `PWA_CSP_DIRECTIVES`, and the hardening headers; the layout passes the nonce where it needs one
- What sign-out needs (its form posts to the app, which redirects to core: `form-action` must allow core's origin) and what the
  `--encryption` variant needs (key release navigates to core and back; check whether its cryptography needs `'wasm-unsafe-eval'`)
- Tests in `tools/create/src/app.test.ts`; both variants run against a core: sign in, write a note, sign out, and for `--encryption` key
  release and a shared note

**Dependencies:** 11.12

**Review checklist:**

- No `'unsafe-inline'` in `script-src`; the policy is on every page and on none of the API answers
- Both variants sign in, work and sign out under the policy, with no violation in the console

**Not here:** the deployed apps, which have their own policies (11.13).

**Done:** `lib/csp.ts` and `proxy.ts` in the template: a nonce per request, `'strict-dynamic'`, `PWA_CSP_DIRECTIVES`, `form-action`
naming core's origin (from `<PREFIX>_CORE_URL`), `nosniff` and `X-Frame-Options: DENY`; the layout makes every page render per request
(`connection()`). The encrypted variant needs nothing more: its page fetches only its own server and reaches core by navigation, and it
never loads libsodium, so no `'wasm-unsafe-eval'`. Run against a built core with both variants generated from the template: sign-in
and consent, a note written, sign-out, and for `--encryption` key release with the recovery kit and the return to `/keys/return`, with no
violation on any of the app's pages. A copy built without core in `form-action` could not sign out (the form never left the app), so
core's origin is needed.

#### 📋 11.15 — The deployed apps on `@sovereignfs/pwa`

**Goal:** The seven apps carry no copy of the manifest, the worker or its registration of their own.

**Deliverables:**

- In each app, after `@sovereignfs/pwa` (and `@sovereignfs/ui` 0.100.0) are on npm: the manifest from `manifest()` with the app's own
  colours, icons and shortcuts; the worker from `serviceWorkerSource()` where its allow-list fits (tusk's and waymark's wake, sync and
  map tiles may keep their own worker); `ServiceWorkerRegistration` in place of the app's own, so a new version is announced
- The app's own tests for what it keeps, run against the package's worker

**Dependencies:** 11.11 released, 11.13

**Review checklist:**

- Each app's worker still keeps only what is the same for everyone, and its offline behaviour is unchanged
- An install from before the change is still the same app

**Not here:** an app's own offline features (tusk's Desk, waymark's tiles), which stay the app's.
