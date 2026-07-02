# Troubleshooting

Known issues, workarounds, and debugging notes for Sovereign development and self-hosting.

---

## Development server

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

## iOS PWA / mobile layout

Two distinct iOS-specific layout bugs, both surfaced only on real devices
(installed standalone PWA and/or mobile Safari). They look similar — "empty
space at the bottom" — but have different causes and fixes.

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
