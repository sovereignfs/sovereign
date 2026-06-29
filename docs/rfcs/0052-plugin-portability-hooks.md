---
rfc: 0052
title: Plugin portability hooks
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, plugins/account, plugins/console, docs; builds on RFC 0007, RFC 0033, RFC 0044, and RFC 0051
incorporated_into_plan: 'Yes — epic task 8.8'
---

# RFC 0052 — Plugin Portability Hooks

## Summary

Define a plugin-owned portability hook system for export, import, and deletion.
The platform owns orchestration and bundle format; each plugin owns its domain
serialization, import validation, file inclusion policy, and cross-plugin
reference handling.

This strengthens RFC 0007 user data portability and RFC 0033 user deletion for
larger plugins with files, generated artifacts, external connections, and
cross-plugin references.

## Motivation

Simple platform-owned export works for core account data, but richer plugins
need domain-specific behavior:

- include or exclude large attachments and generated documents;
- preserve opaque references to other plugins without forcing those plugins to
  export at the same time;
- export secret metadata without plaintext secret values;
- remap storage object IDs during import;
- run deletion cleanup across plugin DB rows, storage objects, jobs,
  connections, and secrets.

Without plugin hooks, each new plugin either leaves portability incomplete or
requires platform-specific export code.

## Current state

- RFC 0007 defines user data export and portability.
- RFC 0033 defines user data deletion.
- Account has a Data tab for export/delete flows.
- RFC 0044 proposes plugin storage participation.
- There is no stable plugin SDK hook for export/import/delete.

## Proposed design

### SDK surface

Add `sdk.portability.provide()`:

```ts
sdk.portability.provide({
  export: async (ctx) => PluginExportResult,
  import: async (ctx, bundle) => PluginImportResult,
  deleteUserData: async (ctx) => PluginDeletionResult,
});
```

The runtime injects tenant ID, user ID, plugin ID, and export options. Hook
handlers run server-side only.

### Export result

```ts
interface PluginExportResult {
  manifest: {
    pluginId: string;
    pluginVersion: string;
    schemaVersion: number;
    exportedAt: string;
  };
  data: unknown;
  files?: Array<{ storageKey: string; exportPath: string }>;
  references?: PluginReference[];
  secretMetadata?: Array<{ label: string; provider: string; exists: boolean }>;
  warnings?: string[];
}
```

Plaintext secrets are never exported. Files are included only according to the
user's export options and plugin policy.

### Import behavior

Import is merge-oriented by default:

- validate bundle plugin ID and schema version;
- remap storage objects and generated IDs;
- preserve external references as inert links unless providers are available;
- do not recreate secrets or external connections automatically;
- report warnings for skipped files, unsupported versions, or unavailable
  providers.

Plugins may reject imports that would overwrite existing domain records unless
the platform later adds explicit overwrite modes.

### Deletion behavior

Deletion hooks remove all owner-scoped plugin data for a user:

- plugin database rows;
- user-owned storage objects;
- user-scoped secrets and connections;
- queued jobs owned by the user;
- cached references and generated artifacts;
- provider-specific local state.

Deletion must be idempotent. Re-running the hook should succeed.

### Platform orchestration

The platform:

- enumerates installed plugins;
- calls hooks with bounded timeouts;
- records success/failure per plugin;
- includes plugin warnings in the export report;
- blocks account deletion completion until required hooks finish or are
  explicitly marked failed according to the accepted policy.

## Security requirements

- Export hooks run with the current user's scope, not platform-wide access.
- Plaintext secrets are never exported.
- Import hooks validate bundle shape and size before writing.
- Deletion hooks are idempotent and fail closed on unknown ownership.
- Export bundles identify plugin ID, plugin version, schema version, and
  generated-at timestamp.
- Cross-plugin references are inert metadata; importing a reference does not
  grant access to the provider plugin.

## Alternatives considered

### Platform introspects every plugin table

Rejected. It cannot understand domain semantics, storage keys, references, or
secret metadata safely.

### Each plugin builds its own export UI

Rejected. Users need one Account-level portability flow across installed
plugins.

### Export everything including secrets

Rejected. Reconnecting external accounts is safer than exporting plaintext
credentials.

## Open questions

1. Should export hooks stream data, or is JSON result plus file references enough
   for v1?
2. Should account deletion fail hard if one plugin hook fails, or produce a
   recoverable admin task?
3. Should import support dry-run previews?
4. Should plugin export schema versions be declared in manifest metadata?

## Adoption path

1. Add portability hook registration to SDK/runtime.
2. Define bundle format for plugin export results and files.
3. Wire Account export/import/delete orchestration through registered hooks.
4. Add storage, secret metadata, connection, and job cleanup helpers.
5. Document plugin portability test requirements.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
