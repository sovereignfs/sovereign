---
rfc: 0039
title: Instance identity — instanceId field and terminology cleanup
status: Accepted
date: June 2026
author: kasunben
scope: packages/db, packages/sdk, runtime, plugins/console, packages/ui, docs
incorporated_into_plan: 'Yes — implemented in runtime@0.33.0, sdk@1.13.0, db@1.7.3'
---

## Summary

Two related changes shipped together:

1. **`instanceId`** — a stable UUID added to `platform_settings` at bootstrap that
   uniquely identifies a Sovereign installation. Exposed via
   `sdk.platform.getConfig().instanceId`. Useful for federated contexts, licensing
   checks, and analytics.

2. **Terminology cleanup** — operator-facing UI strings, capability names, and
   activity event names that used "tenant" where the correct term is "instance"
   have been updated. The underlying `tenants` table, `tenant_id` columns, and
   `DEFAULT_TENANT_ID` constant are intentionally unchanged — they are forward-
   looking multi-tenancy infrastructure.

## Background

Sovereign uses "tenant" in two distinct senses:

- **Multi-tenancy infrastructure** — `tenants` table, `tenant_id` columns on all
  user-scoped tables. v1 is single-tenant per deployment; the schema is designed
  for future multiple tenants within a single instance. These uses are correct.

- **"Tenant" used where "instance" is meant** — the Console "Tenant name" label,
  capability names `tenant:view`/`tenant:configure`, and the activity event
  `settings.tenant_name_changed` all referred to the entire deployment as a
  "tenant" when they meant the self-hosted Sovereign instance. This conflation
  makes the future multi-tenancy migration harder to reason about.

## Changes

### `instanceId` (new)

- `packages/db/src/platform-db.ts` — `bootstrapPlatformDb()` seeds
  `platform_settings` with key `'instance_id'` = `crypto.randomUUID()` on
  `ON CONFLICT DO NOTHING` (idempotent; never changes after first bootstrap).
  New export: `getInstanceId(pdb): Promise<string>`.
- `packages/sdk/src/types.ts` — `PlatformConfig.instanceId: string` added.
- `runtime/src/sdk-host.ts` — reads `instanceId` via `getInstanceId()` and
  includes it in `getConfig()` return.

### Capability renames

| Old                | New                  | Where enforced                |
| ------------------ | -------------------- | ----------------------------- |
| `tenant:view`      | `instance:view`      | `runtime/src/capabilities.ts` |
| `tenant:configure` | `instance:configure` | `runtime/src/capabilities.ts` |

Role presets unchanged in membership — only the string name changed. The type
union `Capability` in `capabilities.ts` updated; test file updated to match.

### Activity event rename

| Old                            | New                              |
| ------------------------------ | -------------------------------- |
| `settings.tenant_name_changed` | `settings.instance_name_changed` |

Historical rows in `activity_log` are unaffected. The human-readable `summary`
now reads "Instance name changed to …" instead of "Tenant name changed to …".

### UI label fixes (Console › Settings)

- "Tenant name" → "Instance name" (label text only; form field `name="tenantName"`
  and the API body key `tenantName` are unchanged — renaming the wire format would
  require activity log metadata migration, deferred).
- "Tenant name is required." → "Instance name is required."

### Example plugin template

`runtime/app/(platform)/(plugins)/my-plugin/page.tsx` now references
`config.instanceName` instead of `config.tenantName` — `instanceName` is the
preferred display name (white-label name falling back to the tenant row name).

### Storybook & docs

- `DesignSystemOverview.stories.tsx` — "tenant theming" → "instance theming" (4 hits)
- `CLAUDE.md` — "tenant theming" / "a tenant adds colour" → "instance theming" /
  "an instance admin adds colour"
- `docs/architecture.md` — White-labeling section updated to reflect renamed
  symbols (`instance_config`, `InstanceProvider`, `INSTANCE_*`)
- `docs/sovereign-proposal-plan-srs.md` — capability table updated
- `docs/upgrade.md` — v0.33.0 notes for event name and capability renames
- `.env.example` — "baseline for all tenants" → "baseline for the instance"

### What was NOT changed

- `tenants` table, `tenant_id` columns, `DEFAULT_TENANT_ID`, `getDefaultTenant()`,
  `setTenantName()` — correct multi-tenancy infrastructure, kept as-is.
- `PlatformConfig.tenantName` — kept; the JSDoc clarifies it is the name of the
  tenant row (in v1, the workspace name set in Console).
- CSS comments in `packages/ui/src/tokens/semantic.css` and `primitives.css` —
  "tenant theming" there is accurate (tenants, including future ones, can override
  semantic tokens).
- Historical RFCs and task history docs — immutable records, not updated.
- SQL migration files — immutable history.

## Semver

- `@sovereignfs/db` — **patch** `1.7.2 → 1.7.3` (new internal helper)
- `@sovereignfs/sdk` — **minor** `1.12.0 → 1.13.0` (new public field `instanceId`
  on `PlatformConfig`; additive, non-breaking)
- `runtime` — **minor** `0.32.0 → 0.33.0` (capability rename affects API surface)
- `plugins/console` — **patch** `0.14.0 → 0.14.1` (label text only)

## Changelog

| Version | Date      | Change               |
| ------- | --------- | -------------------- |
| 1.0     | June 2026 | Accepted and shipped |
