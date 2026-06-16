# RFC 0022 — Plugin-declared capabilities

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (a new `capabilities` declaration), `packages/sdk` (`hasCapability`/`requireCapability` resolve plugin capabilities), the capability resolver + session from RFC 0021, an optional platform/Console assignment surface, `docs/plugin-development.md`; **builds on RFC 0021** (capability model, resolver, SDK helper, `platform:`/`plugin:` namespacing), RFC 0018 (manifest declaration + namespacing pattern), RFC 0005 (audit)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 1.0.03; documentation-first. This RFC specifies how plugins declare and use their own plugin-scoped capabilities; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Let a **plugin** declare its own authorization vocabulary — namespaced capabilities
like `splitify:create-group` or `splitify:settle` — so plugin code can gate features
on something finer than "is this user a platform admin." All users remain
`platform:user` by default (RFC 0021); plugin capabilities are an **additional,
plugin-scoped** layer:

- declared in the **manifest** (auto-namespaced by plugin slug, validated at build);
- **enforced inside the plugin** via the RFC 0021 SDK helper
  (`sdk.auth.hasCapability('splitify:create-group')`) — **not** by the platform route
  gate;
- assigned through a model this RFC scopes (the central open question:
  platform-stored vs plugin-managed).

This is the layer SRS §3.4 reserved when it chose `platform:` namespacing to "scale
to plugin-level roles" and deferred per-plugin assignment.

## Relationship to RFC 0021

RFC 0021 makes **capabilities** the platform's enforcement unit, adds the resolver
and the `hasCapability`/`requireCapability` SDK helper, and establishes the
`platform:` / `plugin:` namespace split. RFC 0022 reuses all of that for the
**plugin** namespace: plugins declare `<slug>:<capability>` and check them with the
same helper. The distinction: **platform** capabilities gate platform routes/chrome;
**plugin** capabilities gate behaviour _inside_ a plugin.

## Motivation

A plugin like Splitify has its own roles in spirit — who can create a group, settle
balances, manage members — but today it has **no declared vocabulary** for them. A
plugin that needs authorization must roll its own entirely in its slug-prefixed
tables (it has `db:readWrite`) and check it ad hoc; `sdk.auth` exposes only the
platform role. There's no shared way to _name_ these capabilities, no consistency
across plugins, and nothing the platform/owner can see, assign, or audit centrally.
Declaring plugin capabilities gives them a first-class, namespaced, validated home.

## Current state (what this builds on)

- **No plugin authz vocabulary.** Plugins implement any roles privately; there is no
  manifest field for capabilities and no SDK concept of a plugin capability.
- **0021's foundation.** The capability resolver, `hasCapability`/`requireCapability`,
  capabilities carried in the session, and the `platform:`/`plugin:` namespacing all
  come from RFC 0021.
- **Reserved hooks.** The manifest's `admin:*` permission was explicitly noted for
  "future fine-grained plugin admin scopes"; RFC 0018 established the
  manifest-declaration + auto-namespacing pattern (for env) that this mirrors.

## Proposed design

### Manifest `capabilities` declaration

A plugin declares its capabilities in the manifest, **auto-namespaced** by its slug:

```jsonc
{
  "capabilities": {
    "create-group": { "description": "Create a new expense group.", "defaultGrant": true },
    "settle": { "description": "Settle balances for a group." },
    "manage-members": { "description": "Add or remove group members." },
  },
}
```

These surface as `splitify:create-group`, `splitify:settle`, etc.
`defaultGrant: true` means every user of the plugin holds it implicitly; otherwise it
requires explicit assignment. Validated at build like `permissions` / `env` (RFC
0018); namespacing prevents collisions with platform capabilities or other plugins.
Adds a manifest field (minor bump) + a docs-parity entry.

### Enforcement is intra-plugin, via the SDK

Plugin code gates on its own capabilities with the RFC 0021 helper:

```ts
await sdk.auth.requireCapability('splitify:create-group');
```

**The platform route gate does not enforce plugin capabilities** — they are the
plugin's concern, checked where the plugin decides. (Platform capabilities, by
contrast, gate routes and chrome in the middleware.) Stating this plainly avoids the
expectation that `adminOnly`-style gating applies to plugin capabilities.

### Assignment model (the central open question)

Two shapes, with different trade-offs:

- **Platform-stored grants** — the platform owns a `user × capability` store; plugin
  capabilities resolve into the session alongside platform ones; consistent
  assignment UI and central audit — but the platform then stores plugin-domain authz,
  and the session can bloat.
- **Plugin-managed** — the plugin stores its own grants in its slug-prefixed tables
  and checks them; the manifest declaration is the **vocabulary** that an optional
  shared/Console assignment surface can read. Keeps plugin authz in the plugin; less
  central consistency.

**Recommendation:** lean **plugin-managed** for genuinely plugin-scoped roles (e.g. a
Splitify _group owner_ grants `manage-members` within their group — domain data the
plugin already owns), with the manifest vocabulary enabling a shared assignment UI
where useful. Present both; mark the v1 storage choice as open.

### Who assigns

Plugin-internal (a plugin's own owner/admin role grants to others within the plugin)
vs the platform owner/Console. Likely **plugin-internal** for domain roles, with an
**optional platform-owner override**. Open question.

## UI / flows

A plugin declares `splitify:create-group` etc. in its manifest → its code calls
`requireCapability('splitify:create-group')` where needed → a user without it is
refused by the plugin (the plugin chooses the UX) → grants are assigned per the
chosen model (e.g. a group owner grants within Splitify) and, where applicable,
audited (RFC 0005).

## Alternatives considered

1. **No declaration (status quo).** Plugins fully roll their own authz. Works, but
   there's no shared vocabulary, no consistent assignment UI, and nothing the
   platform/owner can see or audit. Rejected — declaring capabilities is the point.
2. **Platform-stored only.** Central and consistent, but puts plugin-domain
   authorization (and its data) in the platform and bloats the session. Kept as one
   option, not mandated.
3. **Plugin-managed only, no manifest declaration.** Keeps authz in the plugin but
   loses the named vocabulary that makes a shared UI / audit possible. Rejected in
   favour of declaring the vocabulary even when storage is plugin-managed.

## Open questions

1. **Storage** — platform-stored vs plugin-managed vs hybrid (the central decision).
2. **Assignment actor/UI** — plugin-internal vs platform owner vs both.
3. **`defaultGrant` semantics** — granted to all plugin users vs all platform users
   of the instance.
4. **Session carriage** — do plugin capabilities ride in the session cookie (bloat,
   staleness) or are they checked on demand against the store?
5. **Owner override** — can the platform owner override a plugin's grants?
6. **Plugin-level roles** — bundles of plugin capabilities (`splitify:owner`) vs flat
   capabilities; do plugins get presets like the platform does?
7. **Requirement IDs** — deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).**
2. **When accepted & scheduled (after RFC 0021):** the manifest `capabilities` field +
   validation, the SDK plumbing so `hasCapability`/`requireCapability` resolve plugin
   capabilities, and the chosen assignment/storage model + `docs/plugin-development.md`.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                           |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft; plugins declare namespaced `<slug>:<capability>` in the manifest, enforced intra-plugin via the RFC 0021 SDK helper; assignment-model (platform-stored vs plugin-managed) left as the central open question; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 1.0.03.                                                                                                                                                                                               |
