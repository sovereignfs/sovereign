---
rfc: 0053
title: Plugin flow handoffs
status: Implemented
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

1. ~~Should handoff payloads always be stored server-side, or can small
   payloads be embedded in signed tokens?~~ **Resolved:** always server-side,
   in a new `plugin_handoffs` table. The signed token carries only an opaque
   `handoffId`; embedding the payload in the token itself was rejected even
   for small payloads to keep one code path and one size limit rather than
   two.
2. ~~Should source plugins be able to revoke unconsumed handoffs?~~
   **Resolved: not in this pass.** The default 15-minute (max 1-hour) expiry
   bounds exposure without needing a revocation API; add one later if a real
   use case needs it.
3. ~~Should public handoffs support one anonymous browser session binding to
   reduce token forwarding?~~ **Resolved: no** — public-mode handoffs are
   consumable by anyone holding the token, same as a public webhook payload.
   Authenticated-mode handoffs get the stronger property instead: consumption
   is pinned to the exact creating user (see the Security requirements
   note below), which covers the case that actually matters (a logged-in
   user's flow being hijacked), without adding session-binding machinery to
   the public/anonymous path where there's no session to bind to.
4. ~~Should handoff schemas use the same schema format as tool contracts?~~
   **Resolved: yes, same shape, not shared enforcement.** `inputSchema` uses
   the same JSON-Schema-subset shape RFC 0047 (tool contracts) defines, for
   author familiarity — but it is declarative metadata only. The platform
   validates a tool call's input before invoking the tool; it does **not**
   validate a handoff's payload, per this RFC's own "Provider responsibility"
   text above. A provider must validate `context.payload` itself in its
   receiver route.

## Adoption path

1. Add manifest `handoffs.receives` / `handoffs.sends` declarations and
   validation.
2. Add platform handoff table and signed token helpers.
3. Add `sdk.handoffs.create()` and `sdk.handoffs.consume()`.
4. Add public/authenticated mode enforcement and replay protection.
5. Document source-provider patterns, including checkout-style flows.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2     | August 2026 | Shipped (epic task 3.21, workstream 0015 leg 5). Payload always server-side in a new `plugin_handoffs` table (`packages/db`) — the signed token carries only an opaque `handoffId`. Token is `base64url(json) + "." + HMAC-SHA256` (`runtime/src/handoff-token.ts`), same shape as `connections.ts`'s OAuth state token, but — unlike RFC 0047's tool-confirmation tokens — has **no in-memory replay tracking**; single-use is enforced entirely by the DB row's `consumed_at`, claimed atomically via `UPDATE ... WHERE consumed_at IS NULL RETURNING`, the same idiom `checkWebhookReplay` (RFC 0050) uses. `handoffs.receives[].path` is an **exact** match, mirroring `webhooks[].path`, not `publicRoutes`' prefix match — resolved the same way RFC 0050 resolved its own equivalent question. `matchedPublicHandoffRoute()` (`runtime/src/route-guard.ts`) only matches `public: true` receivers; unlike the webhook middleware branch (which never forwards user identity), the new handoff branch forwards `x-sovereign-user-id` conditionally when a session is present, like `publicRoutes`' own branch — mode/actor enforcement happens in `sdk-host.ts`'s `consume()`, not in middleware. **Authenticated-mode consumption is pinned to the exact creating user** (`context.actorUserId === existing.actorUserId`), tighter than this RFC's literal text (which only required _a_ session) — closes a confused-deputy gap where a leaked/forwarded authenticated handoff URL could otherwise be redeemed by a different logged-in visitor; flagged in the epic correction note as a deliberate strengthening, not scope creep. `returnUrl` reuses `post-login-redirect.ts`'s existing `sanitizeRedirectPath()` rather than reimplementing the same-origin check. Default expiry is 15 minutes; `expiresInSeconds` is clamped server-side to a 1-hour maximum regardless of what a plugin requests. New permissions `handoffs:send`/`handoffs:receive`, mirroring `data:provide`/`data:consume` and `tools:provide`/`tools:call`'s naming. All four open questions above resolved during implementation — see their entries. |
