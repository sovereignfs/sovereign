---
rfc: 0047
title: Plugin tool contracts
status: Implemented
date: June 2026
author: kasunben
scope: packages/sdk, packages/manifest, runtime, docs; builds on RFC 0002, RFC 0005, RFC 0022, RFC 0035, RFC 0040
incorporated_into_plan: 'Yes — epic task 3.18'
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

Resolved pragmatically at implementation time (epic task 3.18, workstream
0015 leg 4) — decisions below, not left open:

1. **Tool versioning:** not implemented. RFC 0002's own data contracts are
   the versioning precedent this question asked to mirror, but nothing in
   epic task 3.18's deliverables or review checklist requires it, and a
   provider can simply register a new tool `name` for a breaking change
   (the same escape hatch a versioned contract would need anyway on a major
   bump). Revisit if a real provider needs in-place breaking changes.
2. **Input schema flavor:** a deliberately minimal JSON Schema subset
   (`type`/`properties`/`required`/`items`/`enum`), hand-validated in
   `runtime/src/tool-schema.ts` — not a full JSON Schema engine (e.g. ajv).
   Covers this RFC's own example; extend it if a real provider needs a
   keyword it doesn't support.
3. **Confirmation UI location: caller-owned.** The lowest-scope-creep of
   the three options, and the only one with no new UI component to build.
   `sdk.tools.preview()` returns `summary`/`details`/`confirmationToken`;
   rendering the "are you sure?" prompt from those is the calling plugin's
   own responsibility. No Account or runtime-modal UI was added — RFC 0047's
   original `scope:` line named `plugins/account`; that's now inaccurate and
   has been corrected above.
4. **Dry-run diffs:** not implemented. `preview()`'s structured
   `summary`/`details` is judged sufficient for v1; a provider can put
   whatever diff shape it wants in `details`.
5. **Stronger default verification for external tools:** no implicit floor.
   `minVerificationLevel` is opt-in per-tool, consistent with progressive
   verification's "additive, opt-in" design throughout workstream 0017 —
   a platform-wide default would be a policy decision for a future RFC, not
   inferred silently here.

## Adoption path

1. Add manifest `tools` declarations and validation.
2. Add provider registration and caller SDK.
3. Add preview/confirmation token runtime routes.
4. Add activity logging.
5. Add docs and examples for read, write, and external tool effects.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.2     | August 2026 | Implemented (epic task 3.18, workstream 0015 leg 4). Confirmation-token mechanism modeled directly on the existing OAuth-state-token/signed-storage-URL pattern (`runtime/src/connections.ts`/`storage.ts`) rather than a new format — HMAC-SHA256 over base64url JSON, single-use via an in-memory `Map`, plus a new `inputHash` binding this RFC needed that neither precedent had. `sdk.tools.provide()` is `async` (unlike `sdk.data.provide()`) so it can read `x-sovereign-plugin-id` itself and namespace the in-process registry as `<providerId>:<name>` — closing a real gap RFC 0002's own resolver registry has (keyed by bare contract name, no per-provider collision guard). All five open questions resolved pragmatically rather than left blocking — see that section above for each decision and why; the most consequential is open question #3 (confirmation UI is caller-owned, so `plugins/account` was never actually touched despite being named in this RFC's original `scope:` line). |
