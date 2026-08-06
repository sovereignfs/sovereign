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

#### 📋 9.9 — Email template system + White-labeling Phase 2 — Email + auth login page (RFC 0031 + RFC 0027)

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

---

#### 📋 9.10 — White-labeling, Phase 3 — Dynamic PWA manifest + favicon route (RFC 0027)

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

#### 📋 9.13 — Subtle Sovereign attribution (RFC 0027)

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

#### 📋 9.14 — Local visual regression testing (RFC 0059)

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

---

#### 📋 9.15 — NavTabs Link support + PageHeader heading level

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

#### 📋 9.24 — Runtime mobile shell consumes `MobileHeader`/`MobileFooter`

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
  `<MobileHeader logo={...} title={activePluginTitle} bell={<NotificationBell
/>} avatarMenu={<AccountMenu .../>} />`, passing the exact same
  `instanceLogoUrl`/`instanceName`/`accountAvatar` data it already resolves
  server-side.
- A new small hook (e.g. `useActivePluginTitle(plugins)`) in
  `runtime/app/(platform)/_components/`, porting `ActivePluginTitle.tsx`'s
  existing longest-`routePrefix`-match logic unchanged; `ActivePluginTitle.tsx`
  and its module CSS are deleted (the logic moves, nothing is reimplemented).
- `MobileNav.tsx`'s footer `<nav>` (`:49-83`) rewritten to render
  `<MobileFooter onOpenApps={...} launcherIcon={...} leftIcons={[home]}
rightIcons={[search]} />`, reproducing today's exact Home/Apps/Search
  layout via the new 1+1 shape — the Drawer and `MobileSearch` overlay stay
  owned by `MobileNav.tsx` unchanged.
- No change to `shellConfig.mobileHeader`/`mobileFooter` visibility gating
  (RFC 0075) — this task only changes what renders inside the `showMobileHeader`/
  `showMobileFooter` conditionals, not the conditionals themselves.

**Dependencies:** Task 9.23 (the components this consumes).

**SRS reference:** [RFC 0088](../rfcs/0088-mobile-header-footer-design-system-components.md)

**Version impact:** `runtime` → **patch** — internal refactor plus the
title-rendering fix; no public API change.

**Review checklist:**

- Visual diff at mobile viewport (375px and 768px breakpoints) shows only
  the new header title appearing when navigating into a plugin — brand,
  avatar, bell, and all three footer icons render identically to before.
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
