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

## Docker / production

See [`docs/self-hosting.md`](self-hosting.md) for Docker-specific troubleshooting (volume ownership, `pnpm-workspace.yaml` marker, IPv4 healthcheck, etc.).

---

### Full-page 404 opening an overlay route (Account/Console) in production or the desktop app

**Symptom:** Clicking the Account or Console icon shows the styled full-page "404 — This page could not be found. / Go home" — not the dialog. Most often seen **right after opening the app** (or the desktop shell), and a **reload loads the full dialog and the 404 goes away**. This is the production/deployed cousin of the dev-server cold-compile 404 documented above; the visible result is the same styled 404, but the cause is different.

**Cause:** Overlay pages are React Server Components that fetch during render (e.g. `security/page.tsx` fetches the session and passkeys from the auth server; Console pages self-fetch their data). On a cold client — the `@modal` interception route not yet initialised in the client router tree, or a fetch failing because the auth server is briefly unreachable (the middleware still lets the request through on its 300 s signed session-data cookie cache) — the overlay page throws during render. Next.js 15 surfaces an **unhandled** RSC error in a parallel-route slot as a full-page 404 rather than routing it to the slot's error boundary.

**Current protection (why it should not recur):**

1. [`runtime/app/(platform)/(plugins)/@modal/error.tsx`](<../runtime/app/(platform)/(plugins)/@modal/error.tsx>) — the slot-level error boundary. It confines any overlay render error to a recoverable "This page could not be loaded / Try again" state **inside the open dialog**, so the failure never escapes the slot as a 404.
2. Per-page fetch guards — `account/{profile,preferences,data,activity}` and `console/{plugins,users,health,activity}` wrap their self-fetches in `try/catch` with safe fallbacks so a failed response returns empty data instead of throwing.

If the styled 404 reappears on a deployed instance, the most likely explanation is that the instance is running a build from **before** these fixes (2026-06-28), or the boundary/guards regressed. Confirm the running build with `GET /api/admin/health` → `platformVersion`, and check the browser devtools Network tab at the moment of the 404 for a failed RSC request to an overlay route.

**Residual gap:** [`plugins/account/app/security/page.tsx`](../plugins/account/app/security/page.tsx) still has unguarded `await fetch(...)`/`sdk.auth.listSessions()` calls — it currently relies solely on the `@modal/error.tsx` boundary rather than its own fallbacks like the sibling pages. Wrapping those in `try/catch` would make the Security tab resilient on its own.

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
