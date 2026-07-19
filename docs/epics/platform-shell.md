# Epic: Platform Shell

> The Sovereign Core — the Next.js runtime host, middleware, shell modes, and SDK bridge that every plugin runs inside.

## Status

⏳ In Progress

## Overview

The Platform Shell is the runtime that composes plugins into a coherent experience. It owns the sidebar chrome, the three shell modes (`default`, `overlay`, `minimal`), request authentication, CSP/security headers, the cross-plugin data sharing mechanism, and the SDK host implementation that bridges plugin code to platform services. Once this epic completed, all subsequent work is either new features layered on top or hardening of what the shell provides.

## Tasks

#### ✅ 2.1 — Runtime scaffold

**Goal:** Sovereign Core Next.js app scaffold with shell layout, middleware, and root placeholder page. No plugins wired yet.

**Deliverables:**

- `runtime/` — Next.js 15 app with App Router:
  - `app/(platform)/layout.tsx` — shell layout implementing the three-section sidebar (PLT-11):
    - **Top:** branding header — logo / tenant name; links to `/`.
    - **Middle:** plugin icon area. In the v0.3 scaffold this section is empty (no plugins installed yet). The first icon will always be the root plugin, pointing to `/` (PLT-12); it is inserted and populated in Tasks 0.4.05 (Launcher) and 0.4.04 (root plugin config). Each icon loads from the manifest `icon` field (path relative to plugin root); runtime generates a two-letter monogram fallback if `icon` is absent.
    - **Bottom:** hardcoded shell chrome, **not** driven by the plugin registry — Console icon (rendered only for `platform:admin`) + Account avatar slot (all authenticated users). This section does not participate in user customisation.
    - Mobile layout: header (logo + Account avatar) + content area + footer launcher (mirrors middle section; Console icon visible to admin only).
  - `app/(platform)/page.tsx` — placeholder redirect page (empty for now; in Task 0.4.04 this redirects to the configured root plugin's `routePrefix`)
  - `app/plugins/` — empty directory with `.gitignore` (generated, never committed)
  - `src/middleware.ts` — reads session cookie, calls `apps/auth /api/verify` to validate session (v0.3 approach — see SRS AUTH-05 for v0.5 local verification target), redirects to `/login` if unauthenticated
  - `src/registry.ts` — reads `generated/registry.ts`, exports installed plugin list
  - `generated/registry.ts` — placeholder empty registry
  - `app/login/route.ts` — redirects unauthenticated users to the auth server's
    login page (the login/registration UI lives in `apps/auth`, not the runtime;
    SRS §3.3). The auth server redirects back after login.
- `runtime/next.config.ts` — must include:
  - `transpilePackages: ['@sovereignfs/sdk', '@sovereignfs/ui',
'@sovereignfs/db', '@sovereignfs/manifest', '@sovereignfs/mailer']` —
    compiles all workspace package TypeScript sources directly during dev.
    Changes to any package file trigger HMR in the runtime without a separate
    watch build. (All packages share the single `@sovereignfs/*` scope; only
    `sdk` and `ui` are published, the rest are `private`.)
  - `webpack: (config) => { config.resolve.symlinks = false; return config; }`
    — required for plugin HMR. Without this, webpack resolves symlinks to
    their real path before watching, breaking hot reload for plugin source
    files that are symlinked into `runtime/app/plugins/` by the generate
    script. Setting `symlinks: false` makes webpack watch the symlink path
    so edits to `plugins/[id]/app/` propagate via HMR immediately.
- `runtime/package.json` — `dev` script runs the generate script before
  starting the dev server: `tsx ../scripts/generate-registry.ts && next dev`.
  The generate script is run synchronously on startup (creates/updates
  symlinks), then Next.js dev server starts.
- Environment: `SOVEREIGN_AUTH_URL`, `SOVEREIGN_AUTH_SECRET`

**SRS reference:** 3.4 Runtime Layer, 3.10 Shared Login State, PLT-01, PLT-02, PLT-08, PLT-11, PLT-12, PLT-13

**Review checklist:**

- Unauthenticated request to `/` redirects to `/login`
- Shell renders correctly on desktop and mobile viewports
- `app/plugins/` is gitignored
- No hardcoded auth secret
- Editing a file in `packages/ui/src/` while `pnpm dev` is running triggers
  HMR in the runtime without any manual rebuild step
- Editing a file in `plugins/console/app/` triggers HMR in the runtime

---

#### ✅ 2.2 — Generate script

**Goal:** Pre-build script that reads plugin manifests, validates them, and injects plugin routes into the runtime.

**Deliverables:**

- `scripts/generate-registry.ts`:
  - Scans `plugins/*/manifest.json`
  - Validates each manifest via `packages/manifest`
  - Fails with a clear error if any manifest is invalid
  - Writes `runtime/generated/registry.ts` — typed array of installed plugin manifests
  - In `development` mode: symlinks `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - In `production` mode: copies `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - Mode determined by `NODE_ENV`
  - `--watch` flag: when passed, watches the `plugins/` directory for new or
    removed plugin directories and re-runs the symlink/copy step automatically.
    Used by `runtime/package.json`'s `dev` script to keep the plugin route
    tree in sync while the Next.js dev server is running. A newly added plugin
    directory is symlinked immediately; developers may need to trigger a route
    refresh in Next.js (fast-refresh boundary), but no manual generate command
    is needed.
- `turbo.json` updated with two additions:
  - `generate` task: `dependsOn: ["packages/manifest#build"]`, outputs
    `["runtime/app/plugins/**", "runtime/generated/**"]`, `cache: false`
    (plugin file state is not cacheable)
  - `runtime#build` override: `dependsOn: ["generate", "^build"]` — ensures
    generate runs and all package deps are built before the runtime Next.js
    build starts. Without this, `next build` may run before plugins are
    composed in.
- `package.json` script: `"generate": "tsx scripts/generate-registry.ts"`

**SRS reference:** 3.9 Plugin Loading Model

**Review checklist:**

- Invalid manifest causes script to exit non-zero with a readable error
- `runtime/generated/registry.ts` is valid TypeScript after running
- Symlinks created in dev mode, copies in production mode
- Running generate with no plugins produces an empty registry without errors

---

#### ✅ 2.3 — SDK implementations (db and platform)

**Goal:** Complete remaining SDK implementations. `sdk.auth` and `sdk.mailer` were wired in Task 0.4.02. This task completes `sdk.db` and `sdk.platform`.

> **Scope update (Jun 2026).** Since this task was written the architecture moved on: `sdk.platform` and `sdk.mailer` are implemented **directly in `packages/sdk`** (via `@sovereignfs/db`/`@sovereignfs/mailer`), not re-exported from the runtime — so the "SDK re-exports runtime implementations" deliverable below is obsolete, and `runtime/src/sdk/*` is not created. `sdk.platform.getConfig()` landed async with Task 0.5.03; this task completes the last stub, `sdk.db.getClient()` (async, returns the live platform Drizzle instance). The **local JWT-verification middleware migration (AUTH-05) is split into its own follow-up task** — it is large and security-sensitive (better-auth currently uses DB-backed session cookies with no JWT/cookie-cache configured; it needs auth-side JWT issuance plus Edge-compatible `jose` verification on the runtime), and the current `/api/verify` round-trip works correctly in the meantime.

**Deliverables:**

- `runtime/src/sdk/db.ts` — real `getClient()` returning scoped Drizzle instance
- `runtime/src/sdk/platform.ts` — real `getConfig()` reading from `tenants` table
- `runtime/src/middleware.ts` — updated to verify JWT locally using `SOVEREIGN_AUTH_SECRET` (replaces `/api/verify` round-trip per SRS AUTH-05)
- SDK package updated to re-export all runtime implementations when running inside runtime context

**SRS reference:** 3.6 SDK

**Review checklist:**

- `sdk.auth.requireSession()` throws when called from an unauthenticated context
- `sdk.db.getClient()` returns a working Drizzle instance
- `sdk.mailer.send()` delegates correctly to packages/mailer
- No stub implementations remain for the v1 SDK surface

---

#### ✅ 2.4 — Public `/api` namespace delegation

**Goal:** Reserve the top-level `/api/*` namespace for plugin-served public APIs, per PLT-16. Required before the API Composer plugin (`docs/plugins/api-composer.md`) can serve its generated APIs.

**Deliverables:**

- Runtime middleware: requests under `/api/*` are exempt from the session-redirect rule (PLT-02) — the serving plugin owns authentication for these routes (API keys per the API Composer spec)
- Route delegation: the runtime rewrites `/api/<segment>/*` to the registered API-provider plugin's serve route (for API Composer: `/api-composer/serve/<segment>/*`)
- Provider registration mechanism — likely a manifest flag (e.g. `apiProvider`); exact shape decided in this task, coordinated with `packages/manifest`. Exactly one provider per instance in v1; the generate script fails loudly if two plugins declare it
- With no provider installed, `/api/*` returns 404

**SRS reference:** PLT-16, `docs/plugins/api-composer.md` (architecture — `/api` namespace delegation)

**Review checklist:**

- An unauthenticated request under `/api/*` is not redirected to login
- `/api/<slug>/<path>` reaches the provider plugin's serve handler with the slug and path intact
- `/api/*` returns 404 when no provider plugin is installed
- Two plugins declaring the provider flag fail the generate step with a clear error

---

#### ✅ 2.5 — Overlay shell mode

**Goal:** Add the `overlay` shell mode from RFC 0001 (SRS §3.8/§3.9) — a plugin renders as a dismissable dialog over the current page, with a full-page fallback on hard navigation — and migrate Console and Account to it. A v0.5 polish item; no hard dependency on the other v0.5 tasks, but it needs the `packages/ui` `Dialog` primitive. Console and Account already ship as `default`/full-page, so this is a retrofit.

**Deliverables:**

- `packages/manifest`: `shell` enum gains `'overlay'`; tests; **minor** version bump
- `packages/ui`: a `Dialog` primitive (scrim + panel, sizes, Esc/scrim-click dismissal, focus trap, `--sv-*` tokens) and its mobile full-screen sheet behaviour
- Runtime: a `@modal` parallel-route slot under `(platform)/` (`default.tsx`, dialog `layout.tsx`); the platform layout renders the slot
- `scripts/generate-registry.ts`: for `shell: overlay`, compose the plugin's `app/` tree twice — interception copy under `(platform)/@modal/(.)<routePrefix>/` and full-page fallback under `(platform)/(plugins)/<routePrefix>/`; emit the mode in the registry
- Root-plugin eligibility (CON-11) excludes `overlay` plugins
- Migrate `plugins/console` and `plugins/account` manifests to `shell: "overlay"`; update `docs/plugins/console.md` and `docs/plugins/account.md`
- `CLAUDE.md`: hard-rule note that the shell route-group mapping gains the overlay compose target

**SRS reference:** RFC 0001, SRS §3.8, §3.9, CON-11, §5

**Review checklist:**

- A soft (in-app) navigation to Console/Account opens it as a dialog over the current page; the underlying page stays mounted and is restored on dismiss
- A hard load / deep link / refresh of `/console` or `/account` renders the full-page fallback
- `adminOnly` gating still returns 403 for Console regardless of presentation mode
- Esc and scrim-click dismiss the dialog; mobile renders a full-screen sheet
- An `overlay` plugin cannot be selected as the root plugin (CON-11)
- The generate script composes both copies; navigating between an overlay plugin's sub-routes stays within the dialog

---

#### ✅ 2.6 — Cross-plugin data sharing (consent-gated)

**Goal:** Implement the consent-gated, pull-based, read-only cross-plugin data-sharing mechanism specified in RFC 0002 / SRS §3.13. The reserved `sdk.data` surface and the `data:provide`/`data:consume` permissions already exist as stubs; this task makes them real. Depends on `sdk.db` (Task 0.5.05).

**Delivered:**

- `@sovereignfs/manifest` → 0.10.0: optional `data.provides[]` / `data.consumes[]` manifest fields; `data:provide` and `data:consume` permissions promoted from reserved to active
- `@sovereignfs/db` → 0.8.0: `consent_grants` and `data_access_log` tables (SQLite + Postgres, bootstrap DDL, dialect-parity-tested); 7 helper functions (`getConsentGrant`, `listConsentGrants`, `listAllConsentGrants`, `createConsentGrant`, `revokeConsentGrant`, `logDataAccess`)
- `@sovereignfs/sdk` → 1.2.0: `sdk.data.provide(contract, resolver)` stores an in-process resolver via the host; `sdk.data.query(ref, params)` consent-checks, calls the resolver, and logs access; `SdkHost` extended with `data` section
- Runtime → 0.13.0: in-memory resolver registry; middleware injects `x-sovereign-plugin-id` for plugin routes; `GET/POST /api/account/data-grants`, `DELETE /api/account/data-grants/[id]`, `GET /api/admin/data-grants`
- Account plugin → 0.3.0: **Data** tab — lists active consents with per-grant revoke
- `docs/plugin-development.md`: `data` manifest field documented, `sdk.data` usage guide with provider/consumer code samples; docs-parity test passes

**Deferred:** `packages/ui` `ConsentPrompt` dialog primitive and Console data oversight view are post-task refinements; the grant management API is fully functional and the Account tab provides user-facing revocation.

**SRS reference:** RFC 0002, SRS §3.13, §5 (manifest `data.*`)

---

#### ✅ 2.7 — Security hardening, Tier 0 + Tier 1

**Goal:** Ship the no-crypto-machinery hardening tiers of RFC 0008 / SRS §3.17 in v1: security headers + threat-model doc (Tier 0) and transport hardening (Tier 1). At-rest encryption and beyond (Tiers 2–4) are deferred post-v1 to Task 1.0.01.

**Deliverables:**

- Tier 0: security headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy) in both Next configs + `runtime/middleware.ts`; cookie-hardening review; codify the no-telemetry guarantee; new `docs/security.md` (threat model + self-hoster hardening checklist)
- Tier 1: Postgres `sslmode=require` + cert handling in `packages/db`; enforce TLS/HSTS at the edge (documented + required); optional shared-secret/mTLS on the internal runtime↔auth channel
- No new app secrets or native deps in this task (those arrive with Tier 2 in Task 1.0.01)

**Dependencies:** none hard (TLS/HSTS doc assumes the reverse proxy already in `docs/self-hosting.md`)

**SRS reference:** RFC 0008 (Tiers 0–1), SRS §3.17, NFR-02/07/08

**Review checklist:**

- Every response carries the security headers; CSP does not break the runtime/auth UIs or the inline theme script
- Postgres connects over TLS when `sslmode=require`; `docs/security.md` documents the threat model and the hardening checklist
- No behaviour change to the existing session/cookie flow

---

#### ✅ 2.8 — Test setup & seeding

**Goal:** A test-data foundation — in-code fixtures/factories plus an idempotent seed with per-role test users — and the dev/prod mode concept.

**Deliverables:**

- In-code fixtures/factories (user/tenant/plugin-status/notification) for unit/integration, placed per RFC 0010's layout
- `sv seed` (`scripts/seed.ts`): idempotent baseline data + per-role test users (admin, user; known passwords via `better-auth/crypto`), **hard-gated to non-prod**
- Document the disposable dev/test DB (config-only via `DATABASE_URL`/`AUTH_DATABASE_URL`); align with the RFC 0010 e2e tier; establish dev (default locally) vs prod mode

**Dependencies:** Task 0.5.16 (test-org layout)

**SRS reference:** RFC 0019

**Review checklist:**

- `sv seed` is idempotent and refuses to run against a prod DB; documented test users can log in
- Fixtures need no running instance or DB

---

#### ✅ 2.9 — Minimal shell mode

**Goal:** Wire the third `shell` mode — `minimal` (chrome-free, full-bleed) — which currently fails the build.

**Deliverables:**

- A new top-level `(minimal)` route group (sibling of `(platform)`) with a committed chrome-free `layout.tsx` (force-dynamic for the CSP nonce; `100dvh` + safe-area per RFC 0013) + `.gitignore`
- `generate-registry`: replace the `minimal` build-fail with a compose target (`(minimal)/<routeSegment>`, multi-segment allowed) + clear step; compose/parity tests
- Root-plugin eligibility keeps minimal allowed (kiosk) with the no-chrome/no-nav caveat + a nav-contract convention documented; CLAUDE.md note

**Dependencies:** builds on the RFC 0001 composition model

**SRS reference:** RFC 0014

**Review checklist:**

- A `shell: minimal` plugin composes to `(minimal)/` and renders chrome-free; the session gate still applies
- It is not wrapped by the `(platform)` shell

---

#### ✅ 2.10 — Mobile responsiveness & PWA hardening

**Goal:** Harden the mobile and PWA experience across the three shell modes.

**Deliverables:**

- Default shell (mobile): footer → an action button opening a dismissable bottom **Drawer** (plugin nav); header gains the active-plugin title; Console moves into the avatar menu
- Overlay: `--sv-dialog-inset-top` keeps the header visible above the mobile sheet
- Cross-cutting: unify the 640/768 breakpoints; `100vh` → `100dvh`; `viewport-fit=cover` + `env(safe-area-inset-*)`; 44px touch targets + `--sv-touch-target-min`; manifest polish (`display_override`/`shortcuts`/`screenshots`/`orientation`, immersive iOS status bar)
- `packages/ui`: a `Drawer` primitive + tokens (additive **minor**); the first responsive section in `docs/design-system.md`

**Dependencies:** relates to Task 0.5.24 (minimal safe-area)

**SRS reference:** RFC 0013

**Review checklist:**

- The mobile footer opens the Drawer; an open overlay keeps the header visible; safe areas are respected in standalone
- One documented breakpoint; the shell uses `dvh`

---

#### ✅ 2.11 — Offline connectivity banner

**Goal:** Surface connectivity status to users who are already in an authenticated session when their network drops. The hard-offline case (navigating to an uncached page) was already handled by the `/offline` fallback route; this task covers the soft-offline case — the network disappears while the user is on a page.

**Deliverables:**

- `@sovereignfs/ui` → **minor** (0.7.0): status colour tokens — `--sv-color-warning-surface/text/border` (amber) and `--sv-color-success-surface/text/border` (green); backed by new `--sv-amber-*` / `--sv-green-*` primitive swatches; documented in `docs/design-system.md` "Status colours" section
- `runtime` → **minor** (0.20.0): `OfflineBanner` client component (`runtime/app/(platform)/_components/OfflineBanner.tsx`) — initialises to `'online'` server-safely (avoids SSR hydration mismatch), then checks `navigator.onLine` in `useEffect`; listens to `window` `offline`/`online` events; amber "No internet connection" banner persists until reconnected; green "Back online" flash auto-dismisses after 3 s (coincides with `reloadOnOnline` SW reload); `position: fixed; top: 0; z-index: 200` (above the mobile header's `z-index: 101`); 200 ms slide-in animation; uses `alert-triangle` icon and `--sv-color-warning-*` / `--sv-color-success-*` tokens
- Wired into both `(platform)/layout.tsx` and `(minimal)/layout.tsx`; excluded from `/offline` (implicit there)
- `CLAUDE.md` gains the browser-API / `useState` hydration rule: never read `navigator`/`window`/`localStorage` in a `useState` initializer — initialise to a server-safe value and read in `useEffect`

**Dependencies:** Task 0.5.01 (PWA — `reloadOnOnline`), Task 0.5.17 (Icon — `alert-triangle`), Task 0.5.25 (mobile shell — z-index context)

**SRS reference:** SRS §3.11 (PWA)

**Review checklist:**

- DevTools → Network → Offline: amber banner slides in immediately; no hydration error in dev or production build
- DevTools → Network → Online: green "Back online" flash appears then dismisses after ~3 s; page reloads from SW
- Loading from SW cache while offline: amber banner present on mount (not deferred until a network event)
- Mobile (< 768 px): banner is above the sticky header; `z-index: 200` > header's `101`
- Dark mode: dark amber/green tokens render correctly

---

#### ✅ 2.12 — Production dev-mode & diagnostics

**Goal:** Validate features on a production instance against a mock database without touching real data, plus local no-telemetry diagnostics.

**Deliverables:**

- A request-scoped dev-mode switch (`AsyncLocalStorage`, never global) → the mock DB for the toggled request only; env-gated off by default, secret-authenticated, visibly flagged, audited (RFC 0005); the mock DB seeded by `sv seed`
- Resolve the auth-server mock-DB crux (or scope v1 to data-only mock)
- Structured logging (`LOG_LEVEL`, stdout only) + a richer admin `/api/admin/health` — reconciled with the no-telemetry guarantee

**Dependencies:** Task 0.5.23 (seed), Task 0.5.12 (audit)

**SRS reference:** RFC 0020

**Review checklist:**

- ✅ A dev-mode request reads only the mock DB; concurrent real requests are unaffected; nothing egresses

---

#### ✅ 2.13 — Sidebar customization — plugin ordering and visibility

**Goal:** Let each user reorder and hide individual plugin icons in the sidebar's middle section (the plugin strip), without affecting the fixed chrome (notifications bell, console icon, account avatar) or the Launcher home icon.

**Deliverables:**

- `packages/db` → **patch** (1.7.2): `sidebar_plugins` column (nullable `text`, JSON-serialised `Array<{ id: string; hidden: boolean }>`) added to `account_prefs` in both SQLite and Postgres schemas; `SidebarPluginEntry` type exported; `AccountPrefsValue` extended with `sidebarPlugins: SidebarPluginEntry[] | null`; `getAccountPrefs` / `setAccountPrefs` helpers updated; Drizzle-kit migration 0006 for both dialects
- `runtime` → **minor** (0.32.0): `/api/account/prefs` PATCH accepts `sidebar_plugins` (validated array or `null` to reset); new `GET /api/account/sidebar-plugins` returns available non-chrome plugin list and the user's current saved order (consumed by the Account preferences UI); `(platform)/layout.tsx` reads the authenticated user's saved preference server-side and merges it into `pluginList` — applying custom order and filtering hidden plugins — before rendering the sidebar and passing `pluginList` to `MobileNav`
- `plugins/account` → **minor** (0.11.0): new **Sidebar** section on the Preferences page; `SidebarControl` client component — draggable list, per-row show/hide toggle, reset-to-default button; `updateSidebarPluginsAction` server action calls `patchPrefs({ sidebar_plugins })`. Originally built on native HTML5 Drag-and-Drop (no extra dep); replaced with `@dnd-kit` (matching the `sovereign-tasks`/`sovereign-shopper` pattern) in a follow-up fix — iOS Safari/WKWebView never implements HTML5 DnD for touch input, so reordering silently did nothing on mobile PWA/iOS despite working on desktop.

**Constraints:**

- Launcher home icon stays pinned first in the sidebar and is not included in the customisation list
- Chrome plugins (console, notifications, account avatar) are always fixed in the bottom section and excluded from the list

**Dependencies:** Tasks 2.1 (shell layout), 2.8 (account prefs infrastructure)

**Review checklist:**

- Account → Preferences → Sidebar section lists all installed non-chrome, non-launcher plugins
- Dragging a plugin row to a new position and saving reflects in the sidebar on next load
- Toggling a plugin hidden and saving removes its icon from the sidebar middle section; bottom chrome is unaffected
- Hidden plugins remain visible in the Sidebar settings list so users can re-enable them
- A newly installed plugin not yet in the saved list appears at the end of the sidebar by default
- Mobile nav drawer reflects the same order and visibility as the desktop sidebar
- A user with no saved preference sees the default install order (no regression)
- Resetting to default clears the preference; sidebar reverts to install order
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass

---

#### ✅ 2.14 — Public plugin page routes (RFC 0042)

**Goal:** Add a manifest-declared way for plugins to expose narrowly scoped public page routes without the global session redirect, while keeping the plugin responsible for route-level authorization.

**Deliverables:**

- Add `publicRoutes` or equivalent manifest field for declared public page prefixes.
- Update runtime middleware/route gating so only declared public page routes bypass the session redirect.
- Ensure public route prefixes are explicit, reviewable, and cannot shadow platform/account/admin routes.
- Require plugins to perform token/session/public-ID authorization on public routes and fail closed.
- Document public route patterns for token-protected previews, public shared documents, and published read-only pages.
- Add tests for unauthenticated public route access, undeclared route redirects, and disabled/paywalled plugin behavior.

**Dependencies:** Task 2.4 (public `/api` namespace delegation), Task 2.1 (middleware/session gate), Task 3.10 (compatibility/versioning).

**SRS reference:** [RFC 0042](../rfcs/0042-public-plugin-routes.md)

**Review checklist:**

- Unauthenticated requests can reach only manifest-declared public plugin page routes.
- Undeclared plugin pages still redirect to login.
- Disabled plugin routes remain unavailable.
- Public routes cannot claim reserved platform paths.

---

#### 📋 2.15 — Public plugin webhooks (RFC 0050)

**Goal:** Add manifest-declared unauthenticated webhook ingress for plugins, with route validation, request limits, signature helpers, and replay protection.

**Deliverables:**

- Add manifest `webhooks` declarations with path, methods, description, body limits, and signature requirement metadata.
- Extend middleware route decisions so only declared webhook paths bypass the session redirect.
- Apply method and body-size limits before plugin handler execution.
- Add server-side SDK helpers for common HMAC signature verification and replay checks.
- Ensure webhook signing secrets are read through the plugin secret vault.
- Add tests for undeclared webhook paths, disabled plugins, invalid methods, oversized bodies, and signature/replay helper behavior.
- Document webhook implementation patterns for provider callbacks, verification challenges, and sanitized failure handling.

**Dependencies:** Task 2.14 public plugin page routes for related public-route validation patterns, RFC 0043 plugin secret vault, RFC 0049 plugin external connections.

**SRS reference:** [RFC 0050](../rfcs/0050-public-plugin-webhooks.md)

**Review checklist:**

- Multiple plugins can expose narrow public webhook routes without claiming global `/api/*`.
- Undeclared webhook paths remain protected.
- Webhook handlers receive no forged user identity.
- Invalid signatures and replayed events fail closed.

---

#### ✅ 2.16 — Middleware regression coverage

**Goal:** Freeze the current middleware behavior with focused tests before
refactoring the load-bearing auth, routing, CSP, paywall, and root-plugin paths.

**Deliverables:**

- Add regression coverage for unauthenticated `POST` requests to gated routes
  redirecting to `/login` with `303`.
- Cover non-admin access to Console returning `403`.
- Cover disabled plugin routes returning `404`.
- Cover paywalled page routes redirecting to `/paywall/<pluginId>`.
- Cover paywalled plugin API routes returning `402`.
- Cover root `/` rewrite behavior when a configured root plugin is available.
- Cover public `/api/*` delegation remaining unauthenticated and provider-owned.

**Dependencies:** Task 2.4 (public `/api` namespace delegation), Task 2.7
(security hardening), Task 7.1 (plugin monetization), Task 0.12 (E2E golden-path
test suite).

**SRS reference:** PLT-02, PLT-03, PLT-04, PLT-06, PLT-16.

**Review checklist:**

- The high-risk middleware branches are covered before decomposition starts.
- Tests document fail-open behavior for disabled-plugin and paywall status
  lookups, and fail-closed behavior for auth verification.
- The established unauthenticated `POST` → `303` login redirect behavior is
  protected from regression.

---

#### 📋 2.17 — Middleware decomposition

**Goal:** Keep `runtime/middleware.ts` behavior identical while reducing the
risk of future auth, routing, CSP, paywall, and root-plugin changes.

**Deliverables:**

- Extract response helpers into `runtime/src/middleware/response.ts`:
  - CSP application.
  - Forwarded cookie handling.
  - Dev-mode response stamping.
  - Login and paywall redirect helpers.
- Extract session verification into `runtime/src/middleware/session.ts`:
  - Local signed cookie-cache verification.
  - Auth-server fallback verification.
  - A typed result carrying the verified session and forwarded cookies.
- Extract plugin route gating into `runtime/src/middleware/plugin-gate.ts`:
  - Disabled-plugin lookup.
  - Entitlement and paywall lookup.
  - Admin-only, disabled, and paywalled route decisions.
- Keep the exported `middleware()` function as a readable orchestration layer.
- Preserve existing fail-open and fail-closed semantics exactly:
  - Auth verification fails closed.
  - Disabled-plugin and paywall status fetches fail open.
  - Unauthenticated gated requests redirect to `/login` with `303`.

**Dependencies:** Task 2.16 (middleware regression coverage).

**SRS reference:** PLT-02, PLT-03, PLT-04, PLT-06, PLT-16, RFC 0008.

**Review checklist:**

- Middleware behavior is unchanged from the user's perspective.
- Extracted helpers have focused unit tests where practical.
- `runtime/middleware.ts` reads as orchestration rather than implementation.

---

#### 📋 2.18 — Middleware internal fetch caching review

**Goal:** Reduce repeated middleware self-fetches without weakening correctness
or making admin changes feel stale.

**Deliverables:**

- Measure current middleware internal fetch count by path type:
  - Normal platform page.
  - Plugin route.
  - Root `/`.
  - Public `/api/*`.
- Consider a short-lived in-process cache for disabled plugin IDs and the root
  plugin prefix.
- Keep entitlement checks uncached, or user-scoped with a very short TTL if
  measurements show meaningful pressure.
- Add explicit invalidation on admin mutations if practical; otherwise use a
  conservative TTL such as 2-5 seconds.
- Document fail-open and fail-closed behavior near the caching layer.

**Dependencies:** Task 2.16 (middleware regression coverage), Task 2.17
(middleware decomposition).

**SRS reference:** PLT-04, PLT-06, NFR-05.

**Review checklist:**

- Caching is introduced only after baseline behavior is covered by tests.
- Admin changes become visible within an explicit and documented window.
- Auth and entitlement correctness is not weakened.

---

#### ✅ 2.19 — Overlay size variants for platform plugins

**Goal:** Let overlay-rendered plugins choose an appropriate dialog width instead
of forcing every overlay into the current large presentation.

**Deliverables:**

- Treat the existing overlay dialog size as `lg`.
- Add supported overlay size variants `sm`, `md`, and `lg` for plugins rendered
  through `shell: "overlay"`.
- Wire overlay size resolution through the platform shell so Account, Console,
  and future overlay plugins can request a size without special-casing runtime
  chrome.
- Update Account to render as a medium (`md`) overlay by default.
- Keep Console on the large (`lg`) overlay unless a specific Console view opts
  into a smaller size.
- Ensure overlay size behavior is responsive:
  - desktop uses the selected size token;
  - mobile remains a full-screen sheet or equivalent mobile-safe presentation.
- Document the overlay-size contract for plugin authors.

**Dependencies:** Task 2.5 (overlay shell mode), Task 13.1 (Console plugin
scaffold), Task 14.1 (Account plugin).

**SRS reference:** RFC 0001, PLT-03, PLT-11.

**Review checklist:**

- Account opens in a medium overlay from the shell chrome/avatar entry.
- Console keeps the current large overlay behavior by default.
- `sm`, `md`, and `lg` overlays are visually distinct on desktop and do not
  overflow common viewport widths.
- Mobile overlay behavior remains usable and does not introduce clipped content.
- Overlay size is configured through plugin/runtime metadata rather than
  hardcoded per-route modal wrappers.

---

#### 📋 2.20 — Error-page digital-rights quote rotation

**Goal:** Add a small, curated rotating quote treatment to platform-owned error pages so
dead ends carry Sovereign's privacy and digital-rights voice without obscuring the practical
recovery path.

**Deliverables:**

- Add a local, curated quote list for themes such as digital rights, privacy,
  self-sovereignty, free knowledge, cryptography, and accountable power.
- Each quote entry includes quote text, author, source label where known, and a short
  category/tag. Keep excerpts short and attributable; avoid long copyrighted passages.
- Add a shared `ErrorQuote` component in the runtime error-page surface. It must render as
  secondary content below the primary error title, explanation, and recovery actions.
- Apply the quote component to platform-owned `not-found` / 404 pages first. Generic
  runtime error pages may use it only where it does not reduce clarity or trust.
- Do not add rotating quotes to login, registration, password reset, MFA, account deletion,
  or other auth/security-critical flows.
- Select quotes in a non-tracking way. No remote calls, no analytics, no persistence needed;
  per-request or client-side pseudo-random rotation is sufficient.
- Keep the presentation accessible: semantic `<blockquote>`, visible attribution, no layout
  shift that hides the error action buttons, and readable contrast in light/dark themes.
- Document the editorial guardrails near the quote list so future additions stay
  non-partisan, short, sourceable, and aligned with Sovereign's privacy-first positioning.

**Dependencies:** Task 2.1 (runtime error surfaces), Task 2.10 (responsive shell
polish), Task 9.1 (design tokens).

**SRS reference:** UX polish; no RFC required.

**Review checklist:**

- `/not-found` / unknown routes show the normal 404 title, explanation, and recovery action
  before any quote.
- Reloading or revisiting can show a different quote from the curated local list.
- Quotes are short, attributed, and do not include long copyrighted excerpts.
- Auth/security-critical pages do not render the quote component.
- Mobile and desktop layouts keep buttons visible and avoid overlapping quote text.
- `pnpm format:check && pnpm lint && pnpm typecheck`

---

#### ✅ 2.21 — Plugin access policy enforcement (RFC 0065)

**Goal:** Enforce platform-level plugin availability so installed plugins are visible and
openable only to users allowed by the configured access policy.

**Deliverables:**

- Extend plugin status/configuration persistence with an `access_policy` value:
  `everyone`, `admins`, `selected_users`, `selected_groups`, or `disabled`, plus a
  `self_service` boolean (default `false`, meaningful only for the two `selected_*` policies).
  Both columns default to `everyone`/`false` so every existing `plugin_status` row (and every
  plugin with no row at all) is unaffected until an admin explicitly sets a policy.
- Add `plugin_access_users`/`plugin_access_groups` grant tables, scoped by tenant and plugin.
- A pure `canOpenPlugin` resolver (`runtime/src/plugin-access.ts`) plus a Node-runtime bulk
  resolver (`runtime/src/plugin-access-server.ts`, `getRestrictedPluginIds`/`canUserOpenPlugin`)
  used by runtime routing, shell navigation, Launcher, sidebar, and root-plugin selection. New
  Node-runtime endpoint `GET /api/admin/plugins/access?userId=&role=` lets Edge middleware
  consult it (mirrors `/api/admin/plugins/disabled` and `/api/admin/entitlements`) since Edge
  cannot open the DB directly. Chrome plugins (Launcher/Account/Console) are exempt from access
  policy entirely — always openable when installed and enabled.
- Filter Launcher, sidebar, mobile navigation, and `/api/plugins` by effective access
  (`restrictedIds`, independent of and unioned with the existing disabled-plugin set).
- `decidePluginRoute` returns `'not-found'` (404) for a policy-denied plugin route — never
  `'forbidden'` (403), so denial doesn't disclose the plugin's existence; this wins over the
  adminOnly manifest-flag check, which is an independent, static gate.
- `disabled` is the strongest state — denies even an admin/owner or a direct/group grant.
- Root plugin fallback: `GET /api/admin/root-plugin` (and the Node-runtime `(platform)/page.tsx`
  belt-and-suspenders fallback) resolve the configured root, fall back to the Launcher when it's
  disabled or policy-denied for the current user, and render a "No apps available" state when
  neither resolves.
- Self-service grant/revoke mechanism: `POST`/`DELETE /api/plugins/[id]/self-service`, gated by
  the RFC 0070 `plugins:self-manage` capability and the plugin's `self_service` flag, using the
  same `plugin_access_users` grant table an admin uses. **Scope note:** only `selected_users`
  self-service is implemented — `selected_groups` self-service would require a "self-joinable
  group" concept RFC 0065 doesn't fully specify and this task doesn't add; a `selected_groups`
  plugin's `self_service` flag has no effect until that concept lands. Task 15.3 builds the
  Launcher-facing directory UI on top of this mechanism.

**Dependencies:** Task 1.15 (user groups), Task 1.16 (per-user capability grants, RFC 0070),
Task 15.1 (Launcher plugin), Task 2.13 (sidebar customization). This task's schema/migration
(the `access_policy` column and the backfill of existing plugins to explicit rows) is itself a
prerequisite for Task 3.28 and Task 13.7 — it ships first, they build on it.

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Each policy grants and denies the expected users in resolver tests.
- Unauthorized direct plugin app routes return 404, never 403.
- Launcher, sidebar, mobile navigation, and plugin discovery APIs hide inaccessible plugins.
- Root plugin fallback does not leak inaccessible plugin names.
- A user with `plugins:self-manage` can self-grant/self-revoke a `selected_users` +
  `self_service`-enabled plugin they're otherwise eligible for; a user without the capability
  sees no such affordance and a direct API call is rejected with 403.
- Verified end-to-end in a live browser: `selected_users` grant/revoke, `disabled` winning over
  an existing grant, root-plugin fallback to Launcher, and the self-service grant/revoke/denied
  round-trip, each producing the correct activity log entry.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 2.22 — Launcher grid respects saved sidebar order

**Goal:** A user's saved sidebar plugin order (Task 2.13) is currently applied only to the
sidebar/mobile-drawer chrome. Extend it to the Launcher's app grid so both surfaces present a
consistent order, without changing Launcher's own visibility rules (hiding a plugin from the
sidebar strip does not remove its Launcher tile — Launcher remains the "see everything" view).

**Deliverables:**

- `runtime` → **patch**: new exported `applySidebarOrder()` in `runtime/src/launcher-plugins.ts`,
  factored out of the merge logic previously inlined in `(platform)/layout.tsx`. Takes the
  caller's already-filtered plugin list, the user's saved `sidebar_plugins` entries (or `null`),
  and a `dropHidden` flag — `true` for the sidebar chrome (hidden entries excluded entirely),
  `false` for the Launcher grid (hidden entries stay, only reordered). Plugins not yet present in
  the saved list are appended in their original order, matching the existing sidebar behavior.
  Because each caller passes its own already role/admin-filtered list, an admin-only plugin
  present in a saved order but not visible to the current caller (e.g. a non-admin's Launcher
  request) is naturally dropped — the helper never needs to know about roles itself.
- `(platform)/layout.tsx` refactored to call the new helper instead of its inline duplicate.
- `runtime/app/api/plugins/route.ts` (the Launcher's data source, `GET /api/plugins`) now reads
  `x-sovereign-user-id` (same header the layout already reads, injected by middleware for every
  authenticated request), loads the user's `sidebar_plugins` prefs via `getAccountPrefs`, and
  applies `applySidebarOrder(..., { dropHidden: false })` after `selectLauncherPlugins`'s existing
  role/admin filtering.
- `plugins/launcher` → no code change needed: it already renders whatever order `/api/plugins`
  returns, splitting into main/admin sections by `adminOnly` — a stable sort preserves relative
  order within each section.

**Dependencies:** Task 2.13 (sidebar customization — the `sidebar_plugins` data this reads).

**Review checklist:**

- Reordering plugins in Account → Preferences → Sidebar and reloading the Launcher shows the same
  relative order (within the main and admin sections separately).
- Hiding a plugin from the sidebar strip does not remove its Launcher tile.
- A newly installed plugin not yet in the saved order appears at the end of both surfaces.
- A non-admin user's Launcher request never receives an admin-only plugin, saved order or not.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 2.23 — Plugin invite-scope grant resolution (RFC 0065)

**Goal:** Apply an invite's plugin scope (Task 1.17) through the same `canOpenPlugin`
resolver and grant tables Task 2.21 introduces, so invite-scoped access is indistinguishable
from an admin-granted `plugin_access_users` row once the account exists.

**Deliverables:**

- On successful registration via an invite carrying a `plugins` scope, insert one
  `plugin_access_users` row per listed plugin ID, with `granted_by_user_id` set to the
  inviter (not the new user). Implemented as `resolveInvitePluginGrants`
  (`apps/auth/src/invite-plugin-grants.ts`), called from the better-auth `user.create.after`
  hook (`apps/auth/src/auth.ts`). Since `apps/auth` has no direct access to `plugin_access_users`
  (a platform-db table owned by `runtime`/`packages/db` — separate app, separate database), the
  resolver crosses the process boundary over the existing admin-key-gated
  `GET/POST /api/admin/plugins/[id]/access*` endpoints from Task 13.7, the same pattern
  `platform-email.ts` already uses to report email-delivery outcomes to the activity log.
  The resolver re-queries the invites table by email in the `after` hook (rather than threading
  data through from `before`, which better-auth's hook signatures don't support) — safe because
  email uniqueness means at most one registration can be consuming a given email's invite at a
  time.
- No-op silently for a scoped plugin ID whose current policy isn't `selected_users`/
  `selected_groups` — the invite grants eligibility, never overrides the plugin's policy.
  Implemented by fetching the plugin's current policy via `GET /api/admin/plugins/[id]/access`
  before granting; a plugin left at `everyone`/`admins` needs no grant, and one now `disabled`
  must not silently reopen because of a stale invite.
- Audit the resulting grants identically to an admin-initiated grant, with provenance noting
  they originated from an invite. Extended `POST /api/admin/plugins/[id]/access/users`
  (Task 13.7) to accept an optional `source: 'invite'` field, included in the
  `plugin.access_user_granted` activity metadata (`{ pluginId, userId, source }`) and reflected
  in the summary text — purely descriptive, never trusted for authorization.
- **Scope note:** the entire resolution path only runs when invite-only registration is
  enabled — the pre-existing `before` hook only looks up/consumes an invite by email at all
  under `if (!isFirst && inviteOnly)`. Outside invite-only mode, a matching-but-unconsumed
  invite (and its plugin scope) is never touched by registration; this predates Task 2.23 and
  is the existing invite-consumption behavior, not a gap this task introduces or is scoped to
  fix.

**Dependencies:** Task 1.17 (invite-scoped plugin entitlement), Task 2.21 (plugin access policy
enforcement — the grant tables and resolver this writes into).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Registering via a plugin-scoped invite grants exactly the scoped plugins, resolved through
  the same `canOpenPlugin` path as an admin grant. ✅ verified live end-to-end: enabled
  invite-only registration, set Wallet's policy to `selected_users` with no pre-existing grant,
  created an invite scoped to Wallet through the Console UI, registered a new account via the
  invite link, and confirmed `/wallet` opened immediately for the new user with no separate
  admin action.
- A scoped plugin not currently `selected_users`/`selected_groups` produces no grant and no
  error.
- Resulting grants are audited with invite provenance. ✅ verified: the resulting
  `plugin.access_user_granted` activity entry shows `metadata.source: "invite"` and
  `actorId` = the inviting admin (not the new user), summary text reading "... via invite".
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 2.24 — PWA configuration

**Goal:** Make the runtime installable as a Progressive Web App with a production-only service
worker and a self-contained offline navigation fallback.

**Deliverables:**

- Add a standalone web app manifest with 192 px, 512 px, maskable, and Apple touch icons.
- Link the manifest, theme colour, and Apple Web App metadata from the root layout.
- Generate the service worker only for production builds so local HMR remains unaffected.
- Add an unauthenticated, cacheable `/offline` fallback and exclude PWA assets from the session
  middleware matcher.
- Add manifest regression coverage and ignore generated service-worker output.

**SRS reference:** §3.11, PLT-09.

**Review checklist:**

- A production build generates the service worker and prerenders `/offline`.
- Browser installability checks recognize the manifest and required icons.
- PWA assets and the offline route load without an authenticated session.
- Development mode does not generate a service worker or interfere with HMR.

## Related RFCs

- [RFC 0001 — Overlay shell variant](../rfcs/0001-overlay-shell-variant.md)
- [RFC 0002 — Cross-plugin data sharing](../rfcs/0002-cross-plugin-data-sharing.md)
- [RFC 0008 — Security & encryption architecture](../rfcs/0008-security-encryption-architecture.md)
- [RFC 0013 — Mobile responsiveness & PWA](../rfcs/0013-mobile-responsiveness-pwa.md)
- [RFC 0014 — Minimal shell mode](../rfcs/0014-minimal-shell-mode.md)
- [RFC 0019 — Test setup & seeding](../rfcs/0019-test-setup-and-seeding.md)
- [RFC 0020 — Production dev-mode & diagnostics](../rfcs/0020-production-dev-mode.md)
- [RFC 0042 — Public plugin page routes](../rfcs/0042-public-plugin-routes.md)
- [RFC 0050 — Public plugin webhooks](../rfcs/0050-public-plugin-webhooks.md)
- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)

## Related Docs

- [architecture.md](../architecture.md)
- [architecture-rules.md](../architecture-rules.md)
- [security.md](../security.md)
- [plugin-development.md — Shell modes](../plugin-development.md)
