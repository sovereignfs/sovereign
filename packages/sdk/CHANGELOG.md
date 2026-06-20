# Changelog

All notable changes to `@sovereignfs/sdk` are documented here. The package
follows [Semantic Versioning](https://semver.org); see
[`docs/sdk-stability.md`](../../docs/sdk-stability.md) for the stability policy
and which parts of the surface the guarantee covers.

## 1.8.0

**New export: `sdk.billing` stubs and `EntitlementRequiredError`** (RFC 0003 / Task 0.8.01).
Reserved — not yet covered by the v1 stability guarantee.

- `sdk.billing.getEntitlement(pluginId)` — returns the current user's active entitlement
  for a plugin, or `null` if none. Reserved stub: throws `NotImplementedError`.
- `sdk.billing.requireEntitlement(pluginId)` — asserts the current user holds an
  entitlement; throws `EntitlementRequiredError` if not. Reserved stub: throws
  `NotImplementedError`.
- New export: `EntitlementRequiredError` (extends `Error`, `name: 'EntitlementRequiredError'`).

Plugin authors who want entitlement-aware rendering can `catch (e)` on `requireEntitlement`
and branch accordingly. The middleware's paywall redirect operates independently of
`sdk.billing` — access is blocked at the routing layer before a plugin renders.

## 1.7.0

**New surface: `sdk.notifications`** (RFC 0015 / Task 0.7.01). Experimental.

- `sdk.notifications.send(input, requestHeaders)` delivers an in-app notification to one
  or more users. Requires the `notifications:send` manifest permission. `requestHeaders`
  is the `ReadonlyHeaders` from `next/headers` (used to source the plugin ID).
- New exported type: `SendNotificationInput`.

## 1.6.0

**RFC 0021 — Platform roles & capabilities.** Stable surface addition.

- `SessionUser` gains a `capabilities: readonly string[]` field populated from
  the `x-sovereign-user-capabilities` header injected by the middleware. Plugins
  should inspect this rather than comparing `user.role` directly.
- `sdk.auth.hasCapability(session, capability)` → `boolean` — returns true if
  the session grants the named capability. Synchronous. Works with `null` (returns
  false), so it is safe to call with `await sdk.auth.getSession()` without a null
  guard.

```ts
const session = await sdk.auth.requireSession();
if (sdk.auth.hasCapability(session, 'user:manage')) {
  // current user can manage other users
}
```

Defined capabilities (v1): `plugin:access`, `profile:manage`, `console:access`,
`user:view`, `user:manage`, `plugin:manage`, `tenant:view`, `tenant:configure`,
`health:view`, `activity:view`, `role:assign`.

## 1.5.0

**New surface: `sdk.env`** (plugin-scoped environment variables, RFC 0018 / Task
0.5.22). Experimental — not covered by the v1 stability guarantee.

- `sdk.env.get(key)` reads the calling plugin's `SV_PLUGIN_<SLUG>_<KEY>` env
  var, determined from the `x-sovereign-plugin-id` header that the runtime
  middleware injects. Returns `null` when absent or called outside a plugin
  route. Server-side only (uses `next/headers`).
- For build-scope (`NEXT_PUBLIC_SV_PLUGIN_*`) vars, read `process.env` directly
  in client components — Next.js inlines NEXT*PUBLIC*\* at build time.
- Variables are declared in the manifest `env` field (`@sovereignfs/manifest`
  ≥ 0.12.0). The platform namespaces and validates them at generate time.

## 1.4.0

**New surface: `sdk.portability`** (user data export/import, RFC 0007 / Task
0.5.14). Experimental — not covered by the v1 stability guarantee.

- `sdk.portability.provideExport(resolver)` / `provideImport(handler)` let a
  plugin contribute its slice of a user's data to export and accept it back on
  import. Runtime-mediated: the runtime supplies the user/tenant context, so a
  plugin only ever touches the current user's own data. Both are async (they
  read the calling plugin's id from the request context).
- New exported types: `ExportContext`, `ImportContext`, `PluginExportSection`,
  `ExportResolver`, `ImportHandler`.
- Requires the manifest `data:export` / `data:import` permissions
  (`@sovereignfs/manifest` ≥ 0.11.0).

## 1.3.1

**Fix: host registration is now shared across Next.js bundles.**

- The registered platform host (`provideHost()`) is stored on `globalThis` under
  a `Symbol.for` key instead of a module-level variable. Next.js compiles
  instrumentation, route handlers, and server actions into separate bundles
  (and dev HMR re-evaluates modules), so a module-level singleton could read
  `null` in one bundle while set in another — causing host-backed calls from
  plugin server actions (e.g. `sdk.activity.log()`) to throw "no runtime host is
  registered" even though the runtime had registered it. No API change.

## 1.1.0

**Types-first contract — zero runtime dependencies** (RFC 0023, Task 0.5.20).

- The published package no longer depends on `@sovereignfs/db` or
  `@sovereignfs/mailer`. Platform implementations are **host-provided**: the
  Sovereign runtime registers them at startup via `provideHost()`, so the SDK
  itself has no platform internals to bundle.
- New export: `provideHost(host: SdkHost)` / `SdkHost` type — for the runtime;
  plugin code does not call this.
- Calling `sdk.db`, `sdk.mailer`, or `sdk.platform` outside the runtime (no
  host registered) now throws `"@sovereignfs/sdk: no runtime host is
registered"` with a clear message.
- No change to the plugin-facing API. The stable surface (`auth`, `db`,
  `mailer`, `platform`) is identical to 1.0.0.

## 1.0.0

**Stable release.** The v1 SDK surface is now covered by the semver guarantee:
patch = no breaking changes, minor = additive only, major = breaking with a
migration guide.

- **Stable:** `sdk.auth` (`getSession`, `requireSession`, `changePassword`,
  `listSessions`, `revokeSession`, `signOut`), `sdk.db` (`getClient`),
  `sdk.mailer` (`send`), `sdk.platform` (`getConfig`), plus the exported types
  and errors.
- **Experimental / reserved** (declared, throw `NotImplementedError`, not
  covered by the guarantee): `sdk.data` (RFC 0002), `sdk.activity` (RFC 0005),
  `sdk.storage`, `sdk.notifications`, `sdk.events`.
- npm distribution as a dependency-free typed contract is finalised in Task
  0.5.20 (RFC 0023).

### Surface as it grew to 1.0.0 (pre-1.0 history)

- `sdk.auth.signOut()` (0.9.0) — self sign-out (AUTH-02).
- `sdk.db.getClient()` (0.7.0) — live platform Drizzle client.
- `sdk.auth.changePassword`/`listSessions`/`revokeSession` (0.6.0) — Account
  Security.
- `sdk.platform.getConfig()`, `sdk.mailer.send()`, `sdk.auth.getSession()` /
  `requireSession()` — initial implemented surface.
