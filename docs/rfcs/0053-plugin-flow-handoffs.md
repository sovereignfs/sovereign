---
rfc: 0053
title: Plugin flow handoffs
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, packages/manifest, docs; builds on RFC 0042, RFC 0050, RFC 0051, and RFC 0047
incorporated_into_plan: 'Yes — epic task 3.21'
---

# RFC 0053 — Plugin Flow Handoffs

## Summary

Add a platform-mediated handoff primitive that lets one plugin start or continue
a user-facing flow in another plugin with a signed, short-lived payload. The
handoff may be for an authenticated user or an anonymous public visitor.

This fills the gap between data contracts, tool contracts, public routes, and
ad hoc redirects. Data contracts are read-only. Tool contracts are structured
actions with an actor and confirmation flow. Public routes expose pages or
webhooks. Flow handoffs move a user from one plugin-owned experience into
another with typed input, source attribution, expiry, and replay protection.

## Motivation

Some plugin compositions are not just "read data" or "execute a tool":

- a source plugin sends a visitor to a checkout flow with item snapshots;
- a booking plugin sends a visitor to a payment or confirmation flow;
- a document plugin sends a user into a signing/review flow;
- a campaign plugin sends a public visitor into a form or donation flow;
- an assistant or launcher opens a prefilled plugin flow without writing data
  yet.

Without a handoff primitive, plugins must invent signed URLs, custom public POST
routes, session cookies, replay checks, and return URL semantics. That weakens
isolation and makes reusable template plugins harder to build.

## Current state

- RFC 0002 defines consented read-only cross-plugin data queries.
- RFC 0047 defines tool contracts for provider-owned actions.
- RFC 0042 defines public plugin page routes.
- RFC 0050 defines public plugin webhooks.
- RFC 0051 defines cross-plugin references and dependency discovery.
- There is no standard way to pass a typed, short-lived, user-facing flow payload
  from one plugin to another.

## Proposed design

### Manifest declarations

Provider plugins declare handoff receivers:

```jsonc
{
  "handoffs": {
    "receives": [
      {
        "name": "checkout-session",
        "path": "/cart",
        "title": "Start checkout",
        "inputSchema": {
          "type": "object",
          "properties": {
            "items": { "type": "array" },
          },
          "required": ["items"],
        },
        "public": true,
      },
    ],
  },
}
```

Caller plugins may declare optional handoff targets for discovery and review:

```jsonc
{
  "handoffs": {
    "sends": [
      {
        "provider": "io.openfs.sovereign.checkout",
        "name": "checkout-session",
        "reason": "Send selected items to checkout",
      },
    ],
  },
}
```

### SDK surface

Caller:

```ts
const handoff = await sdk.handoffs.create({
  providerId: 'io.openfs.sovereign.checkout',
  name: 'checkout-session',
  payload,
  returnUrl: '/source/thank-you',
  mode: 'public',
  expiresInSeconds: 900,
});
```

Provider:

```ts
const handoff = await sdk.handoffs.consume(token, {
  name: 'checkout-session',
});
```

The returned handoff context includes:

- source plugin ID;
- provider plugin ID;
- handoff name;
- tenant ID;
- actor user ID when authenticated;
- public visitor marker when anonymous;
- payload;
- return URL if provided;
- created/expiry timestamps.

### Token model

Handoff tokens are:

- signed by the platform;
- short-lived;
- scoped to one provider plugin and handoff name;
- optionally single-use;
- bound to a payload hash;
- replay-protected when `singleUse` is true.

The payload may be stored server-side in a platform handoff table with the token
carrying only an opaque ID, or embedded in the token when small. The
implementation should prefer server-side storage for larger payloads.

### Public and authenticated modes

`mode: 'authenticated'` requires a Sovereign session when the provider consumes
the handoff. `mode: 'public'` may be consumed by an anonymous visitor on a
manifest-declared public route.

Public handoffs must be explicit in the provider manifest. A plugin cannot
accidentally receive arbitrary public payloads.

### Provider responsibility

The provider must:

- validate input against its declared schema;
- apply domain validation before creating durable records;
- treat source references as opaque;
- avoid trusting prices, permissions, or availability without its own checks or
  source validation;
- fail closed when the handoff is expired, replayed, malformed, or for the wrong
  provider.

## Security requirements

- Handoff tokens cannot be forged by source plugins or clients.
- A token for one provider/handoff name cannot be consumed by another.
- Expired and replayed tokens fail closed.
- Public handoffs are allowed only when provider manifest declares them public.
- Payload size is capped.
- Handoff creation and consumption are audited when an authenticated actor
  exists; public handoffs record source/provider metadata without sensitive
  visitor data in platform logs.
- Return URLs are same-origin or manifest-allowed; arbitrary open redirects are
  rejected.

## Alternatives considered

### Use tool contracts for everything

Rejected. Tool contracts represent provider-owned actions and confirmation.
Flow handoffs represent navigation into a provider-owned user experience,
including anonymous public visitors.

### Let source plugins POST directly to provider public routes

Possible as a stopgap, but rejected as the platform pattern. It duplicates
signing, expiry, replay, payload limits, and source attribution.

### Encode everything in query parameters

Rejected. URLs leak into logs/history and are too small for structured payloads.

## Open questions

1. Should handoff payloads always be stored server-side, or can small payloads be
   embedded in signed tokens?
2. Should source plugins be able to revoke unconsumed handoffs?
3. Should public handoffs support one anonymous browser session binding to reduce
   token forwarding?
4. Should handoff schemas use the same schema format as tool contracts?

## Adoption path

1. Add manifest `handoffs.receives` / `handoffs.sends` declarations and
   validation.
2. Add platform handoff table and signed token helpers.
3. Add `sdk.handoffs.create()` and `sdk.handoffs.consume()`.
4. Add public/authenticated mode enforcement and replay protection.
5. Document source-provider patterns, including checkout-style flows.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
