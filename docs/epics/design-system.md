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

- **Visual regression testing (Chromatic):** requires a paid Chromatic account; added as a follow-on when the team is ready. The `build-storybook` CI artifact enables manual visual comparison in the interim.
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

#### ⏳ 9.9 — Email template system + White-labeling Phase 2 — Email + auth login page (RFC 0031 + RFC 0027)

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

#### 📋 9.11 — Design system component gaps — plugin developer readiness

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
