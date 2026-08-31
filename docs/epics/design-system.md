# Epic: Design System

> The Sovereign Design System — CSS custom property tokens, UI components, white-labeling, instance identity, email templates, dark mode, and Storybook.

## Status

⏳ In Progress

## Overview

This epic covers two closely related areas: the `@sovereignfs/ui` design system (the public component and token contract for plugin developers), and the operator-facing white-labeling system that lets a self-hoster replace Sovereign's visual identity with their own brand. The design system scaffold landed in v0.3; white-labeling shipped across Tasks 0.8.4, 0.9.0, and continues with email templates and dynamic PWA manifest. Task 9.11 closes the component gaps identified in a readiness audit (2026-06-27) — eight commonly-needed layout and interaction primitives that plugin developers currently hand-roll per plugin.

## Related RFCs

- [RFC 0027 — White-labeling](../rfcs/0027-white-labeling.md)
- [RFC 0031 — Email templates](../rfcs/0031-email-templates.md)
- [RFC 0032 — Instance identity rename](../rfcs/0032-instance-identity-rename.md)
- [RFC 0073 — Standalone usage of `@sovereignfs/ui` outside the plugin runtime](../rfcs/0073-standalone-ui-package.md)
- [RFC 0079 — Mobile PWA layout, overlay, and gesture consistency](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)
- [RFC 0085 — Vertical section navigation for overlay-shell plugins (`NavRail`)](../rfcs/0085-vertical-section-nav-overlay-shell.md)
- [RFC 0088 — Mobile header and footer as Design System components](../rfcs/0088-mobile-header-footer-design-system-components.md)

## Related Docs

- [design-system.md](../design-system.md)
- [plugin-development.md — Token & component usage](../plugin-development.md)
- [self-hosting.md — Instance identity config](../self-hosting.md)

## Tasks

#### ✅ 9.1 — `packages/ui` — Sovereign Design System scaffold

**Goal:** Sovereign Design System scaffold — two-tier CSS custom property token
architecture and one primitive component to validate the setup. This package is
a public contract for plugin developers; token names and component APIs must be
treated with the same versioning discipline as the SDK.

**Deliverables:**

- `packages/ui/` with:
  - `src/tokens/primitives.css` — raw scale tokens with `--sv-` prefix:
    colour palette (`--sv-grey-50` … `--sv-grey-950`), spacing scale
    (`--sv-space-1` … `--sv-space-16`), font sizes (`--sv-font-size-sm` …
    `--sv-font-size-2xl`), border radii (`--sv-radius-sm/md/lg`)
  - `src/tokens/semantic.css` — contextual tokens mapped from primitives:
    `--sv-color-surface`, `--sv-color-text-primary`, `--sv-color-text-muted`,
    `--sv-color-border`, `--sv-color-accent`, `--sv-shadow-card` etc. These are
    what plugin developers reference. Tenant theming overrides this layer only.
  - `src/components/Button/Button.tsx` — single primitive component using CSS
    Modules to validate the setup
  - `src/components/Button/Button.module.css` — styles referencing `--sv-*`
    tokens only; no hardcoded values
  - `src/index.ts` — barrel export
- Extends `packages/tsconfig` (`library.json`)
- Builds cleanly and is importable by the runtime
- `docs/design-system.md` — foundational design system doc covering:
  - Design principles (what Sovereign UI should feel and look like)
  - Token architecture (two-tier model, `--sv-*` convention, primitive vs
    semantic, theming surface)
  - Full primitive and semantic token reference (all tokens defined in this task)
  - Component contribution guide (how to build a new component correctly —
    CSS Modules, token-only values, accessibility expectations)
  - Theming guide (how tenant overrides work by swapping semantic tokens at
    `:root`; what primitives are and why plugins must not reference them)

  Note: the plugin developer consumption guide (how to use components and tokens
  in a plugin) lives in `docs/plugin-development.md` (Task 0.5.06), not here.
  This doc is for contributors and system-level understanding.

**Technology:** CSS custom properties for tokens (plain `.css` files) + React +
CSS Modules for components. No Tailwind. No runtime CSS-in-JS. No third-party
component framework. See CLAUDE.md — Design System section for full rationale
and token conventions.

**Build:** `tsup` — ESM output, TypeScript declarations. CSS (both CSS Modules
and token files) is marked **external** (`external: [/\.css$/]`); tsup/esbuild
can't scope-hash CSS Modules, so the consuming Next.js app processes the CSS —
via `transpilePackages` (the `src` tree) in v1, or its own bundler when the
package is installed from npm. React is external too (`react`, `react-dom`,
`react/jsx-runtime`), and `esbuildOptions.jsx = 'automatic'`. The `.css` files
ship via the package `files` field; full npm-publish CSS packaging (ensuring the
externalised `.css` imports resolve inside `dist/`) is finalised in Task 0.5.07.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true, external: `[/\.css$/, 'react', 'react-dom', 'react/jsx-runtime']`,
  `esbuildOptions.jsx = 'automatic'`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — consuming Next.js apps (runtime) include this package in
    `transpilePackages`; Next.js compiles the TypeScript source directly and
    handles CSS Modules natively. Changes to components are picked up by HMR
    instantly without any watch build.
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; tsup overwrites with
    `dist/` paths at build time. Published to npm as `@sovereignfs/ui`.
  - `files` field must include `dist/` and any CSS files for the npm package

**SRS reference:** 2.2 Tech Stack (`packages/ui`)

**Review checklist:**

- `Button` renders without errors when imported into a test file
- No hardcoded colour, spacing, or radius values in any component CSS — only
  `--sv-*` token references
- All semantic tokens map to primitive tokens — no semantic token has a
  hardcoded value
- `tokens/primitives.css` and `tokens/semantic.css` are valid, importable CSS
  files
- `docs/design-system.md` exists and covers all sections listed above

---

#### ✅ 9.2 — Overlay shell mode (Dialog primitive)

> Full entry: **[2.5]** in [platform-shell.md](platform-shell.md) — Overlay shell mode.
> This task added the `Dialog` primitive to `@sovereignfs/ui`, establishing the first animated overlay component in the design system.

---

#### ✅ 9.3 — Mobile responsiveness & PWA hardening (Drawer primitive)

> Full entry: **[2.10]** in [platform-shell.md](platform-shell.md) — Mobile responsiveness & PWA hardening.
> This task added the `Drawer` primitive and warning/success status color tokens to `@sovereignfs/ui`.

---

#### ✅ 9.4 — Accessibility audit (design system tokens)

> Full entry: **[10.1]** in [accessibility.md](accessibility.md) — Accessibility audit & a11y contract.
> This task added `--sv-color-error`, `--sv-color-success`, `--sv-color-focus-ring` tokens and `prefers-reduced-motion` support to the design system.

---

#### ✅ 9.5 — Offline connectivity banner (status color tokens)

> Full entry: **[2.11]** in [platform-shell.md](platform-shell.md) — Offline connectivity banner.
> This task added `--sv-color-warning-*` and `--sv-color-success-*` surface/text/border token sets to `@sovereignfs/ui`.

---

#### ✅ 9.6 — White-labeling, Phase 1 — Brand DB + shell injection (RFC 0027)

**Goal:** Let operators replace Sovereign's visual identity with their own brand. Phase 1 ships the data layer, CSS token namespace, runtime injection, and the Console branding form. Depends on the `tenant_branding` table and `BrandProvider` being in place before Phases 2 and 3.

**Deliverables:**

- `packages/db` → minor: `tenant_branding` table (dialect-aware DDL, bootstrapped by `bootstrapPlatformDb()` alongside the default-tenant seed); `getTenantBranding(pdb, tenantId)` (merges DB values over `BRAND_*` env defaults); `setTenantBranding(pdb, tenantId, partial)` (upsert; validates `brand_primary` as `/^#[0-9a-fA-F]{6}$/` before writing — raw user input must never reach a `<style>` block unchecked)
- `packages/ui` → minor: `--sv-brand-logo`, `--sv-brand-logo-dark`, `--sv-brand-favicon` tokens added to `semantic.css` (separate namespace from `--sv-color-*` — brand tokens hold URLs, not colours; they are set once by the operator and do not change with dark mode or user prefs); documented in `docs/design-system.md`
- `runtime` → minor: `BrandProvider` server component (`runtime/src/brand-provider.tsx`) — reads `tenant_branding`, merges env defaults, renders a `<style>` block setting `--sv-brand-*` tokens and (if `brandPrimary` set) `--sv-color-accent` / `--sv-color-accent-hover` (HSL lightness delta, `ACCENT_HOVER_LIGHTNESS_DELTA = 8`, clamped to stay in range); passes `brandName` as a React prop to children; called from `(platform)/layout.tsx`
- `runtime` (continued): `GET /api/brand/logo[?dark=1]` and `GET /api/brand/favicon` routes serving uploaded files from `data/brand/` (MIME type validated, 2 MB cap); `POST /api/brand/logo` / `POST /api/brand/favicon` upload routes (admin-gated); all three excluded from the middleware session gate (must load on the login page)
- `runtime` (continued): `GET /api/admin/tenant-branding` route — returns merged brand config (DB + env defaults) for the auth server proxy in Phase 2
- `@sovereignfs/sdk` → minor: `sdk.platform.getConfig()` gains `brandName` (falls back to `tenantName`) and `brandPrimaryColor?` (validated hex or undefined), documented in `docs/plugin-development.md`
- `plugins/console` → minor: new **Branding** section under `/console/settings/branding` — brand name input, logo upload (light + dark) or external URL, primary colour picker (validated hex client + server), favicon upload, email sender name, email logo URL; live preview panel (client-side CSS variable swap); PATCH writes to `tenant_branding`
- New `BRAND_*` env vars added to `.env.example` and `docs/self-hosting.md`; `docs/plugin-development.md` documents `--sv-brand-*` token usage and the `getConfig()` branding fields

**Dependencies:** Task 0.5.03 (Postgres), Task 0.5.05 (`sdk.platform`), Task 0.5.15 (CSP — `/api/brand/*` must be in the middleware exclusion list alongside `/api/health` and PWA assets)

**SRS reference:** RFC 0027, SRS §3.18

**Review checklist:**

- Brand name set in Console renders in the sidebar header and login page instead of "Sovereign"
- Uploading a logo serves it from `/api/brand/logo` on the login page (pre-auth, session gate excluded)
- `brand_primary` write rejects any non-hex value; valid hex sets `--sv-color-accent` via `BrandProvider`
- `sdk.platform.getConfig()` returns `brandName` and `brandPrimaryColor` (or undefined when unset)
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and docs-parity test pass

---

#### ✅ 9.7 — Storybook for the design system and app shell

**Goal:** Give component authors, plugin developers, and designers a live, isolated environment to develop and inspect every `@sovereignfs/ui` component and its token context. Storybook 8 is the choice — it has native CSS Modules support (via `@storybook/nextjs`), the best a11y addon ecosystem, and wide team familiarity. No RFC is warranted: this is developer tooling with no runtime surfaces, no SDK changes, and no architectural trade-offs that need RFC-level documentation. The decision rationale is recorded in the SRS decision log.

**Scope:**

Phase 1 (this task) targets `packages/ui` exclusively. The `runtime` App Router shell uses React Server Components heavily — Storybook's RSC support is immature as of mid-2026; RSC stories are a follow-on tracked under "Optional extensions" below.

**Deliverables:**

- **Storybook installation (`packages/ui`):**
  - `@storybook/nextjs` (Vite builder) + `storybook` CLI as devDependencies in `packages/ui/package.json`; versions pinned in the pnpm catalog (new `"storybook"` catalog entry, referenced as `"catalog:"`)
  - `.storybook/main.ts` — framework: `@storybook/nextjs`, addons (see below), `stories` glob targeting `src/**/*.stories.tsx`
  - `.storybook/preview.ts` — global decorator importing the full token stack (`primitives.css`, `semantic.css`); `data-theme` parameter wired so the themes addon toggles dark mode correctly
  - `packages/ui/package.json` gains `"storybook": "storybook dev -p 6006"` and `"build-storybook": "storybook build --output-dir storybook-static"` scripts
  - `packages/ui/.storybook/` added to `.prettierignore` (generated config files should not be linted)

- **Addons:**
  - `@storybook/addon-a11y` — accessibility panel; every story must pass WCAG 2.1 AA checks; a11y failures treated as errors in CI
  - `@storybook/addon-viewport` — responsive preview (mobile 375px, tablet 768px, desktop 1280px presets matching the shell breakpoints)
  - `@storybook/addon-themes` — single decorator toggles `[data-theme="dark"]` on the canvas root; eliminates the need for per-story dark variants
  - `@storybook/addon-docs` — auto-generates prop tables from TypeScript types; used for `ComponentName.stories.tsx` `meta.parameters.docs` entries

- **Token Gallery story (`src/stories/TokenGallery.stories.tsx`):**
  - One story per token tier — Colour (semantic, both themes side-by-side), Space scale, Typography scale, Radius scale, Shadow scale, Icon sizes
  - Reads CSS custom properties at render time via `getComputedStyle(document.documentElement)` — always reflects the actual loaded CSS, not a hardcoded snapshot
  - Dark mode toggle shows both themes on the same canvas for comparison

- **Component stories (one `*.stories.tsx` per component):**
  - `Button` — all `variant` × `size` combinations; loading state; disabled; icon-only
  - `Card` — default, with header/footer slots, interactive (clickable)
  - `Input` — text/email/password types; error state; disabled; with label
  - `Badge` — all variants
  - `Dialog` — `sm`/`md`/`lg` sizes; `open`/`closed`; trigger interaction (Storybook `play` function using `@storybook/test`)
  - `Drawer` — mobile breakpoint (viewport addon at 375px); open/closed; with list items
  - `Icon` — full icon grid (all 26 names from `IconName`); `sm`/`md`/`lg` sizes; `aria-label` vs `aria-hidden` variants

- **Monorepo integration:**
  - `turbo.json`: add `"build-storybook"` to the `pipeline` with `dependsOn: ["^build"]` and `outputs: ["storybook-static/**"]`; Storybook dev (`pnpm storybook`) is not a Turborepo task — it runs ad-hoc
  - Root `package.json` gains `"storybook": "pnpm --filter @sovereignfs/ui storybook"` and `"build-storybook": "pnpm --filter @sovereignfs/ui build-storybook"` scripts for convenience
  - `storybook-static/` added to root `.gitignore`

- **CI (`storybook-build` job in `.github/workflows/ci.yml`):**
  - Runs `pnpm build-storybook` — catches stories that fail to compile or reference missing tokens
  - Fails on a11y errors via `--test` flag (Storybook 8 CLI test mode)
  - Runs on the same draft-PR exclusion logic as the existing jobs
  - Uploads `storybook-static/` as a CI artifact (7-day retention) for PR preview inspection without deploying a Storybook hosting service

- **Documentation:**
  - `docs/design-system.md` gains a "Component stories (Storybook)" section: how to run (`pnpm storybook`), what the Token Gallery shows, how to add a story for a new component, the a11y policy
  - `docs/plugin-development.md` notes that `@sovereignfs/ui` ships with Storybook stories developers can run locally to explore the component API

**Optional extensions (follow-on tasks, not in scope here):**

- **Visual regression testing:** covered by follow-on task 9.14 / RFC 0059 using local Playwright screenshots first. Hosted tools such as Chromatic are deferred unless local review becomes a bottleneck.
- **`runtime` client-component stories:** once Storybook's RSC story support matures, extend to `runtime/app/_components/` client components (avatar popover, `ActivePluginTitle`, `MobileNav`, etc.). Tracked as a future task.
- **Plugin developer guide stories:** example stories shipped in `plugins/fs.sovereign.example-basic/` demonstrating how a plugin consumes `@sovereignfs/ui` components in Storybook.

**Dependencies:** Task 0.3.07 (`packages/ui` scaffold must exist — ✅ already merged), Task 0.5.17 (Icon system — all `IconName` values needed for the Icon story — ✅ already merged)

**Version impact:** `packages/ui` → **minor** (adds a new developer-facing capability; no breaking changes to the published component API)

**SRS reference:** SRS §3.19 (design system tooling), NFR-10 (documentation completeness)

**Review checklist:**

- `pnpm storybook` starts the dev server at `:6006` with all stories rendering; Token Gallery correctly reads both light and dark theme token values
- `pnpm build-storybook` exits 0; a11y check passes on all stories
- Dialog and Drawer stories: the `play` function opens and dismisses the component; keyboard navigation works (Tab, Esc); focus trap confirmed in the a11y panel
- Icon story renders all 26 icons with correct sizes; `aria-hidden` icons have no accessible name; `aria-label` icons are announced correctly
- Dark mode toggle in the Storybook toolbar applies `[data-theme="dark"]` to the canvas root and all semantic colour tokens update immediately
- CI `storybook-build` job is green; artifact is uploaded

---

#### ✅ 9.8 — Instance identity rename (RFC 0032)

**Goal:** Rename every `brand/Brand` identifier introduced in Task 1.0.03 (RFC 0027
Phase 1) to `instance/Instance` across the full platform. Pure rename — no new
functionality. Ships first so epic task 9.9 (email templates) and all subsequent work
adopt the correct naming from day one. No production users means zero migration burden.

**Deliverables:**

- `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`: `BRAND_*` →
  `INSTANCE_*` (seven env vars).
- `packages/ui` → minor (`0.10.0` → `0.11.0`): `--sv-brand-logo` / `--sv-brand-logo-dark` /
  `--sv-brand-favicon` renamed to `--sv-instance-logo` / `--sv-instance-logo-dark` /
  `--sv-instance-favicon` in `tokens/semantic.css`.
- `packages/sdk` → minor (`1.10.0` → `1.11.0`): `PlatformConfig.brandName` →
  `instanceName`; `brandPrimaryColor?` → `instancePrimaryColor?`.
- `packages/db` → minor: `tenant_branding` table renamed to `instance_config` via
  drizzle-kit migration (`ALTER TABLE … RENAME TO`); `TenantBrandingValue` →
  `InstanceConfig`; `getTenantBranding()` → `getInstanceConfig()`; `setTenantBranding()`
  → `setInstanceConfig()`; bootstrap DDL parity test updated.
- `runtime` → minor: `brand-provider.tsx` → `instance-provider.tsx` (`BrandProvider` →
  `InstanceProvider`, `BrandContext` → `InstanceContext`); `runtime/app/api/brand/` →
  `runtime/app/api/instance/` (all seven logo/favicon routes); `RESERVED_API_SEGMENTS`
  replaces `'brand'` with `'instance'`; dir-parity test passes.
- `plugins/console` → patch: Settings "Branding" → "Instance identity"; field labels
  updated; `PATCH /api/admin/tenant-branding` → `PATCH /api/admin/instance-config`.
- `apps/auth` → patch: env var reads updated.
- `docs/upgrade.md`: v0.28 → v0.29 migration notes (env var rename table, CSS token
  rename note, SDK field rename note).
- All doc references updated: `docs/self-hosting.md`, `docs/design-system.md`,
  `docs/plugin-development.md`, `docs/rfcs/0027-white-labeling.md`.

**Root version bump:** root `package.json` — patch (one pre-v1 hardening task)

**Dependencies:** Task 1.0.03 (Phase 1 — renames what Phase 1 introduced)

**SRS reference:** RFC 0032

**Review checklist:**

- `grep -r "BRAND_\|--sv-brand\|brandName\|brandPrimary\|BrandProvider\|getTenantBranding\|tenant_branding\|/api/brand/" packages/ runtime/ apps/ plugins/ .env.example` → zero matches
- RESERVED_API_SEGMENTS contains `'instance'` and not `'brand'`; dir-parity test passes
- Console Settings → Instance identity section renders; logo/favicon upload/remove still work
- `sdk.platform.getConfig()` returns `instanceName`; existing Console usage updated
- DB migration runs on both SQLite and Postgres; data preserved
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass

---

#### ✅ 9.9 — Email template system + White-labeling Phase 2 — Email + auth login page (RFC 0031 + RFC 0027)

**Goal:** Introduce the email template infrastructure (RFC 0031) — React Email–based
templates with branding injection, standalone locale support, and operator copy/subject
overrides — then use it to deliver RFC 0027 Phase 2: branded emails and the auth server's
branded login/registration page. RFC 0031 is the prerequisite; both ship in this task.

**Deliverables:**

- `packages/mailer` → minor (RFC 0031): `@react-email/components` + `@react-email/render`
  added; new `templates/` subtree with `EmailLayout`, `EmailHeader`, `EmailFooter`
  components, `locales/{en,de,si,ta}.json`, `PasswordResetEmail.tsx`, `InviteEmail.tsx`;
  exported `renderPasswordResetEmail()`, `renderInviteEmail()`, `renderSubject()`,
  `EmailBranding` and `EmailLocale` types; `email:dev` preview script on port 3003.
- `packages/db` → minor (RFC 0031): `getEmailCopy()` / `setEmailCopy()` helpers using
  `platform_settings` key pattern `email_copy_<templateId>_<locale>_<field>`.
- `packages/sdk` → minor (RFC 0031): `PlatformConfig` gains `emailFromName?`, `emailLogo?`,
  `instanceUrl`; `sdk.platform.getConfig()` returns these fields.
- `runtime` → minor (RFC 0031 + RFC 0027 Phase 2):
  - New `GET /api/admin/instance-config` route (admin-key-gated; returns merged
    `InstanceConfig`; used by `apps/auth` and Console invite action).
  - New Console → Settings → **Email Templates** section: template selector, locale
    selector, subject + body copy override fields, live preview panel (`<iframe>`), and
    test-send button (`POST /api/admin/email-templates/test`).
  - API routes: `GET/PATCH /api/admin/email-templates`, `GET /api/admin/email-templates/preview`.
  - (RFC 0027 Phase 2) Auth login/registration page: `apps/auth` root layout fetches
    `/api/admin/instance-config` (60 s in-process cache; graceful fallback to Sovereign
    defaults); `InstanceProvider` duplicated into `apps/auth/src/instance-provider.tsx`
    (same pattern as `security.ts` duplication).
- `apps/auth` → minor (RFC 0031 + RFC 0027 Phase 2):
  - `sendResetPassword` hook calls `renderPasswordResetEmail()` + `renderSubject()` with
    fetched instance config and resolved locale.
  - `apps/auth/src/email-branding.ts` — 60 s cached `getBranding()` fetching from
    `SOVEREIGN_RUNTIME_INTERNAL_URL` (new env var, default `http://localhost:3000`).
- `plugins/console` → minor:
  - Invite action calls `renderInviteEmail()` + `renderSubject()` with instance identity
    from `sdk.platform.getConfig()` and locale from request headers.
  - Email Templates Console section (see runtime deliverable above).
- New env var: `SOVEREIGN_RUNTIME_INTERNAL_URL` — added to `.env.example` and
  `docs/self-hosting.md`; Docker compose files set this to the internal service name.
- Docs: `docs/plugin-development.md` — note that `sdk.mailer.send()` accepts pre-rendered
  HTML; React Email is available for plugin authors. `docs/self-hosting.md` — email
  template customisation section.

**Dependencies:** epic task 9.8 (RFC 0032 rename must be complete — this task uses
`InstanceConfig`, `INSTANCE_*` env vars, and `--sv-instance-*` tokens throughout);
Task 1.0.03 (Phase 1 — `instance_config` table must exist)

**SRS reference:** RFC 0031, RFC 0027 Phase 2, SRS §3.18

**Review checklist:**

- `pnpm email:dev` starts preview server on `:3003`; all templates render with sample instance identity
- Password reset email arrives with instance logo, instance name in subject, CTA button in `instancePrimaryColor`
- Images blocked in email client → instance name appears as `alt` text; email remains readable
- Console → Settings → Email Templates: override invite subject → test-send → arrives with custom subject
- Locale set to Tamil → invite email body renders in Tamil script
- Auth server offline → password reset sends with graceful Sovereign defaults
- A configured instance shows the operator's logo and name on the login/register page
- Auth server login page falls back to Sovereign defaults if the runtime is unreachable

**Correction note (shipped, workstream 0013 leg 3):** several details diverged from the plan
above during implementation:

- `@react-email/components` was deprecated by its maintainers in favor of a unified
  `react-email` package partway through this task's timeline (React Email 6.0, April 2026) —
  shipped against the unified package instead; `@react-email/render` is unchanged.
- Console's invite action cannot import `@sovereignfs/mailer`/`@sovereignfs/db` directly (the
  SDK boundary rule, added after this task was originally scoped) — added
  `POST /api/admin/email-templates/send` as the one path a plugin can reach the branded
  templates through, rather than the direct import the original design assumed.
  `GET .../preview` and `POST .../test` (sample-link preview/test-send) round out the set,
  alongside `GET`/`PATCH /api/admin/email-templates` for the copy overrides themselves.
- The actual pre-auth branded login/registration page work landed on the runtime's own
  `runtime/app/login/`, `runtime/app/register/` (both previously read only
  `process.env.INSTANCE_NAME`, ignoring the DB-stored config the authenticated shell already
  used, and had unused `.logoImg` CSS with no code ever rendering it) — not `apps/auth`'s
  compatibility login page, which the task's own text assumed was the primary surface;
  `apps/auth`'s page is branded too, but as a secondary path (`GET /api/admin/instance-config`
  already existed and needed no changes).
- No new env vars were needed — `SOVEREIGN_RUNTIME_INTERNAL_URL` (the plan's proposal) already
  existed as `SOVEREIGN_RUNTIME_URL`, and `NEXT_PUBLIC_RUNTIME_URL` already covered the public
  instance URL.
- Locale resolution defaults to `en` everywhere in this task's send paths — no per-user/platform
  language preference exists yet (RFC 0029 not shipped), per RFC 0031's own open question #4.
  All four locale files ship and are fully wired; only the "pick a locale per recipient" step is
  deferred to RFC 0029.
- Verified live end-to-end: `getEmailCopy`/`setEmailCopy`/`deleteEmailCopy` against a real
  Postgres instance; the branded login/register pages and Console's Email Templates section in
  a browser; the Save round trip; and actual delivery through Mailpit for both the test-send
  path and Console's real invite flow (arrived with a genuine token, correct branding).

---

#### ✅ 9.10 — White-labeling, Phase 3 — Dynamic PWA manifest + favicon route (RFC 0027)

**Goal:** Extend instance identity to the PWA manifest and favicon so the installed PWA shows the operator's app name and icons. Depends on Phase 1 (instance config DB and serving routes) and the rename in epic task 9.8.

**Deliverables:**

- `runtime` → minor: `GET /manifest.webmanifest` route — when instance identity is configured reads `instance_config` and returns a dynamic manifest with the operator's `name`, `short_name`, and icon URLs; when unconfigured the static `runtime/public/manifest.json` continues to be served. Route is excluded from the middleware session gate (required for PWA installability)
- `runtime` (continued): `GET /favicon.ico` route — returns the instance's configured favicon when set, falling back to `runtime/public/favicon.ico`; `runtime/app/layout.tsx` `<head>` metadata updated to point to the dynamic route unconditionally so the fallback is transparent
- Document in `docs/self-hosting.md`: when identity changes, cached service-worker users see the old name/icons until the SW updates (known limitation, acceptable for v1)

**Dependencies:** epic task 9.8 (RFC 0032 rename — `instance_config` table name); Task 1.0.03 (Phase 1 — instance logo served from `/api/instance/logo`)

**SRS reference:** RFC 0027 Phase 3, SRS §3.18

**Review checklist:**

- `GET /manifest.webmanifest` returns the operator's instance name and icon URLs when configured; returns the static Sovereign manifest when unconfigured
- `GET /favicon.ico` returns the operator's favicon when configured; falls back to the committed favicon
- PWA installation on a configured instance shows the operator's name and icons in the OS launcher

---

#### ✅ 9.11 — Design system component gaps — plugin developer readiness

**Goal:** Close the eight missing `@sovereignfs/ui` components identified in the
2026-06-27 readiness audit. Plugin developers currently hand-roll these patterns
per plugin (confirmed by reading `plugins/console` and `plugins/account` CSS
modules). All components follow the existing conventions: CSS Modules, token-only
values, RSC-safe, fully typed props, Storybook story included.

Also fixes two documentation gaps found during the audit: font-weight tokens
missing from `TokenGallery`, and the gallery using `system-ui` instead of
`var(--sv-font-family)` for its own chrome.

**Deliverables:**

- **`Card`** (`packages/ui/src/components/Card/`) — surface container.
  Props: `as?: 'div' | 'article' | 'li'` (default `'div'`),
  `interactive?: boolean` (adds hover border + pointer cursor for clickable
  cards), `padding?: 'sm' | 'md' | 'lg'` (default `'md'`), `className?`,
  `children`. Uses `--sv-color-surface-raised`, `--sv-color-border`,
  `--sv-radius-lg`, `--sv-shadow-card`.

- **`FormField`** (`packages/ui/src/components/FormField/`) — accessible label +
  input wrapper. Props: `label: string`, `hint?: string`, `error?: string`,
  `htmlFor?: string`, `required?: boolean`, `children: React.ReactNode`.
  Renders `<label>` linked to the child input via `htmlFor`; hint and error
  rendered as `<p>` with `aria-describedby` wired to the child. Error text
  uses `--sv-color-error-text`; hint uses `--sv-color-text-muted`.

- **`PageHeader`** (`packages/ui/src/components/PageHeader/`) — plugin page
  top-section. Props: `title: string`, `description?: string`,
  `action?: React.ReactNode` (right-aligned slot for a button or badge).
  Uses `--sv-font-size-2xl` + `--sv-font-weight-semibold` for title;
  `--sv-color-text-muted` for description.

- **`EmptyState`** (`packages/ui/src/components/EmptyState/`) — zero-data
  placeholder. Props: `icon?: IconName` (renders an `<Icon>` at `lg` size),
  `heading: string`, `description?: string`, `action?: React.ReactNode`.
  Centred layout. Uses `--sv-color-text-muted` for description,
  `--sv-color-text-subtle` for icon.

- **`Spinner`** (`packages/ui/src/components/Spinner/`) — CSS-animated ring.
  Props: `size?: 'sm' | 'md' | 'lg'` (16 / 24 / 32 px, matching icon size
  tokens), `label?: string` (default `'Loading…'`, used as `aria-label`).
  Pure CSS animation; respects `prefers-reduced-motion` (pauses animation).
  Uses `--sv-color-accent` for the active arc, `--sv-color-border` for the track.

- **`Avatar`** (`packages/ui/src/components/Avatar/`) — user representation.
  Props: `src?: string`, `name: string` (used for initials fallback and
  `alt`), `size?: 'sm' | 'md' | 'lg'` (24 / 32 / 40 px). Shows image when
  `src` is provided and loads successfully; falls back to up-to-2-char initials
  derived from `name` split on whitespace. Background uses
  `--sv-color-surface-raised`; border uses `--sv-color-border`;
  text uses `--sv-color-text-primary`.

- **`NavTabs`** (`packages/ui/src/components/NavTabs/`) — underline-style
  navigation tabs, distinct from the existing contained `Tabs` component.
  Intended for plugin-level page navigation (mirrors the pattern used by both
  `plugins/console` and `plugins/account`). Props: `items: { label: string;
href: string; active?: boolean }[]`. Renders an `<nav>` with anchor tags;
  active item gets a bottom border in `--sv-color-text-primary`. Scrollable
  on mobile (same masked overflow pattern as `account.module.css`).

- **`Tooltip`** (`packages/ui/src/components/Tooltip/`) — hover/focus hint.
  Props: `content: string`, `children: React.ReactElement`, `side?: 'top' |
'bottom' | 'left' | 'right'` (default `'top'`). Wraps the child in a
  `<span>` with `aria-describedby` pointing to a visually-hidden tooltip
  element; shown/hidden via CSS `:hover` + `:focus-within` on the wrapper —
  no JS positioning (keeps it RSC-safe). Uses `--sv-color-surface-raised`,
  `--sv-color-border`, `--sv-shadow-popover`, `--sv-font-size-xs`.

**Token gallery fix:** add `--sv-font-weight-medium`, `--sv-font-weight-semibold`,
`--sv-font-weight-bold` to `TokenGallery.stories.tsx`; replace `system-ui` with
`var(--sv-font-family)` for the gallery's own chrome text.

**Stories:** one `*.stories.tsx` per new component; add all eight to the Component
Gallery section of `DesignSystemOverview.stories.tsx`.

**Version impact:** `@sovereignfs/ui` → **minor** (`0.20.0` → `0.21.0`) — adds
eight new exported components; no breaking changes to existing API.

**Review checklist:**

- All eight components exported from `packages/ui/src/index.ts`
- No hardcoded colour, spacing, or radius values in any component CSS — only `--sv-*` token references
- `Avatar` shows initials when `src` is absent or fails to load; `alt` is always set
- `Spinner` animation pauses under `prefers-reduced-motion: reduce`
- `FormField` error text is announced by screen readers via `aria-describedby`
- `Tooltip` is keyboard accessible (visible on `:focus-within`)
- `NavTabs` scrolls horizontally on a 375 px viewport without showing a scrollbar
- All stories render without errors; a11y panel passes on each
- `pnpm --filter @sovereignfs/ui typecheck` passes
- `pnpm format:check && pnpm lint` pass

---

#### ✅ 9.12 — Design system stabilization

**Goal:** Make `@sovereignfs/ui` a stricter, more reliable public contract for platform screens and plugin authors by fixing token drift, strengthening accessibility wiring, and improving adoption across first-party plugins.

**Deliverables:**

- Replace or formally alias undefined token references, starting with `packages/ui`.
- Add a token validation script that fails on undefined `--sv-*` references and warns/fails on hardcoded design literals in component CSS.
- Fix `FormField` so labels, hints, required state, invalid state, and error text are associated with the actual form control.
- Add missing form primitives needed to reduce local control CSS, starting with `Textarea` and `Checkbox`.
- Migrate Account and Console generic controls/page patterns toward shared primitives (`Button`, `Input`, `Select`, `NavTabs`, `PageHeader`, `Card`, `Badge`, `SystemBanner`).
- Add package-level UI test and Storybook quality gates where practical.
- Update `docs/design-system.md`, `docs/plugin-development.md`, and plugin templates with the recommended patterns.

**Dependencies:** Task 9.11 (component gaps), Task 9.7 (Storybook), Task 10.1 (a11y contract).

**Reference:** [Design System Stabilization Proposal](../design-system-stabilization-proposal.md)

**Version impact:** `@sovereignfs/ui` → **minor** (`0.22.0` → `0.23.0`) — adds
the `Textarea` primitive (additive) and changes `FormField`'s `children` to a
render prop (breaking, but zero prior consumers).

**Review checklist:**

- `packages/ui` has no undefined token references.
- Token validation runs in CI.
- `FormField` hint/error text is announced with the associated control.
- New first-party UI work no longer adds generic local `.button`, `.input`, `.select`, or `.textarea` styles.
- Account and Console use shared primitives for common controls and page structure.

---

#### ❌ 9.13 — Subtle Sovereign attribution (RFC 0027) — Rejected

**Rejected** — excluded from the White-labeling Phase 2 workstream
([0013](../workstreams/0013-white-labeling-phase-2-and-ds-backlog.md))
during its planning pass; not carried forward to any other workstream
either. Left here for the record rather than deleted.

**Goal:** Add subtle, useful attribution surfaces so users and admins can identify
the platform as Sovereign without adding a persistent badge to daily workspace
chrome.

**Deliverables:**

- Auth screens (`apps/auth`) gain small footer microcopy: `Powered by Sovereign`.
- Runtime root metadata includes `<meta name="generator" content="Sovereign" />`
  for authenticated and unauthenticated layouts where applicable.
- Shell avatar menu gains an `About this instance` item that routes to the
  Account or Console about surface depending on role and available destination.
- Account plugin gains an About section/page showing instance name, platform
  name (`Sovereign`), runtime version, and docs/source links.
- Console system health/settings gains an about row showing `Platform:
Sovereign` and `Runtime: vX.Y.Z` alongside existing operational metadata.
- Documentation states that visible attribution is intentionally subtle and that
  a permanent shell badge is not part of the default UI.

**Dependencies:** Task 9.8 (instance identity rename), Task 9.9 (auth login page
identity), Task 14.2 (Account workflow coverage) where relevant.

**SRS reference:** RFC 0027, subtle attribution amendment.

**Review checklist:**

- Auth pages show `Powered by Sovereign` without competing with instance
  identity.
- Avatar menu opens an About surface and preserves normal back/navigation
  behavior.
- Account About and Console health use operational wording:
  `Platform: Sovereign`, `Runtime: vX.Y.Z`.
- Root HTML includes `meta name="generator" content="Sovereign"`.
- Main authenticated shell chrome has no persistent `Powered by` badge.

---

#### ✅ 9.14 — Local visual regression testing (RFC 0059)

**Goal:** Add local Playwright-based visual regression testing for the stabilized
UI contract without introducing hosted visual review services.

**Deliverables:**

- Add `pnpm test:visual` and `pnpm test:visual:update` scripts.
- Add Playwright visual configuration for deterministic screenshot comparisons.
- Add Storybook-driven visual tests for curated `packages/ui` component states
  across light/dark themes and key responsive viewports.
- Add a small root visual smoke suite for auth, shell, Launcher, Account,
  Console, overlays, and mobile navigation.
- Define and document screenshot baseline storage/update workflow.
- Add CI artifact upload for expected/actual/diff images when visual tests fail.
- Document snapshot policy: avoid broad React DOM snapshots; allow snapshots for
  stable serialized outputs only.
- Defer Chromatic, Percy, Loki, or other hosted visual review tools unless local
  review becomes a bottleneck.

**Dependencies:** Task 9.7 (Storybook), Task 9.11 (component gaps), RFC 0010
test organization, existing Playwright e2e setup.

**SRS reference:** RFC 0059.

**Review checklist:**

- `pnpm test:visual` fails on intentional visual diffs.
- `pnpm test:visual:update` refreshes baselines only when explicitly run.
- Component visual tests cover the curated `packages/ui` baseline set.
- Runtime visual smoke tests cover auth, shell, first-party plugins, overlays,
  and mobile navigation without becoming a full workflow snapshot suite.
- Docs explain when to add a visual test, when to update baselines, and when
  snapshots are acceptable.

**Correction note (shipped, workstream 0013 leg 2):** the Tier 1 (`packages/ui`) component
suite is fully implemented and verified live (25/25 passing against a running Storybook
instance). Baselines are macOS-generated (Playwright's default `-darwin` filename suffix) and
will not match Linux CI runners on first run — per this leg's own documented "Do not proceed
if" fallback, CI baseline calibration (generating `-linux` baselines) is left as an explicit
follow-up rather than blocking the leg, so `pnpm test:visual` is not yet a real CI gate. The
Tier 2 root smoke suite (`__tests__/visual/`) is scaffolded with real spec files but its actual
assertions were deferred pending live-app verification — see `docs/testing-visual.md`.

---

#### ✅ 9.15 — NavTabs Link support + PageHeader heading level

**Goal:** Close two `@sovereignfs/ui` API gaps discovered while dogfooding
`NavTabs` and `PageHeader` during Task 9.12's Account/Console migration —
both components turned out to be unusable for their most obvious targets
(the platform plugins' own section nav and page titles) without a
regression, so that migration work was skipped rather than forced.

**Deliverables:**

- `NavTabs` currently renders plain `<a href>` anchors. Inside an overlay
  plugin (`shell: overlay`, e.g. Account), that causes a full browser
  navigation instead of a client-side route transition — breaking the
  documented overlay-navigation contract (`<Link replace>`; a dialog
  dismissed via `router.back()` needs push-based history to not stack).
  Add a way for a consumer to supply its own link renderer (e.g. a
  `renderLink?: (item: NavTabItem) => ReactNode` prop, or an `as` prop
  accepting a component shaped like Next's `Link`) so first-party plugins
  can use `NavTabs` without leaving the SPA.
- `PageHeader` always renders `<h1>`. Console's per-page headers (Users,
  Plugins, Entitlements, …) sit under the shell's own `<h1>Console</h1>` —
  adopting `PageHeader` as-is would produce two `<h1>` elements per page, an
  accessibility regression (broken heading hierarchy). Add a `headingLevel?:
2 | 3` (or similar) prop, defaulting to the current `1` for standalone use.
- Once both land, revisit the Account `layout.tsx` nav/title and Console's
  per-page `.pageHeader`/`.nav` as part of Task 13.6.

**Dependencies:** Task 9.12 (design system stabilization) — this task exists
because 9.12 found the gap.

**Review checklist:**

- `NavTabs` can be used for SPA-internal navigation (Next `<Link>`) without
  a full page reload.
- `PageHeader` can render at a heading level other than `1` without any
  other visual change.
- Both changes are additive (new optional props, existing defaults
  unchanged) — no `@sovereignfs/ui` version bump beyond minor.

---

#### ✅ 9.16 — Editor workflow primitives for content plugins

**Goal:** Add the reusable `@sovereignfs/ui` primitives needed by Plainwrite-style
editor workflows so content/data-entry plugins do not hand-roll status chips,
resizable editing layouts, tag arrays, or code-oriented textareas.

**Deliverables:**

- **`StatusBadge`** — compact inline status indicator for states such as
  unmodified, draft, committed, conflict, pending delete, synced, warning, and
  error. Uses semantic status tokens and supports accessible labels.
- **`SplitPane`** — responsive two-pane layout for editor/preview or
  list/detail workflows. Supports fixed and resizable panes on desktop, stable
  min/max constraints, and a single-column fallback on narrow viewports.
- **`TagInput`** — multi-value text input where each value renders as a
  removable chip. Supports keyboard add/remove, paste splitting, validation
  messages, and `FormField` integration.
- **`CodeTextarea`** — monospace textarea for Markdown/YAML/JSON-style editing
  with predictable whitespace handling, resize constraints, invalid state, and
  `FormField` integration.
- Add Storybook stories for default, error, disabled, keyboard, long-content,
  and mobile states for each primitive.
- Add each primitive to the Component Gallery and update `docs/design-system.md`
  / `docs/plugin-development.md` with recommended editor-workflow patterns.

**Dependencies:** Task 9.11 (component gaps), Task 9.12 (design system
stabilization), Task 9.15 where navigation/header adoption affects editor
screens.

**SRS reference:** Design system plugin readiness; Plainwrite editor UI needs.

**Review checklist:**

- Plainwrite can build its file status list, Markdown/preview layout,
  frontmatter tag fields, and raw YAML editor without plugin-local generic
  control CSS.
- Components use only `--sv-*` tokens and keep stable dimensions across content
  and viewport changes.
- Keyboard and screen-reader interactions are documented and covered in stories.

---

#### ✅ 9.17 — Standalone usage of `@sovereignfs/ui` outside the plugin runtime (RFC 0073)

**Goal:** State and document a standalone-consumption guarantee for
`@sovereignfs/ui` so it can be used as an ordinary npm dependency in an
external app that isn't a Sovereign plugin and doesn't run inside the
runtime shell. Motivated by a separate standalone app that wants visual
consistency with the Sovereign ecosystem without becoming a plugin. Most
of the underlying capability already exists (zero SDK
coupling, a working `tokens.css` export, context-free hooks) — this task is
primarily verification and documentation, not new component code.

**Deliverables:**

- Confirmed `@sovereignfs/ui` is actually published to the npm registry
  (not just publish-configured) — `npm view @sovereignfs/ui` shows a real
  published version — and stated so in `docs/design-system.md`.
- Added a "Standalone usage" section to `docs/design-system.md`: install,
  import tokens (`@sovereignfs/ui/tokens.css`), the "no root provider
  required" guarantee, dark mode via `data-theme="dark"` on the consumer's
  own root (matching `packages/ui/src/tokens/semantic.css:91`), and a
  minimal `FormField` + `Input` example.
- Stated an explicit runtime-independence guarantee for `useIsMobile`,
  `useLongPress`, `useDoubleTapHandler`, `useCommitOnEnterOrBlur` — verified
  none of the four import context or any internal Sovereign dependency.
- Audited the `Icon` component and the rest of `packages/ui/src` for a
  same-origin/runtime-relative asset assumption
  (`fetch(`/`new URL(`/`src="/…"`-style paths) — zero matches; icons are
  bundled as inline SVG React components at build time. No fix needed.
- Added a tiered stability statement for the standalone surface (stable
  core primitives/tokens vs. experimental editor-workflow primitives like
  `SplitPane`) to `docs/design-system.md`, mirroring
  `docs/sdk-stability.md`'s structure.

**Dependencies:** None blocking — `packages/ui` already has zero
`@sovereignfs/sdk` coupling (verified: no matches for
`@sovereignfs/sdk` under `packages/ui/src`).

**SRS reference:** [RFC 0073](../rfcs/0073-standalone-ui-package.md)

**Review checklist:**

- A fresh external app can `npm install @sovereignfs/ui`, import tokens,
  and render `Button`/`FormField`/`Input` with correct styling and no
  runtime-shell dependency. Satisfied by construction — no root provider
  exists in the package, and the documented example matches actual
  component APIs already exercised elsewhere in this codebase (e.g.
  `plugins/console/app/oauth-clients/OAuthClientsClient.tsx`).
- Dark mode toggles correctly via `data-theme` alone, outside the runtime
  shell. ✅ verified against `packages/ui/src/tokens/semantic.css:91` — the
  `[data-theme='dark']` selector has no other dependency.
- `useIsMobile`/`useLongPress`/`useDoubleTapHandler`/`useCommitOnEnterOrBlur`
  work correctly when imported into a plain React 18+ app. ✅ verified: no
  `createContext`/`useContext`/internal-package imports in any of the four.
- No icon or asset request 404s when the component tree is rendered from a
  different origin than any Sovereign instance. ✅ verified: no
  runtime-relative asset references anywhere in `packages/ui/src`.
- `pnpm --filter @sovereignfs/ui typecheck` passes. ✅

---

#### ✅ 9.18 — Shared page layout container (`PageContainer`) and plugin layout convention

**Goal:** Give first-party plugins one documented way to constrain and
center their own main content, so plugin main-layout padding/margin/max-width
stops being ad hoc per plugin. A consistency review found five different
max-width values (960px, 1040px, 640px, 680px, none) and four different
padding combinations across plugin layouts, with no shared component and no
documented convention for what a plugin should add on top of the shell's own
auto-padding (`runtime/app/(platform)/shell.module.css:144-154`) — one plugin
(`sovereign-plainwrite`) ends up double-padded as a result.

**Deliverables:**

- New `PageContainer` component in `packages/ui`: `maxWidth` prop
  (`'sm' | 'md' | 'lg' | 'full'`, default `'md'`), centers via
  `margin-inline: auto` and constrains width — does not add its own padding,
  since the shell already pads every non-fullbleed plugin.
- Reconciled the observed max-width values (960px, 1040px, 640px, 680px)
  into the `sm`/`md`/`lg` scale rather than inventing new numbers.
- Storybook story covering all four `maxWidth` values plus a mobile
  viewport pass.
- `docs/design-system.md` and `docs/plugin-development.md` gain a "Page
  layout" section: the shell already pads plugin content
  (`--sv-space-8`/`--sv-space-4`); use `PageContainer` only to additionally
  constrain width; do not add local `padding`/`max-width` in plugin layout
  CSS. Documents `data-plugin-fullbleed` as the existing opt-out for plugins
  that manage their own full-bleed layout (`sovereign-tasks`,
  `sovereign-shopper`), which `PageContainer` does not apply to.
- Migrated `plugins/account` and `plugins/console` — the only plugins that
  actually live in this monorepo (`.gitignore` excludes every other plugin
  directory except `account/`, `console/`, `launcher/`; `sovereign-ledger`,
  `sovereign-wallet`, `sovereign-healthlog`, `sovereign-tritext`,
  `sovereign-plainwrite`, `sovereign-docs`, and `sovereign-tally` are each
  externally-maintained in their own repository and installed via
  `scripts/install-plugins.ts` — they are **not** editable from a task branch
  here) — onto `PageContainer`, removing their local container CSS.
- **Follow-up, out of this task's scope:** each externally-maintained plugin
  above needs its own PR in its own repository to adopt `PageContainer` once
  a new `@sovereignfs/ui` version ships it — including `sovereign-plainwrite`,
  whose double-padding (shell padding + its own `layout.module.css` padding +
  a page-level max-width) stays unfixed until that plugin's own maintainers
  (or a follow-up task scoped to that repo) pick it up. `sovereign-tasks`/
  `sovereign-shopper` (fullbleed) don't need this migration at all.

**Dependencies:** None — additive `packages/ui` component; does not change
`runtime/app/(platform)/shell.module.css` behavior.

**SRS reference:** [RFC 0079](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)

**Review checklist:**

- Every migrated plugin renders at the same or a more consistent content
  width as before, with no double-padding regression (verify visually at
  desktop and the 768px mobile breakpoint).
- `PageContainer` adds zero padding of its own — confirm via computed
  styles that padding still comes only from the shell.
- Fullbleed plugins (`sovereign-tasks`, `sovereign-shopper`) are visually
  unchanged.
- `pnpm --filter @sovereignfs/ui typecheck` and `pnpm design:tokens:check`
  pass; Storybook builds.

---

#### ✅ 9.19 — Overlay primitive consolidation and Plainwrite ConfirmDialog migration

**Goal:** `Dialog`, `Drawer`, and `Sheet` each independently implement the
same scrim, focus-trap, Escape-key, and scroll-lock logic, with source
comments acknowledging the duplication. Consolidate that shared logic onto
one internal helper with no public API change, and migrate
`sovereign-plainwrite`'s local hand-rolled `ConfirmDialog` (a pre-Task-9.12
stopgap that its own doc comment says should be replaced) onto the shared
`@sovereignfs/ui` `ConfirmDialog`.

**Deliverables:**

- Internal (non-exported) `useOverlayShell`-style helper in
  `packages/ui/src/components` factoring out the focus-trap cycling,
  Escape handling, and `lockBodyScroll`/`unlockBodyScroll`
  (`packages/ui/src/scroll-lock.ts`) `useEffect` currently duplicated in
  `Dialog.tsx`, `Drawer.tsx`, and `Sheet.tsx`.
- `Dialog`, `Drawer`, and `Sheet` call the shared helper internally; all
  existing public props (`open`, `onClose`, `size`, `snapHeight`,
  `slideFrom`, `title`, `aria-label`, etc.) are unchanged.
- `ConfirmDialog` is explicitly not migrated onto this helper — it stays on
  native `<dialog>`, which already provides equivalent behavior more
  reliably for its use case.
- **Follow-up, out of this task's scope:** `sovereign-plainwrite` is an
  externally-maintained plugin in its own repository (excluded from this
  monorepo by `.gitignore` — only `account/`, `console/`, `launcher/` are
  tracked here), so its local `app/_components/ConfirmDialog.tsx` and three
  call sites (`MarkdownEditor.tsx`, `NewPostDialog.tsx`,
  `NewProjectDialog.tsx`) cannot be migrated from a branch in this repo. That
  migration (`onClose` instead of `onCancel`, `destructive`/`pending`/`error`
  props as needed, local component deleted) needs its own PR in Plainwrite's
  repository once this task's `@sovereignfs/ui` release ships.

**Dependencies:** None — internal refactor of existing components; no
public API or manifest change.

**SRS reference:** [RFC 0079](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)

**Review checklist:**

- `Dialog`/`Drawer`/`Sheet` existing Storybook stories and component tests
  pass unchanged (focus trap, Escape-to-close, scroll-lock ref-counting for
  nested overlays all still work).
- No prop, export, or behavior change visible to any consumer of `Dialog`,
  `Drawer`, or `Sheet`.
- (Verified in Plainwrite's own follow-up PR, not this task) its three
  confirm-dialog call sites render and behave identically to before (title,
  message, destructive styling, pending state), now via the shared
  component; local `ConfirmDialog.tsx` removed.
- `pnpm --filter @sovereignfs/ui test` and `pnpm --filter @sovereignfs/ui typecheck` pass.

---

#### ✅ 9.20 — Shared swipe gesture hooks and carousel migration (Tasks, Shopper)

**Goal:** `sovereign-tasks` has two separate hand-rolled swipe-to-reveal
implementations in the same plugin (`TaskItem.tsx`, `ListSidebar.tsx`), and
`sovereign-tasks`/`sovereign-shopper` each independently reimplement the same
scroll-snap carousel settle-detection (`MobileTasksCarousel.tsx`,
`MobileShopperCarousel.tsx`). No shared swipe hook exists in `packages/ui`
today — this is the direct current-code instance of the DS-first rule in
`docs/architecture-rules.md` ("interaction hooks... belong in `packages/ui`...
never a plugin-local implementation 'to be promoted later'"), which
`sovereign-tasks/CLAUDE.md` records was already enforced once before for a
different primitive.

**Deliverables:**

- **`useSwipeReveal({ revealWidth, onReveal?, disabled? })`** in
  `packages/ui/src/hooks`, extracted from the existing pointer-swipe logic in
  `TaskItem.tsx` (`SWIPE_REVEAL_WIDTH=128px`) and `ListSidebar.tsx`
  (`SWIPE_REVEAL_WIDTH=72px`) — same axis-lock tolerance and
  open/close-at-half-width behavior, parameterized by `revealWidth` per
  call site.
- **`useSnapCarousel({ itemCount, onSettle? })`** in
  `packages/ui/src/hooks`, extracted from the existing debounced-scroll
  settle-detection in `MobileTasksCarousel.tsx` and
  `MobileShopperCarousel.tsx`.
- **Follow-up, out of this task's scope:** `sovereign-tasks` and
  `sovereign-shopper` are externally-maintained plugins in their own
  repositories (excluded from this monorepo by `.gitignore` — only
  `account/`, `console/`, `launcher/` are tracked here), so migrating their
  existing swipe/carousel call sites onto the new hooks needs its own PR in
  each plugin's repository once this task's `@sovereignfs/ui` release ships.
  No user-visible behavior change is expected (same thresholds, same
  timing) — this is deduplication, not a UX change.
- Existing `touch-action` declarations in `ListSidebar.module.css`,
  `TaskItem.module.css`, and `ItemRow.module.css` left as-is (unaffected by
  moving the JS into a shared hook); `docs/architecture-rules.md`'s
  nested-`pan-x`/`pan-y` guidance still applies.
- Storybook stories for both hooks under the mobile-patterns section.

**Dependencies:** None — additive `packages/ui` hooks; existing plugin
behavior is preserved, not changed.

**SRS reference:** [RFC 0079](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)

**Review checklist:**

- (Verified in each plugin's own follow-up PR, not this task) swipe-to-reveal
  on task rows and list rows in `sovereign-tasks`, and carousel swipe
  navigation in both `sovereign-tasks` and `sovereign-shopper`, behave
  identically to before the migration (same reveal widths, same settle
  timing) on a touch device or touch emulation, with no plugin-local
  swipe/carousel implementation remaining in either plugin.
- `useSwipeReveal` and `useSnapCarousel` are covered by Storybook stories and
  behave correctly in isolation (this task's actual verification surface).
- `pnpm --filter @sovereignfs/ui typecheck` passes; existing
  `sovereign-tasks`/`sovereign-shopper` test suites pass unchanged.

#### ✅ 9.21 — Swipeable mobile carousel primitive and responsive-layout hooks

**Goal:** `sovereign-tasks` and `sovereign-shopper` each hand-roll an
almost-identical "mobile carousel" pattern on top of task 9.20's
`useSnapCarousel` extraction — the `.wrap`/`.scroller`/`.slide`/`.dots` CSS
and the pathname↔index sync logic (`indexForPathname`, the `isInternalNav`
ref-flag dance distinguishing the carousel's own settle-triggered navigation
from an external one) is duplicated near-verbatim between
`MobileTasksCarousel.tsx` and `MobileShopperCarousel.tsx`, and both plugins'
dot indicator is `aria-hidden` and non-interactive — a real accessibility
gap. Separately, `sovereign-tasks`' carousel is measurably laggier than
`sovereign-shopper`'s equivalent, not because of the carousel mechanism
itself (identical between both) but because it nests cross-slide data
aggregation (a "Starred" rollup refetched on every mutation anywhere in the
plugin) and a detail-overlay `Sheet`'s optimistic/authoritative merge logic
directly inside the carousel component. This task ships a shared,
`packages/ui`-owned primitive that generalizes the proven mechanics, closes
the accessibility gap, and makes the better pattern (render already-known
metadata immediately; keep aggregation/overlays out of the carousel) the
natural way to build a slide — without migrating either plugin in this task.

**Deliverables:**

- **`SwipableMobileCarousel`** + **`SwipableMobileCarouselSlide`** (with
  `SwipableMobileCarouselSlideHeader`/`Body`/`Footer` sub-components) in
  `packages/ui/src/components/SwipableMobileCarousel/` — a compound
  component (this library's first; every existing component is flat/
  prop-based) wrapping `useSnapCarousel` internally. Owns mount-window lazy
  rendering (active slide ± a caller-configurable `prefetchDistance`,
  default 1), a dev-mode-only guard against non-`Slide` children (warns via
  `console.error`, never throws), and a fix for a latent reorder-while-mounted
  bug present in both existing plugins today (scroll position tracks DOM
  position, not slide identity — re-snaps and re-reports `onSettle` when the
  active slide's key moves). `SlideBody`'s `loading` prop scopes the
  loading-placeholder swap to just that region, so a caller can render
  `<Header>` from already-known metadata unconditionally while only `<Body>`
  waits on its own fetch — the fix for `sovereign-tasks`' current
  whole-slide-blanks-until-loaded behavior, expressed as an API shape rather
  than a one-off patch.
- **`SwipableMobileCarouselDots`** in
  `packages/ui/src/components/SwipableMobileCarouselDots/` — a standalone,
  independently-reusable, real `role="tablist"`/`role="tab"` component
  (tappable, labeled, roving `tabIndex`, `:focus-visible` ring) replacing the
  `aria-hidden`, non-interactive dots pattern both plugins currently
  hand-roll. Serves as `SwipableMobileCarousel`'s default indicator via a
  `renderIndicator` prop (nullable to opt out or substitute a custom one).
- **`useResponsiveLayout`** (hook) + **`ResponsiveSurface`** (thin JSX
  wrapper) in `packages/ui/src/hooks` /
  `packages/ui/src/components/ResponsiveSurface/` — formalizes the
  `if (isMobile) return <mobile/>; return <web/>;` fork both plugins'
  `MobileAwareShell.tsx` hand-roll unexported, built on the existing
  `useIsMobile` (no duplicated breakpoint/SSR-safe-default logic).
- **`useCarouselRouteSync`** in `packages/ui/src/hooks` — a router-agnostic
  hook (no `next/navigation` import; `packages/ui` stays framework-generic)
  centralizing the pathname↔index mapping and `isInternalNav` dance both
  plugins duplicate today. Takes the caller's existing `indexForPathname`/
  `pathForIndex` functions and an `onNavigate(path)` callback the caller
  wires to their own router; does not own neighbor-prefetch or scroll
  mechanics, keeping routing glue decoupled from data-fetching.
- Storybook stories for every new export (`SwipableMobileCarousel.stories.tsx`
  including a `Dots` section, two new `InteractionHooks.stories.tsx`
  Sections, new `DesignSystemOverview.stories.tsx` gallery entries, a new
  `MobilePatterns.stories.tsx` section), plus Vitest coverage following
  `useSnapCarousel.test.ts`'s established jsdom scroll-polyfill/fake-timer
  pattern.
- One added sentence in `docs/architecture-rules.md`'s existing
  `touch-action` intersection rule pointing at this component, and a new
  "Mobile carousel & responsive fork" section in `docs/design-system.md`
  documenting the aggregation/overlay-placement guidance (not type-enforced,
  since nothing stops importing `Sheet` inside a `Body` — this is why it's
  written down explicitly).

**Follow-up, out of this task's scope:** migrating `sovereign-tasks` and
`sovereign-shopper` (externally-maintained, separate repositories) onto this
primitive is a later task in each plugin's own repo, same as task 9.20's
own follow-up note. No user-visible behavior change to either plugin
happens in this task.

**Dependencies:** Builds on task 9.20's `useSnapCarousel`/`useSwipeReveal`
(already shipped). No new runtime dependency — `packages/ui` stays at zero
deps beyond React/React-DOM peers.

**SRS reference:** [RFC 0079](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, `test`, and `lint` all pass.
- Every new component/hook has a Storybook story and renders without console
  errors at a mobile viewport (`pnpm storybook` or the `storybook-build` CI
  job); `SwipableMobileCarouselDots` is keyboard-focusable and each dot has a
  distinct accessible name.
- `SwipableMobileCarousel`'s mount-window, settle, dev-guard, and
  reorder-jump behavior are covered by unit tests; `useCarouselRouteSync`'s
  external-nav-vs-own-settle distinction is covered (this is the trickiest
  logic being centralized — both plugins' existing code comments describe a
  real double-flicker bug a wrong reimplementation could reintroduce).
- No plugin migration in this task — `sovereign-tasks`/`sovereign-shopper`
  are unaffected.

#### 📋 9.22 — `NavRail` vertical section nav + `md` overlay resize (RFC 0085)

**Goal:** Console (11 sections) and Account (7 sections) each hand-roll a
near-identical horizontal underline tab strip duplicating logic already
covered by unused `packages/ui` primitives (`Tabs`, `NavTabs`), and both
render full-screen (`overlaySize: "lg"`) for what is functionally a settings
panel. Ship a new vertical rail navigation primitive and switch both plugins
to it inside a resized, landscape `md` dialog — the pattern used by desktop
OS preference panes and Claude's own settings modal.

**Deliverables:**

- **`NavRail`** in `packages/ui/src/components/NavRail/` — link-based
  (`items: { label, href, active, icon? }[]`, matching `NavTabs`'s API shape
  rather than `Tabs`'s controlled `value`/`onChange`), vertical stack, own
  column width, left-edge active indicator, optional per-item icon slot.
  Storybook story + `DesignSystemOverview.stories.tsx` gallery entry;
  `pnpm --filter @sovereignfs/ui typecheck` passes.
- `Dialog.module.css`'s `.md` resized from `36rem × 42rem` (portrait) to a
  landscape box sized for rail-plus-content (starting proposal `60rem ×
40rem`, refine visually against Console's widest real content). Mobile is
  unaffected — every `DialogSize` already collapses to full-screen under
  768px.
- `plugins/console/manifest.json` and `plugins/account/manifest.json`:
  `shellConfig.overlaySize` `"lg" → "md"`.
- Delete Console's `.nav`/`.navLink` (`console.module.css`) and Account's
  `.tabs`/`.tab` (`account.module.css`) hand-rolled CSS; both layouts render
  `NavRail` instead.
- Mobile: no behavior change — both layouts keep using
  `useOverlaySecondRow` with a horizontal strip exactly as today. The full
  drill-down list (Claude Mobile-style) is explicitly out of scope; tracked
  as future work, not a follow-up task yet.
- `docs/upgrade.md` migration note for the `md` size change (visible change
  to a public DS value per NFR-04) and a `docs/design-system.md` mention of
  `NavRail` alongside `NavTabs`/`Tabs`.

**Open design decisions (not resolved by RFC 0085 — resolve during
implementation):** where the plugin's `<h1>` title goes on desktop now that
the rail leaves no obvious header row for it; whether the standalone
hard-navigation route (`/console`, `/account` outside the `Dialog`) also
adopts the rail on desktop or keeps its current horizontal header; exact
`md` pixel dimensions.

**Dependencies:** None — additive `packages/ui` export, existing `Dialog`
size infrastructure already supports `md`.

**SRS reference:** [RFC 0085](../rfcs/0085-vertical-section-nav-overlay-shell.md)

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, `test`, and `lint` pass.
- `NavRail` has a Storybook story and gallery entry; renders without console
  errors.
- Console and Account both render via `NavRail` inside the resized `md`
  dialog on desktop; mobile still shows the horizontal `useOverlaySecondRow`
  strip unchanged (manual check at a mobile viewport).
- No hand-rolled `.nav`/`.navLink`/`.tabs`/`.tab` CSS remains in either
  plugin's module CSS.
- `packages/ui` version bumped (minor) with a `docs/upgrade.md` entry for the
  `md` resize; each plugin's own `manifest.json` version bumped.

---

#### ✅ 9.23 — `MobileHeader` and `MobileFooter` Design System components

**Goal:** Extract the runtime's hardcoded mobile header and footer
(`runtime/app/(platform)/layout.tsx:228-254`,
`runtime/app/(platform)/_components/MobileNav.tsx:49-83`) into two new
`packages/ui` components, formalizing which parts of the mobile chrome are
immutable (brand/logo, avatar menu, and notification bell in the header; the
centered "Apps" launcher in the footer) versus overridable (an optional
header title; up to two additional icons on each side of the footer
launcher), ahead of a not-yet-designed future use case where a plugin
renders this chrome itself. Groundwork only — no manifest or SDK change.

**Deliverables:**

- **`MobileHeader`** in `packages/ui/src/components/MobileHeader/` —
  presentational, no data fetching. Props: `logo: ReactNode`,
  `homeHref?: string`, `title?: string` (absent by default), `bell:
ReactNode`, `avatarMenu: ReactNode`. Reuses the existing
  `--sv-shell-header-height` token; does not change its value.
- **`MobileFooter`** in `packages/ui/src/components/MobileFooter/` —
  presentational. Props: `onOpenApps: () => void`, `launcherIcon?:
ReactNode`, `leftIcons: FooterIcon[]` (1 or 2), `rightIcons: FooterIcon[]`
  (1 or 2), each `FooterIcon` = `{ icon: ReactNode; label: string; href?:
string; onClick?: () => void; active?: boolean }`. Dev-mode-only
  `console.error` (never throws) when `leftIcons.length !== rightIcons.length`,
  matching `SwipableMobileCarousel`'s existing non-fatal-guard pattern.
  Reuses the existing `--sv-shell-footer-height` token.
- Dedicated `Components/MobileHeader` and `Components/MobileFooter` story
  files (`MobileHeader.stories.tsx`, `MobileFooter.stories.tsx`), covering:
  header with/without `title`; footer at 1+1 and 2+2 icon counts; the
  launcher's open/active state.
- A live demo section under `Overview/Mobile Patterns`
  (`MobilePatterns.stories.tsx`) and a `Component Gallery` entry in
  `DesignSystemOverview.stories.tsx`, cross-referencing the dedicated
  stories above.
- `docs/design-system.md` gains a short section on the header/footer
  immutable-vs-overridable boundary, cross-referencing RFC 0088.

**Dependencies:** None — additive `packages/ui` components; no change to
runtime behavior in this task (that's task 9.24).

**SRS reference:** [RFC 0088](../rfcs/0088-mobile-header-footer-design-system-components.md)

**Version impact:** `@sovereignfs/ui` → **minor** — new, additive components.

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, `test`, and `lint` pass.
- Both components render without console errors at a mobile viewport
  (Storybook); the footer's mismatched-icon-count guard fires exactly the
  documented dev-mode warning and never throws.
- Neither component fetches data or imports `@sovereignfs/sdk` — confirmed
  presentational (grep for `fetch`/`useEffect` data calls turns up none).
- `pnpm design:tokens:check` passes; `--sv-shell-header-height` and
  `--sv-shell-footer-height` are unchanged in value.

---

#### ✅ 9.24 — Runtime mobile shell consumes `MobileHeader`/`MobileFooter`

**Goal:** Refactor `runtime/app/(platform)/layout.tsx` and
`runtime/app/(platform)/_components/MobileNav.tsx` to render through task
9.23's new `packages/ui` components instead of their current inline markup,
with no visual or behavioral change except one bug fix: the mobile header's
contextual title — described in RFC 0013's own comment
(`layout.tsx:224`, "brand · active-plugin title · bell · avatar menu") but
never actually wired up — starts rendering for the first time, using the
existing (currently orphaned) resolution logic from `ActivePluginTitle.tsx`.

**Deliverables:**

- `(platform)/layout.tsx`'s header block (`:228-254`) rewritten to render
  `<MobileHeader logo={...} bell={<NotificationBell />} avatarMenu={<AccountMenu
.../>} />`, passing the exact same `instanceLogoUrl`/`instanceName`/
  `accountAvatar` data it already resolves server-side. **No `title` is
  set** — see below.
- `ActivePluginTitle.tsx`'s longest-`routePrefix`-match logic was first
  ported into a new `useActivePluginTitle` hook plus a `PlatformMobileHeader`
  client wrapper, to actually surface it as `MobileHeader`'s `title` and
  close the RFC 0013 gap. A same-day follow-up fix reverted this: showing
  the instance brand and active-plugin name side by side read oddly, and
  per-plugin titles weren't actually the goal, so both `useActivePluginTitle`
  and `PlatformMobileHeader` were deleted and `layout.tsx` renders
  `MobileHeader` directly as a server component again, with no `title`.
  `ActivePluginTitle.tsx` and its module CSS are deleted either way — the
  logic never ships as a rendered title, but the dead code is gone. See RFC
  0088's Changelog (v0.3) for the full account.
- `MobileNav.tsx`'s footer `<nav>` (`:49-83`) rewritten to render
  `<MobileFooter onOpenApps={...} launcherIcon={...} leftIcons={[home]}
rightIcons={[search]} />`, reproducing today's exact Home/Apps/Search
  layout via the new 1+1 shape — the Drawer and `MobileSearch` overlay stay
  owned by `MobileNav.tsx` unchanged. The Home icon uses `onClick` +
  `router.push` rather than `MobileFooter`'s `href` prop, to preserve
  client-side navigation instead of a full page reload.
- No change to `shellConfig.mobileHeader`/`mobileFooter` visibility gating
  (RFC 0075) — this task only changes what renders inside the `showMobileHeader`/
  `showMobileFooter` conditionals, not the conditionals themselves.

**Dependencies:** Task 9.23 (the components this consumes).

**SRS reference:** [RFC 0088](../rfcs/0088-mobile-header-footer-design-system-components.md)

**Version impact:** `runtime` → **patch** — internal refactor plus the
title-rendering fix; no public API change.

**Review checklist:**

- Visual diff at mobile viewport (375px and 768px breakpoints) shows no
  change at all — brand, avatar, bell, and all three footer icons render
  identically to before. (The header-title wiring described above was
  implemented and then reverted the same day, so no title renders.)
- `--sv-dialog-inset-top` and the header/footer height CSS variables are
  unaffected (`ClientShell`'s `syncViewport()` still measures
  `[data-mobile-header]` correctly against the new markup).
- RFC 0075's `shellConfig.mobileHeader`/`mobileFooter: false` still omits
  the respective element server-side (existing Vitest coverage in
  `runtime/src/__tests__/mobile-chrome.test.ts` and
  `runtime/src/__tests__/registry.test.ts` continues to pass unchanged).
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass across `runtime`;
  `ActivePluginTitle.tsx`/`.module.css` no longer exist and nothing else
  references them.

---

#### ✅ 9.25 — Plugin-owned page padding: `PageContainer` gains the gutter, the shell gives it up

**Goal:** Move the plugin content gutter out of the runtime shell and into
`PageContainer`, so a plugin's page inset is declared in the plugin's own
code rather than imposed from outside it. Task 9.18 established
`PageContainer` as the shared width primitive and documented "the shell pads,
you don't" — but left the shell owning padding for content it knows nothing
about, and never fixed the two scaffolders, which still emit the exact
`padding` + `max-width` root rule the docs forbid. Every example plugin is
consequently double-padded (shell 32px + its own 32/24px), which is the
visible bug this task fixes.

**Deliverables:**

- `PageContainer` gains `padding?: 'none' | 'sm' | 'md' | 'lg'` (default
  `'md'`), responsive at the established 768px breakpoint:

  | `padding` | Desktop                | ≤768px                |
  | --------- | ---------------------- | --------------------- |
  | `none`    | 0                      | 0                     |
  | `sm`      | `--sv-space-4` (16px)  | `--sv-space-3` (12px) |
  | `md`      | `--sv-space-8` (32px)  | `--sv-space-4` (16px) |
  | `lg`      | `--sv-space-12` (48px) | `--sv-space-6` (24px) |

  `md` is deliberately the shell's current values, so a bare
  `<PageContainer>` reproduces today's rendering exactly. A fixed enum, not a
  free-form value — the consistency review behind task 9.18 found four
  different ad-hoc padding combinations, and a free-form prop would just
  relocate that mess from CSS modules into JSX.

- `PageContainer`'s `maxWidth` default flips `'md'` → `'full'`. A container
  that silently clamps to 960px is a surprising default; narrowing should be
  opt-in. All five existing call sites pass `maxWidth` explicitly, so no
  in-repo caller changes behavior — but this is a public API semantic change
  to a published package (NFR-04), so it needs the migration note.
- `runtime/app/(platform)/shell.module.css` drops `.content`'s gutter
  (`--sv-space-8` desktop / `--sv-space-4` mobile) and **keeps the two
  clearances**, which are shell facts a plugin cannot compute: the offline
  banner's `--sv-offline-banner-height` reservation (with its 200ms
  transition) and the mobile footer's `--sv-shell-footer-height`. The
  `:has([data-plugin-fullbleed])` rules stay — they now suppress those
  clearances rather than the gutter, which the existing mobile comment at
  `shell.module.css:326` explains is still required — as does the separate
  desktop height-lock, which never had anything to do with padding.
- **Breaking for out-of-repo plugins.** Once the gutter is gone, any plugin
  not wrapped in a padded `PageContainer` renders edge-to-edge. That is
  every externally-maintained plugin (`sovereign-ledger`, `-wallet`,
  `-healthlog`, `-tritext`, `-plainwrite`, `-docs`, `-tally`), each of which
  needs its own PR in its own repository. Accepted deliberately: those
  plugins are slated for a rewrite pass, the failure mode is cosmetic rather
  than broken, and the alternative (a transitional opt-out attribute plus a
  later flag day) buys coordination we do not need. Recorded in
  `docs/upgrade.md`.
- Both scaffolders stop emitting the anti-pattern — `bin/helpers.ts:338` and
  `packages/create-plugin/src/index.ts:209` currently generate
  `.page { padding: var(--sv-space-8) var(--sv-space-6); max-width: 640px; }`,
  which is why every scaffolded plugin, in-repo and third-party, starts life
  double-padded. They emit a `PageContainer` wrapper instead. This is the
  deliverable that stops the problem regenerating.
- Migrate every plugin that ships with the platform: `plugins/launcher`,
  `plugins/account`, `plugins/console`, and `example-plugins/example-{api,
basic,monetized,device-only,encrypted,minimal,mobile}`. `plugins/warden`
  and `example-plugins/example-mobile-poc` are `data-plugin-fullbleed` and
  are excluded by design. `example-minimal` is a `shell: "minimal"` plugin
  that has always hand-rolled its own padding because nothing shared existed
  for it; it gains the same primitive as everything else.
- The three `example-overlay-*` plugins are the one non-mechanical case:
  they render from one component tree into two hosts, and correctly carry no
  padding today because `Dialog` already pads `--sv-space-6`
  (`Dialog.module.css:89`) in the modal case while the shell padded the
  full-page fallback. Wrapping the plugin itself would double-pad the modal.
  The wrapper therefore goes in the **generated fallback copy**
  (`scripts/generate-registry.ts:345` already composes overlay plugins into
  both locations), keeping the plugins' existing padding-free contract intact
  and leaving each host responsible for its own inset.
- Regression guard: a unit test asserting the scaffolder output contains no
  root `padding`/`max-width`. Scoped to the templates deliberately — a
  repo-wide CSS lint cannot statically know which class is a given plugin's
  root, and a heuristic that pretends otherwise is worse than none.
- Docs: `docs/design-system.md`'s "Page layout" section currently states the
  inverse rule and must be rewritten; `docs/plugin-development.md`,
  `docs/architecture-rules.md`, and `docs/upgrade.md` follow. Storybook
  stories for the new `padding` prop plus the `DesignSystemOverview` gallery
  entry, per the per-PR Storybook hygiene rule.

**Dependencies:** Task 9.18 (the `PageContainer` component this changes).

**SRS reference:** [RFC 0079](../rfcs/0079-mobile-pwa-layout-overlay-gesture-consistency.md)
— extends its `PageContainer` design; RFC 0079 §"1. `PageContainer`"
explicitly deferred padding to the shell, and this task reverses that
specific decision while keeping the rest of the component's contract.

**Version impact:** platform → **minor** (`0.94.0`); `@sovereignfs/ui` →
**minor** (new prop + changed `maxWidth` default; NFR-04 forbids shipping
either in a patch); `@sovereignfs/create-plugin` → **patch**.

**Review checklist:**

- Every migrated plugin renders with the same insets as the Launcher does
  today, at desktop and at the 768px breakpoint — verify the four-sided
  padding visually, not just the left edge.
- No plugin is double-padded: computed styles show padding coming from
  `PageContainer` only, with `.content` contributing nothing but the two
  clearances.
- The offline banner still pushes content down without overlaying it, and
  mobile content still clears the footer — both with the banner visible and
  hidden.
- Fullbleed plugins (`warden`, `example-mobile-poc`) are pixel-identical,
  including the desktop viewport height-lock.
- `example-overlay-*` render correctly in **both** hosts: padded once inside
  the modal, padded once on the hard-navigated full-page fallback.
- `sv plugin new` and `npm create @sovereignfs/plugin` both produce a plugin
  that renders correctly padded on first run, with no `padding`/`max-width`
  in its generated CSS module.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, and
  `pnpm design:tokens:check` pass; Storybook builds.

---

#### ✅ 9.26 — Extract shared drag-reorder sensors + GripIcon into packages/ui; migrate plugins/account

**Goal:** Close a DS-first violation flagged in the latest codebase audit: plugins/account/app/_lib/dndSensors.ts's dnd-kit sensor-subclassing pattern (shouldHandleDndEvent() at lines 28-31, useReorderSensors() at lines 63-74, activation constants distance: 8 / delay: 300 / tolerance: 8) is reimplemented byte-for-byte in sovereign-plugin-tasks.local/app/_lib/dndSensors.ts and sovereign-plugin-shopper.local/app/_lib/dndSensors.ts (identical executable code -- only doc comments differ), with a third, structurally related but non-identical variant in sovereign-plugin-kanban.local. The accompanying six-dot drag-handle icon exists three separate times too: privately as DragIcon() inside packages/ui/src/components/DragHandleRow/DragHandleRow.tsx:43-61 (never exported), and independently reproduced as GripIcon.tsx in both sovereign-plugin-tasks.local/app/_components/ and sovereign-plugin-shopper.local/app/_components/ -- both files' doc comments read verbatim "Matches @sovereignfs/ui's DragHandleRow icon, reproduced locally since it isn't exported." plugins/account's own drag handle (SidebarControl.tsx:148-156) doesn't even use an SVG -- it renders a literal "⠿" braille character, a third visual treatment of the same affordance. This directly contradicts CLAUDE.md's DS-first rule: "Reusable UI/UX capability -- interaction hooks ... -- is implemented in packages/ui ... and consumed by plugins, never implemented plugin-locally 'to be promoted later'." Scope is platform-owned code only: extract the hook, the exclusion predicate, and the icon into packages/ui, and migrate plugins/account onto them. The .local plugins (Shopper, Tasks, Kanban) are separately-maintained repos with their own CLAUDE.md/roadmap; migrating each onto the new shared primitive is that plugin's own follow-up once this ships, not part of this task.

**Deliverables:**

- packages/ui/src/hooks/useReorderSensors.ts (new) -- port shouldHandleDndEvent() and useReorderSensors() verbatim from plugins/account/app/_lib/dndSensors.ts:28-74 (MouseSensor/TouchSensor subclasses overriding static activators with a data-no-dnd-aware handler, KeyboardSensor via sortableKeyboardCoordinates), generalized with an optional UseReorderSensorsOptions ({ mouseActivationDistancePx?, touchActivationDelayMs?, touchActivationTolerancePx? }) defaulting to the existing 8/300/8 values -- a bare useReorderSensors() call stays behavior-identical to account's current one.
- packages/ui/src/components/GripIcon/GripIcon.tsx (new) -- the six-dot drag-handle SVG extracted from DragHandleRow.tsx's private DragIcon() (lines 43-61): same viewBox="0 0 14 14", two-column-three-row <circle> markup, fill="currentColor", aria-hidden. Props: size?: number (default 14), className?: string -- no baked-in pointer-events or color, so a floating, absolutely-positioned handle (the shape sovereign-tasks' own GripIcon.tsx needs) can use it too, not only DragHandleRow's fixed-gutter layout.
- DragHandleRow.tsx imports GripIcon and deletes its own private DragIcon() function -- identical rendered output, one fewer internal duplicate of the same markup.
- packages/ui/src/hooks/index.ts and packages/ui/src/index.ts export useReorderSensors, shouldHandleDndEvent, UseReorderSensorsOptions, GripIcon, and GripIconProps (append to the existing hooks re-export block at index.ts:228-256 and near DragHandleRow's own export at index.ts:191-192).
- packages/ui/package.json gains @dnd-kit/core and @dnd-kit/sortable as optional peerDependencies (peerDependenciesMeta marking both { "optional": true }), mirroring the existing react/react-dom peer pattern -- not a regular dependency, since dnd-kit's DndContext needs exactly one shared module instance with whatever DndContext/SortableContext the consuming plugin already renders, and every consumer already installs its own copy. Matching devDependencies added for local typecheck/test/storybook.
- pnpm-workspace.yaml's catalog: gains @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (pinned to plugins/account/package.json's currently-installed ^6.3.1 / ^10.0.0 / ^3.2.2) -- two committed packages (packages/ui, plugins/account) now depend on the same dnd-kit packages, which is exactly the "used by more than one package" trigger for adding a shared dep to the catalog per this repo's own environment-notes convention. packages/ui's new peerDependencies/devDependencies and plugins/account/package.json's existing dependencies both switch to catalog:.
- packages/ui/tsup.config.ts's external array (currently [/\.css$/, 'react', 'react-dom', 'react/jsx-runtime']) gains a /^@dnd-kit\// entry so the published bundle doesn't inline dnd-kit into dist/index.js.
- packages/ui/src/hooks/**tests**/useReorderSensors.test.ts (new) -- unit coverage for shouldHandleDndEvent(): an element nested inside a data-no-dnd ancestor is refused, everything else is allowed, and a non-Element target (e.g. null) is allowed. plugins/account has no existing test for this logic today.
- packages/ui/src/stories/GripIcon.stories.tsx (new) -- default state plus a size variant, per Storybook hygiene rule; add a GripIcon entry to the Component Gallery section of DesignSystemOverview.stories.tsx and bump its "All 75 components" count string (DesignSystemOverview.stories.tsx:1816) to 76.
- docs/design-system.md's "Interaction hooks" section (starting ~line 789) gains a useReorderSensors / shouldHandleDndEvent subsection in the same format as the existing useLongPress/useSwipeReveal write-ups.
- Migrate plugins/account: delete plugins/account/app/_lib/dndSensors.ts; SidebarControl.tsx:15 imports useReorderSensors from @sovereignfs/ui instead of the deleted local file; SidebarRow's drag-handle button (SidebarControl.tsx:148-156) renders <GripIcon /> in place of the literal "⠿" character; account.module.css's .dragHandle rule (lines 853-863) drops the now-dead font-size/line-height declarations that were sized for the text glyph. plugins/account/package.json's own @dnd-kit/core / @dnd-kit/sortable / @dnd-kit/utilities dependencies stay (now via catalog:) -- SidebarControl.tsx still directly uses DndContext, SortableContext, useSortable, arrayMove, closestCenter, and CSS.Transform; only the sensor/icon plumbing moves out.
- Version bumps in the same PR: packages/ui's package.json minor (0.73.0 -> 0.74.0 -- new hook, new component, new optional peer dependency, all additive/non-breaking per NFR-04). plugins/account/manifest.json bumps per the plugin-versioning convention (internal refactor plus a user-visible icon swap on the sidebar drag handle) -- never plugins/account/package.json, which stays pinned at 0.0.0.

**Dependencies:** None.

**SRS reference:** None -- this is remediation of an existing convention (CLAUDE.md's "Design system" section, "DS-first: plugins are consumers" rule under Scope rules), not new design. No RFC governs drag-reorder sensors specifically.

**Review checklist:**

- pnpm --filter @sovereignfs/ui typecheck passes.
- pnpm typecheck (turbo, whole repo) passes, confirming plugins/account still compiles against the new @sovereignfs/ui exports.
- pnpm lint and pnpm format:check pass.
- pnpm exec vitest run packages/ui/src/hooks/**tests**/useReorderSensors.test.ts passes, covering the data-no-dnd exclusion behavior.
- pnpm test (full vitest run) passes with no regressions in plugins/account's own suite.
- grep -rn "dndSensors" plugins/account/app returns nothing -- the file is deleted and no import references it.
- grep -rn "⠿" plugins/account/app returns nothing -- the braille glyph drag handle is gone, replaced by GripIcon.
- pnpm --filter @sovereignfs/ui build succeeds, and dist/index.js does not contain the literal string "@dnd-kit" (confirms tsup.config.ts's external entry actually kept dnd-kit out of the published bundle).
- pnpm install --frozen-lockfile succeeds after the catalog change with git diff pnpm-lock.yaml scoped only to the intended @dnd-kit/* catalog switch -- no unrelated drift.
- pnpm --filter @sovereignfs/ui build-storybook succeeds with the new GripIcon story present.
- pnpm design:tokens:check passes (GripIcon uses fill="currentColor", no hardcoded color literals).
- Manual/Storybook verification: in plugins/account's sidebar-apps reordering UI, mouse drag (8px activation distance) and touch long-press (300ms delay / 8px tolerance) both still reorder rows correctly, and tapping the visibility Toggle (marked data-no-dnd) still flips visibility instead of lifting the row -- behavior-identical to the pre-migration dndSensors.ts.
- docs/design-system.md's new useReorderSensors/shouldHandleDndEvent subsection and DesignSystemOverview.stories.tsx's GripIcon Component Gallery entry (with the bumped "All 76 components" count) are both present.

---

#### ✅ 9.27 — Add a sideEffects declaration to packages/ui/package.json

**Goal:** Close a design-system audit finding: `packages/ui/src/index.ts` re-exports all ~93 components/hooks through a single barrel file, and every one of the package's 92 component modules that renders anything imports its own CSS Module at the top level (e.g. `import styles from './Button.module.css';` at `packages/ui/src/components/Button/Button.tsx:2`) — a real, executable module-level side effect that registers styles as soon as the module runs. `packages/ui/package.json` declares no `sideEffects` field. Because `@sovereignfs/ui` is in `runtime/next.config.ts`'s `transpilePackages` and its root `exports` map points `.` at `./src/index.ts` (compiled from real TypeScript source for every in-repo consumer, not a pre-bundled `dist/`), webpack must conservatively assume any module the barrel touches could matter, even when a page's client bundle only references one or two named exports through it — it cannot safely drop the other ~90 components' JS and CSS. Every plugin, in-repo and third-party, imports from this barrel, so the blast radius of the missing field is the whole plugin ecosystem's client bundle size, not one page. Fix: declare `\"sideEffects\": [\"**/*.css\"]` (accurate — CSS Modules are the package's only real module-level side effect, verified below) and prove the fix actually changes bundling behavior with a real bundle-analyzer run, not just a plausible-sounding config change.

**Deliverables:**

- Add `"sideEffects": ["**/*.css"]` to `packages/ui/package.json`, directly after `"license": "AGPL-3.0-or-later"` (line 16) and before the `"publishConfig"` block (line 17). The glob covers both consumption shapes the package supports: the nested `src/components/**/*.module.css` paths a workspace consumer resolves through the root `exports` map (`".": "./src/index.ts"`, used in-repo via `runtime/next.config.ts`'s `transpilePackages`), and the flattened `dist/*.module.css` paths a published-npm consumer resolves through `publishConfig.exports` (`packages/ui/tsup.config.ts`'s `copyCssToDist()` flattens every `*.module.css` to `dist/<basename>`; non-module CSS like `tokens.css` keeps its relative path under `dist/tokens/`).
- Verify (and note in the PR description, not a new doc) that no other module-level side effect exists in `packages/ui/src` before shipping the wildcard-CSS-only value: every one of the package's 92 component modules that import CSS do so only via `import styles from './X.module.css'` at module scope (e.g. `packages/ui/src/components/Button/Button.tsx:2`); the three non-exported internal helpers with real logic at module scope (`src/motion.ts`, `src/overlay-shell.ts`, `src/scroll-lock.ts`) only touch `document`/`window` inside function bodies, never at import time. If a future component adds a genuine top-level side effect (a global listener, a polyfill), it must be added to the `sideEffects` array explicitly — the array must never be widened back to `true` or removed to work around it.
- Add `packages/ui/src/__tests__/package-json.test.ts` — a regression test asserting `packages/ui/package.json`'s `sideEffects` field is exactly `["**/*.css"]`, so a routine dependency edit (`pnpm add`, a version bump) can't silently drop or loosen it without a test failure.
- One-off verification, not a permanent build dependency: temporarily add `@next/bundle-analyzer` as a `runtime` devDependency and wrap `runtime/next.config.ts`'s exported config in `withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })`. Run `ANALYZE=true pnpm --filter runtime build` once before the `package.json` change and once after, and inspect the client bundle for `example-plugins/example-minimal`'s route — its `app/page.tsx:3` (`import { Button } from '@sovereignfs/ui';`) is the smallest realistic barrel-import case in the repo, importing exactly one of the ~93 exported components. Capture the emitted `.next/analyze/client.html` treemap (or a screenshot) for both runs and paste both into the PR description. Revert the temporary `next.config.ts` wiring and the `@next/bundle-analyzer` devDependency afterward — this task does not add a standing `pnpm analyze` script or leave `ANALYZE` as a documented env var.

**Dependencies:** None.

**SRS reference:** None — this is remediation of a design-system audit finding (barrel-file tree-shaking), not new design. No RFC or incident doc covers it.

**Review checklist:**

- `packages/ui/package.json` contains `"sideEffects": ["**/*.css"]`.
- `packages/ui/src/__tests__/package-json.test.ts` passes, and fails when the field is temporarily reverted locally (confirm this by hand before considering the guard real).
- The before/after `.next/analyze/client.html` treemaps for `example-plugins/example-minimal`'s route, captured in the PR description, show the other ~92 components' CSS Modules and JS excluded from its client chunk after the fix, and not provably excluded before it.
- `pnpm --filter @sovereignfs/ui typecheck`, `pnpm --filter @sovereignfs/ui test`, `pnpm lint`, and `pnpm design:tokens:check` all pass — the wildcard does not mark `tokens.css`/`tokens/*.css` in a way that breaks their `@import` chain (they're consumed via the package `exports` map, not the JS module graph, so this should be a no-op, but the check confirms that assumption still holds).
- No `@next/bundle-analyzer` devDependency or `ANALYZE`-gated wiring remains in `runtime/next.config.ts` or `runtime/package.json` after the PR merges, unless the developer explicitly opts to keep it as a standing script — in which case this task's deliverables and `docs/self-hosting.md`/`package.json` `scripts` are updated to match before merging.
- `packages/ui`'s `package.json` `version` bumped **patch** (build-metadata-only fix, no change to the published component/type API) per NFR-04's semver rule for the published `@sovereignfs/ui` package.

---

#### 📋 9.28 — `NavList` component (grouped icon+label nav, static + drilldown variants)

**Goal:** Add a new `packages/ui` component, `NavList`, for the "vertical list
of icon+label rows, optionally grouped under section headers" shape — needed
first by Console's shell rework (workstream 0022 leg 1) for both its desktop
sidebar (a `static` variant: active row highlighted, no chevron) and its
mobile index (a `drilldown` variant: trailing chevron, tap navigates to a
full-screen section, matching a native Settings-app pattern). No existing
`packages/ui` component covers this — `CheckableListRow` is checkbox-driven,
the wrong shape — and Account's own multi-section layout
(`plugins/account/app/layout.tsx`) has the identical horizontal-tab-strip
pattern Console is moving away from, making it a plausible second consumer
later, though this task does not touch Account.

**Deliverables:**

- `packages/ui/src/components/NavList/NavList.tsx` (new) — presentational
  only (no data fetching, no SDK import, matching every other `packages/ui`
  component). Props: `groups: NavListGroup[]`, `variant: 'static' |
'drilldown'`, `'aria-label': string`. `NavListGroup = { id: string; label?:
string; items: NavListItem[] }` (omit `label` for an ungrouped leading
  item/group). `NavListItem = { id: string; label: string; href: string;
icon: IconName; badge?: ReactNode }` (`badge` reserved for a future
  consumer; not used by Console leg 1).
- `variant="static"`: renders each item as a `<Link>`; active-state is
  computed internally via `usePathname()` + longest-prefix match against each
  item's `href` (mirroring the logic in `plugins/console/app/_components/ConsoleNavLink.tsx`
  and `plugins/account/app/_components/ActiveNavLink.tsx`, both plugin-local
  today — only the row/group rendering moves into the DS here, not those
  helpers verbatim). Active row gets a background highlight and
  `aria-current="page"`; no chevron.
- `variant="drilldown"`: renders each item as a `<Link>` with a trailing
  `Icon name="chevron-right"`; no active-state concept.
- Group header: small uppercase muted label above a group's rows; omitted
  entirely (no empty header markup) when `group.label` is unset.
- `packages/ui/src/stories/NavList.stories.tsx` (new) — both variants,
  grouped and ungrouped, active and inactive states, per this repo's
  Storybook hygiene rule. Add a `NavList` entry to `DesignSystemOverview.stories.tsx`'s
  Component Gallery and bump its component-count string.
- `packages/ui/src/index.ts` exports `NavList`, `NavListProps`,
  `NavListGroup`, `NavListItem`.
- `packages/ui/src/components/NavList/__tests__/NavList.test.tsx` (new) —
  active-item matching for `static`, chevron/navigation rendering for
  `drilldown`, grouped vs. ungrouped rendering, `aria-current` presence.

**Dependencies:** None. Consumed by workstream 0022 leg 1 (task 13.17)
immediately after landing, but has no dependency of its own.

**SRS reference:** None — this is a new, additive design-system component
consumed by a plugin-level shell change (workstream 0022), not a platform
design decision. No RFC governs it (see that workstream's "Why no RFC").

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, `pnpm --filter @sovereignfs/ui test`,
  `pnpm lint`, `pnpm format:check`, and `pnpm design:tokens:check` all pass.
- `pnpm --filter @sovereignfs/ui build-storybook` succeeds with the new
  `NavList` stories present.
- Both variants render correctly at every documented state (grouped/
  ungrouped, active/inactive, with/without a `badge`) in Storybook.
- `packages/ui`'s `package.json` `version` bumped **minor** (new additive
  component/exports, no breaking change) per NFR-04.
- `docs/design-system.md`'s component reference gains a `NavList` entry.
#### ✅ 9.28 — `Dialog`: remove duplicate Escape-dismissal

**Goal:** `Dialog`'s own scrim `<div>` carries an `onKeyDown` handler that calls `onClose()` on Escape (`Dialog.tsx:132-134`), duplicating `useOverlayKeyboardTrap`'s document-level Escape listener (`overlay-shell.ts:59-94`) that `Dialog` already installs one line above it (`Dialog.tsx:118`). Because focus is captured into the panel on open (`useOverlayFocusCapture`), a real Escape keypress bubbles from the focused element through the scrim (firing the redundant handler) and continues natively to `document` (firing the trap's handler) — `onClose()` runs **twice** per keypress. Confirmed empirically: a realistic Escape dispatched from a focused element inside the panel produced 2 `onClose` calls, versus the existing `Dialog.test.tsx` "calls onClose on Escape" test's `fireEvent.keyDown(document, ...)`, which dispatches directly on `document` and misses the bug entirely (it bypasses the exact bubble path that trips the duplicate call). This matters beyond a stray call: `runtime/app/(platform)/(plugins)/@modal/layout.tsx:44` wires `onClose={() => router.back()}` for every `shell: overlay` plugin (Account, Console, third-party overlay plugins), and `docs/architecture-rules.md` documents dismissal as unwinding "exactly one history entry" — the whole `<Link replace>` intra-overlay-navigation convention depends on that. A double `router.back()` pops an extra, unintended history entry; if the overlay was reached with only one prior in-app history entry, it can leave the app entirely.

**Deliverables:**

- Remove the `onKeyDown` prop (the Escape branch) from `Dialog`'s scrim `<div>` (`Dialog.tsx`) — keep only the existing `onClick` scrim-dismiss handler. `useOverlayKeyboardTrap` already owns Escape; its own doc comment says as much ("Attached at document level so no keyboard listener is needed on the overlay's own element").
- Fix `Dialog.test.tsx`'s "calls onClose on Escape" test to dispatch the keydown from a focused element inside the panel (matching real usage) instead of directly on `document` — the current test would keep passing even if this bug were reintroduced.
- Add a regression test asserting exactly one `onClose` call for one Escape keypress with focus inside the panel.

**Dependencies:** None.

**SRS reference:** None — bug fix, found during a design-system review of the overlay components; no RFC or incident doc covers it.

**Review checklist:**

- `pnpm --filter @sovereignfs/ui test` passes, including the new/updated Escape regression test; confirm it fails against the pre-fix code before accepting it as a real guard.
- Manual check in Storybook: open a `Dialog`, focus a control inside it, press Escape once — `onClose` fires exactly once. ✅ (verified live in a real browser, not just jsdom)
- `pnpm --filter @sovereignfs/ui typecheck` and `pnpm lint` pass.

---

#### ✅ 9.29 — `Drawer`: remove duplicate Escape-dismissal

**Goal:** `Drawer.tsx` has the identical bug and root cause as 9.28 — its own scrim `onKeyDown` Escape handler (`Drawer.tsx:141-143`) duplicates `useOverlayKeyboardTrap`'s document-level listener (`Drawer.tsx:85`) it already installs. Same double-`onClose` consequence for any `Drawer` consumer, including `MobileAppsDrawer` (which wraps `Drawer` and backs the platform shell's own mobile Apps drawer).

**Deliverables:**

- Same fix as 9.28, applied to `Drawer.tsx`'s scrim `<div>`.
- Matching regression test in `Drawer.test.tsx`.

**Dependencies:** None — independent of 9.28, safe in either order; sequenced in the same leg as the identical fix pattern.

**SRS reference:** None — bug fix, same review as 9.28.

**Review checklist:**

- `pnpm --filter @sovereignfs/ui test` passes, including the new/updated regression test; confirm it fails against the pre-fix code first.
- Manual check in Storybook: open a `Drawer`, focus a control inside it, press Escape once — `onClose` fires exactly once. ✅ (verified live in a real browser, not just jsdom)
- `pnpm --filter @sovereignfs/ui typecheck` and `pnpm lint` pass.

---

#### ✅ 9.30 — `ConfirmDialog`: stop double-firing `onClose`

**Goal:** `ConfirmDialog`'s Cancel button (`ConfirmDialog.tsx:96-98`) calls the `onClose` prop directly via `onClick={onClose}`. The documented, expected consumer reaction is to flip its own `open` state to `false`; on re-render, `ConfirmDialog`'s own `useEffect` (`if (open) el.showModal(); else el.close();`, `ConfirmDialog.tsx:62-67`) sees `open` go `false` and calls `el.close()`, firing the native `'close'` event — which the component's own second effect (`el.addEventListener('close', () => onClose())`, `ConfirmDialog.tsx:73-79`) reacts to by calling `onClose()` a **second** time. The same chain fires on backdrop click (`ConfirmDialog.tsx:87-89`, same direct-call pattern). Confirmed live in a real browser: a single Cancel click on a standalone `ConfirmDialog` (no nesting involved) produced 2 `onClose` calls. Checked all ~25 `<ConfirmDialog>` call sites in the repo (kanban, Console, Account, Warden, Plainwrite, Shopper, Tasks, Sheets) — every one wires `onClose` to a plain idempotent `setState(false)`/`setState(null)`, so this is currently silently harmless in production, but it violates the component's own documented single-call contract and is a footgun for any future non-idempotent consumer (an analytics call, a toast, chained navigation).

**Deliverables:**

- Make the native `'close'` event the single source of truth for calling `onClose`: change the Cancel and backdrop-click handlers to call `dialogRef.current?.close()` (letting the native `'close'` event fire and the existing listener call `onClose()` once) instead of calling `onClose` directly.
- Add a regression test asserting exactly one `onClose` call per Cancel click and per backdrop click, on a standalone `ConfirmDialog`.

**Dependencies:** None.

**SRS reference:** None — bug fix, same review as 9.28/9.29.

**Review checklist:**

- New regression test passes; confirm it fails against the pre-fix code (temporarily revert locally) before accepting it as a real guard, per this repo's own verification convention.
- Confirm `onConfirm` (a separate prop, unaffected by this bug) still fires exactly once and still does not itself close the dialog — existing documented contract, unchanged.
- `pnpm --filter @sovereignfs/ui typecheck`, `test`, `lint` pass.

---

#### ✅ 9.31 — Overlay Escape precedence for nested modals

**Goal:** even after 9.28–9.30, a `ConfirmDialog` nested inside a `Dialog` (e.g. `CardDetailOverlay`'s delete-confirm, and nearly every Console/Account confirm — deactivate/delete/reset-MFA/vouch/revoke-vouch/cancel-invite, all nested inside the shared `@modal/layout.tsx` `Dialog`) has no way to claim Escape before its ancestor `Dialog` does. Confirmed live in a Storybook repro mirroring `CardDetailOverlay`'s exact nesting: focus inside the nested `ConfirmDialog`, press Escape (real trusted keyboard input, not a synthetic event) → the **outer** `Dialog` closed (outer close count: 1) and the inner `ConfirmDialog` never got to run its own dismissal at all (inner close count: 0) — its native `<dialog>` node was torn out of the DOM when the outer `Dialog`'s document-level Escape trap fired synchronously and unmounted the subtree, racing ahead of the browser's own (spec-deferred) native `<dialog>` Escape/cancel handling. Practical effect: a user trying to cancel "Delete this card?" with Escape instead closes the entire card/user detail overlay; inside Console/Account (whose outer `Dialog`'s `onClose` is `router.back()`), it exits the whole admin surface.

**Deliverables:**

- A shared, lightweight "topmost overlay" registry in `packages/ui/src/overlay-shell.ts` (`registerOpenOverlay`/`unregisterOpenOverlay`/`isTopmostOpenOverlay`, a module-level LIFO array of ids — no external state library needed) — `useOverlayKeyboardTrap` registers/unregisters via a dedicated effect keyed on `open` (deliberately not `mounted`, and deliberately its own effect separate from the one holding the actual keydown listener — see the function's own doc comment for why), and its document-level Escape handler only calls `onClose` when its own id is currently the topmost registered one.
- `ConfirmDialog` participates in the same registry (register on `open`, unregister on close/unmount) purely for precedence purposes — it does **not** otherwise adopt `useOverlayFocusCapture`/`useOverlayScrollLock`/`useOverlayKeyboardTrap`; its own doc comment's reasoning for staying on the native `<dialog>` element is unchanged.
- Regression test (`Dialog.test.tsx`): a `Dialog` containing an open `ConfirmDialog` — Escape with focus inside the confirm closes only the confirm (outer `onClose` not called); a second Escape then closes the outer `Dialog`. Confirmed to fail against the pre-fix code.

**Implementation note — a real limitation found while writing the regression test:** the registry's "last registered = topmost" rule assumes the nested overlay opens via a genuinely _later_ commit than its ancestor, which holds for every real call site (`CardDetailOverlay`: the outer `Dialog` is already mounted before the user ever clicks "Delete card…" to open the nested confirm) but not for a contrived case where both start already-open in the very same initial render — React fires a child's mount effects before its parent's within one commit, so in that specific simultaneous-mount shape the parent would register _after_, and incorrectly outrank, the child. The first version of this task's regression test hit exactly this ordering and had to be rewritten to open the confirm via a later click (matching real usage) rather than mounting both open at once. Documented here rather than silently working around it: this is a known, narrow gap (simultaneous initial-mount of nested overlays), not a general failure of the approach, and not worth solving given no real call site does this.

**Open design decisions — resolved:** `Popover` (which also stacks above `Dialog` per the existing `.close` z-index comment in `Dialog.module.css:176-186`) was **not** audited for the same bug class in this task — no evidence surfaced during this leg that it needs the same registration, and the task's own kill criteria (workstream 0021) said to stop and re-scope rather than expand scope on a suspicion. Left as a genuinely open question for whoever next touches `Popover`'s stacking behavior.

**Dependencies:** Built on 9.28/9.29 (same file, same mechanism).

**SRS reference:** None — bug fix, same review as 9.28–9.30.

**Review checklist:**

- New regression test passes, and is confirmed to fail against the pre-fix code. ✅
- Manual check in Storybook: open a nested confirm inside a `Dialog`, press Escape — only the confirm dismisses; a second Escape closes the outer `Dialog`. ✅ Verified live in a real browser end-to-end: with the confirm open, Escape left the outer Dialog's onClose count at 0; after dismissing the confirm (Cancel) and pressing Escape again, the outer Dialog's onClose fired (count 1). One caveat found during this check, unrelated to this task's own fix: the confirm's own native `<dialog>` Escape-to-close didn't visibly fire from this session's browser-automation tooling's synthetic key dispatch (closing it via the Cancel button instead worked immediately) — plausibly an automation-harness quirk with how trusted/native default actions propagate through remote key dispatch, not a regression, since real `<dialog>` Escape handling is unrelated code this task never touched; worth a real (non-automated) manual pass before merging if anyone wants extra confidence.
- `pnpm --filter @sovereignfs/ui typecheck`, `test`, `lint` pass. ✅

---

#### ✅ 9.32 — `Dialog`: unify the close icon

**Goal:** `Dialog`'s desktop close button uses the `circle-x` icon (`Dialog.tsx:166`, `size="md"`) while the mobile `OverlayHeader` close button — which `Dialog` itself renders for its own mobile mode — uses the plain lucide `x` icon (`OverlayHeader.tsx:67`, `size="sm"`). Same dismiss affordance, two different icons depending on breakpoint. Developer request: standardize on the lucide `x` icon everywhere. Note this reverses a specific, previously recorded decision — `Dialog.tsx:158-164`'s own comment: "`circle-x`, not a bare "×" glyph — developer-requested... platform-wide: every `Dialog` consumer gets this, not just the one it was requested against" — flagged here so the reversal is deliberate, not accidental.

**Deliverables:**

- `Dialog.tsx:166`: swap `<Icon name="circle-x" size="md" ... />` for `<Icon name="x" size="md" ... />` — keep `size="md"` (desktop's close button is a larger tap target than mobile's inline header row; only the glyph changes, not the touch target).
- Update `Dialog.tsx:158-164`'s comment to reflect the new decision instead of describing one that's no longer true.
- Visual check: `.close`'s fixed `width`/`height` (`Dialog.module.css:191-192`, `var(--sv-space-8)`) still centers the new glyph correctly — `circle-x` and plain `x` may have different intrinsic proportions at the same icon size.

**Dependencies:** None.

**SRS reference:** None — developer-requested visual change.

**Review checklist:**

- Storybook: every `Dialog` size story shows the new `x` icon at the correct position/size on desktop; mobile viewport still shows `OverlayHeader`'s existing `x`, now visually consistent with desktop. ✅ Verified live: the `Medium` story's desktop close button renders the plain `x`, well-centered in `.close`'s fixed box; resizing to a 375px mobile viewport confirmed via computed styles that Dialog's own `.close` is `display:none` there and `OverlayHeader`'s `.closeButton` (`display:flex`) is what actually renders — the two icons are now visually identical across both breakpoints, not coincidentally similar.
- `pnpm --filter @sovereignfs/ui typecheck` and the Dialog test suite pass. ✅
- `pnpm design:tokens:check` (129 tokens, no violations) and `pnpm --filter @sovereignfs/ui build-storybook` (completed successfully) both pass. ✅

---

#### ✅ 9.33 — `Dialog` header/body/footer composition

**Goal:** `Dialog` today has no dedicated footer slot — every consumer needing action buttons (Save/Cancel, etc.) renders them as the last item inside `children`, sharing the single scrollable `.content` region (`Dialog.module.css:92-118`); on a tall form those buttons scroll out of view with the rest of the content. `Dialog`'s `title` prop today only renders visually inside `OverlayHeader` on **mobile** (`Dialog.tsx:150-157`) — desktop never shows a header row for it at all, only the floating close button — so a consumer wanting a visible title on desktop currently has to render its own heading inside `children`. Add three explicit, consumer-selectable shapes, matching this repo's existing prop-driven component design (not a new compound-component API): **Body only** (no header/footer — today's default, unchanged), **Header + Body** (a visible, sticky header row on _both_ breakpoints — not mobile-only as today), and **Header + Body + Footer** (header and footer both pinned, only the body between them scrolls).

**Deliverables:**

- New optional `header`/`footer` props on `DialogProps` (`ReactNode`, both optional) alongside the existing `children` (body). Omitting both = today's behavior (Body only).
- Resolve the relationship between the existing `title` string prop and the new `header` node prop before implementing both — don't ship two props with overlapping responsibility (see Open design decisions).
- `footer`, when provided, renders as a flex sibling **after** `.content`, pinned the same way `OverlayHeader` is already pinned before it — a non-scrolling flex sibling, not `position: sticky` (mirrors `OverlayHeader.tsx`'s own doc comment on why it avoids `position: sticky`/`fixed`, and this repo's documented iOS Safari sticky-staleness risk inside touch-scrollable content). `.content` remains the sole scroll container in every variant.
- `Dialog.module.css`: new `.footer` rule (padding/border-top/background, the visual counterpart to the existing header treatment), applied on both breakpoints — not gated to the mobile media query the way `.mobileHeader` currently is.
- Storybook: new stories for "Body only", "Header + Body", and "Header + Body + Footer" (Storybook hygiene rule — every DS component API change needs matching story coverage), plus a `DesignSystemOverview.stories.tsx` import-snippet update if the public props changed.
- `docs/design-system.md`/`DialogProps` doc comments updated to describe the three shapes.

**Open design decisions — resolved:** `header` supersedes `title` outright for
visible content when both are passed — `title` remains the `aria-label`
fallback either way, so it's never truly dead even when superseded. Achieved
by widening `OverlayHeader`'s own `title` prop from `string` to `ReactNode`
(`OverlayHeader.tsx`) — a backward-compatible type widening (every existing
string-passing caller, including `Drawer`/`Sheet`, still typechecks
unchanged) — and reusing `OverlayHeader` itself for the new unified header
(rendered with no Dialog-level display-toggling `className`, since
`OverlayHeader.module.css` has no internal breakpoint gating of its own —
confirmed by reading it before relying on this — so simply not hiding it on
desktop is sufficient to show it on both breakpoints). This avoided writing
a second, parallel header implementation. Existing `Dialog` consumer
migration onto `footer` was left as a follow-up, as recommended — none of
the ~20 existing consumers were touched. `Drawer`/`Sheet` were not
touched either, confirming the scope boundary held.

**Dependencies:** Sequenced after 9.32 (icon) so this leg's header-row rework doesn't also touch the close-icon prop mid-change — not a hard technical dependency, just avoids overlapping diffs.

**SRS reference:** None — developer-requested composition improvement, additive to the existing `packages/ui` public API.

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, the full `packages/ui` test suite (535 tests), and `pnpm lint` on `packages/ui/src` all pass. ✅ 6 new tests added: 5 in `Dialog.test.tsx` covering all three shapes (Body only's unchanged 2-close-button baseline, Header+Body's single close button and `title`-as-fallback-only behavior, Header+Body+Footer's footer-as-sibling-not-nested-in-`.content` check and footer-omitted case) plus 1 in `OverlayHeader.test.tsx` locking in the `title: ReactNode` widening.
- New Storybook stories for all three shapes (`BodyOnly`, `HeaderAndBody`, `HeaderBodyFooter`) exist; `pnpm --filter @sovereignfs/ui build-storybook` succeeds. ✅
- Manual check at both a desktop and a ≤768px viewport: in the Header+Body+Footer story, header and footer stay visibly pinned while only the body content between them scrolls. ✅ Verified live in a real browser: scrolled the body well into "Field 6–9 of 12" at both viewport sizes — the "Edit card" header and Cancel/Save footer never moved. Also verified the Header+Body story shows "Card detail" as a real header row on desktop, where no header row existed before this task.
- `pnpm design:tokens:check` passes (129 tokens, no violations). ✅
- `packages/ui`'s `package.json` version bumped **minor** (`0.74.2` → `0.75.0`, additive public props, per NFR-04). No `docs/upgrade.md` note needed — `title`'s rendering behavior is unchanged for every existing consumer, since none of them pass the new `header` prop; the visible-content change only applies to a consumer that newly opts in.

---

#### ✅ 9.34 — Retire or redefine `Dialog`'s dead `full` size

> **Superseded by `9.38`.** This task's own resolution (keep `full`,
> document it as a deliberate alias) held only until the developer
> explicitly asked for a breaking revamp of the whole size scale — `9.38`
> removes `full` (and `xl`) outright. The history below is kept accurate as
> a record of what was decided _at the time_ and why; it no longer
> describes the current `DialogSize`.

**Goal:** `.lg` and `.full` are CSS-identical on desktop (`Dialog.module.css:166-170`, both `width:100%; height:100%`), and every size collapses to the same full-screen mobile treatment regardless of value (`Dialog.module.css:223-250`). The sole call site in the repo, `CardDetailOverlay.tsx:75`'s `size={isMobile ? 'full' : 'xl'}`, has no effect — mobile already renders full-screen no matter what `size` says, per `Dialog`'s own doc comment ("Mobile always renders as a full-screen sheet"). No Storybook story demonstrates `full` either. Low priority — dead-code cleanup, not a bug.

**Deliverables:**

- Either (a) remove `'full'` from `DialogSize` and simplify `CardDetailOverlay.tsx:75` to a plain `size="xl"` (mobile ignores it regardless), or (b) give `full` real distinct behavior (true edge-to-edge, ignoring the scrim's `--sv-space-8` margin) if a genuine edge-to-edge use case exists. Decide during implementation; default to (a) unless a real use case for true edge-to-edge surfaces.
- If (a): update `Dialog.test.tsx`'s `full` size assertion accordingly.

**Resolved differently from the default (a) — a third option found during implementation:** removing `'full'` from `DialogSize` turned out to be a real breaking type change, not risk-free cleanup — `CardDetailOverlay.tsx:75`'s call site lives in `sovereign-plugin-kanban.local`, a gitignored `.local` plugin clone (confirmed via `git check-ignore`; `git ls-files` returns nothing for it) explicitly outside this repo's ownership, the same category workstream 0020's own Decisions locked table excluded from direct edits ("written up separately for those plugins' own maintainers... not tracked by this repo's epics/ROADMAP.md"). This repo's own `pnpm typecheck` wouldn't catch the break (composed plugin directories are excluded from `runtime/tsconfig.json`'s scope), but the plugin's own separate build would silently start failing against a future `@sovereignfs/ui` bump — for a change whose only benefit was removing an already-inert value, not fixing a bug. Given 9.34 is itself explicitly low-priority ("not a bug, dead-code cleanup"), a breaking change felt disproportionate to the payoff. Landed on neither (a) nor (b): kept `full` in `DialogSize` (no type change, no version bump needed, no consumer anywhere is affected) and instead **documented** why it's a deliberate alias of `lg`, not an oversight — in both `Dialog.tsx`'s `DialogSize` doc comment and `Dialog.module.css`'s `.lg, .full` rule — which is exactly what the review checklist's own bar asks for ("no remaining `full` size that behaves identically to `lg` **without explanation**" — satisfied by adding the explanation, not only by removing the value). `CardDetailOverlay.tsx`'s own redundant ternary is untouched, left for that plugin's own maintainers per the same precedent.

**Dependencies:** None.

**SRS reference:** None — cleanup finding from the same design-system review.

**Review checklist:** `pnpm --filter @sovereignfs/ui typecheck`, `test`, `lint` pass — ✅, unaffected since nothing's removed. `full` now has a clear, explicit explanation for being identical to `lg` in both files it's defined in.

---

#### ✅ 9.35 — Reconcile `Dialog`'s `xl`/`full` sizes with the manifest `overlaySize` schema

> **Partially superseded by `9.38`.** `xl`/`full` no longer exist — `9.38`
> replaced them with `auto`, which is now the one non-manifest-declarable
> `DialogSize` value; the doc notes this task added (`runtime/src/overlay.ts`,
> `docs/plugin-development.md`) were updated in place by `9.38` to say
> `auto` instead of `xl`/`full`, rather than duplicated. The history below
> describes the split as it stood at the time.

**Goal:** `DialogSize` is `sm | md | xl | lg | full`, but `packages/manifest/src/schema.ts:133`'s `shellConfig.overlaySize` enum only allows `sm | md | lg` — `xl` (and `full`, see 9.34) exist on the component but are unreachable from any plugin manifest declaration; only runtime code calling `<Dialog>` directly (bypassing the manifest-driven `@modal` chrome) can use them. Not necessarily wrong, but undocumented as intentional.

**Deliverables:**

- Either document the split explicitly (a one-line note in `docs/plugin-development.md`'s manifest reference and/or `runtime/src/overlay.ts`'s doc comment: manifest-declarable sizes are deliberately narrower than the component's full size set), or extend the manifest enum to include `xl` for parity if a real plugin use case exists. Decide during implementation; default to documenting the existing split.

**Resolved:** documented the split, in both places the deliverable named — `runtime/src/overlay.ts`'s `overlaySizeForSegment` doc comment now states the manifest enum is deliberately narrower than `DialogSize`, and `docs/plugin-development.md`'s `shell: overlay` section (the `overlaySize` bullet) now notes `xl`/`full` aren't manifest-declarable. No manifest schema change — no real plugin use case for manifest-declared `xl` surfaced during this review, matching the default. The existing `overlaySize` row in the manifest field reference table (`docs/plugin-development.md`) needed no edit — it already correctly lists only `sm | md | lg`, matching the actual schema; the two new notes explain _why_ that's narrower than `Dialog`'s own set, without duplicating the enum listing a third time.

**Dependencies:** Followed 9.34 — 9.34 resolved to keep `full` (not remove it), so this task's own doc note correctly says "`xl`/`full`", not just "`xl`".

**SRS reference:** None — cleanup finding from the same design-system review.

**Review checklist:** `pnpm --filter runtime typecheck` and `runtime/src/__tests__/overlay.test.ts` (6 tests) pass — ✅, doc-only change, no schema touched. Both doc updates reviewed for accuracy against the actual schema (`packages/manifest/src/schema.ts:133`, unchanged) and `DialogSize` (`packages/ui`, unchanged by this task).

---

#### ✅ 9.36 — De-duplicate `MOTION_DURATION_MS`

**Goal:** `MOTION_DURATION_MS = 250` is hand-copied verbatim into `Dialog.tsx:18`, `Drawer.tsx:16`, and `Sheet.tsx:45`, each with a comment explaining it must be kept in sync with a CSS custom property by hand. The reasoning against deriving it from CSS is sound (documented in each file), but nothing prevents a future edit to one file silently desyncing the JS unmount timer from its CSS transition in whichever file is missed.

**Deliverables:**

- Export a single `OVERLAY_MOTION_DURATION_MS` constant from `packages/ui/src/overlay-shell.ts`, alongside the other shared overlay primitives, and import it into `Dialog.tsx`, `Drawer.tsx`, `Sheet.tsx`, replacing each file's own local copy. Keep the existing comment explaining why it's a plain JS constant rather than read from the CSS variable — just stop tripling it.

**Dependencies:** None.

**SRS reference:** None — cleanup finding from the same design-system review.

**Review checklist:** `pnpm --filter @sovereignfs/ui typecheck`, `test` (full suite, 535 tests), `lint` pass — ✅. `grep -rn "MOTION_DURATION_MS = 250" packages/ui/src` confirms exactly one definition remains (`overlay-shell.ts`), none in `Dialog.tsx`/`Drawer.tsx`/`Sheet.tsx`.

---

#### ✅ 9.37 — Fallback accessible name in `@modal/layout.tsx`

**Goal:** `runtime/app/(platform)/(plugins)/@modal/layout.tsx:41-44` passes `title={title}` (`title = plugin?.name`) to `Dialog` and no `aria-label`. If `plugin` isn't found (e.g. a routePrefix mismatch on a multi-segment interception segment), the `Dialog` renders with neither `title` nor `aria-label` — a modal panel with no accessible name at all. Edge case, not reachable in normal operation today.

**Deliverables:**

- `@modal/layout.tsx`: fall back to a generic `aria-label` (e.g. `"Dialog"`) when `plugin` is not found, so the panel always has an accessible name.

**A real, separate gap found while writing this task's test — `@modal/{layout,default,error}.tsx` have no path to automated verification at all, not just no existing test:** these three files are explicitly committed, hand-written exceptions inside an otherwise fully-generated, gitignored directory (`runtime/app/(platform)/(plugins)/.gitignore`'s own comment: "The committed exceptions below are hand-written, NOT generated"). But every layer of this repo's tooling treats `runtime/app/(platform)/(plugins)/` as composed/generated territory and excludes it wholesale, with no carve-out for these three real files: (1) the root `vitest.config.ts`'s `include` globs only cover `runtime/src/**/__tests__/**`, never `runtime/app/**` — confirmed live, a test file placed at `@modal/__tests__/layout.test.tsx` produced "No test files found"; (2) `runtime/tsconfig.json` explicitly `exclude`s `app/(platform)/(plugins)/**`, so `pnpm typecheck` never checks this file either; (3) `@modal/.gitignore`'s own `/@modal/*` pattern (only un-ignoring `default.tsx`/`error.tsx`/`layout.tsx` by name) means a new `@modal/__tests__/` directory would itself be gitignored — the test file couldn't even be committed. Fixing this properly needs a deliberate `.gitignore` exception plus a precisely-scoped new vitest include pattern (narrow enough to keep excluding the generated `@modal/(.)*` copies) — a real, worthwhile follow-up, but disproportionate scope for this one low-priority prop fix to carry, so not done here. Verified instead via an isolated one-off `tsc` run (a temporary tsconfig overriding just this file's exclusion, run against the real project's paths/types, then discarded) showing zero errors attributed to `layout.tsx` itself, plus careful manual review — `title: string | undefined` and `title ?? 'Dialog'` typing against `Dialog`'s own `'aria-label'?: string` prop is straightforward enough that this is adequate confidence for a one-line, well-typed prop addition, though it is not the same as a real committed regression test.

**Dependencies:** None.

**SRS reference:** None — cleanup finding from the same design-system review.

**Review checklist:** a new or existing `@modal/layout.tsx` test covers the plugin-not-found case, asserting a non-empty accessible name. **Not met as originally written** — no test exists, for the infrastructure reasons above, not for lack of trying. Verified instead via the isolated `tsc` check and manual review described above.

---

#### ✅ 9.38 — Revamp `Dialog`'s size scale: drop `xl`/`full`, add `auto`

**Goal:** developer feedback on the finished `9.28`–`9.37` work: the five-value `DialogSize` scale (`sm | md | xl | lg | full`) reads as inconsistent — it's really only two distinct behaviors (fixed-width-content-height for `sm`/`md`/`xl`, fixed-100%-box for `lg`/`full`) wearing five names, and `9.34` had already independently flagged `full` as a dead alias. Developer's explicit preference: `sm`, `md`, `lg`, plus a new variant that's content-driven on **both** width and height (not just height, as `sm`/`md` already are) — explicitly accepting this as a breaking change to `@sovereignfs/ui`, to be reconciled with any affected plugin separately before a production release, rather than preserved for backward compatibility the way `9.34` chose to.

**Deliverables:**

- `DialogSize` (`Dialog.tsx`) → `'sm' | 'md' | 'lg' | 'auto'`. `xl` and `full` removed outright (no alias, no deprecation period — superseding `9.34`'s "keep `full`" resolution now that the developer has explicitly authorized the breaking change).
- `auto` (`Dialog.module.css`): `width: fit-content` (shrink-wraps to content, like a flex item centered in `.scrim` naturally would with no explicit width) with `min-width: min(24rem, 100%)` (floor, so sparse content doesn't read as an oddly narrow sliver — matches `sm`'s old fixed width) and `max-width: min(48rem, 100%)` / `max-height: min(48rem, 100%)` (ceiling on both axes — matches where the removed `xl` topped out). Mobile media query updated to include `.auto` (and drop `.xl`/`.full`) in the full-screen-sheet override, including resetting `min-width: 0` there (new — the fixed sizes never needed a mobile `min-width` reset since none of them declared one).
- `Dialog.stories.tsx`: `ExtraLarge` story removed, new `AutoSize` story added (deliberately narrower content than `md`'s 36rem, to make the shrink-below-fixed-width behavior visible, not just theoretical) — `DialogDemo`'s local size type union updated to match.
- `Dialog.test.tsx`: `"applies the size class"` switched from `size="full"` to `size="lg"`; `"supports the xl size"` replaced with `"supports the auto size"`.
- Docs updated to match: `runtime/src/overlay.ts`'s `overlaySizeForSegment` doc comment and `docs/plugin-development.md`'s `overlaySize` bullet (both from `9.35`) now say `auto` instead of `xl`/`full`; `docs/design-system.md`'s two Dialog-size mentions (`Overlay surfaces` table, Storybook coverage table) updated from `sm/md/lg/full` to `sm/md/lg/auto`. `docs/upgrade.md` gets a new `@sovereignfs/ui` entry (migration: `full` → `lg`, `xl` → `auto` or `lg` depending on whether the content genuinely varies in size).
- `9.34`/`9.35`'s own epic entries get a short pointer note to this task, without rewriting their historical narrative (an accurate record of what was decided at the time and why — including the real breaking-change tradeoff `9.34` weighed — stays more useful than silently overwriting it).

**Known affected consumer, confirmed already in `9.34`'s own investigation, not re-migrated here:** `CardDetailOverlay.tsx`'s `size={isMobile ? 'full' : 'xl'}` — the only `xl`/`full` call site in the whole codebase — lives in `sovereign-plugin-kanban.local`, a gitignored `.local` plugin outside this repo's ownership. Per the developer's own framing ("it will break some plugins maybe, but we can address them separately"), this is an accepted, explicitly-scoped-out follow-up, not an oversight — written up as its own bullet in the `docs/upgrade.md` entry so it's discoverable by whoever next touches that plugin.

**Dependencies:** Builds on `9.32`–`9.37` (same files). Directly revises `9.34`/`9.35`'s resolutions.

**SRS reference:** None — developer-requested breaking revamp, not new design.

**Review checklist:**

- `pnpm --filter @sovereignfs/ui typecheck`, the full test suite, `lint` pass.
- New/updated Storybook stories (`AutoSize`, `Small`/`Medium`/`Large` unchanged) exist; `pnpm --filter @sovereignfs/ui build-storybook` succeeds.
- Manual check in Storybook: `auto` visibly shrinks below `md`'s fixed width for narrow content, and caps out (scrolls internally) for content wider/taller than its max.
- `pnpm design:tokens:check` passes.
- `packages/ui`'s `package.json` version bumped **minor** (breaking `DialogSize` change, per NFR-04's floor), with the `docs/upgrade.md` entry above satisfying the migration-note requirement.
- No remaining `'xl'`/`'full'` references to `DialogSize` anywhere in `packages/ui`, `runtime/src`, or `docs/` (RFC bodies excepted — those are point-in-time design records, not living docs, and are never edited after the fact).
