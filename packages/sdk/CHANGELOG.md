# Changelog

All notable changes to `@sovereignfs/sdk` are documented here. The package
follows [Semantic Versioning](https://semver.org); see
[`docs/sdk-stability.md`](../../docs/sdk-stability.md) for the stability policy
and which parts of the surface the guarantee covers.

## 1.47.0

**`sdk.env.get()` now works from a job/schedule handler**, found implementing
`sovereign-plugin-travellog`'s T.20 (RFC 0018/0046) — the identical
background-invocation gap `1.46.0`'s `sdk.storage` fix closed, just never
generalized to `env`. Previously, calling `sdk.env.get()` outside a real
Next.js request (i.e. from an `sdk.jobs`/`sdk.schedules` handler) threw,
because `env.get()` called `next/headers()` directly with no fallback.

- **Breaking for host implementers only** (not for plugin authors calling
  `sdk.env.get()`, whose call signature and return type are unchanged): the
  `SdkHost` interface gains a new required `env.get(key, pluginId)` member.
  A custom host implementation that constructs a `provideHost()` argument
  without an `env` property will fail to type-check. The platform's own
  `runtime/src/sdk-host.ts` already implements it, falling back through the
  same portability/background-plugin contexts `sdk.db.getClient()`/
  `sdk.storage` use.
- Unlike `sdk.storage`, `sdk.env.get()` still returns `null` (rather than
  throwing) when no plugin id is resolvable from the request header, the
  portability context, or the background-invocation context — preserving
  its existing documented "outside a plugin route context → `null`" contract.

## 1.46.0

**`sdk.storage` now works from a job/schedule handler**, found and fixed
building `sovereign-plugin-travellog`'s Swarm importer (RFC 0044/0046).
Previously, calling any `sdk.storage.*` method outside a real Next.js
request (i.e. from an `sdk.jobs`/`sdk.schedules` handler) threw, because
`storageContext()` called `next/headers()` directly with no fallback —
`sdk.db.getClient()` already had this fallback via a background-invocation
context; `sdk.storage` didn't.

- **Breaking for host implementers only** (not for plugin authors calling
  `sdk.storage.*`, whose call signatures are unchanged): `StorageContext.pluginId`
  widens from `string` to `string | null`. A custom `HostImplementations.storage`
  implementation that assumed `context.pluginId` is always a string must now
  handle `null` (the platform's own `runtime/src/sdk-host.ts` already does,
  resolving it via the same background-plugin fallback `sdk.db.getClient()`
  uses, and throwing its own clear error if no plugin id is resolvable at all).
- `sdk.storage.put()`'s `ownerUserId` ownership check still has no
  background-context fallback for user identity — `JobContext` carries a
  plugin id, never a user id, so an object uploaded with `ownerUserId` set
  remains unreadable from a job/schedule handler. See
  `docs/architecture-rules.md` (platform repo) for the full guidance: omit
  `ownerUserId` on any object a background handler will read back.

## 1.17.0

**Provider config read helper** (Task 3.27). Experimental.

- `sdk.connections.getProviderConfig(provider)` returns the calling plugin's
  effective server-side provider config.
- Effective config merges plugin-scoped runtime env vars with Console-managed
  provider config. Console-managed values take precedence.
- New exported types: `ProviderConfig` and `ProviderConfigSource`.

Secret values are returned only to server-side plugin code in the calling
plugin's request context. Console/API reads expose metadata only.

## 1.15.0

**New surface: `sdk.secrets`** (RFC 0043 / Task 8.6). Experimental.

- `sdk.secrets.create({ scope, label, value, metadata? })` stores a runtime-created
  plugin secret in the platform vault.
- `sdk.secrets.get(id)` returns the plaintext value to server-side plugin code only.
- `sdk.secrets.list(scope?)` returns metadata-only `SecretRef` rows.
- `sdk.secrets.update(id, value)` rotates the stored value.
- `sdk.secrets.delete(id)` revokes future reads.

Secret values are encrypted by the runtime, scoped to the calling plugin and
current user where applicable, never exported, and never returned by list calls.

## 1.14.0

**New surface: `sdk.directory`** (RFC 0041 / Task 1.12). Experimental.

- `sdk.directory.searchUsers({ query, limit? })` searches active users in the
  current tenant by display name or email.
- `sdk.directory.resolveUsers({ ids })` resolves explicit stored user IDs to
  display-safe profile rows for active users.
- New exported types: `DirectoryUser`, `SearchUsersInput`, and `ResolveUsersInput`.

The directory returns only `{ id, email, name, image }`. It excludes inactive
users, roles, capabilities, session state, MFA state, test-user flags, and
admin-only metadata. Search requires at least two characters and is capped to 20
results by default, 50 maximum.

## 1.11.0

**`PlatformConfig.brandName` and `brandPrimaryColor` renamed** (RFC 0032 / Task 0.9.0).

`PlatformConfig` field names updated:

- `brandName` → `instanceName`
- `brandPrimaryColor?` → `instancePrimaryColor?`

Update calls to `sdk.platform.getConfig()` to use the new names. See `docs/upgrade.md` for a migration snippet.

## 1.10.0

**`sdk.platform.getConfig()` returns branding fields** (RFC 0027 Phase 1 / Task 1.0.03).

`PlatformConfig` gains two new fields:

- `brandName: string` — the operator-configured display name; falls back to `tenantName`.
- `brandPrimaryColor?: string` — validated 6-digit hex accent colour or `undefined`.

Additive change — no migration required.

## 1.9.0

**`sdk.db.getClient()` routes isolated plugins to their dedicated store** (RFC 0004 / Task 0.8.02).

The public API is unchanged — plugins still call `await sdk.db.getClient()` with no
arguments. Internally, the SDK reads the `x-sovereign-plugin-id` request header (set
by the runtime middleware) and the runtime host returns either the platform DB (for
`database: "shared"` plugins, the default) or a dedicated Drizzle instance (for
`database: "isolated"` plugins). Plugin code requires no changes to adopt isolation —
only the manifest `"database": "isolated"` field is needed.

**`SdkHost` interface change (internal):** `SdkHost.db.getClient` signature changes from
`() => Promise<DrizzleClient>` to `(pluginId: string | null) => Promise<DrizzleClient>`.
This only affects the runtime's host implementation; plugin code and the public
`sdk.db.getClient()` API are unchanged.

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

## 1.16.0

**New surface: `sdk.connections`** (external provider connections, RFC 0049 /
Task 3.19). Experimental — not covered by the v1 stability guarantee.

- `sdk.connections.create/list/get/update/disconnect/markUsed/markError`
  manages platform-owned, metadata-only external connection records scoped to
  the calling plugin, tenant, user, and provider.
- Credential material stays in `sdk.secrets`; connection rows store only
  metadata and secret references.
- `createOAuthState` and `verifyOAuthState` provide signed, expiry-bound OAuth
  state helpers for server-side callback validation.

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
