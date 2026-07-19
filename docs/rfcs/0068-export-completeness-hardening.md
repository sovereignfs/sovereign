# RFC 0068 — Export completeness hardening

**Status:** Accepted — implemented\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** runtime/src/portability, packages/sdk (portability types), plugins/\* (hook audit), docs; amends RFC 0052, builds on RFC 0007\
**Incorporated into plan:** Yes — epic task 8.13

## Implementation notes

The two open questions below were resolved during implementation: `notExported`
ships with a single `no-export-hook` reason (plus `disabled` for a plugin the
export-eligibility filter excludes) — the only case this repo's plugins
actually hit — and the size question was resolved as a documented,
enforced ceiling (`MAX_EXPORT_BYTES`, 50 MB, matching the existing import
cap) rather than a background job. `installedPlugins`/`notExported` land in
`BundleManifest` (`runtime/src/portability/bundle.ts`), populated by
`installedPluginsRoster()` (`runtime/src/portability/platform.ts`) and
`assembleExport()` (`runtime/src/portability/assemble.ts`);
`PortabilityPanel.tsx` unzips the downloaded bundle client-side to surface
non-participating apps by name. The plugin hook audit found `sovereign-tasks`,
`sovereign-wallet`, `sovereign-plainwrite`, and `sovereign-healthlog` already
wired; `sovereign-shopper`, `sovereign-ledger`, `sovereign-docs`,
`sovereign-tally`, and `sovereign-tritext` were closed by adding
`app/_lib/portability.ts` + manifest permissions to each (`sovereign-ledger`
and `sovereign-docs` had declared the permission without a hook — the exact
mismatch this RFC set out to catch).

---

## Summary

RFC 0007 and RFC 0052 shipped a working, plugin-extensible export/import
system: a versioned ZIP bundle assembled from a platform slice plus whatever
plugins choose to register via `sdk.portability.provideExport`/`provideImport`.
That system has a silent gap — a plugin that is installed but has not wired up
a portability hook contributes nothing to the bundle, and nothing in the
bundle records that the plugin was ever installed. A user cannot tell, from
their own export, whether "no data for Wallet" means "you have no Wallet data"
or "Wallet doesn't support export yet." This RFC hardens the existing
implementation to close that gap: it adds an installed-plugin roster to the
bundle manifest, makes non-participation an explicit, visible fact instead of
an omission, and requires an audit of every shipped plugin's manifest
permissions against its actual hook registrations.

## Motivation

Sovereign's core promise is data ownership — a user should be able to get
**all** of their data out, or know precisely what was left behind and why.
Today's bundle only records what succeeded (`BundleManifest.sections`) and
what threw (`BundleManifest.failures`); a plugin that simply never registered
an exporter produces neither entry (`runtime/src/portability/assemble.ts:108-110`,
`if (!exporter) continue;`). Of the plugins shipped in this repo, only
`sovereign-plainwrite` and `sovereign-wallet` currently register portability
hooks — every other plugin (`sovereign-tasks`, `sovereign-shopper.local`,
`console`, `launcher`, `account`, and the example plugins) is either silently
absent from every export or declares `data:export`/`data:import` in its
manifest without honoring it. A user reviewing the Account Data tab's "Data is
merged — nothing is overwritten. Plugins not installed are skipped" copy has
no way to distinguish "not installed" from "installed but non-participating."

## Current state (what this builds on)

- `runtime/src/portability/bundle.ts:51-70` — `BundleManifest` has `sections`
  (successful plugin exports) and `failures` (exporter threw). No field
  enumerates plugins installed for the user's tenant regardless of export
  participation.
- `runtime/src/portability/assemble.ts:88-149` — `assembleExport()` iterates
  `exportPlugins: Record<pluginId, version>` (the allow-list of eligible,
  permission-declaring plugins) and calls each plugin's registered exporter at
  lines 109-118; if `getExporter(pluginId)` returns nothing, the loop
  `continue`s with no record (line 108-110).
- `runtime/src/portability/platform.ts:34-57` — `eligiblePluginIds()` /
  `eligibleExportPlugins()` filter `getInstalledPlugins()` down to
  not-disabled plugins whose manifest declares `data:export`/`data:import`.
  This eligibility list already exists at export time and is discarded after
  filtering instead of being recorded.
- `runtime/src/portability/registry.ts:9-14` — hook registration is
  process-local (`globalThis[Symbol.for(...)]`) and plugins register from
  their own `app/layout.tsx` at boot; a plugin can declare the manifest
  permission without ever calling `sdk.portability.provideExport`, and nothing
  today checks for that mismatch.
- `packages/sdk/src/portability.ts:1-99` — the SDK hook contract
  (`ExportContext`, `PluginExportSection`, etc.) is otherwise sufficient; this
  RFC does not change the hook signatures.
- Reference implementations: `plugins/sovereign-plainwrite/app/_lib/portability.ts`,
  `plugins/sovereign-wallet/app/_lib/portability.ts` — the only two plugins
  that currently register hooks.
- RFC 0064 (operator backups, Draft, epic tasks 8.10-8.12) independently plans
  a `backup-manifest.json` with "installed plugin status" in its per-plugin
  artifact inventory (`docs/epics/data-sovereignty.md:240-242`) — the same
  idea this RFC proposes for the user-level bundle, at the operator layer.
  The two manifests are separate documents for separate audiences (operator
  disaster-recovery vs. self-service user export) and this RFC does not merge
  them, but the shapes should stay conceptually aligned.

## Proposed design

### Installed-plugin roster in the bundle manifest

Add to `BundleManifest`:

```ts
installedPlugins: Array<{
  pluginId: string;
  pluginVersion: string;
  enabled: boolean;
  participatesExport: boolean;
  participatesImport: boolean;
}>;
```

Populated in `assembleExport()` from the full `getInstalledPlugins()` list for
the tenant — not just the permission-filtered eligible subset — so the bundle
always reflects every plugin the user actually uses, regardless of portability
support.

### Visible non-participation

Where `assembleExport()` currently `continue`s past a missing exporter
(`assemble.ts:108-110`), record an entry instead:

```ts
notExported: Array<{ pluginId: string; reason: 'no-export-hook' | 'disabled' }>;
```

Surface this list in `PortabilityPanel.tsx` (e.g. "3 of 9 installed apps don't
support data export yet: Tasks, Shopper, Console") so the gap is visible to
the user at export time, not discovered by absence.

### Plugin hook audit

Audit every manifest in `plugins/*` for `data:export`/`data:import`
permission declarations against actual `sdk.portability.provideExport`/
`provideImport` registrations. For each mismatch, either wire up a real hook
or remove the unearned permission declaration — a plugin's manifest should
never claim a capability it doesn't implement.

### Size and assembly mode decision

`POST /api/account/import` caps bundles at 50 MB
(`runtime/app/api/account/import/route.ts:8`) and `assembleExport()` runs
synchronously in the request/response cycle. RFC 0007 already flagged
large/async export as an open question (comment at `route.ts:21`) rather than
deciding it. This RFC requires an explicit decision — either a documented,
enforced ceiling with a clear user-facing error when a full multi-plugin
export would exceed it, or a move to background assembly with a
download-when-ready flow — rather than leaving the limit as an implicit,
undocumented constraint that a "complete" export could silently exceed.

## Alternatives considered

### Leave non-participation implicit, document it in prose only

Rejected — prose in the Account UI ("plugins not installed are skipped") does
not distinguish "not installed" from "installed but unsupported," and doesn't
survive the bundle leaving the instance (e.g. for GDPR requests, migration
review, or support debugging).

### Fold this into RFC 0064's operator backup manifest instead

Rejected as the primary mechanism — RFC 0064 is instance-operator-facing
disaster recovery with a different audience, format, and encryption posture.
A user-initiated self-service export must remain self-contained and must not
require operator-side tooling to be trustworthy.

## Open questions

1. Should `notExported` distinguish "plugin never registered a hook" from
   "plugin declared the permission but the hook itself threw during
   registration at boot," or is one `no-export-hook` reason sufficient for v1?
2. Does the size/assembly decision (background job vs. documented ceiling)
   block this RFC's other changes, or can the roster/visibility work ship
   first with size handling as a fast-follow?

## Adoption path

Documentation-first. No code lands under this RFC number until accepted;
epic task 8.13 tracks implementation once scheduled. Implementation order:

1. Add `installedPlugins` and `notExported` to `BundleManifest` and populate
   both in `assembleExport()`.
2. Update `PortabilityPanel.tsx` to render non-participating installed
   plugins.
3. Audit `plugins/*` manifests vs. hook registrations; close gaps or drop
   unearned permissions.
4. Decide and implement the size/assembly-mode stance.
5. Update RFC 0052 (`Incorporated into plan` note pointing here for the
   completeness addendum), `docs/epics/data-sovereignty.md` §8.8/§8.13, and
   `docs/roadmap.md` in the same PR as the code, per this repo's doc-parity
   convention.

No manifest schema field changes, no SDK hook signature changes — additive to
the bundle format only. `EXPORT_FORMAT_VERSION` should bump from `1` to `2`
per `bundle.ts:114-124`'s `assertSupportedFormat()` guard, since older
importers reading a v2 bundle would not understand `installedPlugins`/
`notExported` (though they are additive and non-breaking for the _fields
importers already read_, the version bump exists to let readers assert intent
explicitly rather than infer forward-compatibility).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
