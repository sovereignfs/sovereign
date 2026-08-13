---
rfc: 0050
title: Public plugin webhooks
status: Implemented
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

**As shipped, this matches the sketch below closely** — see the 0.2
changelog entry for the few real deviations (`sdk.webhooks.checkReplay()`
returns "is this new/safe" rather than "is this a replay," `requiresSignature`
is documentation-only metadata with no enforcement of its own, and body-size
limits have a documented gap for chunked-transfer bodies). See
`docs/plugin-development.md`'s "webhooks" section for the actual shipped
surface and examples.

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

_Resolved — see the 0.2 changelog entry for the full implementation:_

1. **Should webhook route paths live under `/api/<pluginPrefix>/...`
   regardless of plugin page route prefix?** No — `webhooks[].path` resolves
   to `<routePrefix><path>`, the same convention `publicRoutes` uses, and is
   unrelated to the `/api/*` public-namespace-delegation mechanism (PLT-16,
   `apiProvider`) entirely. A plugin's webhook `route.ts` is composed into
   the runtime route tree exactly like any other plugin route.
2. **Should the platform provide per-webhook rate limiting in v1?** No.
   `runtime/middleware.ts`'s existing general per-IP rate limiter still
   applies (webhook requests go through the same middleware pipeline), but
   there is no rate limit scoped to an individual declared webhook. Flagged
   as a real gap for a future task, not a silent omission — a provider
   retry storm on one webhook endpoint is only bounded by the
   instance-wide per-IP limit today.
3. **Should successful webhook events be visible in Console, or only
   failures?** Neither, in this leg — there is no Console UI surface for
   webhook activity at all (success or failure). A plugin that wants
   visibility must log its own activity via `sdk.activity.log()`. Flagged
   as a follow-up, not built here.
4. **Should webhook verification challenge routes support unauthenticated
   `GET`?** Yes — `methods: ['GET']` is a supported per-declaration choice,
   exactly for this case; `POST` is the default when `methods` is omitted.

## Adoption path

1. ✅ Add manifest `webhooks` declarations and validation
   (`packages/manifest/src/schema.ts`).
2. ✅ Extend middleware route decisions for declared webhook paths
   (`runtime/src/route-guard.ts`'s `matchedWebhookRoute`,
   `runtime/middleware.ts`).
3. ✅ Add request method/body limits (enforced in middleware before the
   plugin's route handler runs — see open question 2 for what this
   doesn't cover, and the 0.2 changelog for the `Content-Length` caveat).
4. ✅ Add signature and replay SDK helpers (`sdk.webhooks.verifyHmac()`/
   `checkReplay()`).
5. ✅ Document provider webhook implementation patterns and tests
   (`docs/plugin-development.md`).

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.2     | August 2026 | Full manifest-declared webhooks shipped (epic task 2.15, workstream 0015 leg 3). Manifest `webhooks` field (`path`/`description`/`methods`/`maxBodyBytes`/`requiresSignature`) mirrors `publicRoutes`' (RFC 0042) validation shape, but `path` is an **exact** match, not a prefix — `matchedWebhookRoute()` (`runtime/src/route-guard.ts`), resolving open question 1. `runtime/middleware.ts` adds a webhook bypass branch ahead of the public-page-route branch: disabled-plugin → 404, undeclared method → 404 (never 405 — never reveal accepted methods), `Content-Length` over `maxBodyBytes` → 413, plugin id injected, **no** `x-sovereign-user-*` header ever set (even with a valid session cookie — there is no user for a webhook call, unlike `publicRoutes` which does forward session headers when present). `sdk.webhooks.verifyHmac()`/`checkReplay()` (`packages/sdk/src/webhooks.ts`) take `requestHeaders` as a **required** argument and fail closed (`false`) rather than defaulting to `'unknown'` — no legitimate webhook call site lacks one. `verifyHmac()` accepts only `'plugin'`-scoped secrets (`runtime/src/sdk-host.ts`'s `webhooks.verifyHmac`, secret lookup via `getPluginSecret`/`decryptSecretValue`) — `'user'`-scoped is inapplicable (no user) and `'instance'`-scoped is deliberately not exposed here since its normal capability check (`instance:configure`) needs a user context this call never has. The HMAC comparison itself (`runtime/src/webhook-hmac.ts`'s `verifyHmacDigest`) computes a hex digest and does a length-checked `timingSafeEqual` against the caller-supplied `signatureHeader` — compared as a hex **string**, not decoded first (decoding malformed hex never throws in Node, so string comparison is simpler and no less safe); provider-specific prefixes (e.g. GitHub's `sha256=`) must be stripped by the caller first, this helper doesn't parse header formats. `checkReplay()` — the RFC's sketch didn't specify return-value polarity; resolved as `true` = "new, safe to process," `false` = "replay" (a "claim, not query" semantics), backed by a new `webhook_replays` platform table (`packages/db`, unique index on `(pluginId, provider, eventId)`, atomic `INSERT ... ON CONFLICT DO NOTHING ... RETURNING` claim, 24h default TTL, expired rows deleted before each claim attempt so an old event id can be legitimately reprocessed rather than blocked forever) — the RFC sketch's `timestamp` input field was dropped since this design keys expiry off server receipt time, not a provider-supplied timestamp. Open questions 2 (per-webhook rate limiting) and 3 (Console visibility) remain unresolved — see their entries below for why neither blocks this leg. |
