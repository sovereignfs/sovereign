# RFC 0001 — An installable core (PWA)

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted; partially implemented (the manifest, metadata, service worker and app icons; the device checks of task 11.3 are not run) |
| **Date**       | October 2026                                                                                                                       |
| **Author**     | Claude Code, for review                                                                                                            |
| **Scope**      | `apps/core`: a web app manifest, a service worker, an offline page, mobile metadata; `docs/specs/core-app.md` §1.3, §3.5           |
| **Tasks**      | [Epic 11](../epics/pwa.md)                                                                                                         |
| **Supersedes** | Nothing. The established Sovereign app had a PWA (manifest, Workbox, offline page, Apple splash images); core has none             |

## Summary

Make core installable, so a person can add their instance to a phone's home screen or a desktop's app list and open
it in a window of its own, and make it say so plainly, rather than show the browser's error page, when the network is
down. It does this with a **web app manifest** and a **small, hand-written service worker** that keeps only what is
the same for everyone (the built scripts and styles, the icons) and **never a page that belongs to a person**. No
library, no push, no offline use of signed-in pages.

## Motivation

Core is the page a person lands on from a phone as often as from a desk: the launcher, their account, a sign-in for an
app. Today:

- A browser offers no "Install" for it. There is no manifest, so it cannot open in its own window, with its own name
  and icon, and without browser chrome.
- A person who opens it with no network sees the browser's own failure page, which says nothing of what they were
  trying to reach.
- On a phone's home screen (added by hand) it has no name of its own, no theme colour and no safe-area handling.

The established Sovereign app had all of this, and people who used it will expect it. None of it is large.

## Current state

Checked in the repository, October 2026:

- **No manifest, no service worker, no offline page.** `apps/core` has no `manifest`, no `sw.js` and no `public/`
  folder.
- **Icons exist** since the default favicon work: `/icons/favicon.svg`, `/icons/favicon.ico` and
  `/icons/apple-touch-icon.png`, served with no session, kept in code (`src/branding/default-icons.ts`). There are no
  192 or 512 pixel icons, which an installable manifest needs.
- **The content security policy** (`src/csp.ts`) is `default-src 'self'` with a nonce and `'strict-dynamic'` for
  scripts, `connect-src 'self'` and `font-src 'self'`. It names no `worker-src` or `manifest-src`.
- **The proxy** sends a request with no session cookie to sign-in unless the path is public; `/icons/*` and
  `/favicon.ico` are public, `/sw.js` and a manifest are not.
- **A rule already exists** (`docs/architecture-rules.md`): _the service worker never stores a per-user page;
  authenticated pages are served network-only with a timeout and an offline fallback; only neutral shells are ever
  cached._ This RFC carries it out.
- **Next.js 16** supports a manifest as `app/manifest.ts` (dynamic, so it can carry the instance's name) and its own
  guide says an install prompt needs no offline support. It does not provide a service worker.

## Goals

1. A browser that supports it offers to install core, and an installed core opens as an app: the instance's name, its
   icon, no browser chrome, a theme colour that matches the page.
2. Opening core with no network shows a page of core's own saying so, with a way to try again, never the browser's
   error and never a stale signed-in page.
3. Nothing that belongs to a person is ever stored by the service worker, by construction and by test.
4. The pages load a little faster on the next visit, because the built scripts, styles and fonts, which never change
   at their address, are kept.
5. Nothing for an operator to do beyond serving core over https (which sign-in already needs for secure cookies).
6. No new dependency, and nothing added to the Docker image beside code.

## Non-goals

- **Offline use.** No signed-in page, no data, no queued action works offline. Core is an identity service: a stale
  account page or a Console page that cannot act would be worse than an honest "you're offline".
- **Push notifications and background sync.** They belong with the notification service of a later phase (spec §3.16),
  which will need its own RFC; a service worker is where they would live, so this one is written to make room.
- **Caching apps.** Apps are other origins and other people's code; they are outside core's scope and its worker's.
- **Apple splash images.** The legacy app carried eighty-six; they are a large maintenance cost for a screen shown for
  a second. See _Alternatives_.
- **An install button inside core.** Browsers have their own; the question is left open below.

## Design

### 1. The manifest

`app/manifest.ts`, dynamic, public (the proxy lets it through with no cookie, as it does the branding document),
served as `application/manifest+json`:

| Field                      | Value                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `short_name`       | The instance's name (`getInstanceIdentity`), so renaming it in the Console renames the app; `short_name` is the first 12 characters |
| `description`              | "Sign in and your apps." plain, not marketing                                                                                       |
| `id`, `start_url`, `scope` | `/`: the launcher, which redirects to sign-in when there is no session. The scope is core's origin and no wider                     |
| `display`                  | `standalone`, with `display_override: ['standalone', 'minimal-ui']`                                                                 |
| `background_color`         | The page colour of the light theme; `theme_color` likewise (see _Theme colour_)                                                     |
| `icons`                    | 192 and 512 pixel PNGs, `any`, and a 512 pixel `maskable`; served from `/icons/`                                                    |
| `shortcuts`                | None in v1. Shortcuts name pages, and which pages exist for a person depends on their role                                          |

The manifest says nothing that depends on who is asking: a public document that varied by person would be a way to
learn who is signed in. It carries the instance's name, which the public branding document (spec §3.13) already
publishes.

**Icons.** The 192, 512 and maskable PNGs are the legacy app's, which are the Sovereign mark (white `S` on a dark
rounded square), kept in code beside the others and served at `/icons/icon-192.png`, `/icons/icon-512.png` and
`/icons/icon-maskable-512.png`, with the same cache policy and the same public route. An instance that has set its own
favicon or logo still gets the default icons in its manifest in v1: turning an operator's SVG or PNG into the right
sizes needs an image library (a native dependency, with Docker consequences) and a decision about maskable padding.
That is task 11.4 and is not on the critical path.

### 2. Mobile metadata

In the root layout's metadata and viewport:

- `appleWebApp: { capable: true, title: <instance name>, statusBarStyle: 'black-translucent' }`, so a page added
  to an iPhone's home screen opens without Safari's bars (iOS reads this, not the manifest, for that).
- `viewportFit: 'cover'`, and the design system's pages respect `env(safe-area-inset-*)` where they have a bar at an
  edge (the header, the Console's sidebar).
- `themeColor` as two entries with `media: (prefers-color-scheme: …)`, so the title bar follows the theme. Core
  already sets the theme from a pre-paint script (`THEME_SCRIPT`) that a person's choice can override; a `meta`
  `theme-color` cannot follow that choice, only the system's. The difference is small and is accepted; see _Open
  questions_.

### 3. The service worker

One file, `/sw.js`, written by hand, served by a route handler (not from a `public/` folder, so the image still needs
no folder of static files). It is about eighty lines and does three things.

**What it caches.** Only a request that is all of: a `GET`, to core's own origin, and a path under `/_next/static/`
(built scripts, styles and fonts, whose address contains a hash of their contents and so never changes), `/icons/` or
the font files. They go in one cache, `sv-static-1`, **cache first**: the first visit fetches, later visits read
the cache. Entries are bounded (the oldest are dropped past a count) so a long-lived install does not grow without
limit. This is the only thing the worker ever writes.

**What it never touches.** Everything else is passed to the network untouched, with no handler at all:

- every navigation that is not the offline fallback below (HTML pages, signed-in or not: the sign-in page carries a
  per-request nonce in its policy and in its scripts, so a stored copy would not run anyway);
- `/api/*`, `/.well-known/*`, `/consent`, `/console/*`, anything with a query string that carries a token, and any
  request with an `Authorization` header or a method other than `GET`;
- another origin.

The rule is written as an allow-list, so a path added later is not cached until someone adds it, and a test asserts
that after browsing as an owner the cache holds nothing outside it.

**The offline page.** A navigation that fails because the network is down (the fetch rejects, or takes longer than
eight seconds) is answered by the worker with a page **it builds itself**: "You're offline. Core can't reach the
server right now. Reconnect and try again", with a "Try again" link to the same address. It is built in the worker
from a string, with its own `Content-Security-Policy` (`default-src 'none'; style-src 'unsafe-inline'`), because the
page core's server would send carries a nonce of a request that is gone, and an offline page must not need a
script. It names no instance: the worker holds nothing of the instance's, and a name read from a stored document would be one
more thing to keep current. No page is stored for this, so there is nothing stale to show.

**Updates.** `register('/sw.js', { scope: '/', updateViaCache: 'none' })`; the route answers
`Cache-Control: no-cache` and `Service-Worker-Allowed: /`, so a new worker is fetched on every start and a change is
live on the next visit. The worker calls `skipWaiting` and `clients.claim`: it holds no state a mid-session swap
could break. The cache name carries a version; a worker that changes its rules bumps it and deletes the others on
activate.

### 4. Registration

A small client component in the root layout registers the worker after load, only when
`'serviceWorker' in navigator` and the page is in a secure context (https, or `localhost` for development and the
acceptance suite), and only when `NODE_ENV` is `production`, so the development server and its hot reload are
unaffected. It is a no-op everywhere else.

### 5. The policy and the proxy

- `worker-src 'self'` and `manifest-src 'self'` are added to the policy explicitly. `worker-src` otherwise falls back
  to `script-src`, where `'strict-dynamic'` makes browsers ignore `'self'`: registering the worker may be refused for
  that reason. The explicit directive removes the doubt, and a browser test proves registration.
- `/sw.js` and the manifest are public in the proxy (a browser fetches them with no session), as the icons are.
- The authorization coverage test names the two new routes in its list of public routes, with the reason, and the
  hardening headers apply to them as to every response.

### 6. What an installed core does with apps

An installed core's window is scoped to core's origin. The launcher's tiles go to apps on other origins, which an
installed app opens in the browser or an in-app browser view, as the platform chooses; the sign-in an app starts with
core lands back on the app in the same way. Nothing here depends on it, and none of it is changed. It is stated so
nobody is surprised that "open Notes" leaves the window.

## Security and privacy

- **No per-user page is stored, ever.** The allow-list above, the test of the cache's contents after a signed-in
  session, and the rule already in `docs/architecture-rules.md` hold it from three sides.
- **Signing out leaves nothing behind**, because nothing of the session was stored; the worker needs no sign-out hook.
  A shared device is as safe after an installed session as after a browser tab.
- **The worker is first-party and fixed.** It is served by core with the same hardening headers as every response and
  has no input from a request beyond its URL. It makes no request of its own to anywhere but core.
- **The manifest and the worker are public** and carry only what the public branding document already carries.
- **Tracking:** nothing is sent anywhere new; the typeface and the icons are core's own.
- **A stale worker** cannot serve stale logic for long: it is fetched on every start with no HTTP caching, and the
  cache holds only content-addressed files.

## Alternatives considered

| Alternative                                          | Why not                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Workbox, `next-pwa`, Serwist** (as the legacy app) | A build-time plugin and a generated worker for what is eighty lines with a fixed allow-list. A library whose defaults cache pages is the wrong tool for a rule that says never to. The legacy app's own offline page needed a precache entry that a worker-built page does not |
| **Cache the app shell (HTML) for fast starts**       | Core's HTML is per-request (a nonce in the policy and every script) and per-person. A cached shell would not run, or would show someone else's name. Rejected by the existing architecture rule                                                                                |
| **Offline signed-in pages**                          | A stale account or Console page that cannot act is worse than an honest message; it would also store a person's data on the device                                                                                                                                             |
| **A static `/offline` page, precached**              | Needs a precache list, a page whose policy has a dead nonce, and either inline script or a stylesheet to cache. Building the answer in the worker has none of those                                                                                                            |
| **A `public/` folder for icons and `sw.js`**         | The Dockerfile and the acceptance suite's start-up copy would both need a new path (AGENTS: flag Docker impact). Route handlers keep the image as it is                                                                                                                        |
| **Apple splash images**                              | Eighty-six PNGs, one for every device size, regenerated whenever a device ships, shown for a moment. iOS falls back to the `background_color` of the manifest, which is acceptable                                                                                             |
| **Do nothing**                                       | Core stays unlistable as an app and shows a browser error offline. The cost of doing it is small and the rule that bounds it is already written                                                                                                                                |

## Testing

- **Unit:** the manifest for a named instance and for the default (fields, the name taken from the instance, icons
  that all resolve to served files, nothing that varies by request); the worker's decision function, extracted so it
  is tested without a browser (a table of request → cache / pass-through, including the cases that must pass through:
  a navigation, `/api/`, a token in a query string, a `POST`, another origin); the CSP and proxy cases.
- **Acceptance (Playwright, in the existing suite):** the manifest is fetched with no session and parses; the worker
  registers (`navigator.serviceWorker.ready`); after a signed-in tour of the launcher, the account pages and the
  Console, the cache holds only paths from the allow-list; with the context set offline, a navigation shows the
  offline page and a signed-in page's content appears nowhere; back online, the same address loads.
- **By hand, listed in task 11.3:** the "Install" prompt in Chrome and Edge, "Add to Home Screen" on an iPhone and on
  Android, the window's title bar colour in both themes.

## Rollout

Four tasks in [epic 11](../epics/pwa.md), in this order: the manifest, icons and metadata first (value on their own: an
install prompt, a named home-screen icon); the worker and the offline page second; standalone polish and the operator
guide third; instance-branded icons last and optional. Each is one pull request and ships behind nothing: a browser
that does not support the feature ignores it. On acceptance, this RFC's outcome is written into spec §1.3 and §3.5 by
the first task, and its `Status:` becomes _Implemented_ when the fourth is done or withdrawn.

## Open questions

1. **Theme colour and the person's own theme.** `theme-color` follows the system's colour scheme, not a theme chosen
   in core's preferences. Is that acceptable, or should the pre-paint script also set the `meta` tag? (Leaning:
   set it, it is three lines.)
2. **Instance icons.** Is a default Sovereign icon in an instance's manifest acceptable to operators who have set
   their own logo, until task 11.4? (Leaning: yes; the favicon and the page's logo already show theirs.)
3. **An install hint.** Should the Account pages offer "Install this app" using `beforeinstallprompt` on supporting
   browsers? It is one component but one more thing to keep working across browsers. (Leaning: not in this RFC.)
4. **Worker and `strict-dynamic`.** Whether `worker-src 'self'` is needed at all, or registration works under the
   current policy, is settled by the first browser test of task 11.2, not by this document. The explicit directive
   is correct either way.

## Decision requested

Approve the design above, answer the open questions (or accept the leanings), and confirm the order of the tasks. On
approval the first task writes the outcome into the spec before any code.

## Outcome

Accepted as proposed, with the open questions answered as leaned:

1. **Theme colour:** the `theme-color` tags also follow a saved theme choice, set by the pre-paint script. Preferences now
   has an Appearance choice (light, dark or the system's), kept on the device; the bar takes a saved choice's colour once
   the page is ready, since a tag changed earlier is not recognised by the framework, which then adds another.
2. **Instance icons:** the default Sovereign icons are in every instance's manifest until the operator sets their own
   (task 11.4, decided in [ADR 0001](../adrs/0001-app-icons-are-supplied-not-generated.md): supplied, not generated).
3. **An install hint:** not in this RFC.
4. **Worker and `strict-dynamic`:** settled by the browser test of task 11.2: Chromium registers the worker with and
   without `worker-src` (the fallback to `script-src` does not refuse it there). The directive stays, explicit, for the
   browsers that follow the fallback strictly.
