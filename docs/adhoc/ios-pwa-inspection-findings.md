# iOS PWA inspection findings

**Status: ✅ Complete — all 5 findings resolved (2026-07-02).** See the resolution
table below. Remaining follow-up is production-build / on-device verification
only (service worker and home-screen launch behaviour can't be exercised in dev).

**Date:** 2026-07-02
**Instance tested:** local dev server (`pnpm dev`, runtime on `:3000`) exposed via ngrok, i.e. the same build an iPhone reaches through the tunnel.
**Method:** emulated iPhone viewport (390×844, DPR 2) in a Chromium-based inspector; light and dark color schemes; full user flows exercised — sign-up → home → Apps drawer → Search overlay → Tasks plugin (list creation) → account menu → sign-out → sign-in. PWA plumbing (manifest, icons, meta tags, service worker, CSP) inspected directly; iOS-specific behavior (safe-area, viewport units, overscroll, focus zoom) verified against source.

No console errors or warnings were produced anywhere in the session.

Related: [pwa-real-device-testing.md](../pwa-real-device-testing.md) for on-device verification of anything fixed from this list.

---

## Resolution status (updated 2026-07-02)

| #   | Issue                            | Status    | Where the fix lives                                                                                            |
| --- | -------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Input focus-zoom                 | **Fixed** | `packages/ui` — Input + Select (`@sovereignfs/ui` 0.22.1)                                                      |
| 2   | Static dark `theme-color`        | **Fixed** | `runtime/src/theme-script.ts`, `runtime/app/layout.tsx`, `plugins/account` ThemeControl                        |
| 3   | Tasks sidebar stale after create | **Fixed** | `sovereign-tasks` plugin repo (`ListSidebar.tsx`) — separate repo, needs its own commit                        |
| 4   | `/login` shown to authed users   | **Fixed** | `runtime/src/server-session.ts` + login/register pages                                                         |
| 5   | Missing iOS splash images        | **Fixed** | `scripts/generate-splash.ts` → `runtime/public/icons/splash/` + `runtime/src/apple-splash.ts`, wired in layout |

Verification was done against the running dev instance (emulated 390×844): single
authoritative `theme-color` meta that flips light/dark and survives soft
navigation; `/login` and `/register` redirect an authenticated visitor to `/`;
the Tasks sidebar shows a newly created list without a reload; 84
`apple-touch-startup-image` links render in `<head>` with correct light/dark
media queries and the images resolve (200). The input-zoom CSS rule ships for
both Input and Select (`@media (pointer: coarse)` → 16px) — confirmed present in
the served CSS; the emulator reports a fine pointer, so the final proof is an
on-device tap-without-zoom per
[pwa-real-device-testing.md](../pwa-real-device-testing.md).

Caveat carried over from testing: the service worker is disabled in dev, so
offline/caching and the installed-PWA launch experience (splash shows only on a
real home-screen install) still need a production-build / on-device
verification.

---

## Issues

### 1. Text inputs trigger iOS focus-zoom — highest user impact

**Symptom.** Tapping any text field on an iPhone (Safari tab _and_ installed PWA) zooms the whole page in. Affects every field in the product: login email/password, register form, home "Search apps", Tasks "Add a task…".

**Root cause.** iOS Safari auto-zooms when a focused input's font-size is below 16px. The shared `Input` component renders at 14px — `packages/ui/src/components/Input/Input.module.css` line 6 sets `font-size: var(--sv-font-size-sm)`, and `--sv-font-size-sm` is `0.875rem` (14px) in `packages/ui/src/tokens/primitives.css`. The viewport meta (correctly) does not set `maximum-scale`, so nothing suppresses the zoom.

**Fix.** Bump the effective input font-size to ≥16px on touch devices inside the `Input` component CSS, e.g.:

```css
@media (pointer: coarse) {
  .input {
    font-size: var(--sv-font-size-md); /* 16px — prevents iOS focus zoom */
  }
}
```

Do **not** fix this by adding `maximum-scale=1` / `user-scalable=no` to the viewport meta — that suppresses pinch-zoom for low-vision users (accessibility regression) and only masks the cause.

Note `packages/ui` is a published design-system contract: this is a visual change to a public component, so it needs a Storybook check and a version bump per NFR-04 rules (non-breaking → patch/minor).

---

### 2. `theme-color` is hard-coded dark while the app supports light mode

**Symptom.** In light mode, browser/OS chrome (Safari tab bar tint, Android status bar) renders near-black around a white UI. On Android, a light-mode install still gets a dark splash screen.

**Root cause.** Two places declare dark-only colors:

- `runtime/app/layout.tsx` line 40: static `themeColor: '#09090b'` in the Next metadata export.
- `runtime/app/api/manifest/route.ts` lines 35–36: `background_color: '#09090b'`, `theme_color: '#09090b'`. The manifest `background_color` drives the Android splash; `theme_color` tints Android system UI.

The app itself resolves `data-theme="light" | "dark"` at runtime, so the static value is wrong half the time.

**Fix.** Next metadata supports media-qualified theme colors — replace the static value with:

```ts
themeColor: [
  { media: '(prefers-color-scheme: light)', color: '<light surface token value>' },
  { media: '(prefers-color-scheme: dark)', color: '#09090b' },
],
```

Use the light-mode `--sv-color-surface` value for the light entry. The manifest cannot be media-qualified (single value per spec); either keep it dark as the lesser evil, or pick based on a future instance-theme setting when CON-08 theming lands. If the user's theme preference is stored server-side, `/api/manifest` could read it — but manifests are cached aggressively, so don't rely on it being fresh.

Caveat: if the in-app theme toggle can diverge from the OS scheme (user forces light while OS is dark), the media-query approach follows the OS, not the app. Full correctness requires swapping the `<meta name="theme-color">` value from the theme-switch code path as well.

**Implemented (diverged from the above).** The media-qualified `viewport.themeColor` approach was tried and abandoned: Next's metadata reconciler re-inserts its own copy during hydration, so a server-rendered meta ends up **duplicated** and the browser honours the last one. The shipped fix instead removes `themeColor` from the `viewport` export entirely and lets the pre-paint theme script own a single `theme-color` meta (create-or-update to `#ffffff`/`#09090b`), with `plugins/account` `ThemeControl` updating it on live toggle. This also handles the cookie-driven light/dark override that a media query can't. Editing the pinned theme script required recomputing `THEME_SCRIPT_CSP_HASH` in `runtime/src/security.ts`. The manifest route's `theme_color`/`background_color` were left dark (single-value, not media-qualifiable).

---

### 3. Tasks plugin: sidebar does not refresh after creating a list

**Symptom.** Creating a list via "+" → name → Enter opens the new list in the detail pane, but the "MY LISTS" sidebar still shows "No lists yet. Create one above." The new list only appears after a full page reload.

**Root cause.** State-sync bug in the tasks plugin: the create action updates whatever state drives the detail pane but never updates (or revalidates) the collection behind the sidebar list. Sidebar component: `plugins/sovereign-tasks.local/app/ListSidebar.tsx`. Reproduced on the running instance; the exact wiring (local state vs. server revalidation) should be confirmed in the plugin repo — the fix belongs there, not in this monorepo.

**Fix.** After a successful create, either update the shared client state that the sidebar renders from, or trigger the same refetch/`router.refresh()`/revalidation path the sidebar uses on first load. A reload-shaped fix (full navigation) would also mask it but is the wrong tool.

**Related copy nit (mobile).** The empty states say "Create one above" and "Choose a list from the sidebar". On the stacked mobile layout there is no visible "sidebar" and the create control is a small "+" in the same row — the copy reads wrong on a phone. Per naming conventions, user-facing copy tweaks here should keep "app" terminology if any is added.

---

### 4. `/login` renders the sign-in form for already-authenticated users

**Symptom.** With a valid session, navigating to `/login` shows the sign-in form instead of redirecting to `/`.

**Why it matters for iOS PWA.** Standalone apps restore their last URL on relaunch. A user whose app last sat on `/login` (e.g. after a previous sign-out) relaunches into a login form even though their session is valid — they either sign in redundantly or get confused.

**Root cause.** The middleware guards protected routes (redirects unauthenticated → `/login`) but has no inverse rule: `/login`, `/register`, and the other public auth pages don't check for an existing session. Verified live: with a valid session cookie, `GET /` returns 200 while `GET /login` serves the form.

**Fix.** In `runtime/middleware.ts` (or in the login page's server component), when the session cookie verifies for a request to `/login` or `/register`, 303-redirect to `/`. Reuse the existing offline cookie-cache verification so this adds no auth-server round-trip on the hot path. Keep `/login?signedout=1` behavior intact — that arrives cookie-less after logout, so it is unaffected.

---

### 5. No iOS splash screens (`apple-touch-startup-image`)

**Symptom.** Cold-launching the installed PWA on an iPhone shows a blank white flash before the app paints — jarring against a dark theme.

**Root cause.** The document head contains zero `<link rel="apple-touch-startup-image">` entries. iOS ignores the manifest's `background_color`/icons for launch screens; it only honors these Apple-specific links, and it requires exact per-device-resolution images (each device picks the link whose media query matches its screen).

**Fix (implemented).** Added `scripts/generate-splash.ts` (`pnpm generate:splash`), which uses `sharp` (a devDependency — nothing native is needed at build/runtime since the PNGs are committed) to composite the brand mark (`favicon.svg`) onto the light/dark surface colours for a comprehensive Apple device matrix (21 devices × portrait/landscape × light/dark = 84 PNGs, palette-compressed to ~0.8 MB total). Output goes to `runtime/public/icons/splash/`, and the script also emits `runtime/src/apple-splash.ts` — the `{ url, media }` list consumed by `metadata.appleWebApp.startupImage` in `runtime/app/layout.tsx`. Each device gets both a `(prefers-color-scheme: light)` and `(prefers-color-scheme: dark)` link. Regenerate (e.g. when Apple ships new screen sizes) by appending to the `DEVICES` array and re-running. The PNGs ship via `runtime/public` (already `COPY`d in the Dockerfile), so no Docker change is required.

---

## Testing caveats (not bugs)

- **No service worker on the dev/ngrok instance.** `/sw.js` is 404 because next-pwa is disabled in development (`runtime/next.config.ts` line 54, by design). Everything tested through the ngrok tunnel therefore has **no offline support and no caching**, and the `/offline` page (which exists and renders fine) is unreachable organically. Offline behavior, install-update cycles, and caching must be verified against a production build (`pnpm build` / Docker). See [pwa-real-device-testing.md](../pwa-real-device-testing.md).
- Next.js emits `mobile-web-app-capable` but not the legacy `apple-mobile-web-app-capable` meta. Irrelevant on any iOS version that reads the web-app manifest (iOS 11.3+); informational only.
- The account menu opens on `pointerdown` (Radix-style). Real taps are unaffected — only synthetic-click test tooling needs to send pointer events. Hit-testing on all controls resolved to the correct elements; no overlay/z-index problems.

## Verified healthy

- **Manifest** (`/api/manifest`): `display: standalone` (+ `display_override`), `scope: /`, `start_url: /`, shortcuts, valid icon set — 192/512 `any` + 512 `maskable`, all served 200 with correct intrinsic sizes; `apple-touch-icon` is a proper 180×180.
- **Viewport & safe areas:** `viewport-fit=cover` present; `env(safe-area-inset-*)` handled in the shell header, mobile nav, mobile search, and the UI `Drawer`; `100dvh` with `100vh` fallback plus the `--sv-vh` stale-dvh workaround; overscroll containment on drawer/dialog/search surfaces.
- **Auth stays same-origin end to end** — login, register, and logout (`POST /api/account/logout` → 303 `/login?signedout=1`, with a visible signed-out notice) never leave the runtime origin, so the installed PWA never breaks out of standalone mode. Session is rejected immediately after logout (cache cookies cleared correctly).
- **Layout:** no horizontal overflow at 390px on any screen tested; Apps drawer and Search overlay render and behave correctly in both light and dark themes.
- **CSP:** nonce-based `script-src`, no `unsafe-inline` scripts; `form-action` includes the auth origin.

## Suggested priority

| #   | Issue                            | Priority                                    | Where                                             |
| --- | -------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| 1   | Input focus-zoom (14px inputs)   | High — felt on every field, every day       | `packages/ui` Input                               |
| 3   | Tasks sidebar stale after create | High — core flow visibly broken             | tasks plugin repo                                 |
| 2   | Static dark `theme-color`        | Medium — cheap fix, visible chrome mismatch | `runtime/app/layout.tsx`, manifest route          |
| 4   | `/login` shown to authed users   | Low — relaunch edge case                    | `runtime/middleware.ts`                           |
| 5   | Missing iOS splash images        | Low — polish                                | `runtime/app/layout.tsx`, `runtime/public/icons/` |
