# RFC 0089 — Fully public plugins

**Status:** Implemented\
**Date:** August 2026\
**Author:** kasunben\
**Scope:** `packages/manifest`, runtime middleware, `runtime/src/route-guard.ts`, `runtime/app/(minimal)/layout.tsx`, `docs/plugin-development.md`; builds on RFC 0042 (public plugin page routes) and RFC 0014 (minimal shell mode)\
**Incorporated into plan:** Yes — epic task 2.30.

---

## Summary

Add a manifest-level `public: true` flag that exempts an **entire plugin** from
the platform's session-redirect gate, for plugins that are public by design —
a status page, a public wiki, a changelog/blog. This is a thin extension of
RFC 0042 (which exempts individual declared route prefixes) and reuses RFC
0014's existing `shell: "minimal"` rendering mode rather than introducing a
new shell type.

## Motivation

RFC 0042 lets a plugin carve out narrow, token-protected public pages inside
an otherwise private app (a shared document, a published view). It
deliberately forbids a `/` prefix — public exposure must be a small,
reviewable declaration, not the whole plugin.

Some plugins have no private mode at all: their entire purpose is to be
visible to anyone, logged in or not (an instance status page, a public wiki,
a blog). Building these today means either fighting RFC 0042's per-route
model with awkward workarounds, or accepting that the plugin is unreachable
without a session — wrong for the use case. There's no manifest-driven way to
say "this plugin has no auth requirement, period."

## Current state (what this builds on)

- Runtime middleware redirects unauthenticated page requests to `/login`
  unless the path matches a declared public route.
- `publicRoutes` ([packages/manifest/src/schema.ts:187](../../packages/manifest/src/schema.ts)) lets a plugin
  declare route prefixes, relative to its own `routePrefix`, that are exempt
  from the session gate. The schema explicitly rejects a `/` prefix
  (`publicRoutes prefix must not be "/"`), so a plugin can never be made
  fully public this way.
- `matchedPublicPluginRouteId` ([runtime/src/route-guard.ts:72-82](../../runtime/src/route-guard.ts)) does
  plain prefix matching against `publicRoutes` — it has no opinion on what the
  prefix is, so a `/` prefix would in fact resolve correctly if the schema
  allowed it. The exemption mechanism already generalizes to "the whole
  plugin"; only the manifest validation blocks it.
- `decidePluginRoute` ([runtime/src/route-guard.ts:40-55](../../runtime/src/route-guard.ts)) implements the
  general precedence — disabled plugin → 404, RFC 0065 access-policy denial →
  404, `adminOnly` without `console:access` → 403, paywall → redirect, else
  ok — but it is only consulted by the _authenticated_ gate branch in
  `runtime/middleware.ts`. The separate public-route fast path
  ([runtime/middleware.ts:283-360](../../runtime/middleware.ts), reached when
  `matchedPublicPluginRouteId` matches) returns before that branch and only
  checks disabled-plugin status and, for a session-present or monetized
  request, paywall status — it never consults RFC 0065 restriction. A public
  route on a restricted plugin is reachable regardless today; this is
  existing `publicRoutes` (RFC 0042) behavior, not something this RFC
  changes.
- `shell: "minimal"` (RFC 0014, [runtime/app/(minimal)/layout.tsx](<../../runtime/app/(minimal)/layout.tsx>))
  is chrome-free: no sidebar, header, or footer, the plugin owns the whole
  viewport. Its doc comment currently states "the session gate still
  applies... so only authenticated users reach these routes" — true today,
  not necessarily true after this RFC.
- The default shell (`shell: "default"` or omitted) renders the platform nav
  chrome — sidebar/header/footer, user menu — which assumes an authenticated
  session throughout. It is not designed to render sensibly for an anonymous
  visitor.

## Proposed design

### Manifest field

Add optional `public` to `manifest.json`:

```jsonc
{
  "public": true,
  "shell": "minimal",
}
```

Rules, enforced at manifest validation (same layer as the existing
`publicRoutes` and `shell`/`shellConfig` `.refine()` checks):

- `public: true` requires `shell` to be **explicitly** `"minimal"` — an
  omitted, `"default"`, or `"overlay"` `shell` is rejected. The schema
  validates cross-field constraints elsewhere rather than silently defaulting
  one field based on another (see the `shellConfig` `.refine()` checks it
  sits alongside), and both `"default"` and `"overlay"` assume a chrome or
  dialog context built around an authenticated user that a standalone public
  entry point does not have.
- `public: true` cannot combine with `adminOnly: true` — contradictory
  (admin-gated and open-to-anyone).
- `public: true` cannot combine with a paywall tier — contradictory (paid and
  open-to-anyone).
- `public: true` cannot combine with `publicRoutes` — redundant and
  ambiguous about which one governs; a fully public plugin doesn't need
  route-level declarations.

### Middleware / route-guard behavior

Implemented as sugar over the existing RFC 0042 mechanism rather than a
parallel code path:

- At manifest-load time, a plugin with `public: true` is treated as if it
  declared `publicRoutes: [{ prefix: '/' }]`. `matchedPublicPluginRouteId`
  requires no changes — `underPrefix` matching already covers this case
  correctly, since `publicRoutes` was never actually incapable of a `/`
  prefix, only forbidden from declaring one.
- The public-route fast path's existing precedence is unchanged: disabled
  status still resolves to 404 ahead of the exemption, same as `publicRoutes`
  today. A `platform:owner` can still fully disable a nominally-public
  plugin; `public: true` removes the _default_ login requirement, it does not
  remove that override. RFC 0065 access-policy restriction is **not**
  consulted on this fast path — same gap `publicRoutes` already has (see
  "Current state" above) — so restricting a `public: true` plugin has no
  effect on its reachability; a `platform:owner` wanting to fully lock one
  down must disable it instead. Closing that gap for both mechanisms
  together is left as an open question below rather than folded into this
  RFC's scope.
- `apiProvider`/public `/api/*` delegation is untouched and orthogonal.
  `public: true` only exempts page routes from the session redirect, the
  same boundary RFC 0042 draws. A public-content plugin that only needs to
  read data server-side in its page components (the expected case for a
  status page or wiki) needs no API changes at all. A plugin that also wants
  an anonymous API surface still opts in via `apiProvider` separately.
- Session headers: same behavior as RFC 0042 — middleware injects session
  headers when a valid session exists (so a logged-in visitor to a public
  wiki still gets their identity, e.g. to show edit controls) and omits them
  otherwise. The plugin decides what, if anything, to do differently for an
  authenticated visitor; it must not assume one exists.

### Shell reuse, not a new shell type

`shell: "minimal"` already provides everything a fully public plugin needs at
the rendering layer: no nav chrome, no user-menu assumption, full-viewport
content. Requiring it for `public: true` avoids inventing and maintaining a
fourth shell mode, and avoids the real risk in the default shell — its chrome
is not audited for anonymous rendering and could leak session-shaped UI
(user menu, avatar, account links) into a logged-out view if a public plugin
were allowed to use it.

The only change needed to `(minimal)/layout.tsx` is to its doc comment: drop
the "only authenticated users reach these routes" claim, since it is no
longer universally true once a plugin can be both `shell: "minimal"` and
`public: true`. No rendering logic changes — `OfflineBanner` and the rest of
the minimal layout have no auth dependency to begin with.

### Plugin responsibility

Same posture as RFC 0042, generalized to the whole surface instead of a
carved-out prefix:

- Render sensibly for an anonymous visitor by default — the common case, not
  the edge case, for every route under the plugin.
- Treat the presence of injected session headers as an enhancement (show
  edit/admin affordances to an authenticated, permitted user), never as an
  assumption.
- Any mutation route must perform its own authorization — the platform gate
  is gone for the entire plugin, not just a share-link prefix, so there is no
  implicit "this part must still be private" boundary left to lean on.

### Console visibility

Public plugins should be visibly marked in Console's plugin catalog/detail
view (a "Public" badge, similar to how `publicRoutes` declarations are
already surfaced per RFC 0042), so an operator installing or auditing a
plugin can immediately see it has no default access control.

## Alternatives considered

### A new dedicated shell type (e.g. `shell: "public"`)

Rejected. `shell: "minimal"` already provides the correct chrome-free
rendering with no auth assumptions baked into its layout; a new shell type
would duplicate it for no rendering difference, only to carry the auth
semantics that belong in `public`, a separate manifest axis. Keeping shell
(rendering) and public (auth) as independent fields is also more composable:
nothing here rules out a future non-minimal public rendering mode without
another shell enum value.

### Relax `publicRoutes` to allow `/` directly, skip the new field

Rejected as the primary interface, though it is exactly the underlying
mechanism. A bare `publicRoutes: [{ prefix: '/' }]` doesn't read as "this
plugin is fully public" to a manifest reviewer, Console, or the plugin
catalog the way an explicit `public: true` does, and it would leave the
`shell: "minimal"` requirement, the `adminOnly`/paywall conflicts, and the
"can't combine with other publicRoutes entries" rule all unstated. `public`
is implemented in terms of the relaxed mechanism internally, but is the
intentional, documented, validated surface.

### Let `public: true` also make `/api/*` public

Rejected for this RFC. Conflating page-route exposure with API exposure
increases blast radius for the common case (read-only public content pages
that fetch server-side and need no client-callable API at all) and
duplicates a decision already owned by `apiProvider`. A plugin that needs
both simply sets both flags.

## Open questions

1. Should a fully public plugin be reachable without being "installed" in
   the traditional per-instance sense, or does it always require the normal
   install/enable flow (this RFC assumes the latter — no change to
   install/enable semantics, only to the auth gate once enabled)?
2. Should Console's plugin catalog treat `public: true` plugins as
   discoverable to anonymous visitors (e.g. listed at a root index), or is
   each public plugin only reachable if its `routePrefix` is known/linked
   externally?
3. Root-plugin rewrite (the mechanism that lets one plugin claim `/`) and
   `public: true` plugins — any interaction to define, or are they
   orthogonal since root-plugin eligibility is about `shell: "minimal"`
   already (RFC 0014) and unaffected by the auth flag?
4. Should there be a `paywallExempt`-style escape hatch analogous to RFC
   0042's open question, for a plugin that is mostly paywalled but wants one
   fully public sub-mode — or does that scenario stay served by
   `publicRoutes` instead of `public: true` (this RFC assumes the latter:
   `public` and paywall are mutually exclusive by design, not a hatch to
   design around)?
5. The public-route fast path in `runtime/middleware.ts` doesn't consult RFC
   0065 access-policy restriction at all — a `platform:owner` cannot restrict
   a `public: true` (or `publicRoutes`) plugin without fully disabling it.
   Should a follow-up add a `fetchRestrictedPluginIds` check to that fast
   path so restriction and public exposure compose correctly for both
   mechanisms, or is "restriction doesn't apply to a route the operator
   marked public" the intended, if undocumented, semantics? This RFC does not
   change that existing behavior.

## Adoption path

1. Add `public` to the manifest schema with the validation rules above
   (mutually exclusive with `adminOnly`, paywall, and `publicRoutes`;
   requires `shell: "minimal"` explicitly).
2. `matchedPublicPluginRouteId` (`runtime/src/route-guard.ts`) treats
   `public: true` as an implicit `publicRoutes: [{ prefix: '/' }]` match — no
   new middleware code path.
3. Update `(minimal)/layout.tsx`'s doc comment to stop asserting the session
   gate always applies.
4. Add Console "public" badge to the Plugins page (desktop table and mobile
   card layouts).
5. Add tests: authenticated, unauthenticated, disabled-plugin (still 404, on
   both the pure `decidePluginRoute` function and the real middleware fast
   path), access-policy-restricted (`decidePluginRoute` resolves not-found in
   isolation, but the middleware fast path doesn't consult it — covered
   explicitly, not left implicit), and each rejected manifest combination
   (`public` + `adminOnly`, `public` + paywall, `public` + `publicRoutes`,
   `public` + `shell: "default"`/`"overlay"`).
6. Document the field and the plugin-author responsibilities in
   `docs/plugin-development.md`, alongside the existing RFC 0042 section.

No breaking change to existing plugins — `public` is optional and defaults
to unset (current session-gated behavior unchanged).

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | August 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                  |
| 0.2     | August 2026 | Implemented as Task 2.30. `shell: "minimal"` is required explicitly rather than silently defaulted, matching the schema's existing validation-not-defaulting style. Corrected an inaccurate claim that RFC 0065 access-policy restriction applies to the public-route fast path — it doesn't, for `publicRoutes` either; flagged as open question 5 instead of silently fixed. |
