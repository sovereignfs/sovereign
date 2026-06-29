---
rfc: 0047
title: Plugin tool contracts
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, packages/manifest, runtime, plugins/account, docs; builds on RFC 0002, RFC 0005, RFC 0022, RFC 0035, RFC 0040
incorporated_into_plan: 'No — documentation-first. This RFC specifies a consented tool/action contract for plugins; scheduling and task IDs are deferred.'
---

# RFC 0047 — Plugin Tool Contracts

## Summary

Add a platform-mediated tool contract that lets a plugin expose structured
actions to another trusted caller, such as an assistant layer or automation
plugin. Tools are explicit, typed, permissioned, auditable, and require user
confirmation for mutating or external effects.

This is the write/action counterpart to RFC 0002 cross-plugin data sharing.
RFC 0002 lets a consumer read provider data with consent. Tool contracts let a
caller ask a provider plugin to perform a declared action on behalf of the user.

## Motivation

As plugins become richer, users will expect orchestration: create a record,
prepare a draft, add an item, update a status, publish a change, send a summary,
or trigger a workflow. Direct database writes across plugins would violate the
SDK boundary. Ad hoc server actions would be impossible to discover, preview,
or audit consistently.

A tool contract gives the platform one safe pattern for cross-plugin actions:
the provider declares what can be done, the caller supplies structured input,
the user sees a preview and confirms risky effects, and the platform records
the action.

## Current state

- RFC 0002 supports read-only data contracts.
- Plugin capabilities can express local access decisions.
- Activity logging can record outcomes.
- There is no manifest or SDK surface for cross-plugin actions.
- Assistant/automation workflows must not mutate plugin data directly.

## Proposed design

### Manifest declarations

Add optional `tools` to plugin manifests:

```jsonc
{
  "tools": [
    {
      "name": "create-record",
      "title": "Create record",
      "description": "Create a new record in this plugin.",
      "effect": "write",
      "requiresConfirmation": true,
      "inputSchema": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
        },
        "required": ["title"],
      },
    },
  ],
}
```

Tool names are local to the provider plugin and namespaced by the platform as
`<pluginId>:<toolName>`.

### Effect classes

| Effect     | Meaning                                      | Confirmation default |
| ---------- | -------------------------------------------- | -------------------- |
| `read`     | Computes or previews without mutation.       | optional             |
| `write`    | Mutates plugin-owned data.                   | required             |
| `external` | Calls an external service or sends data out. | required             |

`external` includes webhooks, provider APIs, email, model providers, and any
network side effect beyond the Sovereign instance.

### SDK surface

Provider registration:

```ts
sdk.tools.provide('create-record', {
  preview: async (input) => ({ summary: 'Create "Example"', details: input }),
  execute: async (input) => createRecord(input),
});
```

Caller invocation:

```ts
const preview = await sdk.tools.preview({ providerId, tool: 'create-record', version: 1 }, input);

const result = await sdk.tools.execute({ providerId, tool: 'create-record', version: 1 }, input, {
  confirmationToken,
});
```

The runtime injects actor user ID, caller plugin ID, provider plugin ID, tenant
ID, and request context. Plugins cannot forge actor identity.

### Confirmation flow

For tools requiring confirmation:

1. Caller requests preview.
2. Provider returns structured preview.
3. Platform displays confirmation UI.
4. User confirms.
5. Platform issues a short-lived confirmation token.
6. Caller executes with token.
7. Runtime verifies token matches actor, provider, tool, input hash, and expiry.

If input changes after preview, the confirmation token is invalid.

### Authorization

Tool execution requires:

- provider plugin installed and enabled;
- caller has any required manifest permission;
- current user can access the provider resource;
- provider-specific authorization passes;
- confirmation token for mutating/external tools;
- user verification level if the tool declares `minVerificationLevel`.

### Auditing

Every execution writes a platform activity event:

- provider plugin ID;
- caller plugin ID;
- tool name;
- effect class;
- actor user ID;
- target resource ID when provided;
- success/failure;
- timestamp.

Raw tool inputs may contain sensitive data and should not be written to the
platform activity log. Provider plugins may store domain-specific history in
their own tables.

## Security requirements

- No direct cross-plugin DB writes.
- Mutating and external tools require confirmation by default.
- Confirmation tokens are single-use and input-bound.
- Providers validate input against schema before preview and execute.
- Tools fail closed when provider registration is missing.
- Disabled plugins cannot provide or execute tools.
- Tool calls are tenant-scoped and actor-scoped.

## Alternatives considered

### Let callers use provider server actions directly

Rejected. Server actions are not discoverable, previewable, or consistently
auditable across plugins.

### Extend data contracts to allow writes

Rejected. Read and write semantics are different enough to need separate
consent, confirmation, and audit rules.

### Allow arbitrary code execution

Rejected. Tool contracts are structured plugin-owned actions, not a sandbox for
arbitrary code.

## Open questions

1. Should tools be versioned like data contracts?
2. Should tool input schemas use JSON Schema, Zod-derived JSON Schema, or a
   smaller platform schema?
3. Should confirmation UI live in Account, a runtime modal, or caller-owned UI?
4. Should tools support dry-run diffs for complex mutations?
5. Should external tools require stronger user verification by default?

## Adoption path

1. Add manifest `tools` declarations and validation.
2. Add provider registration and caller SDK.
3. Add preview/confirmation token runtime routes.
4. Add activity logging.
5. Add docs and examples for read, write, and external tool effects.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
