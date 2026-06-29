---
rfc: 0050
title: Public plugin webhooks
status: Draft
date: June 2026
author: kasunben
scope: packages/manifest, runtime middleware, runtime route guard, packages/sdk, docs; builds on RFC 0042 and RFC 0043
incorporated_into_plan: 'Yes — epic task 2.15'
---

# RFC 0050 — Public Plugin Webhooks

## Summary

Add a manifest-declared webhook ingress primitive for plugins that need to
receive unauthenticated callbacks from external systems. Webhook routes are
public at the middleware layer, but the plugin must verify signatures, reject
replays, enforce body limits, and fail closed.

This is distinct from RFC 0042 public page routes. Public pages render content
to humans. Webhooks accept machine-to-machine callbacks such as message
delivery, payment events, provider sync notifications, or OAuth provider
postbacks that are not browser callback flows.

## Motivation

Plugins that integrate with external providers often need inbound callbacks:

- email, chat, or social providers notifying that new messages are available;
- payment providers reporting payment success/failure;
- document-signing or form providers posting completed payloads;
- provider-specific verification challenges.

Today public API delegation is too coarse: it allows one plugin to own public
`/api/*`, but it does not provide a per-plugin webhook declaration, consistent
limits, or standard security expectations.

## Current state

- Public `/api/*` delegation exists for one provider plugin.
- RFC 0042 covers public page routes.
- RFC 0043 covers secret storage for webhook signing secrets.
- There is no narrow manifest declaration for public plugin webhook endpoints.

## Proposed design

### Manifest declarations

Add optional `webhooks` to plugin manifests:

```jsonc
{
  "webhooks": [
    {
      "path": "/webhooks/provider",
      "description": "Provider delivery callback",
      "methods": ["POST"],
      "maxBodyBytes": 262144,
      "requiresSignature": true,
    },
  ],
}
```

Rules:

- `path` is relative to the plugin `routePrefix`.
- paths must start with `/` and cannot be `/`;
- methods are restricted to `POST` by default, with `GET` allowed only for
  provider verification challenges;
- webhook routes never inherit public page route behavior;
- disabled plugins return 404 for webhook routes.

### Runtime behavior

For declared webhook routes, middleware:

1. skips the session redirect;
2. preserves CSP and security headers where applicable;
3. applies request body and method limits before invoking plugin code;
4. injects plugin ID and tenant context;
5. never injects a forged user identity.

The plugin route handler verifies provider-specific authorization.

### SDK helpers

Add small server-side helpers rather than a full provider framework:

```ts
sdk.webhooks.verifyHmac(input: {
  body: Uint8Array;
  signatureHeader: string;
  secretRef: string;
  algorithm: 'sha256' | 'sha512';
}): Promise<boolean>;

sdk.webhooks.checkReplay(input: {
  provider: string;
  eventId: string;
  timestamp?: number;
  ttlSeconds?: number;
}): Promise<boolean>;
```

Replay state is platform-owned so plugins do not need to reimplement a durable
dedupe table for every provider.

## Security requirements

- Undeclared webhook paths remain session-gated or unavailable.
- Webhook route declarations are validated at build/install time.
- Request body size limits apply before plugin handler execution.
- Signature verification secrets are read through the secret vault.
- Replay protection is available for providers with stable event IDs.
- Invalid signatures return 404 or 401 without revealing whether a resource
  exists.
- Webhook failures are sanitized and rate-limited to avoid log/DB flooding.

## Alternatives considered

### Reuse public page routes

Rejected. Webhooks need method/body limits, signature helpers, replay handling,
and different audit semantics.

### Keep the single public API provider model

Rejected. It blocks multiple plugins from receiving provider callbacks.

### Require external reverse proxies for webhooks

Rejected. It makes plugin installation operator-hostile and weakens portability.

## Open questions

1. Should webhook route paths live under `/api/<pluginPrefix>/...` regardless of
   plugin page route prefix?
2. Should the platform provide per-webhook rate limiting in v1?
3. Should successful webhook events be visible in Console, or only failures?
4. Should webhook verification challenge routes support unauthenticated `GET`?

## Adoption path

1. Add manifest `webhooks` declarations and validation.
2. Extend middleware route decisions for declared webhook paths.
3. Add request method/body limits.
4. Add signature and replay SDK helpers.
5. Document provider webhook implementation patterns and tests.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
