# Research 0010 — Opening an installed app from an installed core

|                   |                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | For review                                                                                                                                                                                           |
| **Date**          | November 2026                                                                                                                                                                                        |
| **Author**        | Claude Code                                                                                                                                                                                          |
| **Scope**         | [RFC 0001](../rfcs/0001-installable-core.md) §6; [core-app](../specs/core-app.md) §1.3; the launcher (`apps/core/app/launcher.tsx`), `AppTile` in `@sovereignfs/ui`, shortcuts; every app's manifest |
| **Versions read** | Platform 0.109.0, core 0.71.0; Chrome 139–151 release notes and documentation; WebKit's documentation for Home Screen and Dock web apps                                                              |

---

## Question

A person who installs core and installs their apps (Tusk, Fjord, Wallet) as apps of their own expects a tile in core's launcher to open
the installed app: its own window, its own icon in the app switcher, no address bar. Today a tile opens the app inside core's window, in
the browser view the platform shows for an address outside core's scope, with an address bar and a close button. In a browser tab nothing
should change: a tile opens the app in that tab, as it does now.

Can a tile open the installed app instead, on iPhone and iPad, Android, desktop Chrome and Edge, and macOS Safari? What would core and
each app have to do, and what can the shortcuts a person adds do the same way, including a link into a native app?

## Method

- **The code:** the launcher's tiles (`apps/core/app/launcher.tsx`, app tiles same-tab to `launchUrl`, shortcut tiles `external`),
  `AppTile` (`packages/ui/src/components/AppTile/AppTile.tsx`), the client registry's launcher settings
  (`apps/core/src/clients/registry.ts`), the shortcut store and its address check (`apps/core/src/shortcuts/manager.ts`,
  `apps/core/src/clients/validate.ts`), and the manifests of the seven deployed apps.
- **How apps are addressed:** every app of the suite is on a host of its own (`tusk.<domain>`, `fjord.<domain>`), core on another, so
  no two scopes overlap.
- **The platforms' documentation**, summarised, not quoted: Chrome's _navigation management into installed PWAs_ and launch handler
  pages, the `handle_links` explainer, web.dev's _WebAPKs_ and _OS integration_ pages, WebKit's and Apple's material on Home Screen web
  apps (iOS 26) and Dock web apps (macOS 14 onward), and a public matrix of what installed web apps do with links.
- **Nothing was run on a device for this document.** Each platform's row below says what the documentation promises; the spike in the
  recommendation turns each into an observed result before an RFC relies on it.

## Findings

1. **Why the address bar appears.** An installed app's window covers its scope. Core's scope is core's host, so a navigation to
   `tusk.<domain>` leaves it. Every platform answers that the same way: it shows the address in a browser view over or inside the window
   (a Custom Tab on Android, a Safari view on iPhone, a minimal browser frame on desktop). A same-tab link, as the app tiles are now, is
   never offered to another installed app: the navigation stays in the window that started it.
2. **Desktop Chrome and Edge hand a new-window navigation to the installed app.** Since Chrome 139 (Windows, macOS, Linux; ChromeOS
   later) a navigation that opens a new top-level browsing context into an installed app's scope launches that app by default, unless
   the person turned "open supported links" off in the app's settings. `launch_handler` (since Chrome 110) decides what the launched
   app does: `focus-existing` brings forward a window already open, `navigate-existing` loads the address into it, `navigate-new` opens
   another. `handle_links: "preferred"` (Chrome 140 onward) asks for links to be captured. Two exceptions: a browser tab already open in
   the app's scope is reused instead, and capture from inside another installed app's window (as opposed to a browser tab) is described
   for `window.open` only from Chrome 151, so a `target="_blank"` link from core's window is the case to see on a device.
3. **Android hands a link to an installed app through its intent filters.** Chrome makes each installed app a WebAPK, which Android
   registers as the handler of its scope. A link from another app opens the WebAPK. A `target="_blank"` link clicked in Chrome, or in
   another installed Chromium app, opens it too; a same-tab navigation does not. Firefox and Samsung Internet installs register no
   intent filters. An `intent://<host><path>#Intent;scheme=https;S.browser_fallback_url=…;end` address is a fallback if the plain link
   is not handed over; it is not needed if it is.
4. **iPhone and iPad have no way to do it.** Since iOS 26 every site added to the Home Screen opens as a web app by default, but iOS
   gives web apps no link capture: nothing opens a Home Screen web app except its icon. An address outside the app's scope opens in a
   Safari view over the app, with a Done button that returns to it. No markup, manifest member or address scheme changes that.
5. **macOS Safari's Dock apps do not capture links from each other.** Links inside a Dock app's scope stay in it; links outside open in
   the default browser; `handle_links` is not supported. Reports of how subdomains are treated differ between macOS 14 and 15, and Safari
   treats an address opened by `window.open` as in the app. A Dock core cannot open a Dock Tusk.
6. **Custom protocol handlers are a desktop feature.** `protocol_handlers` (`web+tusk:`) launch an installed app on desktop Chromium
   only; on Android and iOS only store-distributed apps register schemes. They add nothing over finding 2 for Sovereign's own apps.
7. **Core needs to know nothing new about an app.** Every mechanism above routes by the address alone. The app's `launchUrl`, already in
   the registry, is all a tile needs; no manifest field, no `getInstalledRelatedApps` detection (it only finds apps the asking site names
   in `related_applications`, and same-origin ones on desktop).
8. **What an app must declare.** For finding 2: `launch_handler: { client_mode: ['focus-existing', 'auto'] }` and
   `handle_links: 'preferred'`, and a stable manifest `id`. Six of the seven deployed apps have no `id`, so their identity is derived from
   `start_url` (`/`); setting `id: '/'` produces the same identity, which should be seen to keep an existing install before it ships.
9. **The two rules a tile must keep.** `'use client'` components never read browser globals in render or a `useState` initializer, and a
   navigation decision is never forked by viewport. A tile that decides "new window or same tab" from `display-mode` has to make the
   decision when it is clicked, in the event handler, where reading `matchMedia` is allowed; the markup stays the same for everyone.
   Display mode is not viewport, but the rule's reason (one decision for everyone, rendered once) is kept by deciding at click time.
10. **Shortcuts already open in a new tab.** A shortcut tile is `external`, so a shortcut to a site the person has installed is handed to
    it wherever finding 2 or 3 applies. What shortcuts cannot do is open a native app: `urlProblem` accepts `https` only (http on
    localhost in development), by design. Native apps take links through their own schemes (`spotify:`, `obsidian://`, `zoommtg:`) or,
    on phones, through https links they claim themselves, which a new-tab link reaches already.

## Options

### A. Leave it, and say so

Keep tiles as they are and document the behaviour (RFC 0001 §6 and the deployment guide already do). Nothing changes on any platform.

### B. Open in a new window when installed, decided at click time (recommended)

- **App tiles** render as now. When clicked inside an installed core (`display-mode` is `standalone`, `minimal-ui` or
  `window-controls-overlay`), the handler opens `launchUrl` in a new top-level context (`target="_blank"`, `noopener`) instead of the
  same window. In a browser tab, nothing changes.
- **Every app declares** `launch_handler` and `handle_links` and a stable `id` (finding 8), through the manifest builder that
  `@sovereignfs/pwa` will give the template and the apps.
- **Result by platform (to be seen on devices):** desktop Chrome and Edge, and Android Chrome, open the installed app; where it is not
  installed, a browser tab (desktop) or a Custom Tab (Android) opens, as now. iPhone, iPad and macOS Safari cannot (findings 4, 5); there
  the new-window link opens a Safari view or the default browser, which closes back to core, no worse than today. The launcher says
  nothing extra; an installed app is its own icon on those devices.
- Changes `AppTile` in the published `@sovereignfs/ui`: a way for the consumer to pass the click behaviour (the package stays
  framework-agnostic; the decision is core's).

### C. B plus the Android `intent:` address

Rewrite the address to an `intent:` one on Android when B's plain link is seen not to be handed over. Only if the spike shows it is
needed: it is Android-only, and the fallback address is one more thing a person could be sent through.

### D. A protocol handler per app

Each app registers `web+sv-<app>:` and tiles use it in an installed core. Desktop only (finding 6), adds a manifest field per app and a
contract change, and does nothing finding 2 does not. Rejected.

### Shortcuts: an "open in the app" address

A shortcut gains an optional second address, used only when the shortcut is opened from an installed core or a phone, that may name a
native app's scheme. The main address stays `https` and is what a browser opens. The second is checked by an allow-list, not a deny-list:
a scheme of letters, digits, `+`, `-` and `.`; never `javascript`, `data`, `vbscript`, `file`, `blob`, `about`, `http`, `https`
(those belong in the main address), or `intent`; no control characters; a length cap. The tile opens it at click time and falls back to
the main address if nothing handles it. It needs a schema change on every dialect and a security check before it ships.

## Recommendation

1. **Spike first.** A throwaway pair of installable pages on two https hosts of the suite, one linking to the other same-tab, with
   `target="_blank"`, and with `window.open`, the target declaring `launch_handler`, `handle_links` and an `id`. Run it on desktop Chrome
   and Edge, Android Chrome, an iPhone and macOS Safari, each with the target installed and not, and record the results in this document.
2. **Then option B**, written into RFC 0001 as an amendment (§6 rewritten), with C held in reserve for Android.
3. **What every app owes** (the audit checklist): `id`, `launch_handler`, `handle_links`, besides the installability items the apps
   already mostly have. It goes into `@sovereignfs/pwa`'s manifest builder, so the template has it by default.
4. **Shortcut deep links** as their own task, after B, with the allow-list above and `sv-security-check`.
5. **Say plainly where it cannot work:** iPhone, iPad and macOS Safari open a browser view; the deployment guide and the launcher's help
   say so, without a hint inside the launcher that nags.

## Sources

- Chrome for Developers, _Navigation management into installed PWAs_ and _Launch handler API_
- Chrome for Developers, _PWAs as URL handlers_ (superseded by `handle_links`); blink-dev PSA, _Navigations can now be captured into an
  installed PWA_
- web.dev, _WebAPKs on Android_ and _Learn PWA: OS integration_
- What PWA Can Do Today, _Link handling_
- Apple WWDC23 session 10120, _What's new in web apps_; WebKit and press coverage of iOS 26's Home Screen web apps
