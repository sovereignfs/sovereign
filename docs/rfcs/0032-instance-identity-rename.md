---
rfc: 0032
title: Instance Identity Rename
status: Accepted
date: June 2026
author: kasunben
scope: >
  packages/ui, packages/db, packages/sdk, runtime, apps/auth, plugins/console,
  .env.example, docker-compose.yml, docker-compose.prod.yml, all docs
incorporated_into_plan: 'Yes — epic task 9.8 (completed)'
---

# RFC 0032 — Instance Identity Rename

## Summary

Task 1.0.03 (White-labeling Phase 1, RFC 0027) introduced `BRAND_*` environment
variables, `--sv-brand-*` CSS custom properties, `brandName`/`brandPrimaryColor` SDK
fields, and the `tenant_branding` database table. The word "brand" carries corporate
marketing connotations that conflict with Sovereign's ethos: a privacy-first,
self-hosted workspace tool that operators _own_. Operators are configuring _their
instance_, not "branding" a product.

This RFC renames every `brand/Brand` identifier to `instance/Instance` across the
entire platform. It is a pure rename — no new functionality. It ships as epic task 9.8
before epic task 9.9 (email templates, RFC 0031) so that all subsequent work adopts the
correct naming from the start.

---

## Motivation

The naming misalignment is visible to three audiences:

**Operators** setting up their instance read `.env.example` and see:

```
BRAND_NAME=Sovereign
BRAND_LOGO=
```

"Branding" implies corporate marketing. A solo developer running a personal workspace
isn't "branding" anything — they're naming their instance.

**Plugin developers** consuming the design system read:

```css
color: var(--sv-brand-logo);
```

A token named `--sv-brand-logo` suggests it belongs to the product's marketing identity.
`--sv-instance-logo` makes clear it is _this deployment's_ logo — whatever the operator
has configured.

**Contributors** reading the source see `getTenantBranding()` next to `getInstanceConfig()`
(not yet written), creating two different mental models for the same concept.

Since Sovereign has no production users yet, a clean break costs nothing operationally and
eliminates the semantic drift before it is set in concrete.

---

## Rename map

### Environment variables

| Old name                | New name                   |
| ----------------------- | -------------------------- |
| `BRAND_NAME`            | `INSTANCE_NAME`            |
| `BRAND_LOGO`            | `INSTANCE_LOGO`            |
| `BRAND_LOGO_DARK`       | `INSTANCE_LOGO_DARK`       |
| `BRAND_FAVICON`         | `INSTANCE_FAVICON`         |
| `BRAND_PRIMARY_COLOR`   | `INSTANCE_PRIMARY_COLOR`   |
| `BRAND_EMAIL_FROM_NAME` | `INSTANCE_EMAIL_FROM_NAME` |
| `BRAND_EMAIL_LOGO`      | `INSTANCE_EMAIL_LOGO`      |

Updated in: `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`,
`runtime/src/instance-provider.tsx` (reads these vars), `docs/self-hosting.md`.

### CSS custom properties (`packages/ui`)

| Old token              | New token                 |
| ---------------------- | ------------------------- |
| `--sv-brand-logo`      | `--sv-instance-logo`      |
| `--sv-brand-logo-dark` | `--sv-instance-logo-dark` |
| `--sv-brand-favicon`   | `--sv-instance-favicon`   |

Updated in: `packages/ui/src/tokens/semantic.css`, all references in
`runtime/src/instance-provider.tsx`, `runtime/app/(platform)/layout.tsx`,
`docs/design-system.md`, `docs/plugin-development.md`.

### SDK (`packages/sdk`)

The `PlatformConfig` type returned by `sdk.platform.getConfig()`:

| Old field            | New field               |
| -------------------- | ----------------------- |
| `brandName`          | `instanceName`          |
| `brandPrimaryColor?` | `instancePrimaryColor?` |

Note: RFC 0031 adds `instanceEmailFromName?`, `instanceEmailLogo?`, and `instanceUrl`
directly under the new naming — no further rename needed for those fields.

### Database (`packages/db`)

| Old                             | New                             |
| ------------------------------- | ------------------------------- |
| Table: `tenant_branding`        | Table: `instance_config`        |
| Type: `TenantBrandingValue`     | Type: `InstanceConfig`          |
| Function: `getTenantBranding()` | Function: `getInstanceConfig()` |
| Function: `setTenantBranding()` | Function: `setInstanceConfig()` |

A drizzle-kit migration (`000x_rename_tenant_branding`) renames the table in both
dialects:

```sql
-- SQLite
ALTER TABLE tenant_branding RENAME TO instance_config;

-- Postgres
ALTER TABLE tenant_branding RENAME TO instance_config;
```

Both dialects use the same SQL here. The Drizzle schema files
(`packages/db/src/schema/sqlite/` and `packages/db/src/schema/postgres/`) are updated
to reflect the new table name. The bootstrap DDL parity test is updated accordingly.

### Runtime (`runtime/`)

| Old                                 | New                                    |
| ----------------------------------- | -------------------------------------- |
| `runtime/src/brand-provider.tsx`    | `runtime/src/instance-provider.tsx`    |
| `BrandProvider` component           | `InstanceProvider` component           |
| `BrandContext` interface            | `InstanceContext` interface            |
| `runtime/app/api/brand/` directory  | `runtime/app/api/instance/` directory  |
| Route: `GET /api/brand/logo`        | Route: `GET /api/instance/logo`        |
| Route: `GET /api/brand/logo?dark=1` | Route: `GET /api/instance/logo?dark=1` |
| Route: `GET /api/brand/favicon`     | Route: `GET /api/instance/favicon`     |
| Route: `POST /api/brand/logo`       | Route: `POST /api/instance/logo`       |
| Route: `POST /api/brand/favicon`    | Route: `POST /api/instance/favicon`    |
| Route: `DELETE /api/brand/logo`     | Route: `DELETE /api/instance/logo`     |
| Route: `DELETE /api/brand/favicon`  | Route: `DELETE /api/instance/favicon`  |

`RESERVED_API_SEGMENTS` in `runtime/src/api-namespace.ts`: replace `'brand'` with
`'instance'`. The dir-parity test passes once the route directory is renamed.

All consumers updated: `(platform)/layout.tsx`, `(minimal)/layout.tsx`, middleware
(`runtime/middleware.ts`), Console branding settings routes.

### Console plugin (`plugins/console`)

- Settings page "Branding" section → "Instance identity"
- Field labels: "Brand name" → "Instance name", "Brand logo" → "Instance logo", etc.
- `PATCH /api/admin/tenant-branding` → `PATCH /api/admin/instance-config`
  (leaf under the already-reserved `admin` segment; no change to `RESERVED_API_SEGMENTS`)

### Auth server (`apps/auth`)

Reads env vars by name only — no code changes beyond the env var reads. The
`INSTANCE_*` vars are read from `process.env` the same way `BRAND_*` were.

---

## What does NOT change

- The `tenants` table (holds tenant ID + tenant name) — unchanged; this rename is
  specifically for the identity/appearance configuration.
- `sdk.platform.getConfig()` field `tenantName` — this is the operator's human-readable
  tenant name, a different concept from the instance identity configuration. Left as-is.
- The `--sv-color-accent` override mechanism (which `InstanceProvider` injects from
  `INSTANCE_PRIMARY_COLOR`) — the CSS property name stays `--sv-color-accent`; the env
  var feeding it is renamed.
- All `sv-theme` cookie, theme tokens (`--sv-color-*`), and dark mode behaviour —
  unrelated to identity configuration.

---

## Semver impact

| Package             | Bump  | Version             | Reason                                                                     |
| ------------------- | ----- | ------------------- | -------------------------------------------------------------------------- |
| `@sovereignfs/ui`   | minor | `0.10.0` → `0.11.0` | `--sv-brand-*` tokens renamed; NFR-04: `0.x` minor covers breaking changes |
| `@sovereignfs/sdk`  | minor | `1.10.0` → `1.11.0` | `PlatformConfig.brandName/brandPrimaryColor` renamed                       |
| `@sovereignfs/db`   | minor | current → next      | Table + helper renames                                                     |
| `runtime`           | minor | current → next      | Route rename, provider rename, env var reads                               |
| `apps/auth`         | patch | current → next      | Reads new env var names only                                               |
| `plugins/console`   | patch | current → next      | UI labels + route name                                                     |
| Root `package.json` | patch | —                   | One pre-v1 naming rectification task; slot in roadmap.md                   |

---

## Docs updated

| File                               | Change                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `.env.example`                     | `BRAND_*` → `INSTANCE_*`                                                  |
| `docker-compose.yml`               | `BRAND_*` → `INSTANCE_*`                                                  |
| `docker-compose.prod.yml`          | `BRAND_*` → `INSTANCE_*`                                                  |
| `docs/self-hosting.md`             | Env var table + "Instance identity" section header                        |
| `docs/design-system.md`            | "Brand identity tokens" → "Instance identity tokens"; token table updated |
| `docs/plugin-development.md`       | `getConfig()` field names; CSS token references                           |
| `docs/upgrade.md`                  | v0.28 → v0.29 migration notes (env var rename instructions)               |
| `docs/rfcs/0027-white-labeling.md` | "brand" → "instance" throughout (terminology only)                        |

---

## Migration notes for `docs/upgrade.md` (v0.28 → v0.29)

Operators upgrading from runtime 0.28 must:

1. **Rename environment variables** in their `.env` file or Compose env block:

   ```
   BRAND_NAME         → INSTANCE_NAME
   BRAND_LOGO         → INSTANCE_LOGO
   BRAND_LOGO_DARK    → INSTANCE_LOGO_DARK
   BRAND_FAVICON      → INSTANCE_FAVICON
   BRAND_PRIMARY_COLOR → INSTANCE_PRIMARY_COLOR
   BRAND_EMAIL_FROM_NAME → INSTANCE_EMAIL_FROM_NAME
   BRAND_EMAIL_LOGO   → INSTANCE_EMAIL_LOGO
   ```

2. **Update any plugin CSS** that references `--sv-brand-*`:

   ```css
   /* Before */
   background-image: var(--sv-brand-logo);

   /* After */
   background-image: var(--sv-instance-logo);
   ```

3. **Update any plugin code** calling `sdk.platform.getConfig()` that reads
   `brandName` or `brandPrimaryColor`:

   ```ts
   // Before
   const { brandName } = await sdk.platform.getConfig();

   // After
   const { instanceName } = await sdk.platform.getConfig();
   ```

4. The database migration runs automatically at startup — no manual SQL required.

5. The `/api/brand/*` routes are renamed to `/api/instance/*`. If any external system
   fetches these routes directly (uncommon — they are typically only used by the shell
   itself), update those references.

---

## Open questions

None — this is a pure mechanical rename with no design decisions.

---

## Review checklist

```bash
# Zero remaining 'brand' references in non-upgrade-guide docs
grep -r "BRAND_\|--sv-brand\|brandName\|brandPrimary\|BrandProvider\|getTenantBranding\|tenant_branding\|/api/brand/" \
  docs/ --include="*.md" | grep -v "upgrade.md"
# Should return zero matches

# Zero remaining old identifiers in source files
grep -r "BRAND_\|--sv-brand\|brandName\|brandPrimaryColor\|BrandProvider\|BrandContext\|getTenantBranding\|setTenantBranding\|TenantBrandingValue\|tenant_branding\|/api/brand/" \
  packages/ runtime/ apps/ plugins/ bin/ .env.example \
  --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" --include="*.example"
# Should return zero matches

# RESERVED_API_SEGMENTS contains 'instance' and not 'brand'
grep -n "RESERVED_API_SEGMENTS\|'brand'\|'instance'" runtime/src/api-namespace.ts

# Parity test still passes (no new segment without a route dir, no route dir without a segment)
pnpm test -- api-namespace

# Migration runs cleanly on both dialects
pnpm test -- bootstrap  # or equivalent DB parity test

pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

---

## Changelog

- **v0.1** (June 2026) — Initial draft. Pure rename; no new functionality.
