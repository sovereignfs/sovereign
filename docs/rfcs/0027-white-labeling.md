# RFC 0027 — White-labeling (tenant branding)

**Status:** Draft\
**Date:** June 2026\
**Author:** Open Code\
**Scope:** Whole platform — `packages/ui`, `packages/db`, `runtime`, `apps/auth`, `packages/mailer`, `bin/sv`, `.env.example`, docs, Docker/compose, SRS\
**Incorporated into plan:** No — documentation-first. This RFC describes the design for per-tenant white-labeling (visual + email tier); implementation tasks and SRS sections to be assigned when scheduled.

---

## Summary

Let any Sovereign operator — individual, organisation, or company — replace Sovereign's visual identity with their own brand. An operator deploys Sovereign as the core and customises the logo, app name, favicon, colours, and email sender identity per tenant, with env-var defaults for the single-tenant case. The same infrastructure enables the dual-licensing model (AGPL + commercial) where a closed-source derivative ships under an operator's own brand.

Brand values are injected as CSS custom properties at `:root` — the same mechanism as dark mode and tenant theming — so every component inherits the brand without code changes. A new `--sv-brand-*` token namespace separates brand identity (logo, name, links) from the semantic colour layer (theme).

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
env var default → platform_settings → tenant_branding (DB table per tenant)
```

The layering follows the same pattern as invite-only (`CON-10`): env vars define the baseline at deploy time, a new `tenant_branding` table stores per-tenant overrides, and the UI reads the most specific value. Single-tenant operators who never touch the Console get a pure env-var experience; multi-tenant operators configure each tenant's brand in the Console.

### New env vars

| Variable                | Default       | Description                                 |
| ----------------------- | ------------- | ------------------------------------------- |
| `BRAND_NAME`            | `"Sovereign"` | The display name of the instance/tenant     |
| `BRAND_LOGO`            | _(empty)_     | URL or path to the brand logo (light theme) |
| `BRAND_LOGO_DARK`       | _(empty)_     | URL or path to the brand logo (dark theme)  |
| `BRAND_FAVICON`         | _(empty)_     | URL or path to the favicon                  |
| `BRAND_PRIMARY_COLOR`   | _(empty)_     | Hex colour overriding `--sv-color-accent`   |
| `BRAND_EMAIL_FROM_NAME` | _(empty)_     | Sender name for outbound email              |
| `BRAND_EMAIL_LOGO`      | _(empty)_     | Logo URL to embed in HTML email templates   |

All are optional. When unset, Sovereign defaults apply (the current behaviour). `BRAND_PRIMARY_COLOR` sets `--sv-color-accent` so the accent token reflects the brand colour; this is the minimum viable colour override — full palette customisation is a future extension.

### `tenant_branding` table

A new table in `packages/db`, dialect-agnostic:

```sql
CREATE TABLE tenant_branding (
  tenant_id       TEXT NOT NULL,
  brand_name      TEXT,
  brand_logo      TEXT,
  brand_logo_dark TEXT,
  brand_favicon   TEXT,
  brand_primary   TEXT,     -- hex colour
  email_from_name TEXT,
  email_logo      TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (tenant_id)
);
```

Read via a new helper `getTenantBranding(pdb, tenantId): TenantBranding | null`. The returned object merges DB values over env defaults so callers always get a complete set. Written via `setTenantBranding(pdb, tenantId, partial)` which upserts.

Bootstrapped by `bootstrapPlatformDb()` with a `BRAND_NAME` env-var seed row (or the default `"Sovereign"`) alongside the existing default-tenant seed.

### `--sv-brand-*` token namespace

New CSS custom properties injected at `:root`, separate from the existing `--sv-color-*` semantic tokens:

```
--sv-brand-name         the tenant display name (usable in CSS via attr or content)
--sv-brand-logo         URL of the brand logo (light)
--sv-brand-logo-dark    URL of the brand logo (dark, falls back to light)
--sv-brand-favicon      URL of the favicon
```

Why a separate namespace rather than extending `--sv-color-*`:

- **Semantic distinction.** `--sv-color-accent` is a theme token — it can change with dark mode, user preference, or seasonal decoration. `--sv-brand-logo` is an identity token — it stays the same regardless of theme variant. Mixing them conflates two concerns.
- **Value types.** Colour tokens hold hex/rgb values. Brand tokens hold URLs and strings. A CSS custom property for a URL needs different handling (`url()` wrapping, `content` vs `background-image` usage).
- **Clear override boundary.** Brand tokens are set by the operator once; colour tokens may be swapped dynamically (dark mode, user theme). The separation makes it obvious what changes with tenant config and what changes with theme.

In practice, when a brand primary colour is set, the runtime also sets `--sv-color-accent` to the brand colour (and computes `--sv-color-accent-hover` from it). This gives instant visual impact with zero component changes, while keeping the colour in the semantic namespace where it belongs. The brand token namespace is for _non-colour_ identity: name, logo, favicon.

### Runtime injection

A new server component `BrandProvider` at `runtime/src/brand-provider.ts`:

1. Reads `tenant_branding` from the platform DB (or the `getPlatformDb` singleton) for the current tenant.
2. Merges with env defaults.
3. Renders `<style>` or inline `style` attribute on `<html>` setting the `--sv-brand-*` tokens.

Called from `(platform)/layout.tsx` (the authenticated shell) and from the root `layout.tsx` (for the login page, which is outside the platform group).

For the Edge middleware (which cannot read the DB), brand values needed pre-login are fetched via a new API route `GET /api/admin/tenant-branding` — same localhost self-fetch pattern as `fetchDisabledPluginIds()` and `fetchRootPluginPrefix()` in `runtime/middleware.ts`. The login page redirect is outside the middleware gate, so the login page reads branding via client-side fetch or a nonce-based inline script injected at render.

### Login page (`apps/auth`)

The auth server reads its own brand configuration. Two options (open question — see below):

- **Dual-write** (matching the invite-only pattern): the Console PATCH writes branding to both the platform DB and `apps/auth`'s own `auth_settings` table. The auth server reads from `auth_settings` at render time.
- **Proxy through runtime:** the auth server fetches branding from the runtime's `/api/admin/tenant-branding` at render time.

Either way, the auth server's root layout injects `--sv-brand-*` tokens and replaces hardcoded Sovereign branding with the tenant's values.

### Email templates

`packages/mailer` gains an optional `branding` parameter in `MailOptions`:

```ts
interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  branding?: {
    name: string;
    logoUrl?: string;
  };
}
```

When branding is present, HTML email templates render the logo as a `data:` URL (to avoid external-image blocking) and use the brand name in the sender header. The runtime passes branding from `tenant_branding` when constructing mail options.

### PWA manifest

The `manifest.json` at `runtime/public/manifest.json` becomes a **served** route (`GET /api/manifest`) instead of a static file when branding is configured. The route reads the tenant's brand name and returns a dynamic manifest. The service worker caches the first response; a hard refresh picks up changes. When no branding is configured, the static file is served directly (no change from the current behaviour).

### Favicon

A route `GET /favicon.ico` or the existing `GET /api/account/...` pattern returns the tenant's branded favicon when configured, falling back to the committed `runtime/public/favicon.ico`.

### Console settings page

A new **Branding** section under Console settings (`/console/settings/branding`), visible to `platform:admin`:

- Brand name (text input)
- Logo URL (light + dark variants)
- Primary colour (colour picker → hex)
- Favicon URL
- Email sender name
- Email logo URL
- Preview panel showing the shell header with current brand values

The PATCH route writes to `tenant_branding` in the platform DB and dual-writes to the auth server if the dual-write option is chosen.

## UI flows

### Admin flow: setting up branding

1. Admin navigates to Console → Settings → Branding.
2. Form is pre-filled from current `tenant_branding` (merged with env defaults).
3. Admin uploads a logo (handled by the existing avatar-upload pattern, stored in `data/brand/`), enters brand name, picks a primary colour.
4. Preview panel updates live via client-side CSS variable swapping.
5. On save, PATCH writes to `tenant_branding` (and dual-writes to auth server).
6. Page reloads with new branding applied immediately (CSS vars on `:root` update).

### User flow: seeing the brand

1. User visits the login page — sees the tenant logo and name, not Sovereign's.
2. User logs in — shell header shows the tenant logo and name.
3. User receives an email — sender name and logo reflect the tenant brand.
4. User installs the PWA — app name and icons show the tenant brand.

### Reset flow

Admin clears all branding fields → PATCH writes nulls → env defaults apply → Sovereign's own identity is restored.

## Alternatives considered

### Pure env-var approach

Rejected. Env vars require a server restart to change and work only for single-tenant. The project has `tenant_id` on every table from day one — per-tenant branding is a direct use of that infrastructure. Env vars as the _baseline_ (merged with DB overrides) gives the best of both: single-tenant ops set-and-forget, multi-tenant ops configure at runtime.

### Build-time approach (theme at Docker build)

Rejected. Building a branded Docker image per tenant is operationally expensive, prevents runtime reconfiguration, and breaks auto-update. Sovereign already ships as a single image.

### Template overrides (full login page template per tenant)

Rejected. Custom templates in `apps/auth` would fork from upstream, break on upgrade, and create a maintenance burden. CSS variable injection achieves the same visual result without forking a single file.

### Extending `--sv-color-*` instead of `--sv-brand-*`

Considered but rejected for the reasons in the token namespace section above. The core objection is mixing value types (colours vs URLs) and conflating theme identity with brand identity. A separate namespace is clearer for operators, plugin developers, and future maintainers.

### Per-role branding

Considered and deferred. Showing different branding to admins vs users is a plausible requirement for OEM scenarios but adds complexity (role-scoped DB reads, multiple token sets). It can be layered on top of the single-tenant-brand model without breaking changes by adding a `role` filter column to `tenant_branding`.

## Open questions

1. **Auth server: dual-write or proxy?** The invite-only toggle uses dual-write (Console writes to both platform DB and `auth_settings`). Branding could follow the same pattern, or the auth server could proxy through the runtime at render time. Dual-write is simpler for offline resilience but creates a desync surface. **Proposal:** dual-write, matching the existing precedent — the Console PATCH handler already proxies to the auth server.

2. **Logo storage: disk or URL?** Uploaded logos could be stored in `data/brand/<tenant_id>.<ext>` (same pattern as avatars at `data/avatars/`) or the operator provides an external URL. **Proposal:** both — accept an uploaded file (stored on disk, served by a runtime route) or an external URL. The DB column stores the final accessible URL either way.

3. **Email logo: inline or hosted?** HTML email clients block most external-image loading. **Proposal:** embed small logos as base64 `data:` URLs in the email body at send time (the `packages/mailer` branding layer does the conversion). Large logos should be hosted and referenced by URL with appropriate `alt` text.

4. **PWA manifest caching:** The service worker caches `manifest.json` on first load. When branding changes, users on the cached version see the old name/icons until the SW updates. **Proposal:** acceptable for v1 — the SW updates eventually. Document as a known limitation.

5. **What is the minimum viable surface for Phase 1?** The RFC defines the full model. Implementation phases should be decided when scheduled. Recommended Phase 1: `tenant_branding` table + env vars + `--sv-brand-*` injection in shell layout + Console branding form. Phase 2: email templates + auth login page. Phase 3: PWA manifest + favicon dynamism.

## Adoption path

This RFC is **documentation-first**. The design is recorded here for review and consensus; implementation scheduling is deferred.

| Phase | What ships                                                                                                 | Packages affected                                          | Semver                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1     | `tenant_branding` table + helpers, env vars, `--sv-brand-*` tokens, `BrandProvider`, Console branding form | `packages/db`, `runtime`, `plugins/console`, `packages/ui` | `db` minor, `runtime` minor, `ui` minor, `console` minor |
| 2     | Branded email templates (logo + sender name), auth login page branding                                     | `packages/mailer`, `apps/auth`                             | `mailer` minor, `auth` minor                             |
| 3     | Dynamic PWA manifest, dynamic favicon route                                                                | `runtime`                                                  | `runtime` patch                                          |

Published packages (`@sovereignfs/ui`, `@sovereignfs/sdk`) are additive only — no breaking changes. `@sovereignfs/ui` gains the `--sv-brand-*` tokens in `semantic.css` (a minor bump per semver convention — new tokens are additive).

### Required doc updates

- `docs/design-system.md` — document `--sv-brand-*` token namespace
- `docs/self-hosting.md` — document new `BRAND_*` env vars
- `docs/plugin-development.md` — guide plugin developers on using `--sv-brand-*` tokens
- `docs/sovereign-proposal-plan-srs.md` — add white-labeling to SRS §3 or §4
- `.env.example` — add `BRAND_*` vars

### Docker/config impact

- No new ports or on-disk paths (logo storage reuses `data/` directory, same as avatars)
- No new Docker services
- `BRAND_*` env vars added to Docker Compose files and `.env.example`

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
