---
rfc: 0049
title: Plugin external connections
status: Implemented
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, packages/manifest, plugins/account, plugins/console, docs; builds on RFC 0043 and RFC 0047
incorporated_into_plan: 'Yes — epic task 3.19'
---

# RFC 0049 — Plugin External Connections

## Summary

Add a platform pattern for plugins that connect to external services on behalf
of a user or instance. The platform provides connection metadata, OAuth callback
routing, token/credential storage through the secret vault, reconnect and
disconnect semantics, and operator visibility. Plugins still own provider
adapters and domain-specific behavior.

This fills the gap between deployment-time plugin env vars and runtime secrets:
a plugin can let a user connect an email account, model provider, payment
provider, social account, or other external API without each plugin inventing
its own credential lifecycle.

## Motivation

Several plugin categories need external accounts:

- syncing messages from email, chat, or social providers;
- sending through communication providers;
- connecting model providers or self-hosted AI endpoints;
- connecting payment or invoice delivery providers;
- importing data from third-party tools.

RFC 0043 defines where secrets live, but it does not define the provider
connection lifecycle around those secrets. Without a shared pattern, plugins
will duplicate OAuth state validation, callback routing, token refresh,
disconnect behavior, audit logs, and Account/Console visibility.

## Current state

- RFC 0018 supports plugin-scoped env vars for deployment-time secrets.
- RFC 0043 proposes `sdk.secrets` for runtime secrets.
- RFC 0047 proposes tool contracts for explicit external effects.
- Public API delegation exists, and public page routes are planned in RFC 0042.
- There is no standard `sdk.connections` surface, OAuth callback route model, or
  external-provider inventory.

## Proposed design

### Connection records

Add platform-owned metadata records:

```text
plugin_connections
  id
  tenant_id
  plugin_id
  user_id nullable
  scope                 # user | plugin | instance
  provider              # email.imap, google.oauth, openrouter, stripe, custom
  label
  status                # connected | needs_reauth | paused | disconnected | error
  secret_ref nullable
  metadata
  last_checked_at nullable
  last_used_at nullable
  last_error nullable
  created_at
  updated_at
  disconnected_at nullable
```

The connection record stores metadata only. Secret values remain in the vault.

### SDK surface

Add experimental `sdk.connections`:

```ts
sdk.connections.create(input: {
  scope: 'user' | 'plugin' | 'instance';
  provider: string;
  label: string;
  secretRef?: string;
  metadata?: unknown;
}): Promise<ConnectionRef>;

sdk.connections.list(filter?: { provider?: string; scope?: string }): Promise<ConnectionRef[]>;
sdk.connections.get(id: string): Promise<ConnectionRef | null>;
sdk.connections.update(id: string, input: { label?: string; status?: string; metadata?: unknown }): Promise<ConnectionRef>;
sdk.connections.disconnect(id: string): Promise<void>;
sdk.connections.markUsed(id: string): Promise<void>;
sdk.connections.markError(id: string, error: SanitizedConnectionError): Promise<void>;
```

The runtime injects plugin ID, tenant ID, and user ID. Plugins cannot list or
read another plugin's connections.

### OAuth/connect callback flow

Plugins may register connection callback routes through manifest declarations:

```jsonc
{
  "connections": {
    "providers": [
      {
        "id": "email.google",
        "title": "Google Mail",
        "callbackPath": "/connections/google/callback",
        "scopes": ["user"],
      },
    ],
  },
}
```

Callback rules:

- callback paths resolve under the plugin route prefix;
- the platform provides a signed, short-lived `state` helper;
- plugins validate provider response and exchange codes server-side;
- token material is stored through `sdk.secrets`;
- connection metadata is stored through `sdk.connections`;
- failed callbacks never log raw tokens or authorization codes.

### External effects

Connecting an account does not grant arbitrary external side effects. Sending,
publishing, charging, or mutating remote state remains plugin-owned and should
use tool contracts when another caller initiates the action.

## Security requirements

- Secret material is never stored in connection metadata.
- OAuth `state` values are signed, single-use, and expiry-bound.
- OAuth callbacks validate plugin ID, provider ID, actor user, and expected
  redirect path.
- Disconnect deletes or revokes associated secrets where possible.
- Token refresh errors move the connection to `needs_reauth` or `error`.
- Account and Console can show connection metadata without revealing secrets.
- External provider errors are sanitized before activity logs or UI display.

## Alternatives considered

### Let every plugin manage its own connection table

Rejected. Plugins still need domain tables, but the security-sensitive lifecycle
around credentials and account visibility should be consistent.

### Treat connections as secrets only

Rejected. Secrets lack user-facing labels, status, reconnect state, provider
metadata, and audit visibility.

### Require only deployment-time env vars

Rejected. User-authorized accounts and BYO API keys are runtime decisions.

## Open questions

1. Should OAuth callback routing be implemented as public plugin API routes or a
   dedicated runtime callback dispatcher?
2. Should provider manifests declare OAuth scopes as display-only metadata, or
   should the platform validate scope changes?
3. Should connection records support health-check handlers?
4. How much provider metadata should be exported during user data export?

## Adoption path

1. Add connection metadata tables.
2. Add `sdk.connections` and manifest provider declarations.
3. Add signed OAuth state helper and callback validation helpers.
4. Add Account/Console connection metadata views.
5. Document provider adapter, reconnect, and disconnect patterns.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
