# Troubleshooting

Known issues, workarounds, and debugging notes for Sovereign development and self-hosting.

---

## Development server

### `better-sqlite3.node` was compiled against a different Node.js version

**Symptom:** `pnpm dev` starts compiling auth/runtime instrumentation, then fails
with an error like:

```text
The module '.../node_modules/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using NODE_MODULE_VERSION ...
This version of Node.js requires NODE_MODULE_VERSION ...
Please try re-compiling or re-installing the module
```

**Cause:** `better-sqlite3` is a native Node module. Its compiled binary is tied
to the Node ABI version that was active when `node_modules` was installed. This
happens when the checkout's dependencies were installed or rebuilt with one Node
version and `pnpm dev` later runs with another. Sovereign pins local development
to Node 24, matching the Docker `node:24-alpine` images, so Node 26-built
bindings will fail under a Node 24 dev process.

**Diagnose:** In the same terminal where `pnpm dev` fails, check the active Node
version and ABI:

```bash
node -p "process.version + ' ABI ' + process.versions.modules"
```

If the error says the installed binary was compiled for a different
`NODE_MODULE_VERSION`, first make sure the repository's pinned Node is active:

```bash
nvm use
node -p "process.version + ' ABI ' + process.versions.modules"
```

The expected local major version is Node 24. If your shell reports a different
major, fix that before rebuilding dependencies.

**Fix:** First try rebuilding the native dependency:

```bash
pnpm rebuild better-sqlite3
pnpm dev
```

If the mismatch persists, remove the stale install and reinstall:

```bash
rm -rf node_modules
pnpm install
pnpm dev
```

Make sure the same Node version is active for both `pnpm install` and
`pnpm dev`. The repo includes `.nvmrc`, `.node-version`, `engines.node`, and
pnpm `engine-strict`/`use-node-version` settings so unsupported Node majors fail
early instead of silently compiling incompatible native bindings. Docker
production images build their own dependencies inside the container, so this is
a local/native development issue.

---

### 404 on first navigation to an overlay plugin after server restart

**Symptom:** Clicking the Console or Account icon in the sidebar shows "404 — This page could not be found." The server log shows `200` for the same request (or the route compiles immediately before the 200 line).

**Cause:** Overlay plugins (`shell: "overlay"`) compose into two places:

1. A full-page fallback under `(plugins)/<routePrefix>/`
2. An interception copy under `(plugins)/@modal/(.)<routePrefix>/`

Next.js compiles App Router routes **lazily** — each route only compiles on its first request. On a cold dev-server start, the `/(.)console` (or `/(.)account`) interception route has never been compiled. A soft-navigation that arrives during that compilation window gets a broken React tree: the `@modal` slot can't resolve the intercepted segment and renders nothing, while the children stay on the previous page. The result looks like a 404 even though the HTTP response is 200.

**Workaround:** Do a hard reload (**Cmd+R** on macOS, **Ctrl+R** on Windows/Linux) after the server finishes compiling. The route will be ready by then and the hard reload fetches a fresh server render.

**Why it doesn't recur:** Once compiled, the interception route stays in Next.js's in-memory route cache for the lifetime of the dev-server process. Subsequent soft-navigations work immediately.

**Not a bug in the compose output:** You can verify the routes are correctly placed with:

```bash
ls runtime/app/\(platform\)/\(plugins\)/@modal/
# Should show: (.)account  (.)console  default.tsx  layout.tsx
```

If the interception directories are missing, re-run `pnpm generate` to recompose plugin routes.

---

### Intermittent 404 on plugin routes during development (spurious recompiles)

**Symptom:** A plugin page that was working suddenly 404s on soft-nav without any code change. A hard reload fixes it.

**Cause (historical):** Before the `syncDir()` fix in `scripts/generate-registry.ts`, the generate watcher re-copied every plugin route file on every manifest change — updating mtimes even when file content was unchanged. Next.js's dev route watcher treated those mtime changes as route invalidations, evicting compiled route entries from its cache. A soft-nav during the recompile window got the same broken-React-tree 404 as above.

**Current behaviour:** `syncDir()` performs a content-aware incremental copy: it only writes a file if its size or mtime differs from the destination. Unchanged files are not touched, so their mtimes stay stable and Next.js does not invalidate them.

If you see this in a fresh checkout, check that `syncDir` is in use in `composePlugins()` inside `scripts/generate-registry.ts`.

---

### `/(.)console` or `/(.)account` 404 persists after hard reload

If Cmd+R doesn't fix it, the interception copy is likely missing from disk. This can happen if:

- `pnpm generate` was interrupted mid-run.
- The `(plugins)/.gitignore` keep-list was accidentally edited to exclude `(.)console` or `(.)account`.

Check and re-run:

```bash
ls runtime/app/\(platform\)/\(plugins\)/@modal/
pnpm generate   # recomposes all plugin routes
```

---

## iOS PWA / mobile

The layout entries below are two distinct iOS-specific bugs, both surfaced
only on real devices (installed standalone PWA and/or mobile Safari). They
look similar — "empty space at the bottom" — but have different causes and
fixes. The push entry is a configuration trap that only manifests on Apple
devices.

### Push notifications never arrive on iOS (the in-app bell works)

**Symptom:** Notifications appear in the in-app notification pane, and push
works on Android/desktop Chrome — but an iPhone/iPad running the installed
PWA never shows a system notification.

**Most common cause — `VAPID_CONTACT` unset.** Apple's push service validates
the VAPID JWT subject and rejects the `mailto:admin@localhost` fallback with
403, so every send to an iOS device fails while Chrome's push service (which
is lenient) keeps working. Set `VAPID_CONTACT=mailto:<address you monitor>`
in the runtime's environment and restart — no re-subscription is needed; the
subject is stamped per send. The runtime warns at first send
(`push: VAPID_CONTACT is unset or points at localhost…`) when this applies.

**Checklist if that isn't it** (check the runtime logs for `push: send failed`
entries with `pushService: web.push.apple.com` — the `statusCode`/`body`
fields say which of these it is):

1. iOS 16.4+ and the app **installed via Add to Home Screen and opened from
   the home-screen icon** — Safari-tab subscriptions don't exist on iOS.
2. Push enabled **from within the installed PWA** (Account → Notifications →
   enable on this device), and iOS Settings → Notifications shows the app
   with Allow Notifications on.
3. The notification's category isn't muted in Account → Notifications (muted
   categories skip the push branch entirely — nothing is logged).
4. `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` set on the **runtime** service (not
   just the auth service) — without both, push is disabled platform-wide and
   the Account toggle hides itself.
5. Web Push requires the production build: the service worker (and therefore
   push) is disabled in `pnpm dev`.

### Sign-in screens rubber-band / bounce on press-and-drag

**Symptom:** On iOS (Safari or the installed PWA), pressing and dragging a finger
on the sign-in / register / 2FA screens makes the **whole page bounce** — the
card slides up under the status bar, a band of empty background appears below,
then it springs back on release. The content already fits; nothing should
scroll.

**Cause:** `.page` used `min-height: 100vh` with the **document** (`html`/`body`)
as the scroller. iOS applies elastic overscroll (rubber-band) to the document
scroller **even when nothing overflows**, so any drag bounces the page. The
runtime shell was already hardened against this, but the auth screens — the
standalone `apps/auth` app and the runtime's own `/login`, `/register`,
`/login/2fa` (which live outside the `(platform)` shell) — were not.

**Fix:** Stop the document from being the scroller and suppress the bounce:

- Set `overscroll-behavior: none` on `html, body` (and `overflow: hidden` where
  the whole app is auth-only, e.g. `apps/auth/app/globals.css`). In the runtime,
  `overscroll-behavior: none` goes in the global `globals.css` — a CSS Module
  **cannot** carry a purely `:global(html)` rule (it fails the "pure selector"
  build check), so it can't be scoped inside `login.module.css`.
- Make `.page` the viewport-sized scroll surface: `height: 100dvh`,
  `overflow-y: auto`, `overscroll-behavior: none`, and
  **`align-items: safe center`** so a taller form (register / 2FA) still scrolls
  from the top instead of being centred with its top clipped above the scroll
  origin.

### Empty strip below the footer / login card in the installed PWA

**Symptom:** In the **installed standalone PWA**, a strip of the page background
shows **below the bottom nav** on Home (and below the login card after logout).
It's **intermittent** — the same screen sometimes renders correctly and
sometimes with the strip, depending on the launch.

**Cause:** iOS standalone PWAs intermittently report the viewport
**~status-bar height short at launch/resume** — e.g. `793` instead of the true
`852` — and the short value appears across `window.visualViewport.height`,
`window.innerHeight` **and CSS `100dvh` simultaneously**, never self-correcting
until a reflow. Anything sized to those units (the shell's `height: var(--sv-vh)`,
the auth `.page`'s `100dvh`) therefore comes up short, exposing the darker
`<body>` backdrop below it. **`window.screen.height` stays correct** throughout.

Confirmed by an on-device readout: in the bad state `visualViewport.height`,
`innerHeight` and `100dvh` were all `793` while `screen.height` was `852`; in the
good state all four were `852`.

**Fix:** Derive the full-screen height from `window.screen.height` — the one
reliable metric — rather than the viewport units:

- Shared helper `runtime/src/viewport-height.ts` returns `screen.height` **in
  portrait standalone with the keyboard closed**, and falls back to the measured
  visual viewport everywhere else (browser tabs, where it must sit inside the
  browser chrome; landscape, where `screen.height` is unreliable; and while the
  software keyboard is up, where the shrunk height is wanted so fixed footers
  stay above the keyboard).
- `ClientShell` pushes it onto `--sv-vh` for the platform shell; a small
  `ViewportHeightSync` client component does the same for the auth pages (which
  are outside the shell), and their `.page` consumes `height: var(--sv-vh, 100dvh)`.

**Diagnosing on-device without Web Inspector:** if a USB/Web-Inspector connection
isn't available, a throwaway fixed-position overlay that prints
`visualViewport.height` / `innerHeight` / a measured `100dvh` probe /
`screen.height` / the shell's `offsetHeight` (updated on `resize`,
`orientationchange` and `visibilitychange`) is enough to read the values straight
off the phone.

---

## Docker / production

See [`docs/self-hosting.md`](self-hosting.md) for Docker-specific troubleshooting (volume ownership, `pnpm-workspace.yaml` marker, IPv4 healthcheck, etc.).

---

### Full-page 404 opening an overlay route (Account/Console) in production or the desktop app

**Symptom:** Clicking the Account or Console icon shows the styled full-page "404 — This page could not be found. / Go home" — not the dialog. Most often seen **right after opening the app** (or the desktop shell), and a **reload loads the full dialog and the 404 goes away**. This is the production/deployed cousin of the dev-server cold-compile 404 documented above; the visible result is the same styled 404, but the cause is different.

**Cause:** Overlay pages are React Server Components that fetch during render (e.g. `security/page.tsx` fetches the session and passkeys from the auth server; Console pages self-fetch their data). On a cold client — the `@modal` interception route not yet initialised in the client router tree, or a fetch failing because the auth server is briefly unreachable (the middleware still lets the request through on its 300 s signed session-data cookie cache) — the overlay page throws during render. Next.js 15 surfaces an **unhandled** RSC error in a parallel-route slot as a full-page 404 rather than routing it to the slot's error boundary.

**Current protection (why it should not recur):**

1. `runtime/app/(platform)/(plugins)/@modal/error.tsx` — the slot-level error boundary. It confines any overlay render error to a recoverable "This page could not be loaded / Try again" state **inside the open dialog**, so the failure never escapes the slot as a 404.
2. Per-page fetch guards — `account/{profile,preferences,data,activity}` and `console/{plugins,users,health,activity}` wrap their self-fetches in `try/catch` with safe fallbacks so a failed response returns empty data instead of throwing.

If the styled 404 reappears on a deployed instance, the most likely explanation is that the instance is running a build from **before** these fixes (2026-06-28), or the boundary/guards regressed. Confirm the running build with `GET /api/admin/health` → `platformVersion`, and check the browser devtools Network tab at the moment of the 404 for a failed RSC request to an overlay route.

**Residual gap:** `plugins/account/app/security/page.tsx` still has unguarded `await fetch(...)`/`sdk.auth.listSessions()` calls — it currently relies solely on the `@modal/error.tsx` boundary rather than its own fallbacks like the sibling pages. Wrapping those in `try/catch` would make the Security tab resilient on its own.

**Desktop shell note:** the shell has no reload shortcut wired yet, so the "just reload" workaround is not available to end users there. Because the shell is a thin WebView that renders whatever the instance serves, a 404 seen in the desktop app is instance-side — debug it against the instance, not the shell.

---

### Login loops back to the login page on a VPS deployment

**Symptom:** Navigating to the runtime (`http://VPS_IP:4000`) immediately
redirects to the auth login page. After signing in, the browser is sent to
`localhost:4000` (or `localhost:3000`) instead of the server — and the login
page appears again.

**Cause:** `AUTH_BASE_URL` and `NEXT_PUBLIC_RUNTIME_URL` were not set, so they
defaulted to `localhost:*`. Those addresses are only reachable from inside the
server itself; a remote browser that follows them goes nowhere (or to the wrong
machine entirely) and ends up back at the login page.

**Fix:** Add these three variables to `.env` before starting the stack:

```bash
AUTH_BASE_URL=http://YOUR_VPS_IP_OR_DOMAIN:4001
NEXT_PUBLIC_RUNTIME_URL=http://YOUR_VPS_IP_OR_DOMAIN:4000
AUTH_TRUSTED_ORIGINS=http://auth:3001
```

Restart both containers after editing `.env`:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

See [Deploying to a real VPS or server](self-hosting.md#deploying-to-a-real-vps-or-server) for the full setup with TLS/domain examples.

---

### Docker image not found when using `SOVEREIGN_VERSION`

**Symptom:** `docker compose -f docker-compose.prod.yml up -d` fails with
`manifest unknown` or `not found` when `SOVEREIGN_VERSION` is set.

**Cause:** The image names in `docker-compose.prod.yml` reference
`ghcr.io/sovereignfs/sovereign-auth` and `ghcr.io/sovereignfs/sovereign-runtime`.
If you see a different org name, the file may be out of date.

**Fix:** Pull the latest `docker-compose.prod.yml` from the repo — the org name
was corrected to `sovereignfs` to match the GitHub Container Registry packages:

```bash
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
