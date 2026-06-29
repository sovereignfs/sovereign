---
rfc: 0051
title: Cross-plugin references and dependency discovery
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, packages/manifest, plugins/account, plugins/console, docs; builds on RFC 0002 and RFC 0047
incorporated_into_plan: 'Yes — epic task 3.20'
---

# RFC 0051 — Cross-plugin References and Dependency Discovery

## Summary

Define a platform convention for optional plugin dependencies and opaque
cross-plugin references. Plugins can discover whether another plugin is
installed, enabled, available to the current user, and consented for a contract.
Plugins can also store references to provider-owned records without importing
provider schemas or copying private data.

This complements RFC 0002 data contracts and RFC 0047 tool contracts. Those RFCs
define how to read data and perform actions. This RFC defines how consumers
represent links, handle stale references, and build good degraded UI.

## Motivation

Composable plugins need to point at each other's records:

- a conversation linked to a contact;
- an invoice linked to a customer and originating conversation;
- a health note linked to a file or message;
- an assistant action referencing records across multiple providers.

Direct foreign keys across plugin tables break plugin isolation. Raw strings
work technically, but without a convention every plugin will handle stale links,
cached labels, consent revocation, and provider uninstall differently.

## Current state

- RFC 0002 specifies consented read-only data contracts.
- RFC 0047 specifies provider-owned tool execution.
- Middleware injects current plugin ID for data queries.
- There is no `sdk.plugins` discovery API or standard cross-plugin reference
  shape.

## Proposed design

### Dependency discovery

Add `sdk.plugins`:

```ts
sdk.plugins.get(id: string): Promise<PluginAvailability>;
sdk.plugins.list(filter?: { providesContract?: string }): Promise<PluginAvailability[]>;
sdk.plugins.getConsentStatus(ref: DataContractRef): Promise<ConsentStatus>;
```

`PluginAvailability` includes:

- plugin ID, name, route prefix, and icon metadata;
- installed/enabled/disabled status;
- whether the current user can launch it;
- whether requested data/tool contracts are declared;
- whether a matching consent grant exists.

The API does not expose private provider data.

### Reference shape

Define a standard reference object for plugin-owned records:

```ts
interface PluginReference {
  providerId: string;
  resourceType: string;
  resourceId: string;
  contract?: string;
  version?: number;
  labelSnapshot?: string;
  metadata?: unknown;
  linkedAt: string;
}
```

Plugins may store this object in their own tables, or split it into columns.
`resourceId` is opaque to the consumer. The provider decides whether it is a
UUID, slug, compound key, or stable public ID.

### Stale and revoked references

Consumers must treat references as nullable links:

- provider unavailable: show snapshot and disabled link;
- consent revoked: show "access revoked" state and offer re-consent;
- resource deleted: show "deleted or unavailable" state;
- provider version mismatch: show degraded state and avoid destructive actions.

Providers should expose lightweight lookup contracts where appropriate so
consumers can refresh labels or check existence without reading full records.

### Manifest declarations

Optional manifest metadata can improve install/discovery UX:

```jsonc
{
  "integrations": {
    "optional": [
      {
        "provider": "io.openfs.sovereign.crm",
        "reason": "Link records to contacts",
        "contracts": ["crm.contacts.lookup"],
        "tools": ["crm.timeline.addEntry"],
      },
    ],
  },
}
```

Optional integrations are not install blockers. They power Console, Account,
Launcher, and plugin UI hints.

## Security requirements

- References are not authorization. Every dereference still uses data/tool
  contracts and current user consent.
- Consumers cannot infer private provider records from discovery alone.
- Cached snapshots are minimal and may be stale.
- Provider uninstall or disable never breaks consumer table integrity.
- Cross-plugin references are exported as inert metadata unless the user also
  exports the provider data.

## Alternatives considered

### Direct foreign keys across plugin tables

Rejected. It couples schemas and makes plugin uninstall/migration brittle.

### Require all integrations to be hard dependencies

Rejected. Many plugin families should degrade gracefully when a sibling plugin
is missing or disabled.

### Let each plugin invent its own reference shape

Rejected. It leads to inconsistent UI, export, deletion, and consent behavior.

## Open questions

1. Should `resourceType` names be provider-local strings or registered contract
   resource kinds?
2. Should the platform provide a generic link resolver UI primitive?
3. Should optional integrations appear in the plugin manifest validation output?
4. Should references carry a stable provider instance ID for future multi-instance
   plugin support?

## Adoption path

1. Add reference-shape docs and TypeScript types to the SDK.
2. Add `sdk.plugins` discovery and consent-status helpers.
3. Add optional integration manifest metadata.
4. Add Account/Console UI for visible app connections.
5. Update plugin development docs with stale-link and export patterns.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
