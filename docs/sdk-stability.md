---
docSection: app-developers
docType: policy
audiences:
  - app-developer
  - contributor
---

# SDK stability & semver policy

`@sovereignfs/sdk` is the **only** contract between a plugin and the Sovereign
platform. From **v1.0.0** it is a stable, semver-governed public API: plugin
authors can depend on it without fear of silent breakage. This document defines
what "stable" means and which parts of the surface the guarantee covers.

## Semver policy (NFR-04)

`@sovereignfs/sdk` follows [Semantic Versioning](https://semver.org):

| Bump                | Means                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| **patch** (`1.0.x`) | Bug fixes and internal changes. **No breaking changes, ever.**                         |
| **minor** (`1.x.0`) | **Additive only** — new methods/types/fields. Existing code keeps working.             |
| **major** (`x.0.0`) | Breaking changes, accompanied by a migration guide in [`docs/upgrade.md`](upgrade.md). |

The same discipline applies to `@sovereignfs/ui` (the design system is also a
published plugin contract). Changes are recorded in each package's
`CHANGELOG.md`.

## What the guarantee covers

**Stable surface** — covered by the semver guarantee above:

- `sdk.auth` — session and account (`getSession`, `requireSession`,
  `changePassword`, `listSessions`, `revokeSession`, `signOut`,
  `hasCapability(session, capability)`).
- `sdk.db` — the Drizzle client for this plugin's database (`getClient`). Returns
  the platform DB for `shared` plugins (the default) and a dedicated Drizzle
  instance for `isolated` plugins — transparent to the caller. See
  [`docs/plugin-database.md`](plugin-database.md).
- `sdk.mailer` — transactional email (`send`).
- `sdk.platform` — instance configuration (`getConfig`).

Plus the exported types (`Session`, `SessionUser`, `ActiveSession`,
`ChangePasswordInput`, `MailOptions`, `PlatformConfig`, `DrizzleClient`, …) and
errors (`NotAuthenticatedError`, `NotImplementedError`, `ConsentRequiredError`).

## What is NOT covered (experimental / reserved)

These surfaces are **experimental** — they are implemented and usable, but their
shape may still change before v1.0.0 stable. Changes follow the same
minor/major bump discipline as stable surfaces, but an additive change
(e.g. a new field on a callback argument) may ship without a minor bump in this
group during the pre-v1 hardening period:

- `sdk.data` — consent-gated cross-plugin data sharing (RFC 0002).
- `sdk.activity` — activity log (RFC 0005).
- `sdk.portability` — user data export/import (RFC 0007, `data:export`/`data:import` permissions).
- `sdk.env` — plugin-scoped environment variable accessor (RFC 0018). `sdk.env.get(key)` reads `SV_PLUGIN_<SLUG>_<KEY>` scoped to the calling plugin; server-side only.
- `sdk.notifications` — Notification Center (RFC 0015). `sdk.notifications.send()` delivers in-app notifications to users; requires the `notifications:send` manifest permission. Polling default (30s), SSE optional.
- `sdk.directory` — member search and explicit user resolution for display-safe user selection (RFC 0041).
- `sdk.secrets` — encrypted runtime-created plugin secrets (RFC 0043). Values are server-side only; list/export surfaces expose metadata only.
- `sdk.crypto` — server-side field encryption (RFC 0092, `crypto:use` permission). `encryptField()`/`decryptField()` under per-(sensitivity class × plugin) keys; whether a class is actually encrypted is operator policy (`SOVEREIGN_ENCRYPT_CLASSES`), and plugin code stays policy-agnostic via the `svf0` passthrough envelope. Distinct from `sdk.e2ee`: the runtime can decrypt these fields.
- `sdk.storage` — plugin-scoped binary object storage (RFC 0044). Local filesystem storage is implemented; future backends may expand the host implementation without changing plugin calls.
- `sdk.connections` — external provider connection metadata, OAuth state helpers, and server-side effective provider config reads (RFC 0049). Credential values remain in `sdk.secrets`; Account/Console surfaces expose metadata only.
- `sdk.events` — ephemeral realtime channels (RFC 0045, `events:publish`).
  `publish()` only: clients subscribe through a runtime route
  (`GET /api/events/stream`), not an SDK call. Best-effort and not persisted —
  not a durable queue, an inbox (`sdk.messages`), or an audit log
  (`sdk.activity`).
- `sdk.jobs` — background jobs and schedules (RFC 0046, `jobs:write`). `type`
  must match an entry in the manifest's `jobs` array; the handler is wired
  through that entry's module rather than a runtime `register()` call.
- `sdk.tools` — platform-mediated tool contracts (RFC 0047), the write/action
  counterpart to `sdk.data`. A provider declares tools in its manifest
  (`tools:provide`) and registers `preview`/`execute` handlers; a caller needs
  `tools:call`. Mutating or external effects go through a confirmation token.
- `sdk.messages` — Message Inbox (RFC 0048, `messages:send`). Send-only by
  design: plugins never read a user's inbox.
- `sdk.email` — user-scoped email (RFC 0062, `mailer:send`), the safer
  alternative to `sdk.mailer.send()`. The platform resolves a `recipientUserId`
  to an address and applies delivery policy, rate limits, and audit logging
  server-side, so a plugin never handles the address itself.
- `sdk.webhooks` — helpers for a public plugin webhook route's own handler
  (RFC 0050). The manifest's `webhooks` field declares metadata only — path,
  methods, body-size cap; verifying the request stays the handler's job.
- `sdk.handoffs` — platform-mediated flow handoffs (RFC 0053,
  `handoffs:send`/`handoffs:receive`): a signed, short-lived payload letting one
  plugin start or continue a user-facing flow in another.
- `sdk.authz` — plugin-scoped roles and resource-scoped grants (RFC 0054), the
  middle ground between coarse platform capabilities
  (`sdk.auth.hasCapability`) and a plugin inventing its own table. Grants live
  in the owning plugin's storage; the platform never persists them, and they are
  never injected into the session capability header.
- `sdk.plugins` — opaque cross-plugin record references (RFC 0051). Exposes
  install/enable state and contract summaries, never another plugin's private
  data.
- `sdk.e2ee` — client-side encryption profile persistence (RFC 0060). Server-side
  plumbing only: the content master key is generated and wrapped in the browser
  (`@sovereignfs/sdk/e2ee-crypto`, `.../e2ee-device`), and the server only ever
  stores opaque material. This is the surface Account and Wallet use, and the
  one place the runtime genuinely cannot decrypt — unlike `sdk.crypto`.
- `sdk.id` — random ID generation. The one surface with no host indirection: it
  runs inside the SDK on Web Crypto, so it works without a registered host.
- `sdk.device` — surface detection (RFC 0080): `getSurface()`/`getShellVersion()`/`isNativeShell()` (server, main barrel) and `useDeviceEnvironment()`/`readEnvironment()` (client, `@sovereignfs/sdk/device-client` subpath). A presentation hint only, never a security boundary — see `docs/architecture-rules.md`. The device **bridge** capability contract (RFC 0083) — `provideBridge()`, `BridgeImpl`, `DeviceResult` — lives on a separate `@sovereignfs/sdk/device-bridge` subpath, deliberately React-free so `@sovereignfs/bridge` can import it without pulling React into its own zero-dependency build. The plugin-facing capability surface — `supports()`, `getTransport()`, `getShellInfo()`, `isDeviceOnlyTierAvailable()`, `haptics.impact()`, `nativeNotifications.{getPermission,requestPermission,show}()`, `biometrics.confirm()`, `secureStorage.{get,set,remove,keys,clear}()` — lands in `device-client.ts` (workstream 0003 leg 2; `biometrics`/`secureStorage` added later, RFC 0083/RFC 0093). Needs the `device:haptics`/`device:notifications`/`device:biometrics`/`device:secureStorage` manifest permissions; those are install/review-time metadata and a consent-prompt input, not an enforced boundary — client-side plugin identity is self-declared. `secureStorage` is the one exception worth naming: its own hardware-backed device-auth gate (Keychain/Keystore or WebAuthn PRF) is real even though the plugin-id attribution around it is not — same posture as `biometrics.confirm()`. See `docs/plugin-development.md`'s permission table for the full caveat.

One surface is **reserved**: it exists as a stub that throws
`NotImplementedError` rather than failing quietly, and its shape may change
before it ships.

- `sdk.billing` — plugin monetization (RFC 0003). `getEntitlement(pluginId)` and
  `requireEntitlement(pluginId)` are exported as stubs; `EntitlementRequiredError`
  is exported. The platform's own paywall gating (middleware redirect + license
  token import) does not require calling `sdk.billing` directly — it is available
  for plugins that want to do entitlement-aware rendering inside a partially-gated
  surface.

When one of these is implemented, it graduates into the stable surface with a
**minor** release (additive), and this document is updated.

## Distribution

`@sovereignfs/sdk` is a **types-first contract** with **zero runtime
dependencies**. Implementations are host-provided by the Sovereign runtime at
startup (`runtime/instrumentation.ts` registers them via `provideHost()`); when
the SDK is called from a composed plugin route, the host's copy always executes,
not the caller's installed copy.

This means:

- A standalone plugin repo can install `@sovereignfs/sdk` as a devDependency
  and type-check against its surface without pulling in platform-internal
  packages (`@sovereignfs/db`, `@sovereignfs/mailer`, etc. — those stay
  `private` and are never bundled into the published SDK).
- The SDK's methods are not meaningful outside the runtime. Calling them from a
  process with no registered host throws `"@sovereignfs/sdk: no runtime host is
registered"`. The dev/test loop is always runtime-hosted.

See `docs/plugin-development.md` → [Plugin isolation boundary](#plugin-isolation-boundary)
for the full authoring ✅ / build ❌ / run ❌ table.

## Published packages summary

Four packages from this monorepo are published to npm:

| Package                      | Purpose                                                                           | Policy                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@sovereignfs/sdk`           | Plugin↔platform contract (types)                                                  | Strict semver (this document)                                                                     |
| `@sovereignfs/ui`            | Design system (components + tokens)                                               | Same strict semver as SDK (NFR-04)                                                                |
| `@sovereignfs/create-plugin` | CLI scaffolding tool                                                              | Semver; CLI tools follow patch/minor/major but have no library compatibility obligation           |
| `@sovereignfs/bridge`        | Device bridge implementation (RFC 0083 — transports, protocol, shell-side helper) | Same strict semver as SDK (NFR-04) — `sovereign-mobile`/`sovereign-desktop` depend on it directly |

`@sovereignfs/create-plugin` is invoked via `npm create @sovereignfs/plugin`.
It is a dev tool, not a runtime library — plugin code never imports it, so
breaking changes follow standard semver without the additional "patch must
never break" constraint that applies to sdk and ui.
