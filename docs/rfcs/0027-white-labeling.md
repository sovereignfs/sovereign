# RFC 0027 — White-labeling (tenant branding)

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Whole platform — `packages/ui`, `packages/db`, `runtime`, `apps/auth`, `packages/mailer`, `bin/sv`, `.env.example`, docs, Docker/compose, SRS\
**Incorporated into plan:** Yes — post-v1. SRS §3.18 documents the architecture; roadmap Tasks 1.0.03 (Phase 1: DB + shell + Console form + SDK), 1.0.04 (Phase 2: email + auth login), and 1.0.05 (Phase 3: dynamic PWA manifest + favicon) schedule the implementation.

---

## Summary

Let any Sovereign operator — individual, organisation, or company — replace Sovereign's visual identity with their own brand. An operator deploys Sovereign as the core and customises the logo, app name, favicon, colours, and email sender identity per tenant, with env-var defaults for the single-tenant case. The same infrastructure enables the dual-licensing model (AGPL + commercial) where a closed-source derivative ships under an operator's own brand.

Brand values are injected as CSS custom properties at `:root` — the same mechanism as dark mode and tenant theming — so every component inherits the brand without code changes. A new `--sv-brand-*` token namespace carries non-colour identity (logo URLs, favicon URL). Colour overrides go into the existing `--sv-color-*` semantic layer. The brand name is delivered as a React prop by `BrandProvider` and may be mirrored as a CSS custom property for decorative uses only.

## Motivation

Sovereign is positioned as a "modular, self-hostable workspace runtime" that anyone can own. Today, every instance looks like Sovereign — grey-scale, the Sovereign logo in the shell header, the same name on the login page. That works for the developer running their own instance, but three groups need to make it their own:

- **Individuals** who want their instance to feel like _their_ workspace, not someone else's product.
- **Organisations** deploying Sovereign internally — they want their own logo, colours, and app name so their team sees a familiar corporate tool, not an open-source project.
- **Companies** embedding Sovereign as the core of a commercial product (the dual-licensing model). They need full visual OEM — their logo, their name, their URL — so their customers never see "Sovereign."

The existing infrastructure — `tenant_id` on every user-scoped table, the `tenants` table with tenant name, the `platform_settings` key-value store, and the design-system token architecture — already points toward this capability. What is missing is a structured model for per-tenant brand values, a dedicated token namespace, and the injection mechanism to deliver them across the runtime, auth server, email, and PWA.

## Current state (what this builds on)

### Platform DB (`packages/db`)

- `tenants` table with `tenant_id` PK and `name` column (`docs/sovereign-proposal-plan-srs.md` §3.7, `packages/db/src/schema/`)
- `platform_settings` key-value store scoped by `tenant_id` (`PLT-15`, `packages/db/src/schema/`)
- `sdk.platform.getConfig()` returns `{ tenantName, inviteOnly, version }` (`packages/sdk/src/platform.ts`, `plugins/console/app/settings/`)
- `DEFAULT_TENANT_ID = 'default'` for single-tenant v1 (`packages/db/src/constants.ts`)

### Design system (`packages/ui`)

- Two-tier `--sv-*` token architecture: primitives (fixed) + semantic (theme surface) (`docs/design-system.md` §Token architecture)
- Dark mode and tenant theming already swap semantic colour tokens at `:root` / `[data-theme]` (`docs/design-system.md:120-137`, `packages/ui/src/tokens/semantic.css`)
- Components reference only semantic tokens — a theme is purely CSS variable values, no component changes
- `@sovereignfs/ui` v0.4.0 — published to npm, versioned with semver discipline

### Runtime (`runtime/`)

- Shell sidebar has a branding header (currently hardcoded "Sovereign" + logo) (`runtime/app/(platform)/`, `plugins/launcher/`)
- Middleware injects `x-sovereign-user-*` headers from verified session (`runtime/middleware.ts`)
- `(platform)/layout.tsx` renders the shared chrome
- PWA manifest at `runtime/public/manifest.json` is a static committed file (`Task 0.5.01`)
- CSP nonce + hash for inline scripts (`runtime/src/security.ts`, `runtime/src/theme-script.ts`)
- Current CSP: `img-src 'self' data: blob:` — external origin images are blocked by default

### Auth server (`apps/auth`)

- Standalone Next.js app with its own DB and login UI (`apps/auth/`)
- Login page currently hardcodes Sovereign branding
- Server-to-server calls use `Origin` header matching `SOVEREIGN_AUTH_URL` (`apps/auth/src/auth.ts`)
- Email/password auth, invite-only registration

### Email (`packages/mailer`)

- Thin SMTP wrapper around nodemailer (`packages/mailer/`)
- `SMTP_FROM` env var for the sender address (`packages/mailer/src/index.ts`)
- HTML templates use a hardcoded Sovereign logo and name
- No-op when `SMTP_HOST` is unset

### Existing tenant-theming notes

The SRS and decision log already acknowledge that tenant theming swaps semantic tokens at `:root` (`docs/design-system.md:133-137`), and the Console has a tenant-name field (`CON-08`). The concept is validated; this RFC formalises the extension into a full white-label model.

## Proposed design

### Config layering

```
env var default → tenant_branding (DB table per tenant)
```

Env vars define the baseline at deploy time; the `tenant_branding` table stores per-tenant overrides. The runtime reads the most specific value. Single-tenant operators who never touch the Console get a pure env-var experience; multi-tenant operators configure each tenant's brand in the Console.

The existing `platform_settings` key-value store is **not** used as a middle layer for branding. It is untyped and unstructured; brand values benefit from explicit columns (clear schema, easier migration, typed helpers). The dedicated `tenant_branding` table gives the same two-layer pattern (env defaults + DB overrides) with structured access.

### New env vars

| Variable                | Default       | Description                                 |
| ----------------------- | ------------- | ------------------------------------------- |
| `BRAND_NAME`            | `"Sovereign"` | The display name of the instance/tenant     |
| `BRAND_LOGO`            | _(empty)_     | URL or path to the brand logo (light theme) |
| `BRAND_LOGO_DARK`       | _(empty)_     | URL or path to the brand logo (dark theme)  |
| `BRAND_FAVICON`         | _(empty)_     | URL or path to the favicon                  |
| `BRAND_PRIMARY_COLOR`   | _(empty)_     | Hex colour overriding `--sv-color-accent`   |
| `BRAND_EMAIL_FROM_NAME` | _(empty)_     | Sender name for outbound email              |
| `BRAND_EMAIL_LOGO`      | _(empty)_     | Logo URL to include in HTML email templates |

All are optional. When unset, Sovereign defaults apply (the current behaviour). `BRAND_PRIMARY_COLOR` sets `--sv-color-accent` so the accent token reflects the brand colour; this is the minimum viable colour override — full palette customisation is a future extension.

### `tenant_branding` table

A new table in `packages/db`. The DDL uses the dialect-aware bootstrap helper (same pattern as `platform_settings` and `plugin_status`), not raw `strftime` which is SQLite-only:

```ts
// packages/db/src/schema/sqlite/index.ts
export const tenantBranding = sqliteTable('tenant_branding', {
  tenantId: text('tenant_id').notNull().primaryKey(),
  brandName: text('brand_name'),
  brandLogo: text('brand_logo'),
  brandLogoDark: text('brand_logo_dark'),
  brandFavicon: text('brand_favicon'),
  brandPrimary: text('brand_primary'), // validated hex colour
  emailFromName: text('email_from_name'),
  emailLogo: text('email_logo'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// packages/db/src/schema/postgres/index.ts — bigint timestamps, same columns
```

Read via `getTenantBranding(pdb, tenantId): Promise<TenantBranding | null>`. The returned object merges DB values over env defaults so callers always get a complete, typed set. Written via `setTenantBranding(pdb, tenantId, partial)` which upserts.

`brand_primary` is stored pre-validated: the write helper rejects any value that does not match `/^#[0-9a-fA-F]{6}$/`. Raw user input must never be injected into a `<style>` block without this gate — a malformed or adversarial value (e.g. `red; } * { visibility:hidden } /*`) would be a CSS injection.

Bootstrapped by `bootstrapPlatformDb()` with a `BRAND_NAME` env-var seed row alongside the existing default-tenant seed.

### `--sv-brand-*` token namespace

New CSS custom properties injected at `:root`, separate from the existing `--sv-color-*` semantic tokens:

```
--sv-brand-logo         URL of the brand logo (light), path-relative to the runtime origin
--sv-brand-logo-dark    URL of the brand logo (dark), falls back to --sv-brand-logo
--sv-brand-favicon      URL of the favicon
```

Why a separate namespace rather than extending `--sv-color-*`:

- **Semantic distinction.** `--sv-color-accent` is a theme token — it can change with dark mode, user preference, or seasonal decoration. `--sv-brand-logo` is an identity token — it stays the same regardless of theme variant. Mixing them conflates two concerns.
- **Value types.** Colour tokens hold hex/rgb values. Brand tokens hold URLs. A CSS custom property for a URL needs different handling (`url()` wrapping, `content` vs `background-image` usage).
- **Clear override boundary.** Brand tokens are set by the operator once; colour tokens may be swapped dynamically (dark mode, user theme).

**The brand name is not a `--sv-brand-*` CSS token.** CSS custom properties cannot supply rendered text content — they work with `content:` on pseudo-elements, which is too narrow for the shell chrome. The brand name is passed as a React prop by `BrandProvider` and rendered in the sidebar header and login page as normal React children. It may additionally be mirrored as a `data-brand-name` attribute on `<html>` for CSS `attr()` edge cases, but this is never the primary mechanism.

When a brand primary colour is set, `BrandProvider` also sets `--sv-color-accent` and derives `--sv-color-accent-hover`. Derivation uses an HSL lightness delta: the hover colour is the accent colour shifted toward its background (darker on light theme, lighter on dark theme) by a fixed `8%` lightness step. `BrandProvider` computes the HSL triple from the validated hex value at render time (pure arithmetic, no external dependency). The algorithm is a named constant (`ACCENT_HOVER_LIGHTNESS_DELTA = 8`) so it can be adjusted without hunting the code.

### Runtime injection

A new React server component `BrandProvider` at `runtime/src/brand-provider.tsx`:

1. Reads `tenant_branding` from `getPlatformDb()` for the current tenant.
2. Merges with env defaults (`BRAND_*` vars).
3. Renders a `<style>` block setting `--sv-brand-*` tokens and (if `brandPrimary` is set) `--sv-color-accent` / `--sv-color-accent-hover`.
4. Passes `brandName` as a named prop to its children so the shell chrome can render it without a CSS variable.

Called from `(platform)/layout.tsx` (the authenticated shell) and the auth server's root layout (login page). Both call sites pass the brand name down as a prop to the header component — no prop drilling through intermediate layers.

`BrandProvider` is a server component; it runs per-request and always reflects the current DB state without an additional client-side fetch. There is no persistent in-process cache in the server component: Next.js's per-request render boundary provides sufficient isolation, and brand values change rarely enough that a DB read per render is acceptable.

### Logo serving and CSP

Uploaded logos are stored at `data/brand/<tenant_id>.<ext>` (same volume as `data/avatars/`) and served by a dedicated runtime route:

```
GET /api/brand/logo[?dark=1]      light or dark variant
GET /api/brand/favicon
```

These routes are **excluded from the middleware session gate** — they must load on the login page before any session exists. The exclusion list in `runtime/middleware.ts` already has entries for `/api/health` and PWA assets; `/api/brand/*` joins that list.

Uploaded files are validated for MIME type (`image/png`, `image/svg+xml`, `image/jpeg`, `image/webp`, `image/x-icon`) and capped at 2 MB at the upload handler — the same constraints as the avatar upload route.

The DB stores a **path-relative URL** for uploaded files (`/api/brand/logo`), not an absolute URL. An absolute URL baked at upload time breaks when the operator's hostname changes (different environments, VPN, local dev). The serving layer resolves the origin at response time. External URLs entered directly by the operator are stored as-is; the frontend renders them, not the server.

**CSP impact:** the current `img-src 'self' data: blob:` allows path-relative logo URLs served from the runtime's own origin. External logo URLs entered directly by the operator would be blocked by this policy. The implementation must handle this in one of two ways:

- **Recommended:** proxy external URLs through `/api/brand/proxy?url=…` (validates against an allowlist, caches on disk) so the browser always fetches from `'self'`. This avoids any CSP relaxation.
- **Alternative:** widen `img-src` to include the configured brand domain when set, injected dynamically by the CSP middleware. Acceptable if the proxy approach is deferred.

The proxy approach is preferred — it keeps the CSP maximally strict and avoids leaking referer information to third-party logo hosts. The decision is recorded here; the implementation task chooses which to ship first.

### Login page (`apps/auth`)

The auth server renders branding on the login page. Since the auth server is a separate Next.js app with no access to the platform DB, it must obtain brand values via one of two paths:

- **Proxy through runtime (recommended):** the auth server's root layout fetches `GET <SOVEREIGN_AUTH_URL replaced with runtime URL>/api/admin/tenant-branding` at render time. The runtime route returns the merged brand config (DB + env defaults). This keeps the auth server stateless with respect to branding — no extra table, no dual-write, no desync surface. The tradeoff is a render-time dependency on the runtime being reachable; if the runtime is down the login page falls back to Sovereign defaults (graceful degradation).
- **Dual-write (fallback):** the Console PATCH writes branding to both the platform DB and a structured key in `apps/auth`'s `auth_settings` table. Matches the invite-only precedent. More resilient to runtime downtime, but requires keeping two stores in sync across 7 fields. Invite-only is one boolean — branding is substantially more state, making desync more likely and harder to detect.

**Decision:** proxy through runtime. The dual-write approach was appropriate for invite-only (one boolean, safety-critical to keep in sync because registration enforcement reads the auth copy exclusively). Branding is cosmetic — a stale value shows the wrong logo for one render cycle, not a security failure. The simpler path (one store, one source of truth) is the right tradeoff here.

The fetch is wrapped in a try/catch; on failure `BrandProvider` renders with Sovereign defaults. An in-memory TTL cache (60 s, same order as the session cookie cache) prevents a brand fetch on every login page render.

### Email templates

`packages/mailer` gains an optional `branding` parameter in `MailOptions`:

```ts
interface MailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  /** Override the configured default sender for this message. */
  from?: string;
  branding?: {
    /** Displayed in the email header and footer in place of "Sovereign". */
    name: string;
    /**
     * Publicly reachable URL for the brand logo.
     * The template renders it as <img src="…" alt="name"> with a text fallback.
     * See "Email logo" below for the rationale against data: URIs.
     */
    logoUrl?: string;
  };
}
```

The runtime passes branding from `getTenantBranding()` when constructing mail options for invite and password-reset emails.

**Email logo approach — hosted URL, not `data:` URI.** Embedding logos as base64 `data:` URIs is not viable: Gmail, Outlook, and most modern webmail clients strip or refuse to render inline `data:` URIs as a security policy. The two technically sound alternatives are:

1. **Hosted URL** (chosen): the `<img>` tag references the operator's logo URL. Some clients block external images by default; the template is designed to be readable without images — the brand name appears as text in the header and `alt` attribute so the email makes sense either way. This is the industry standard for transactional email.
2. **CID attachment** (`multipart/related`, `Content-ID`): embeds the image in the MIME envelope without an external request. Works in desktop clients (Outlook, Apple Mail) but not in most webmail (Gmail renders CID attachments as broken images). Adds complexity to the mailer without reliable cross-client coverage; deferred as a future enhancement.

The template must degrade gracefully — brand name in the sender field (`"Acme Corp <noreply@acme.com>"`), brand name as `alt` text on the logo `<img>`, brand name in the plain-text version.

### PWA manifest

The `manifest.json` at `runtime/public/manifest.json` becomes a **served** route (`GET /manifest.webmanifest`) when branding is configured. The route reads the tenant's brand name and icon URLs and returns a dynamic manifest. When no branding is configured, the static file continues to be served directly.

The service worker caches `manifest.json` on first load. When branding changes, users on the cached version see the old name/icons until the SW updates. This is a known limitation for v1 — document in `docs/self-hosting.md` under PWA notes.

### Favicon

A route `GET /favicon.ico` returns the tenant's branded favicon when configured, falling back to the committed `runtime/public/favicon.ico`. The Next.js `<head>` metadata in `runtime/app/layout.tsx` points to this route unconditionally so the fallback is transparent.

### Console settings page

A new **Branding** section under Console settings (`/console/settings/branding`), visible to `platform:admin`:

- Brand name (text input)
- Logo upload (light + dark variants) or external URL entry
- Primary colour (colour picker → hex, validated `/^#[0-9a-fA-F]{6}$/` client and server)
- Favicon upload or external URL
- Email sender name
- Email logo URL
- Preview panel showing the shell header and login page chrome with current brand values applied via client-side CSS variable swapping

On save, PATCH writes to `tenant_branding`. No dual-write to the auth server (see Login page section).

### `sdk.platform.getConfig()` extension

`getConfig()` currently returns `{ tenantName, inviteOnly, version }`. In Phase 1 it gains branding fields:

```ts
interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  // New in Phase 1:
  brandName: string; // falls back to tenantName
  brandPrimaryColor?: string; // validated hex, or undefined if unset
}
```

Plugin developers use `sdk.platform.getConfig()` to display the instance name. Exposing `brandName` and `brandPrimaryColor` lets plugins participate in the brand without reading CSS variables (useful in non-browser contexts like email-generating plugins). The `--sv-brand-*` CSS tokens are sufficient for purely visual plugin uses; `getConfig()` is the programmatic path.

Logo and favicon URLs are intentionally excluded from `getConfig()` — they are served via the `/api/brand/*` routes and consumed as CSS `background-image` values, not as props. Adding them to the SDK surface would couple the SDK to the runtime's URL structure.

## UI flows

### Admin flow: setting up branding

1. Admin navigates to Console → Settings → Branding.
2. Form is pre-filled from current `tenant_branding` (merged with env defaults).
3. Admin uploads a logo (stored at `data/brand/`, served as `/api/brand/logo`) or enters an external URL; enters brand name; picks a primary colour.
4. Preview panel updates live via client-side CSS variable swapping (no save needed to preview).
5. On save, PATCH validates and writes to `tenant_branding`.
6. Page reloads; `BrandProvider` re-reads from DB and the new branding is visible immediately.

### User flow: seeing the brand

1. User visits the login page — sees the tenant logo and name, not Sovereign's.
2. User logs in — shell header shows the tenant logo and name.
3. User receives an email — sender name and logo reflect the tenant brand (logo visible in clients that allow external images).
4. User installs the PWA — app name and icons show the tenant brand.

### Reset flow

Admin clears all branding fields → PATCH writes nulls → env defaults apply → Sovereign's own identity is restored.

## Security considerations

- **CSS injection:** `brand_primary` is stored and rendered as a hex colour. Any non-hex value reaching the `<style>` block would be a CSS injection. Validated server-side at write time (`/^#[0-9a-fA-F]{6}$/`), never written raw.
- **Logo URL injection:** logo URLs stored in the DB are operator-supplied. The `/api/brand/logo` serving route restricts to uploaded files from `data/brand/`; external URLs are passed through to the browser and rendered by `<img>`, not fetched server-side, so there is no SSRF surface at the serving layer. If the proxy approach is implemented for CSP, the proxy must validate the URL against an allowlist or scheme check (`https:` only).
- **Uploaded file validation:** MIME type check + 2 MB cap at the upload handler. Files are stored under `data/brand/` with a sanitised filename (tenant ID + extension only — no path traversal).
- **Pre-auth route exposure:** `/api/brand/logo`, `/api/brand/favicon`, and `/manifest.webmanifest` are excluded from the session gate and publicly readable. They contain no user data; the only information exposed is the operator's own branding choices.

## Alternatives considered

### Pure env-var approach

Rejected. Env vars require a server restart to change and work only for single-tenant. The project has `tenant_id` on every table from day one — per-tenant branding is a direct use of that infrastructure. Env vars as the _baseline_ (merged with DB overrides) gives the best of both: single-tenant ops set-and-forget, multi-tenant ops configure at runtime.

### Build-time approach (theme at Docker build)

Rejected. Building a branded Docker image per tenant is operationally expensive, prevents runtime reconfiguration, and breaks auto-update. Sovereign already ships as a single image.

### Template overrides (full login page template per tenant)

Rejected. Custom templates in `apps/auth` would fork from upstream, break on upgrade, and create a maintenance burden. CSS variable injection achieves the same visual result without forking a single file.

### Extending `--sv-color-*` instead of `--sv-brand-*`

Considered but rejected. The core objection is mixing value types (colours vs URLs) and conflating theme identity with brand identity. A separate namespace is clearer for operators, plugin developers, and future maintainers.

### `--sv-brand-name` CSS custom property for the brand name

Considered. CSS custom properties can expose a string via `content: var(--sv-brand-name)` on pseudo-elements, but this does not work for rendered text content in the shell chrome. The brand name is visible HTML text — it needs to be a React prop. A CSS custom property would be a secondary mirror at best, creating two sources of truth and a confusing API for plugin developers. Dropped in favour of a single mechanism: React prop from `BrandProvider`.

### Dual-write for auth server branding

Considered, matching the invite-only precedent. Rejected for branding because: (a) the scope is much larger (7 fields vs 1 boolean), increasing desync risk; (b) the failure mode is cosmetic (wrong logo) rather than a security failure (open registration); (c) the proxy approach (one store, one source of truth) is simpler and sufficient. See "Login page" section.

### `data:` URI email logo embedding

Considered to avoid external-image blocking in email clients. Rejected because Gmail, Outlook, and most webmail clients refuse to render inline `data:` URIs as a security measure — the technique would silently produce broken-image icons in the most common clients. Hosted URL with graceful text fallback is the correct pattern.

### Per-role branding

Considered and deferred. Showing different branding to admins vs users is a plausible requirement for OEM scenarios but adds complexity (role-scoped DB reads, multiple token sets). It can be layered on top of the per-tenant model without breaking changes by adding a `role` column to `tenant_branding`.

## Open questions

1. **CSP for external logo URLs: proxy or widen?** (See "Logo serving and CSP" above.) Proxy keeps the CSP strict; widening is simpler to ship. The proxy is preferred; the implementation task records the final choice.

2. **Logo storage: disk or external URL?** The design supports both — uploaded files stored at `data/brand/` and served via `/api/brand/*`; external URLs stored as-is and rendered by the browser. The DB column stores a path-relative URL for uploaded files and an absolute URL for external entries. **Resolved:** both, as described above.

3. **PWA manifest caching:** When branding changes, cached SW users see the old name/icons until the SW updates. **Resolved:** acceptable for v1. Document in `docs/self-hosting.md`.

4. **`--sv-color-accent-hover` derivation algorithm:** HSL lightness delta (`ACCENT_HOVER_LIGHTNESS_DELTA = 8%`) computed by `BrandProvider` at render. If the accent colour is at an extreme lightness (< 8% or > 92%), the delta is clamped to keep the result in range. **Resolved in design above; implementation validates the output is visually distinguishable.**

5. **What is the minimum viable surface for Phase 1?** Recommended: `tenant_branding` table + env vars + `--sv-brand-*` injection in shell layout + `BrandProvider` + Console branding form + `sdk.platform.getConfig()` extension. Phase 2: email templates + auth login page. Phase 3: dynamic PWA manifest + favicon route.

## Adoption path

This RFC is **documentation-first**. The design is recorded here for review and consensus; implementation scheduling is deferred.

| Phase | What ships                                                                                                                          | Packages affected                                                          | Semver                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | `tenant_branding` table + helpers, env vars, `--sv-brand-*` tokens, `BrandProvider`, Console branding form, `getConfig()` extension | `packages/db`, `runtime`, `plugins/console`, `packages/ui`, `packages/sdk` | `db` minor, `runtime` minor, `ui` minor, `console` minor, `sdk` minor |
| 2     | Branded email templates (logo + sender name), auth login page branding via runtime proxy                                            | `packages/mailer`, `apps/auth`                                             | `mailer` minor, `auth` minor                                          |
| 3     | Dynamic PWA manifest route, dynamic favicon route                                                                                   | `runtime`                                                                  | `runtime` minor                                                       |

Published packages (`@sovereignfs/ui`, `@sovereignfs/sdk`) are additive only — no breaking changes. `@sovereignfs/ui` gains the `--sv-brand-*` tokens in `semantic.css` (a minor bump — new tokens are additive). `@sovereignfs/sdk` gains the new `getConfig()` fields (minor bump).

### Required doc updates

- `docs/design-system.md` — document `--sv-brand-*` token namespace and the brand-name-as-prop convention
- `docs/self-hosting.md` — document new `BRAND_*` env vars, PWA manifest caching limitation
- `docs/plugin-development.md` — guide plugin developers on using `--sv-brand-*` tokens and `sdk.platform.getConfig()` branding fields
- `docs/sovereign-proposal-plan-srs.md` — add white-labeling to SRS §3 or §4
- `docs/upgrade.md` — migration note for operators: new `tenant_branding` DB table (bootstrapped automatically on first run), new optional `BRAND_*` env vars
- `.env.example` — add `BRAND_*` vars

### Docker/config impact

- No new ports or Docker services
- Logo storage reuses the `data/` directory (same named volume in prod, same `./data` bind mount in dev)
- `/api/brand/*` routes must be excluded from the middleware session gate (alongside existing exclusions for `/api/health` and PWA assets)
- `BRAND_*` env vars added to Docker Compose files and `.env.example`

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 0.2     | June 2026 | Clarified config layering (removed phantom `platform_settings` middle tier); fixed `--sv-brand-name` approach (React prop, not CSS var); fixed email logo (hosted URL, not `data:` URI); specified CSS injection guard on `brand_primary`; specified dialect-agnostic DDL; added CSP/logo-serving analysis; resolved auth server approach (proxy, not dual-write); added `getConfig()` extension; specified `accent-hover` derivation algorithm; corrected Phase 3 semver to minor; added `docs/upgrade.md` to required doc updates; added security considerations section |
