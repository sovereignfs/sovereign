---
rfc: 0042
title: Public plugin page routes
status: Draft
date: June 2026
author: kasunben
scope: >
  packages/manifest, runtime middleware, runtime route guard, docs; builds on
  PLT-16 public API delegation and RFC 0024
incorporated_into_plan: 'No — documentation-first. This RFC specifies a manifest-declared public page route primitive for plugins; scheduling and task IDs are deferred.'
---

# RFC 0042 — Public Plugin Page Routes

## Summary

Add a manifest-declared way for a plugin to expose specific page routes without
the global session redirect. These routes are public entry points where the
plugin owns authentication and authorization, usually through an expiring token,
a public identifier, or a session fallback.

This extends the same principle as public `/api/*` delegation: the platform can
exempt a narrow, declared route from the session gate, but the plugin must then
perform its own access check and fail closed.

## Motivation

Some plugins need read-only public pages: a shared document, a public board, a
published view, or a token-protected preview. Today the runtime session-gates
page routes. A plugin can expose public API endpoints through `/api/*` if it is
the single API provider, but there is no equivalent for public pages.

Without a public-page primitive, plugins either cannot implement public sharing,
link users to an external system, or try to smuggle HTML through API routes. A
small manifest feature keeps public exposure explicit and reviewable.

## Current state

- Runtime middleware redirects unauthenticated page requests to `/login`.
- `apiProvider: true` allows one plugin to own public `/api/<slug>/*`.
- Public API delegation is path-based and plugin-owned for auth.
- There is no manifest field for public page routes.

## Proposed design

### Manifest field

Add optional `publicRoutes` to `manifest.json`:

```jsonc
{
  "publicRoutes": [
    {
      "prefix": "/p",
      "description": "Token-protected public read-only pages.",
    },
  ],
}
```

Rules:

- `prefix` is relative to the plugin `routePrefix`.
- It must start with `/`.
- It must not be `/`.
- It must not contain route groups or interception markers.
- It must resolve under the plugin route prefix only.
- Public routes are never inherited by child plugins or API routes.

Example resolution:

```text
routePrefix: /example
publicRoutes[0].prefix: /p
exempt path: /example/p/*
```

### Middleware behavior

For a request under a public plugin route:

1. Middleware still applies CSP and security headers.
2. Middleware does not redirect unauthenticated users to `/login`.
3. Middleware injects session headers if a valid session exists.
4. Middleware omits session headers if no valid session exists.
5. The plugin page renders and must perform token/session authorization itself.

Disabled-plugin and paywall gates still apply. A disabled plugin's public route
returns 404. A paywalled plugin's public route behavior is an open question; the
default should be to block unless the public route is explicitly marked
`paywallExempt`.

### Plugin responsibility

A public route must:

- validate its token or public identifier server-side;
- return 404 for invalid, expired, disabled, or unknown shares;
- avoid leaking whether a private resource exists;
- render read-only by default;
- use a session fallback only when the session user has normal plugin access to
  the underlying resource.

### Token storage

This RFC does not define token tables. Each plugin owns its public-share model.
Recommended fields:

- token hash, not plaintext token;
- resource ID;
- created by;
- created at;
- expires at;
- revoked at;
- mode (`expiring`, `permanent`, or plugin-specific enum).

## Security requirements

- Public route declarations are validated at build/install time.
- Public route prefixes cannot overlap another plugin's route prefix.
- Public routes cannot point at runtime routes.
- Invalid public links return 404, not 401/403.
- Public pages must not expose mutation controls to unauthenticated users.
- Public routes are listed in Console health/plugin detail views.

## Alternatives considered

### Use public `/api/*` routes to serve HTML

Rejected. API routes are for machine-readable endpoints and only support one
provider plugin per instance. Public pages need plugin-local ownership and
normal rendering.

### Make all plugin routes optionally public at runtime

Rejected. Public exposure must be explicit in the manifest so install/build
review can catch it.

### Add a platform-wide public share service

Deferred. Plugins have different resource models. A generic public-route
primitive is smaller and keeps authorization near the resource owner.

## Open questions

1. Should `publicRoutes` support `paywallExempt`, or should monetized plugins
   be blocked from public pages unless a separate RFC defines sharing and
   entitlements?
2. Should public routes be eligible for root-plugin rewrite?
3. Should public routes support cache hints in the manifest?
4. Should Console show a consolidated list of active public shares, or only the
   route declarations?

## Adoption path

1. Add `publicRoutes` to the manifest schema.
2. Add validation for route-prefix safety.
3. Extend middleware route decisions to skip login redirects for declared public
   route prefixes.
4. Add tests for authenticated, unauthenticated, disabled-plugin, and invalid
   route cases.
5. Document public-route implementation patterns.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
