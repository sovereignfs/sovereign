---
rfc: 0043
title: Plugin secret vault
status: Draft
date: June 2026
author: kasunben
scope: >
  packages/sdk, packages/db, runtime, packages/manifest, plugins/account,
  plugins/console, docs; builds on RFC 0008 and RFC 0018
incorporated_into_plan: 'No — documentation-first. This RFC specifies a secure per-plugin and per-user secret storage surface; scheduling and task IDs are deferred.'
---

# RFC 0043 — Plugin Secret Vault

## Summary

Add a platform-managed secret vault for plugins that need to store sensitive
operator or user credentials, such as OAuth tokens, personal access tokens, API
keys, webhook signing secrets, or provider refresh tokens.

Plugin-scoped env vars remain the right mechanism for deployment-level secrets.
The vault fills the gap for secrets created at runtime through user interaction,
especially per-user credentials that cannot be known at deploy time.

## Motivation

Several plugin categories need runtime secrets: connecting to a git provider,
calling a user-authorized third-party API, storing a webhook secret, or letting a
user bring their own model/provider key. Today the safest documented path is
plugin-scoped env vars, but env vars only cover instance-level configuration.

Without a shared vault, each plugin must implement its own encryption, key
rotation, deletion semantics, audit behavior, and export policy. That is both
inconsistent and easy to get wrong.

## Current state

- RFC 0018 provides plugin-scoped env vars.
- RFC 0008 specifies a future encryption architecture.
- There is no stable `sdk.secrets` or equivalent.
- Plugins can write encrypted blobs to their own DB tables, but the platform
  does not standardize keys, metadata, rotation, or deletion.

## Proposed design

### SDK surface

Add experimental `sdk.secrets`:

```ts
interface SecretRef {
  id: string;
  scope: 'user' | 'plugin' | 'instance';
  label: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

sdk.secrets.create(input: {
  scope: 'user' | 'plugin' | 'instance';
  label: string;
  value: string;
  metadata?: unknown;
}): Promise<SecretRef>;

sdk.secrets.get(id: string): Promise<string | null>;
sdk.secrets.list(scope?: 'user' | 'plugin' | 'instance'): Promise<SecretRef[]>;
sdk.secrets.update(id: string, value: string): Promise<SecretRef>;
sdk.secrets.delete(id: string): Promise<void>;
```

The runtime injects plugin ID and user ID from the request context. Plugins
cannot read another plugin's secrets or another user's user-scoped secrets.

### Scopes

| Scope      | Owner                               | Example                            |
| ---------- | ----------------------------------- | ---------------------------------- |
| `user`     | current user + calling plugin       | user's OAuth refresh token         |
| `plugin`   | calling plugin, shared across users | webhook signing secret             |
| `instance` | instance admin + calling plugin     | instance-level provider credential |

`instance` scope requires a platform capability such as `instance:configure` or
a plugin-declared admin capability. The exact gate is implementation-specific
but must not be available to ordinary users by default.

### Storage model

Secrets are stored encrypted in platform tables, not plugin tables:

```text
plugin_secrets
  id
  tenant_id
  plugin_id
  scope
  user_id nullable
  label
  ciphertext
  metadata
  created_at
  updated_at
  last_used_at nullable
  deleted_at nullable
```

Encryption uses the platform key hierarchy from RFC 0008 when available. If the
full encryption architecture is not yet implemented, this RFC should not ship a
plaintext fallback. It should remain blocked or require a no-default local key.

### Export, import, and deletion

Secrets are not exported by default. User export includes metadata only:

- label;
- provider/type metadata;
- created/updated timestamps;
- whether a secret exists.

Import does not recreate secrets. The user or admin must reconnect.

User deletion hard-deletes user-scoped secrets. Plugin uninstall deletes or
archives plugin/instance-scoped secrets according to the uninstall flow.

### UI

Plugins own their connection UI, but Account and Console may surface vault
metadata:

- Account: "connected credentials" per plugin for the current user.
- Console: instance-scoped/plugin-scoped secrets without revealing values.
- Both surfaces support disconnect/delete where authorized.

## Security requirements

- No plaintext secret values in logs, activity events, generated files, exports,
  or error messages.
- Secret reads update `last_used_at` without logging the value.
- Secret values are returned only server-side.
- Client components never receive secret values.
- Deleting a secret revokes future reads immediately.
- Vault setup fails fast if encryption key material is unavailable.

## Alternatives considered

### Keep all secrets in plugin-scoped env vars

Good for deployment-level secrets, insufficient for runtime user credentials.

### Let every plugin implement encryption

Rejected. It fragments security behavior and makes audits impossible.

### Store secrets in plugin isolated databases

Rejected for the shared vault. Isolated DBs are useful for plugin data, but the
platform should own encryption, deletion, and metadata for secrets.

## Open questions

1. Should the vault wait for RFC 0008 Tier 2, or ship earlier with a mandatory
   local key?
2. What is the exact capability gate for `instance` scope?
3. Should plugins be able to mark a secret as non-exportable/non-migratable
   explicitly, or is that always implied?
4. How should OAuth refresh-token rotation be represented?

## Adoption path

1. Decide encryption dependency and key source.
2. Add platform secret tables and helpers.
3. Add `sdk.secrets`.
4. Add Account/Console metadata views.
5. Update plugin development docs with credential patterns.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
