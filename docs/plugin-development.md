---
docSection: app-developers
docType: guide
audiences:
  - app-developer
---

# Plugin development

This guide is for building a Sovereign plugin. A plugin is a self-contained app
— Next.js App Router routes plus an optional database schema — that the platform
composes into the runtime at build time and serves under a URL prefix you
choose. Plugins talk to the platform **only** through the SDK
(`@sovereignfs/sdk`); they never import runtime internals.

If you are deploying an instance rather than building a plugin, see
[self-hosting.md](self-hosting.md). For the platform internals, see
[architecture.md](architecture.md).

## Getting started

Three ways to scaffold a new plugin from the canonical skeleton:

### 1. `sv plugin new` — inside a Sovereign monorepo checkout

```bash
pnpm sv plugin new io.example.my-plugin
# Options:
#   --name <name>         Display name (default: derived from ID)
#   --description <text>  Short plugin description
#   --route <prefix>      Route prefix, e.g. /my-plugin (default: /<last-id-segment>)
#   --out <dir>           Parent directory (default: ./plugins)
```

Creates `plugins/io.example.my-plugin/` with the canonical skeleton and uses
`workspace:*` / `catalog:` references so the plugin is immediately runnable
with `pnpm dev`.

### 2. `npm create @sovereignfs/plugin` — standalone plugin repository

```bash
npm create @sovereignfs/plugin
# or: pnpm create @sovereignfs/plugin
# or: yarn create @sovereignfs/plugin
```

Interactive: asks for plugin ID, display name, description, and route prefix.
Creates a directory in the current folder with the same skeleton, but using
`latest` npm references for all dependencies. Commit the directory, push to
GitHub, then install it in your Sovereign instance via `sv plugin add`.

### 3. GitHub template repository

Fork [`sovereignfs/sovereign-plugin-template`](https://github.com/sovereignfs/sovereign-plugin-template)
to create a pre-wired plugin repository with the same skeleton and a CI
workflow. Edit the manifest, implement your `app/page.tsx`, then install with
`sv plugin add <your-repo-url>`.

### Example plugins

Reference plugins serve as both documentation and runtime test fixtures. They
live in-repo under [`example-plugins/`](../example-plugins/README.md), tracked
in git — browse that directory for fully-working code to adapt. (An earlier
plan moved them to a separate `sovereign-plugins-examples` repository; that was
reversed on 2026-08-01 — see `docs/epics/example-plugins.md`'s correction
note.) They're **not** part of the default bundle: `example-plugins/` is only
composed into the build when `SOVEREIGN_EXAMPLES_ENABLED` is set, and even then
hidden by default per-instance until shown from the Console — see
[Reference example plugins](self-hosting.md#reference-example-plugins):

| Plugin ID                             | Route                     | What it shows                                                                                                                                                             |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs.sovereign.example-basic`          | `/example-basic`          | Session reading, `@sovereignfs/ui`, CSS tokens, plugin-declared capabilities                                                                                              |
| `fs.sovereign.example-overlay-small`  | `/example-overlay-small`  | `shell: "overlay"` with `overlaySize: "sm"`                                                                                                                               |
| `fs.sovereign.example-overlay-medium` | `/example-overlay-medium` | `shell: "overlay"` with `overlaySize: "md"`                                                                                                                               |
| `fs.sovereign.example-overlay-large`  | `/example-overlay-large`  | `shell: "overlay"` with `overlaySize: "lg"`                                                                                                                               |
| `fs.sovereign.example-minimal`        | `/example-minimal`        | `shell: "minimal"` chrome-free/fullscreen composition                                                                                                                     |
| `fs.sovereign.example-api`            | `/example-api`            | API provider serve-route pattern (PLT-16)                                                                                                                                 |
| `fs.sovereign.example-monetized`      | `/example-monetized`      | Monetization manifest field, Ed25519 license gating, paywall flow (RFC 0003)                                                                                              |
| `fs.sovereign.example-mobile`         | `/example-mobile`         | `@sovereignfs/ui`'s PWA/mobile layout: responsive breakpoint fork, swipeable carousel                                                                                     |
| `fs.sovereign.example-mobile-poc`     | `/example-mobile-poc`     | Stability evaluation for `MobileHeader`/`MobileFooter`/`SwipableMobileCarousel` ahead of the runtime shell's own adoption (task 9.24) — navigation/UI only, no data layer |
| `fs.sovereign.example-encrypted`      | `/example-encrypted`      | App-level field encryption (RFC 0092): classified schema, seal/open, blind-index search, table registration, plaintext export                                             |
| `fs.sovereign.example-device-only`    | `/example-device-only`    | `offline: "device-only"` tier (RFC 0093): `DeviceOnlyGate`/`DeviceStorageKeyGate`, encrypted notes, unlock-session status/lock control                                    |

To develop against them locally, set `SOVEREIGN_EXAMPLES_ENABLED=1` in your
`.env` before `pnpm dev` — `scripts/generate-registry.ts` then composes
`example-plugins/` alongside `plugins/`, with the same copy-on-change dev
watcher as any other plugin. See [Sovereign repositories](repositories.md) for
the full first-party repository map.

The `example-monetized` plugin ships with a committed demo keypair and a
pre-signed token, so you can test the paywall → import → access flow immediately
without any billing setup. See [Testing monetization locally](#testing-monetization-locally)
for the step-by-step instructions.

## How plugins work

- **Native runtime.** A v1 plugin is plain Next.js App Router code (server
  components, route handlers, server actions, client components). No iframes, no
  separate process.
- **Build-time composition.** The generate step copies your plugin's `app/`
  tree into the runtime's App Router under your manifest's `routePrefix`, so your
  routes render inside the platform shell (sidebar, auth, theming) with zero
  wiring. The copies are generated and git-ignored — your `plugins/<id>/app/` is
  always the source of truth.
- **The SDK is the only contract.** Auth, database, email, and platform config
  come from `@sovereignfs/sdk`. The design system comes from `@sovereignfs/ui`.
  Importing from `runtime/src` is forbidden and enforced by ESLint.

## Plugin isolation boundary

What a plugin can do **in isolation** (without a full platform checkout):

| Stage                     | Isolated? | Why                                                                                                         |
| ------------------------- | :-------: | ----------------------------------------------------------------------------------------------------------- |
| Author / edit             |    ✅     | Write TypeScript/TSX against `@sovereignfs/sdk` + `@sovereignfs/ui` types.                                  |
| Type-check / lint         |    ✅     | `tsc --noEmit` / ESLint need only those types — no platform internals required.                             |
| Build as a standalone app |    ❌     | A plugin's `app/` is a route-group **fragment** with no root layout, no `next.config`, no shell.            |
| Run / test                |    ❌     | Needs the host: middleware-injected headers (`getSession`), `getPlatformDb`, the auth server, shell chrome. |

**Authoring in a standalone repo:** Install `@sovereignfs/sdk` and `@sovereignfs/ui` as devDependencies for types. The SDK is a types-first contract — its implementations are host-provided by the Sovereign runtime when your plugin routes execute. The published package has zero runtime dependencies on platform internals.

**The dev/test loop is always runtime-hosted.** Use `sv plugin add <repo>` or `sovereign.plugins.json` to run your plugin inside a platform checkout, then `pnpm dev`. There is no standalone `next build` or `next dev` path for a plugin. See [Local development](#local-development) below.

## File structure

A plugin lives in one directory. Minimal shape (modelled on the built-in
`account` plugin):

```
my-plugin/
  manifest.json          # required — identity, routing, capabilities, version (see below)
  package.json           # name, deps (react, @sovereignfs/sdk, @sovereignfs/ui) — version stays "0.0.0", unused
  icon.svg               # optional — sidebar/launcher icon (monogram generated if absent)
  app/                   # composed into the runtime at your routePrefix
    page.tsx             #   → <routePrefix>/
    layout.tsx           #   optional plugin-level layout
    actions.ts           #   'use server' actions
    settings/page.tsx    #   → <routePrefix>/settings
    _components/         #   private components (underscore = not a route)
    _lib/                #   private helpers/tests
    my-plugin.module.css #   CSS Modules + design tokens
  db/
    schema.ts            # optional — Drizzle tables (slug-prefixed, see Database)
```

Anything under `app/` that isn't an underscore-prefixed folder becomes a route
relative to your `routePrefix`. `routePrefix: "/tasks"` + `app/lists/page.tsx`
serves at `/tasks/lists`.

## Manifest reference

`manifest.json` is validated at build time against a strict schema
(`packages/manifest`); unknown keys fail the build. Every field:

| Field                  | Type                                                    | Required                             | Description                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`        | integer                                                 | yes                                  | Manifest format version. Currently `1`.                                                                                                                                                                                                                                                                    |
| `id`                   | string                                                  | yes                                  | Globally-unique reverse-DNS id, e.g. `io.example.tasks`. Also the install directory name.                                                                                                                                                                                                                  |
| `name`                 | string                                                  | yes                                  | Human-readable name shown in the sidebar and Launcher.                                                                                                                                                                                                                                                     |
| `version`              | string                                                  | yes                                  | Plugin version (semver recommended). This is the **only** version the platform reads — the runtime, registry, and export/portability code all key off it. Your `package.json`'s `version` field is unrelated tooling metadata; leave it at `"0.0.0"` and never bump it.                                    |
| `description`          | string                                                  | no                                   | Short description.                                                                                                                                                                                                                                                                                         |
| `type`                 | `platform` \| `sovereign` \| `community`                | yes                                  | Origin/trust tier (see below).                                                                                                                                                                                                                                                                             |
| `runtime`              | `native`                                                | yes                                  | Execution model. v1 plugins use `native`. Other runtime models are planned but are not accepted manifest values until implemented.                                                                                                                                                                         |
| `routePrefix`          | string starting with `/`                                | yes                                  | URL prefix the plugin serves under, e.g. `/tasks`. The single source of truth for the plugin's URL.                                                                                                                                                                                                        |
| `permissions`          | array of permission strings                             | yes (may be `[]`)                    | SDK capabilities the plugin declares (see below).                                                                                                                                                                                                                                                          |
| `shell`                | `default` \| `minimal` \| `overlay`                     | no                                   | Presentation mode. `default` = full page under the platform sidebar; `overlay` = dialog over the current page (see below); `minimal` = chrome-free, full-bleed (see below).                                                                                                                                |
| `shellConfig`          | object (see below)                                      | no                                   | Per-shell tuning. Holds `overlaySize` (`sm` \| `md` \| `lg`, default `lg`) for `shell: overlay` plugins, and `mobileHeader`/`mobileFooter` (booleans, default `true`) for `shell: default` plugins (RFC 0075). Each field is only valid for its own `shell` value.                                         |
| `adminOnly`            | boolean                                                 | no (default `false`)                 | When `true`, only `platform:admin` users may reach the plugin's routes (403 otherwise).                                                                                                                                                                                                                    |
| `minVerificationLevel` | `0` \| `1` \| `2` \| `3`                                | no (default `0`)                     | Minimum progressive verification level (RFC 0035) a user needs to reach this plugin's routes: `0` registered, `1` email_verified, `2` mfa_enrolled, `3` admin_vouched. Enforced at the plugin route boundary — see the worked example below.                                                               |
| `apiProvider`          | boolean                                                 | no (default `false`)                 | When `true`, the plugin serves the public `/api/*` namespace (PLT-16). One provider per instance — see below.                                                                                                                                                                                              |
| `publicRoutes`         | array (see below)                                       | no                                   | Manifest-declared public page routes (RFC 0042). Each entry exempts a path prefix — relative to `routePrefix` — from the session-redirect gate; the plugin owns authorization for the exempted paths.                                                                                                      |
| `webhooks`             | array (see below)                                       | no                                   | Manifest-declared public webhook endpoints (RFC 0050) — unauthenticated machine-to-machine ingress, distinct from `publicRoutes`' human-facing pages. Each entry is one exact endpoint with method/body-size limits enforced before your handler runs.                                                     |
| `public`               | boolean                                                 | no (default `false`)                 | Marks the whole plugin as public — no auth requirement at all (RFC 0089). Requires `shell: "minimal"` explicitly; cannot combine with `adminOnly`, a paid `monetization.model`, or `publicRoutes`. See below.                                                                                              |
| `offline`              | boolean (see below)                                     | no (default `false`)                 | Marks the plugin's bare `routePrefix` page as its one offline-capable entry point (RFC 0074, flattened by RFC 0078 from the original `offline.routes[]`/`offline.root` object shape). Grants no auth exemption; the route must render a user-neutral shell and hydrate data client-side via `sdk.offline`. |
| `installable`          | boolean (see below)                                     | no (default `false`)                 | Lets the plugin be installed from a browser as its own home-screen app, scoped to `routePrefix`, via a dedicated manifest at `/api/manifest/<id>` (RFC 0081). Deliberately independent of `offline` — see below.                                                                                           |
| `icons`                | object (see below)                                      | no                                   | Author-supplied raster icon set (RFC 0081) — overrides the platform's auto-generated icons for `installable: true`, per variant (`png192`/`png512`/`maskable512`), for a glyph that rasterizes poorly. `installable: true` requires `icon` or `icons`.                                                     |
| `surfaces`             | array of `browser` \| `mobile` \| `desktop` (see below) | no (default: every surface)          | Surfaces this plugin is available on (RFC 0080). Filters Launcher/sidebar/mobile-drawer presentation only — not a security boundary.                                                                                                                                                                       |
| `example`              | boolean                                                 | no (default `false`)                 | Marks the plugin as a bundled reference/example. Classification only — no effect on routing or permissions. Example plugins are hidden by default and shown via the Console → Settings → Example plugins toggle; each can also be toggled individually on the Plugins page.                                |
| `development`          | boolean                                                 | no (default `false`)                 | Marks the plugin as still under active development — not yet ready for production use. Classification only, like `example`: no effect on routing, access policy, or the enable/disable default. Surfaced as a warning badge on the Console Plugins page and on the plugin's Launcher tile.                 |
| `icon`                 | string                                                  | no                                   | Path to an SVG icon relative to the plugin root. A monogram is generated if omitted.                                                                                                                                                                                                                       |
| `compatibility`        | object (see below)                                      | yes                                  | Platform version constraints. Hard-gates install/boot on `minPlatformVersion`; surfaces an advisory warning in Console/health when the platform exceeds the optional `maxPlatformVersion`.                                                                                                                 |
| `data`                 | object (see below)                                      | no                                   | Cross-plugin data sharing declarations (RFC 0002). Declare the contracts this plugin exposes (`data.provides`) and the ones it reads (`data.consumes`). Requires the matching `data:provide` / `data:consume` permissions.                                                                                 |
| `tools`                | array (see below)                                       | no                                   | Platform-mediated tool contracts (RFC 0047) — the write/action counterpart to `data`. Each entry declares a name, effect class, and input schema; the actual `preview`/`execute` handlers are registered at runtime via `sdk.tools.provide()`. Requires the `tools:provide` permission.                    |
| `env`                  | object (see below)                                      | no                                   | Plugin-scoped environment variable declarations (RFC 0018). Keys are auto-namespaced to `SV_PLUGIN_<SLUG>_<KEY>`; read them via `sdk.env.get('KEY')` in server code.                                                                                                                                       |
| `capabilities`         | object (see below)                                      | no                                   | Plugin-declared capabilities (RFC 0022). Each key is a local name auto-namespaced to `<pluginId>:<capName>`; enforce access inside the plugin via `sdk.auth.hasCapability`.                                                                                                                                |
| `schedules`            | array (see below)                                       | no                                   | Recurring background schedules (RFC 0046 Phase 1). Each entry names a server-side handler module inside `app/` that the platform's in-process scheduler invokes every `intervalMinutes` while the plugin is enabled.                                                                                       |
| `jobs`                 | array (see below)                                       | no                                   | Background job type declarations (RFC 0046). Each entry names a server-side handler module inside `app/` that the platform's job worker invokes whenever a `sdk.jobs.enqueue()`/`schedule()` call for that `type` becomes due. Coexists with `schedules` — see below for when to use each.                 |
| `events`               | array (see below)                                       | no                                   | Realtime channel authorization declarations for `sdk.events` (RFC 0045). Each entry names a server-side handler module inside `app/` that decides whether a subscribing user may receive events on a matching channel pattern.                                                                             |
| `connections`          | object (see below)                                      | no                                   | External provider connection declarations (RFC 0049). Lists OAuth/connect-account providers and callback paths for platform-visible connection metadata.                                                                                                                                                   |
| `monetization`         | object (see below)                                      | no                                   | Monetization model (RFC 0003). Declares the billing model, tiers, and the author's Ed25519 public key for offline license verification. Only `sovereign`/`community` plugins may declare this.                                                                                                             |
| `repository`           | string (URL)                                            | required for `sovereign`/`community` | Git repository URL. Required unless `type` is `platform`.                                                                                                                                                                                                                                                  |

### Future runtime models

The platform currently accepts only `runtime: "native"` in `manifest.json`.
Earlier design documents reserve `static`, `iframe-local`, `iframe-remote`, and
`external` as future runtime models, but those values intentionally fail
manifest validation until the corresponding runtime support ships.

### `type`

- `platform` — built-in plugins that ship in this monorepo (Console, Launcher,
  Account). No `repository` required.
- `sovereign` — first-party plugins maintained by the project, installed from
  their own repos. `repository` required.
- `community` — third-party plugins. `repository` required.

### `permissions`

Declared SDK capabilities. The v1-functional ones:

| Permission            | Declares                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `auth:session`        | Read the current session via `sdk.auth`.                                                       |
| `db:readWrite`        | Read/write access to the platform DB via `sdk.db`.                                             |
| `db:readOnly`         | Read-only DB access.                                                                           |
| `mailer:send`         | Send email via `sdk.mailer.send()` or `sdk.email.sendToUser()` (RFC 0062).                     |
| `mailer:sendExternal` | Send email to a raw address (not a platform-resolved user) via `sdk.mailer.send()` (RFC 0062). |
| `data:provide`        | Expose read-only data contracts for other plugins to query (RFC 0002, `sdk.data`).             |
| `data:consume`        | Read data from another plugin's contracts, subject to user consent (RFC 0002, `sdk.data`).     |
| `data:export`         | Participate in a user's data export bundle — `sdk.portability.provideExport()` (RFC 0007).     |
| `data:import`         | Participate in a data import/restore — `sdk.portability.provideImport()` (RFC 0007).           |
| `admin:*`             | Administrative capabilities (platform plugins).                                                |

| `activity:write` | Record activity-log events via `sdk.activity.log()` (RFC 0005). |

| `notifications:send` | Send notifications to users via `sdk.notifications.send()` (RFC 0015). |

| `jobs:write` | Enqueue/schedule/cancel/read background jobs via `sdk.jobs` (RFC 0046). |

| `events:publish` | Publish realtime events via `sdk.events.publish()` (RFC 0045). |

| `events:subscribe` | Declares the plugin's channels are subscribable — a `GET /api/events/stream`/`poll` caller must still pass a manifest-declared `events[]` channel authorizer before actually receiving anything (RFC 0045). |

| `storage:readWrite` | Read/write plugin-scoped binary objects via `sdk.storage` (RFC 0044). |

| `crypto:use` | Server-side field encryption via `sdk.crypto.encryptField()`/`decryptField()` (RFC 0092). |

| `device:haptics` | Use `sdk.device.haptics.impact()` (RFC 0083). |

| `device:notifications` | Use `sdk.device.nativeNotifications.*` (RFC 0083). |

| `device:biometrics` | Use `sdk.device.biometrics.confirm()` (RFC 0083, sovereign-mobile epic task 20.7). |

| `device:secureStorage` | Required for `offline: 'device-only'` (research 0012, RFC 0093). Durable, encrypted, device-auth-gated key/value storage — native Keychain/Keystore key custody + SQLCipher on Capacitor, WebAuthn PRF key custody + OPFS on web. Check availability with `sdk.device.supports('secureStorage')` before relying on it; it reports `false` until a shell's transport actually implements it. Reserved — the backing bridge capability and SDK surface are not implemented yet (workstream 0008 leg 4, epic tasks 20.13/8.20/1.22); declaring it today is accepted metadata only. |

| `handoffs:send` | Create a signed handoff token addressed to another plugin's declared receiver via `sdk.handoffs.create()` (RFC 0053). |

| `handoffs:receive` | Declare `handoffs.receives[]` entries and consume tokens addressed to them via `sdk.handoffs.consume()` (RFC 0053). |

| `tools:provide` | Expose tool contracts other plugins can preview/execute via `sdk.tools.provide()` (RFC 0047). |

| `tools:call` | Preview/execute another plugin's declared tools via `sdk.tools.preview()`/`sdk.tools.execute()` (RFC 0047). |

Reserved (declaring them is allowed; the backing surfaces throw `NotImplementedError` until
implemented): `device:secureStorage`. `e2ee:use` (client-side encryption,
`sdk.e2ee` — RFC 0060) and `crypto:use` (server-side field encryption, `sdk.crypto` —
RFC 0092) are both implemented and deliberately distinct: the runtime _can_ decrypt a
`sdk.crypto` field, and can never decrypt an `sdk.e2ee` object.

**`device:haptics`, `device:notifications`, and `device:biometrics` (RFC 0083)
provide no isolation between plugins — say this to yourself in plain words
before relying on any of them for anything security-sensitive.**
`sdk.device.*` runs entirely in the browser, on the browser-only
`@sovereignfs/sdk/device-client` subpath. There is no server-injected
`x-sovereign-plugin-id` header to trust there (unlike every server-side SDK
surface) — every plugin's client code shares one origin and one JavaScript
context, so any plugin's client code can call
`sdk.device.nativeNotifications.requestPermission('any.plugin.id')` and
claim to be a different plugin entirely. Consequently:

- The manifest declaration is **install/review-time metadata** — a reviewer
  signal and a consent-prompt input, not an enforced grant.
- The per-user device consent grant (visible and revocable in Account →
  Data → "Device app permissions") records _which plugin id asked_, but that
  id is exactly the self-declared, unverifiable one above. Treat it as "what
  this plugin's code told us," not "what this plugin's code is."
- The actual gate on the web transport is the browser's own
  `Notification.permission` — once granted to the instance's origin, _every_
  plugin's client code can call `new Notification(...)` directly, with or
  without going through `sdk.device.nativeNotifications.show()` at all.
- **`biometrics.confirm()` is a partial exception, worth stating precisely
  rather than lumping in wholesale:** the biometric check itself is real —
  the OS genuinely requires the device owner's actual face/fingerprint, no
  plugin can fake that part. What's spoofable is only the _attribution_ —
  which plugin id the consent/audit record credits with having asked. Don't
  read "provides no isolation" as "the confirmation itself is fake"; read it
  as "don't trust which plugin's code claims to have triggered it."

This is the same posture RFC 0080 §2 states for the `x-sovereign-surface`
signal, and every self-declared manifest permission takes in this system —
self-declared identity is a structural fact of running third-party client
code in one shared browser origin, not a bug to fix here. A future shell transport that
withholds its raw native bridge object from page JavaScript (Tauri's opt-in
command surface makes this realistic; whether a Capacitor shell can do the
same is an open question — RFC 0083 §5, §6) can make native-only capability
_calls_ genuinely unforgeable on that transport. It does not, and cannot,
make the _web_ transport's permission model any more enforceable than the
browser's own origin-wide `Notification.permission` already is.

Permission declarations are part of the manifest contract and are used by
platform flows such as portability (`data:export` / `data:import`) and by the
`mailer:send` / `mailer:sendExternal` host-side enforcement described below
(RFC 0062). Other SDK host surfaces currently rely on the declaration as
compatibility metadata rather than a complete runtime authorization boundary;
plugins should still declare the permissions they use so future host-side
gates can be enforced without changing the manifest.

### Plugin email (`sdk.mailer` / `sdk.email`, RFC 0062)

The runtime enforces `mailer:send` at the SDK host boundary: a call to
`sdk.mailer.send()` or `sdk.email.sendToUser()` from a plugin without that
permission throws before any send is attempted. Both methods also require a
plugin route context — pass `await headers()` from `next/headers` as the
second argument, the same convention `sdk.notifications.send()` uses (unlike
`sdk.auth`/`sdk.storage`, which read request headers internally). The calling
plugin ID is derived from the `x-sovereign-plugin-id` header on the server
side, never from anything in the call's input, so a plugin cannot forge which
plugin a send is attributed to.

There are two methods with different recipient models:

- **`sdk.email.sendToUser({ recipientUserId, templateId, subject, html?, text?, data? })`**
  — the recommended default. You supply a user ID; the platform resolves the
  recipient's email address server-side (through the same directory
  resolution `sdk.directory.resolveUsers()` uses), applies delivery policy,
  records an audit entry in the platform's email delivery log, and returns
  `{ status: 'sent' | 'skipped' | 'failed', errorCode? }`. Requires only
  `mailer:send`. `templateId` is recorded for audit/diagnostics; there is no
  plugin-facing template renderer yet (RFC 0031), so you still supply the
  final `subject`/`html`/`text` yourself.
- **`sdk.mailer.send({ to, subject, html?, text?, from? })`** — a low-level
  escape hatch for a raw recipient address. Because the address doesn't come
  from the platform's own user resolution, it's treated as an **external**
  recipient regardless of whether it happens to match a user's email, and
  additionally requires the `mailer:sendExternal` permission. Prefer
  `sdk.email.sendToUser()` unless you have a genuine reason to email an
  address the platform doesn't know as a user (e.g. inviting someone who
  doesn't have an account yet).

Both methods are rate-limited per plugin and per recipient (a fixed
per-process sliding window — a burst of automated or malicious sends from one
plugin, or targeting one recipient, is rejected with a "rate limit exceeded"
error rather than exhausting SMTP or spamming a user) and go through the same
delivery machinery as first-party account/security email — no separate
plugin-only mailer path exists. This is distinct from
`sdk.notifications.send()` (RFC 0015): notifications are in-app/push and
high-volume by design, while email is comparatively rare, explicitly
permissioned, and audited.

```ts
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';

await sdk.email.sendToUser(
  {
    recipientUserId,
    templateId: 'export-ready',
    subject: 'Your export is ready',
    text: 'Your data export has finished. Open the app to download it.',
  },
  await headers(),
);
```

### `apiProvider` and the public `/api/*` namespace (PLT-16)

The runtime reserves the top-level `/api/*` namespace for plugin-served **public**
APIs. A plugin that sets `apiProvider: true` becomes the instance's API provider:

- Requests to `/api/<slug>/<path>` are **exempt from the session gate** — the
  provider owns authentication for them (e.g. API keys). They are **not**
  redirected to `/login`.
- The runtime rewrites `/api/<slug>/<path>` to the provider's serve route,
  `<routePrefix>/serve/<slug>/<path>` — implement it as a catch-all route handler
  at `app/serve/[slug]/[[...path]]/route.ts`.
- **Exactly one** provider is allowed per instance; the build fails if two
  plugins declare `apiProvider: true`. With no provider installed (or the
  provider disabled), `/api/*` returns **404**.
- The segments the runtime serves itself — `account`, `admin`, `health`,
  `plugins` — are reserved and never delegated; a provider must reject them (and
  any future runtime segment) as slugs.

### `publicRoutes` — public plugin page routes (RFC 0042)

`apiProvider` exempts machine-readable `/api/*` endpoints from the session
gate; `publicRoutes` does the same for **page** routes — a shared document, a
public board, a published read-only view, or a token-protected preview.
Unlike `apiProvider`, any number of plugins may declare `publicRoutes`; each
one only exempts paths under its own `routePrefix`.

```json
{
  "routePrefix": "/notes",
  "publicRoutes": [{ "prefix": "/p", "description": "Token-protected public read-only pages." }]
}
```

### `minVerificationLevel` — gating on progressive verification (RFC 0035)

A plugin that handles sensitive data can require a stronger proof of identity
than "logged in" before any of its routes render, without implementing its
own check:

```json
{
  "routePrefix": "/vault",
  "minVerificationLevel": 1
}
```

`0` (the default) means no gate. `1` requires a verified email, `2` requires
TOTP or a passkey enrolled, `3` requires an admin to have explicitly vouched
for the account (Console → Users → Vouch — no self-service path exists for
Level 3 by design). The runtime enforces this at the plugin route boundary —
the same place it enforces `adminOnly` and the `capabilities` manifest field
(RFC 0022) — so a plugin never needs to restate the check in its own route
handlers.

An under-leveled request never reaches the plugin's own code:

- **Page routes** get a `303` redirect to a nudge page
  (`/verification-required/<pluginId>?level=<n>`) explaining what's needed and
  linking to the right place to fix it (`/verify-email`, Account → Security,
  or — for Level 3 — nothing, since there's no self-service path).
- **API routes** (anything under the plugin's `routePrefix` starting with
  `/api/`) get a `403` with a machine-readable body instead of a redirect:

```json
{ "error": "verification_required", "requiredLevel": 1 }
```

A plugin's own client-side error boundary can check for this shape to show a
tailored message instead of a generic failure state:

```ts
const res = await fetch('/vault/api/documents');
if (res.status === 403) {
  const body = (await res.json()) as { error?: string; requiredLevel?: number };
  if (body.error === 'verification_required') {
    // Show a "verify your email" / "enable MFA" prompt instead of a generic error.
  }
}
```

**Sub-fields** (each entry):

| Field         | Type   | Required | Description                                                                                                                                                      |
| ------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`      | string | yes      | Path prefix, **relative to `routePrefix`**. Must start with `/`, must not be `/`, must not contain `..` segments or route-group/interception markers (`(`, `)`). |
| `description` | string | no       | Human-readable note (docs/Console).                                                                                                                              |

Given the example above, `/notes/p/*` is exempt; `/notes/<anything else>`
keeps the normal session gate. Prefixes must be unique within a plugin.

**What the platform does:**

- CSP and security headers still apply.
- The request is **not** redirected to `/login` when unauthenticated.
- If a valid session exists, the platform still injects the usual
  `x-sovereign-user-*` request headers (so a public route can render
  differently for a logged-in owner vs. an anonymous visitor); if not, those
  headers are simply absent.
- A **disabled** plugin's public routes still 404, same as its normal routes.
- A plugin with a paid `monetization` model blocks anonymous requests to its
  public routes by default (redirects to `/paywall/<id>`) — there is no
  `paywallExempt` escape hatch yet. An authenticated request still goes
  through the normal entitlement check, so an entitled user reaches the page.

**What your plugin must do** — the platform only decides whether its own
gates apply; every public route is otherwise unauthenticated, so the plugin
must:

- Validate its own token, public identifier, or share ID **server-side** on
  every request.
- Return **404** (not 401/403) for anything invalid, expired, revoked, or
  unknown — a public link must not leak whether the underlying resource
  exists.
- Render **read-only** by default; never expose mutation controls to an
  unauthenticated visitor.
- Only fall back to the session (when present) when that user already has
  normal access to the underlying resource — the session is a convenience for
  the owner viewing their own share, not a replacement for the token check.

**Example — a token-protected public note preview:**

```json
// manifest.json
{
  "routePrefix": "/notes",
  "publicRoutes": [{ "prefix": "/p", "description": "Public read-only note previews." }]
}
```

```ts
// app/p/[token]/page.tsx
export default async function PublicNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await lookupShareByTokenHash(hashToken(token));

  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < Date.now())) {
    notFound(); // 404 — never distinguish "expired" from "never existed"
  }

  const note = await getNoteById(share.noteId);
  return <ReadOnlyNoteView note={note} />;
}
```

Recommended fields for a plugin's own share table (this RFC does not define a
shared token schema — each plugin owns its model): a **hash** of the token
(never the plaintext), the resource ID, who created it, `createdAt`,
`expiresAt`, `revokedAt`, and a mode (`expiring`, `permanent`, or a
plugin-specific enum).

### `webhooks` — public plugin webhooks (RFC 0050)

Unauthenticated machine-to-machine ingress — distinct from `publicRoutes`
above, which is for human-facing **pages**. A webhook is for provider
callbacks: message delivery, payment events, sync notifications, OAuth
provider postbacks. Each declared entry is one **exact** endpoint, not a
prefix — the platform bypasses the session redirect for exactly that
`<routePrefix><path>` + declared method(s), applies method and
`Content-Length` limits before your handler runs, and injects
`x-sovereign-plugin-id` — but **never** a user identity header, even if the
request happens to carry a valid session cookie. There is no user for a
webhook call.

```json
"webhooks": [
  {
    "path": "/webhooks/deliver",
    "description": "Provider delivery callback",
    "methods": ["POST"],
    "maxBodyBytes": 262144,
    "requiresSignature": true
  }
]
```

| Field               | Notes                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`              | Relative to `routePrefix`; must start with `/`, must not be `/`. Exact match — `/webhooks/deliver/extra` does **not** match a declared `/webhooks/deliver` entry.                                                                        |
| `description`       | Optional human-readable note.                                                                                                                                                                                                            |
| `methods`           | Allowed HTTP methods; defaults to `["POST"]`. `GET` is accepted only for provider verification challenges. A request with an undeclared method gets a 404, not a 405 — the platform never reveals which methods a declared path accepts. |
| `maxBodyBytes`      | Defaults to `262144` (256 KiB), hard-capped at 5 MiB regardless of what you declare. Enforced via a `Content-Length` pre-check in middleware — see the caveat below.                                                                     |
| `requiresSignature` | Documentation/introspection only — declaring `true` enforces nothing by itself; your handler must actually call `sdk.webhooks.verifyHmac()`.                                                                                             |

**Your handler is an ordinary route.** Unlike `schedules`/`jobs`/`events`,
there is no manifest `entry` field and no generate-time composition — you
just place a normal Next.js `route.ts` at the path (e.g.
`app/webhooks/deliver/route.ts`), composed into the runtime the same way
every other plugin route already is. This genuinely is just an HTTP route;
the manifest only declares metadata the platform enforces around it.

**Verify signatures and check replays yourself** — the platform gives you
the primitives, not a provider framework:

```ts
// app/webhooks/deliver/route.ts
import { sdk } from '@sovereignfs/sdk';

export async function POST(request: Request): Promise<Response> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get('x-provider-signature') ?? '';

  const verified = await sdk.webhooks.verifyHmac(
    { body: bytes, signatureHeader: signature, secretRef, algorithm: 'sha256' },
    request.headers,
  );
  if (!verified) return new Response('Unauthorized', { status: 401 });

  const event = JSON.parse(new TextDecoder().decode(bytes)) as { id: string };
  const isNew = await sdk.webhooks.checkReplay(
    { provider: 'my-provider', eventId: event.id },
    request.headers,
  );
  if (!isNew) return new Response('OK', { status: 200 }); // already processed — don't reprocess, don't error

  // …handle the event…
  return new Response('OK', { status: 200 });
}
```

- **`sdk.webhooks.verifyHmac()`** — `secretRef` is a `SecretRef.id` for a
  **`'plugin'`-scoped** secret you created via `sdk.secrets.create()` (user-
  and instance-scoped secrets are rejected — there's no user for a webhook
  call, and instance-scoped secrets normally require the `instance:configure`
  capability, which this call never has). `signatureHeader` is the digest
  **value** your provider sent, hex-encoded, with any provider-specific
  prefix (GitHub's `sha256=`, for example) already stripped by your own
  code — this helper compares a raw hex digest, it doesn't parse
  provider-specific header formats. Read the body as raw bytes _before_ any
  JSON parsing — parsing first and re-serializing would verify different
  bytes than the provider actually signed.
- **`sdk.webhooks.checkReplay()`** — `provider`/`eventId` together are the
  dedupe key, scoped to your plugin (two plugins, or two providers on one
  plugin, never collide on the same `eventId`). Returns `true` the first
  time an event is seen (safe to process) and `false` on every call within
  `ttlSeconds` after that (default 24h) — a replay. Most providers treat a
  non-2xx response as "retry me," so respond 200 on a detected replay
  rather than reprocessing or erroring.

**The `Content-Length` limit has a real gap, not swept under the rug:** a
chunked-transfer body has no `Content-Length` header, so middleware cannot
pre-check its size without consuming it (Next.js middleware can't buffer a
body and then forward an unconsumed stream to your route handler). For a
request with no `Content-Length`, the platform's check simply doesn't fire
— your own handler is the backstop. If this matters for your provider,
bound your own read (don't call `request.arrayBuffer()`/`.json()`
unconditionally on an untrusted body with no declared limit).

**Dev-mode caveat:** none — unlike `schedules`/`jobs`/`events`, a webhook's
`route.ts` hot-reloads normally, since it's composed the same way every
other plugin route is.

### `handoffs` — plugin flow handoffs (RFC 0053)

A signed, short-lived payload that lets one plugin start or continue a
user-facing flow in another — a task app handing a pre-filled item off to a
notes plugin, a shop plugin handing a cart off to a checkout plugin. This is
the flow-continuation counterpart to `data` (read-only queries) and `tools`
(RFC 0047, single mutating calls): a handoff carries the visitor's browser
across a redirect, with a specific payload, to a specific declared endpoint.

```json
"handoffs": {
  "receives": [
    {
      "name": "checkout-session",
      "path": "/checkout",
      "title": "Start a checkout session",
      "description": "Accepts a cart handed off from another plugin.",
      "public": true
    }
  ],
  "sends": [
    { "provider": "io.example.checkout", "name": "checkout-session", "reason": "Cart handoff at purchase time" }
  ]
}
```

| Field          | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receives`     | This plugin's own handoff endpoints. Requires the `handoffs:receive` permission. Optional — omit if this plugin only ever sends.                                                                                                                                                                                                                                                         |
| `.name`        | Stable handoff name, lowercase kebab-case, unique within the plugin. Callers pass this to `sdk.handoffs.create()`.                                                                                                                                                                                                                                                                       |
| `.path`        | Relative to `routePrefix`; must start with `/`, must not be `/`. **Exact match**, not a prefix — mirrors `webhooks[].path` above, not `publicRoutes`' subtree match: a handoff receiver is one specific declared page.                                                                                                                                                                   |
| `.title`       | Human-readable name shown in caller-facing docs/Console.                                                                                                                                                                                                                                                                                                                                 |
| `.description` | Optional longer note.                                                                                                                                                                                                                                                                                                                                                                    |
| `.inputSchema` | Optional, declarative only — like `webhooks[].requiresSignature`, the platform does **not** validate a handoff's payload against this automatically. Unlike RFC 0047 tool contracts (platform-enforced input schemas), RFC 0053 places schema validation under the _provider's own_ responsibility — validate `context.payload` yourself in your receiver route.                         |
| `.public`      | Whether an anonymous, unauthenticated visitor may consume a handoff at this receiver. Defaults to `false`. Must be declared explicitly — never inferred — so a plugin can't accidentally receive arbitrary public payloads.                                                                                                                                                              |
| `sends`        | Optional discovery/review metadata about handoffs this plugin creates for other providers. Requires `handoffs:send`. **Nothing at runtime validates a `sends` entry against the named provider's actual `receives[]` declarations** — this array exists for docs/Console display only; the real check happens at `sdk.handoffs.create()` call time against the provider's live manifest. |

**Source (the plugin starting the flow):**

```ts
import { sdk } from '@sovereignfs/sdk';

const handoff = await sdk.handoffs.create({
  providerId: 'io.example.checkout',
  name: 'checkout-session',
  payload: { items },
  returnUrl: '/cart/thank-you',
  mode: 'public', // or 'authenticated'
});
// Redirect the visitor's browser to the provider's declared receiver path,
// carrying the token as a query param the receiver route reads itself —
// e.g. `/checkout?ho=${handoff.token}`.
```

**Provider (the plugin receiving the flow), at the declared `path`:**

```ts
// app/checkout/route.ts (or a page/action reading the query param)
import { sdk } from '@sovereignfs/sdk';

const token = new URL(request.url).searchParams.get('ho') ?? '';
const context = await sdk.handoffs.consume(token, { name: 'checkout-session' });
// context.payload      — whatever the source passed, unvalidated by the platform
// context.sourcePluginId, context.returnUrl, context.actorUserId (null if public)
```

- **Payload storage is always server-side**, in a `plugin_handoffs` DB row —
  the token itself carries only an opaque id, never the payload. Capped at
  16 KiB JSON-encoded; a larger payload throws at `create()` time.
- **`mode: 'authenticated'`** requires the creating request to have an actor
  (`sdk.handoffs.create()` throws otherwise), and — tighter than a plain
  session check — **can only be consumed by that exact same user**. A
  leaked or forwarded authenticated handoff URL cannot be redeemed by a
  different logged-in visitor.
- **`mode: 'public'`** may be created and consumed anonymously, but only
  against a receiver the provider's manifest marks `public: true`; a
  non-public receiver rejects a public-mode token outright.
- **Single-use by default** (`singleUse: true`) — consuming claims the row
  atomically (`UPDATE ... WHERE consumed_at IS NULL RETURNING ...`, the same
  idiom `sdk.webhooks.checkReplay()` uses for replay detection); a second
  consume attempt on the same token throws. Pass `singleUse: false` for a
  handoff meant to be read more than once before it expires.
- **Expiry defaults to 15 minutes**, and any `expiresInSeconds` you pass is
  clamped to a 1-hour maximum server-side — a handoff token is a short-lived
  redirect, not a durable link.
- **`returnUrl`** is validated with the same same-origin-relative-path check
  `/login`'s own `returnUrl` uses; an absolute or scheme-relative URL is
  rejected (open-redirect prevention). It's carried on `context.returnUrl`
  for the provider to redirect back to when the flow completes — the
  platform doesn't redirect for you.
- **The receiving route is an ordinary route**, same as `webhooks` above —
  no manifest `entry` field, no generate-time composition, hot-reloads
  normally in dev.
- A **public** receiver's page route bypasses the session-redirect gate the
  same way a public webhook does, and — like `publicRoutes` above, unlike
  `webhooks` — forwards `x-sovereign-user-id` when a session happens to be
  present, so a logged-in visitor's flow can still resolve to their account
  if your handler wants that; a **non-public** receiver still requires an
  authenticated session to even reach the route (the platform redirects to
  `/login` first, same as any other authenticated page).

### `public` — fully public plugins (RFC 0089)

`publicRoutes` exempts a declared prefix from the session gate; `public: true`
exempts the plugin's **entire** `routePrefix` — for plugins that are public by
design and have no private mode at all: an instance status page, a public
wiki, a changelog/blog.

```json
{ "public": true, "shell": "minimal" }
```

**Validation rules:**

- Requires `shell` to be **explicitly** `"minimal"` — an omitted, `"default"`,
  or `"overlay"` `shell` is rejected. `default` and `overlay` both assume a
  chrome or dialog context built around an authenticated user; a standalone
  public entry point has neither.
- Cannot combine with `adminOnly: true` (admin-gated and open-to-anyone is
  contradictory).
- Cannot combine with a paid `monetization.model` (paid and open-to-anyone is
  contradictory; an explicit `monetization: { "model": "free" }` is fine).
- Cannot combine with `publicRoutes` — redundant once the whole plugin is
  public.

**What the platform does** — identical to `publicRoutes` above, just applied
to the whole plugin instead of a declared prefix: CSP/security headers still
apply; no redirect to `/login`; session headers are injected when a valid
session exists and omitted otherwise; a **disabled** plugin still 404s.
`public: true` has no effect on `/api/*` — that stays `apiProvider`'s
decision, independent of this flag.

Note: like `publicRoutes`, an RFC 0065 access-policy restriction does **not**
apply here — the public-route fast path in `runtime/middleware.ts` only
checks disabled-plugin status. Restricting a `public: true` plugin has no
effect on its reachability; to fully lock one down, disable it instead.

**What your plugin must do** — the same posture as `publicRoutes`, generalized
to every route instead of a carved-out prefix:

- Render sensibly for an anonymous visitor **by default**, everywhere — there
  is no unexempted part of the plugin left to lean on as "still private".
- Treat injected session headers as an enhancement (show edit/admin
  affordances to an authenticated, permitted visitor), never as an assumption.
- Perform your own authorization on any mutation route; the platform gate is
  gone for the entire plugin.

**Example — a public status page plugin:**

```json
// manifest.json
{
  "id": "io.example.status",
  "routePrefix": "/status",
  "shell": "minimal",
  "public": true
}
```

```ts
// app/page.tsx
export default async function StatusPage() {
  const incidents = await getRecentIncidents(); // read-only, public by design
  return <StatusView incidents={incidents} />;
}
```

### `offline` — offline-capable plugins (research 0012)

Sovereign is installable as a PWA, but every page is per-user server-rendered
and fetched `NetworkFirst` — with no network, everything but the static
`/offline` fallback is unreachable. Declaring `offline` marks your plugin's
bare `routePrefix` page as its one offline-capable entry point — the shell
that loads with no connection, from which your own client-side code takes
over — and tells the platform how much offline capability your plugin needs:

```json
{
  "routePrefix": "/launcher",
  "offline": "offline-first"
}
```

`offline` takes one of two values:

- **`"offline-first"`** — the device keeps a full replica of your plugin's
  data, refreshed in the background; the server stays the source of truth.
  Works on every surface. This is what almost every offline-capable plugin
  wants — a shopping list, a task list, the Launcher's own plugin list.
- **`"device-only"`** — your plugin's data never leaves the device at all;
  there is no server copy. This needs a durable, encrypted, device-auth-gated
  store — available via **either** a native shell's Keychain/Keystore
  (`sovereign-mobile`'s `secureStorage` capability) **or** plain web/PWA's
  WebAuthn PRF + OPFS path (`@sovereignfs/sdk/device-only-kv`). Check
  `isDeviceOnlyTierAvailable()` from `@sovereignfs/sdk/device-client` before
  relying on it — it's `true` on whichever of the two backends this surface
  actually has, `false` only when neither is available (an older browser, a
  native shell build that hasn't shipped `secureStorage` yet), so a plugin
  declaring this tier still needs a real fallback for that case, not just for
  a slow network. Wrap your plugin's own root content in `DeviceOnlyGate`
  (`@sovereignfs/ui`), passing that same `isDeviceOnlyTierAvailable()` result
  as `available` — it renders an explanatory "Phone only" state instead of
  your plugin's content when unavailable, the same pattern `OfflineGate` uses
  for Console/Account.
  The Launcher's own tile and the shell's Apps drawer already show a
  restricted badge for `device-only` plugins (epic task 2.33), but that's
  advisory UI only — a user reaching your route directly (a bookmark, a deep
  link) skips it entirely, so `DeviceOnlyGate` is the part that actually
  matters.

  `DeviceOnlyGate` covers whether the tier is available on this surface at
  all — it says nothing about whether _this user_ has actually set up the key
  that tier needs. Assume nothing about unlock state beyond that: a
  `device-only` plugin must **never run its own enrollment ceremony**.
  Enrollment is centralized, one-time, and per-device — the user sets up
  their Device Storage Key once in Account → Security (RFC 0093 §2, epic task
  1.22), and every `device-only` plugin they have or later get access to
  shares that same key; there is no per-plugin setup step and no separate key
  to create. Check with `getDeviceStorageKeyStatus()` from
  `@sovereignfs/sdk/device-only-storage` and wrap your plugin's own root
  content (nested inside `DeviceOnlyGate`) in `DeviceStorageKeyGate`
  (`@sovereignfs/ui`), passing that status and a `setupAction` link to
  Account → Security:

  ```tsx
  const [status, setStatus] = useState<DeviceStorageKeyGateStatus>('checking');
  useEffect(() => {
    void getDeviceStorageKeyStatus().then(setStatus);
  }, []);

  <DeviceOnlyGate available={isDeviceOnlyTierAvailable()} surfaceName="Notes">
    <DeviceStorageKeyGate
      status={status}
      surfaceName="Notes"
      setupAction={<Link href="/account/security">Set up Device Storage Key</Link>}
    >
      <NoteList />
    </DeviceStorageKeyGate>
  </DeviceOnlyGate>;
  ```

  When no key is set up yet, `DeviceStorageKeyGate` shows a message pointing
  the user at Account → Security and stops there — it does not redirect the
  browser itself, the same "block and explain" pattern `OfflineGate`/
  `DeviceOnlyGate` use rather than a server-side or router-level redirect.
  Revoking and re-granting a user's access to your plugin (RFC 0065) never
  touches their Device Storage Key or its data — those two lifecycles are
  deliberately independent, so re-checking status on every mount (as above)
  is the correct behavior, not a one-time gate you can cache past a
  navigation.

  `status` can also come back `'no-device-auth'` — the device supports the
  tier but has no passcode, fingerprint, or face unlock configured at all, so
  no key can be created there regardless of what the user does in your
  plugin. `DeviceStorageKeyGate` shows an explanatory message for this case
  with no `setupAction`, since the fix is a change in the device's own system
  settings, not anything your plugin or Account → Security can do. Don't
  treat this the same as `'not-set-up'` in your own code (e.g. by lumping
  both into a single "go set it up" branch) — the redirect that helps for one
  does nothing for the other.

  Once past the gate, your plugin's own storage layer still needs the
  _unwrapped_ key for every actual read or write — call
  `getUnlockedDeviceStorageKey()` from `@sovereignfs/sdk/device-only-session`
  for that, never `deriveDeviceOnlyKeyViaPrf` directly. It transparently
  reuses the current unlock session while the user's chosen re-lock policy
  (Account → Security's Auto-lock setting) still allows it, and only re-runs
  the platform ceremony — prompting for biometric/passcode presence again —
  once that window has elapsed, so your plugin doesn't need to track re-lock
  timing itself:

  ```ts
  const result = await getUnlockedDeviceStorageKey();
  if (result.status !== 'ok') {
    // 'cancelled' | 'failed' | any DeviceStorageKeyGateStatus other than
    // 'set-up' — show your own retry affordance; DeviceStorageKeyGate
    // already covers the steady 'not-set-up'/'no-device-auth' cases above.
    return;
  }
  const deviceStorageKey = result.key; // CryptoKey, ready to use
  ```

  Most plugins don't need the raw `CryptoKey` at all — for "durable, encrypted,
  per-record device-local storage" (notes, entries, settings — the common
  case), use `@sovereignfs/sdk/device-only-kv` directly instead of calling
  `getUnlockedDeviceStorageKey()` yourself. It's a small encrypted key/value
  store, one AES-GCM-encrypted file per key, scoped to your plugin's own id —
  the same shape as `@sovereignfs/sdk/offline`'s existing IndexedDB-backed
  cache for the `offline-first` tier, but encrypted and gated on the Device
  Storage Key instead:

  ```ts
  import { getDeviceOnlyValue, setDeviceOnlyValue } from '@sovereignfs/sdk/device-only-kv';

  const result = await getDeviceOnlyValue<Note>('io.example.notes', 'note-1');
  if (result.status === 'ok') {
    const note = result.value; // Note | undefined — undefined means never written
  }

  await setDeviceOnlyValue('io.example.notes', 'note-1', { title: 'Groceries' });
  ```

  `listDeviceOnlyKeys`/`deleteDeviceOnlyValue`/`clearDeviceOnlyPluginData` round
  out the surface — the latter two need no unlocked session (deleting a file
  needs no decryption), `get`/`set` do. **This is not a relational database** —
  no queries, no joins, no indices beyond the key itself. A plugin that
  genuinely needs SQL against its `device-only` data isn't served by this
  module yet; that gap (a real `wa-sqlite`-backed engine) is tracked as
  remaining work, not silently worked around.

  You don't need to build export/import yourself — `@sovereignfs/sdk/device-only-export`
  covers every `device-only` plugin's data in one call, not per-plugin:

  ```ts
  import { exportDeviceOnlyData, importDeviceOnlyData } from '@sovereignfs/sdk/device-only-export';

  const result = await exportDeviceOnlyData(userChosenPassphrase);
  if (result.status === 'ok') {
    // result.file is plain JSON — write it to a file for the user to download.
  }
  ```

  This is Account → Security's own "Export device data" action (RFC 0093 §4
  Layer 2) — always available, no per-plugin opt-in, no server involvement.
  Import re-encrypts every value under the _importing_ device's own unlocked
  Device Storage Key rather than copying ciphertext across devices, since two
  devices never share the same key. You will not normally call either
  function directly from plugin code; it's documented here so a plugin author
  understands what already covers their data without them building it.

Omitting the field entirely means no offline support — the default, and still
the right choice for most plugins (an admin console, a settings page, anything
whose whole point is showing live server state has no business working
offline). There is no third "off" value in the enum on purpose: a field that's
either a real tier or absent is easier to reason about than one that can also
hold an explicit "false" meaning the same thing as absent.

There is no per-route declaration — `offline` is a single field at the plugin
level. Which screens, lists, or records your plugin actually supports offline
is entirely your own client-side decision, invisible to the manifest — the
platform only needs to know there's a neutral shell to precache.

`offline` requires no separate permission and grants **no auth exemption** —
it is purely a caching/rendering declaration, unlike `publicRoutes`. Both
tiers imply local mutation, so declaring either is sufficient to also use
`sdk.offline-queue` for writes if your plugin needs them — see "Offline
writes" below; there's nothing further to declare.

**What the platform does:**

- Precaches your plugin's bare-`routePrefix` document (shell HTML, JS, CSS)
  the first time it's visited online, so it loads with no network from then
  on.
- Every other route stays `NetworkFirst`; offline, it falls back to the
  `/offline` "no internet connection" page as usual — only your plugin's one
  declared entry point is reachable with no connection.
- Never caches or replays per-user API responses — the SW cache holds only
  the user-neutral shell document.

**What your plugin must do** — the offline-capable route is still a per-user
page, but its SSR output must contain **no per-user data**, or a cached copy
could be replayed for the wrong user on a shared device:

- Render a **user-neutral shell** server-side, in both `page.tsx` and any
  wrapping `layout.tsx` (layout, chrome, empty states, skeletons only — no
  data fetched during SSR).
- Hydrate the real data **client-side** from `sdk.offline` (an IndexedDB-backed
  cache, imported from the dedicated `@sovereignfs/sdk/offline` subpath —
  browser-only modules can't go through the main barrel, same as the E2EE
  helpers). Pass your plugin's own manifest `id` as the first argument; you
  already know it statically, the same way you know your own `routePrefix`:

  ```ts
  'use client';
  import { offline } from '@sovereignfs/sdk/offline';

  const PLUGIN_ID = 'fs.sovereign.wallet';

  // On mount: render whatever is cached immediately (works offline).
  const cards = await offline.get<Card[]>(PLUGIN_ID, 'cards');

  // When online, fetch fresh data and mirror it for next time offline.
  const fresh = await fetchCards();
  await offline.set(PLUGIN_ID, 'cards', fresh);
  ```

- Show a plugin-owned empty state ("Not available offline yet — open once
  online") when the cache has nothing stored, rather than a blank page.
- Keep each cached value reasonably sized: `offline.set` enforces a 5 MB
  soft cap per entry and throws `OfflineQuotaExceededError` (also thrown if
  the browser's origin storage quota — shared across every installed
  plugin's offline cache — is exhausted). Split large data across multiple
  keys rather than one large entry.
- Cached values are **encrypted at rest**, automatically — no setup, no opt-in
  (RFC 0093 task 8.20). `offline.set`'s values must be JSON-serializable
  (encryption needs to byte-serialize them); a `Blob`/`Map`/`Set` value that
  IndexedDB's own structured clone would otherwise accept now throws instead.
  This is a much weaker guarantee than `device-only`'s presence-gated Device
  Storage Key above — it protects against other apps and casual filesystem
  access, not against another script on this same origin — appropriate for
  this tier's own threat model, not a substitute for `device-only` when a
  plugin's data genuinely needs presence-gating.
- Everything past the one entry point — which screens or records to show,
  how to route between them — is your own client-side code. There is no
  platform mechanism for a second offline-reachable route; a bookmark or
  link to anything other than your plugin's bare `routePrefix` is not
  SW-served offline and falls through to the generic `/offline` fallback.

**CI-enforced:** `runtime/src/__tests__/offline-route-neutrality.test.ts`
statically scans every offline-enabled plugin's root `page.tsx`/`layout.tsx`
(and any co-located `_`-prefixed helper files they import) for
identity-reading APIs (`headers()`, `cookies()`, a session helper, the
`x-sovereign-user-id` header) and fails the build if any are found — it is a
source scan, not a rendered-output diff, so it cannot catch every possible
per-user leak, but it catches the direct ones before your route ships.

**Isolation note:** `sdk.offline` scopes entries by plugin id only, not by
user id — an offline route's own SSR output must never carry per-user data
(that's the whole point of the user-neutral-shell rule above), so there's no
safe client-side signal to key by user identity. Isolation across a login
boundary instead comes from the runtime calling `offline.clearAll()` on every
logout/user-switch: nothing cached ever survives past the session that wrote
it, which is what makes plugin-only scoping safe on a shared device.

### Offline writes (`sdk.offline-queue`)

`sdk.offline` above is a **read-only** cache. `@sovereignfs/sdk/offline-queue`
adds a client-side mutation queue on top of it, so a plugin declaring either
offline tier can also let a user add, edit, or delete data while offline —
queuing each write and syncing it back once connectivity returns. No separate
permission is required; declaring `offline` is enough.

```json
{
  "routePrefix": "/shopper",
  "offline": "offline-first",
  "permissions": ["auth:session", "db:readWrite"]
}
```

Like `sdk.offline`, this is a **generic, plugin-agnostic capability** — it
takes a `pluginId` and plugin-chosen operation names/payloads, and knows
nothing about any particular plugin's data model. It is a separate
IndexedDB-backed module from `sdk.offline` (its own database, its own
`clearAll()` purge), imported from its own subpath for the same
client/server-boundary reason as every other browser-only SDK module:

```ts
'use client';
import { offlineQueue, drainQueue } from '@sovereignfs/sdk/offline-queue';

const PLUGIN_ID = 'fs.sovereign.shopper';

// While offline (or optimistically, even online): apply the change to your
// own local view immediately, then queue it.
await offlineQueue.enqueue(PLUGIN_ID, 'setBought', { itemId, bought: true, at: Date.now() / 1000 });

// Later — on mount, or a `window` 'online' handler — drain the queue against
// your own sync endpoint.
await drainQueue(PLUGIN_ID, async (batch) => {
  const res = await fetch('/shopper/api/sync', {
    method: 'POST',
    body: JSON.stringify({ mutations: batch }),
  });
  const { outcomes } = await res.json();
  return outcomes; // [{ id, status: 'applied' | 'skipped' | 'failed', error? }]
});
```

**The apply contract your sync endpoint must implement** (this is the part
that makes retries and last-write-wins safe, not `sdk.offline-queue` itself
— the queue only stores and drains; your endpoint decides what each
operation means):

- **Every operation must be idempotent and absolute, never a delta or a
  toggle.** A create should carry a client-minted permanent id (so a retried
  `INSERT ... ON CONFLICT DO NOTHING` is safe and there's no temp-id
  reconciliation step). An update should carry the full new field values,
  not a diff. A boolean flip (e.g. "mark bought") must carry the **intended
  end state**, not "toggle it" — a lost response followed by a client retry
  would otherwise flip a real toggle twice.
- **Last-write-wins via a server-side timestamp comparison, checked on every
  apply attempt** — compare the mutation's `clientTimestamp` (epoch seconds)
  against the target row's own last-modified timestamp; apply only if the
  mutation is newer. Every _online_ write path that touches the same rows
  must also maintain that timestamp column, or an online edit's stale value
  will wrongly lose to a later-synced offline mutation.
- **Apply sequentially and halt at the first failure** within a batch, so a
  dependent later mutation (e.g. editing an item some earlier queued
  mutation in the same batch was meant to create) is never attempted out of
  order. Mutations your endpoint never reaches this round simply stay
  queued for the next drain.
- Return `'skipped'` (not `'failed'`) when a mutation's target was already
  removed by someone else — there's nothing to reconcile, and the client's
  next full re-fetch will drop it from view. Return `'failed'` with a clear
  `error` when the mutation genuinely couldn't be applied (e.g. its parent
  list was deleted) — silently dropping a user's change is worse than
  surfacing it.

`offlineQueue.enqueue()` throws `OfflineQueueFullError` past a 500-entry
soft cap per plugin — there's no eviction, since silently dropping a queued
write is data loss. `offlineQueue.clearAll()` is purged on every logout/login
boundary alongside `offline.clearAll()`, the same shared-device safeguard —
a plugin adopting offline writes should attempt a best-effort `drainQueue()`
before sign-out completes when online, since the purge is destructive to
anything not yet synced.

**Known limitation, stated plainly:** sync only ever runs while a plugin's
own client code is mounted and calls `drainQueue()` — there is no
platform-orchestrated background sync (the Background Sync API has no iOS
Safari support). If the app isn't open when connectivity returns, queued
writes wait until it is.

### `installable` — per-plugin installable PWA (RFC 0081)

Sovereign already installs as a PWA — but only as _Sovereign_, one manifest,
one icon, `scope: "/"`. Declaring `installable` lets your plugin be installed
as its **own** home-screen app instead, with its own name, icon, and scope:

```json
{
  "routePrefix": "/tally",
  "installable": true
}
```

**Deliberately separate from `offline`.** They answer different questions: a
plugin can be installable without offline support (it just needs a network to
work once opened), and offline-capable without being separately installable
(Launcher, today, is offline-capable but not installable). Deriving one from
the other would couple two independent product decisions — pair them in your
own plugin if that's the experience you want, but the platform never assumes
it for you. An installed app that fails outright on a cold launch with no
signal is a poor app, so pairing `installable` with `offline` is recommended,
not required.

**What the platform does:**

- Serves a dedicated web app manifest at `/api/manifest/<your-plugin-id>`,
  reachable with no session (browsers fetch a manifest before login). It
  carries your plugin's own `name`/`description` verbatim — the instance name
  is **not** prepended, since the user is installing _your plugin_, not
  "MyInstance Tally" — and sets `start_url`, `scope`, and `id` all to your
  plugin's bare `routePrefix`.
- Rasterizes your `icon` SVG into the full icon set an install prompt needs —
  192×192, 512×512, and a maskable 512×512 — at build time, and lists all
  three in your plugin's manifest. The maskable variant gets an opaque
  background plate (never transparent — a transparent maskable icon renders
  as a floating glyph on a platform-chosen background and looks broken on
  Android) and is centered within the platform's safe zone so no mask shape
  clips it.
- Overrides the document's `<head>` metadata (`manifest`, `apple-touch-icon`,
  and the PWA title) on your plugin's routes, so the browser's install prompt
  and iOS's home-screen resolution both pick up your plugin's identity
  instead of the instance's.
- Serves both the generated icon set and your raw `icon.svg` (used by the
  sidebar/Launcher tiles) with no session gate — the same exemption the
  manifest itself needs and for the same reason: a browser fetching a
  manifest's icon URLs to decide whether to show an install prompt cannot be
  expected to already have a session, and most browsers don't follow a
  redirect when fetching a manifest icon, so a session-gated icon would
  silently break installability with no other symptom.
- Rewrites (never redirects) an unauthenticated request to your plugin's bare
  `routePrefix` to the login document, so signing in from a cold launch stays
  inside the installed app's scope and returns you to your plugin afterward,
  not to `/`. The same fix RFC 0013 already applies to bare `/` for the
  identical reason — a 303 redirect has no body/head at all, so iOS shows a
  blank white screen instead of resolving the launch image.

**If your glyph rasterizes poorly** — a maskable icon in particular needs
safe-area padding and usually a background plate an SVG glyph doesn't have —
declare your own pre-made PNGs instead of relying on auto-generation:

```json
{
  "icon": "icon.svg",
  "installable": true,
  "icons": {
    "png192": "icon-192.png",
    "png512": "icon-512.png",
    "maskable512": "icon-maskable-512.png"
  }
}
```

Each path is relative to your plugin root, same as `icon`. You can override
just one variant and let the platform generate the other two from `icon` —
`icons` and `icon` are consulted independently per variant, not
all-or-nothing. `installable: true` requires `icon` **or** `icons` (at least
one usable icon source); declaring neither fails manifest validation at
build time rather than shipping a broken install prompt.

**Known permanent-for-now limitation:** installed plugin apps have no
splash/launch image of their own — that's a separate concern from the icon
set above (`apple-touch-startup-image`, iOS's launch screen, not a manifest
icon) and nothing currently generates one per plugin. An installed plugin
app shows a brief blank white flash on cold launch rather than a branded
splash screen. This is deliberate, not an oversight: showing the _instance's_
splash would display the wrong app's identity, which reads as more broken
than blank.

`installable` grants **no auth exemption** for anything beyond the bare
`routePrefix` document itself and its icon assets — every other route your
plugin serves is gated exactly as it is today. It also registers no second
service worker and changes nothing about the existing one's scope: manifest
`scope` governs the _installed app's navigation containment_, which is
independent of service-worker registration.

### `surfaces` — plugin availability by surface (RFC 0080)

Declare which surfaces your plugin is available on:

```json
{
  "routePrefix": "/scanner",
  "surfaces": ["mobile"]
}
```

Values are `browser`, `mobile` (the Capacitor shell, RFC 0058), and `desktop`
(the Tauri shell, RFC 0038) — unique, non-empty when the field is present.
**Omitting `surfaces` entirely means available everywhere**, the behavior
every plugin already has today; this field is purely additive.

**What the platform does:**

- Filters your plugin's tile out of the Launcher grid, its icon out of the
  sidebar's middle plugin section, and its entry out of the mobile Apps
  drawer, whenever the current request's surface isn't in your declared list.
- A direct navigation to your plugin's routes from an unavailable surface
  renders a generic "not available on this device" page instead of your
  plugin's own content — **not** a 404: the plugin is installed and the user
  is entitled to it, it just doesn't belong on this surface.

**What `surfaces` deliberately is not:** a security boundary. The current
surface comes from the shell's own User-Agent — a value any caller can set to
anything (see `sdk.device.getSurface()`'s own hard rule in
`docs/architecture-rules.md`) — so `surfaces` only ever filters
_presentation_. This is the same asymmetry RFC 0082's focused-app route lock
documents about itself: a user who edits their User-Agent (or a script that
never sends one) reaches your plugin's routes regardless of what `surfaces`
says, and that's fine, because nothing behind `surfaces` is a secret — it's
purely "does this make sense to show here," not "is this allowed here." Gate
anything that actually needs to be inaccessible with session, capability, or
`data:provide`/`data:consume` permissions instead, never with `surfaces`.

Read the current surface server-side with `await sdk.device.getSurface()` if
your plugin needs to branch on it beyond the platform's own filtering (e.g. to
show a native-only affordance inside an already-available page) — see the SDK
reference below.

### `shell: overlay` (RFC 0001)

An `overlay` plugin renders as a **dismissable dialog over the current page**
instead of a full-page navigation — ideal for settings, quick-capture, or
pickers the user opens mid-task and wants to dismiss back to where they were.

You write ordinary pages; the platform handles the rest:

- A soft (in-app) navigation to the plugin opens it in a dialog layered over the
  current page, which stays mounted (no lost scroll/state). Navigating between
  the plugin's own sub-routes stays inside the dialog.
- A hard load (deep link, refresh, post-login redirect) renders the same pages
  as a normal full page — the URL is identical either way.
- The runtime owns the dialog chrome (scrim, close button, Esc/scrim-click
  dismissal); your pages never implement a modal shell.
- The dialog size is set by `shellConfig.overlaySize` (`sm` | `md` | `lg`,
  default `lg`).

**Intra-overlay navigation must use `replace`.** The dialog is dismissed with
`router.back()`, which unwinds exactly one history entry. If your in-dialog tab
or section links push new entries (the `<Link>` default), each one stacks on
history and a single dismiss only steps back one tab instead of closing the
dialog. Use `<Link replace>` (or `router.replace`) for navigation _within_ an
overlay plugin so closing always returns to the page the dialog opened over.

Constraints: an overlay plugin's `routePrefix` must be a **single segment**
(e.g. `/account`), and an overlay plugin is **not eligible as the root plugin**
(CON-11) — the root serves `/` as a full page.

### `shell: minimal` (RFC 0014)

A `minimal` plugin renders **chrome-free and full-bleed** — no sidebar, no
header, no footer. The plugin owns the entire viewport. Useful for kiosk
displays, immersive media players, or any full-screen experience where the
platform shell would be intrusive.

```json
{ "shell": "minimal" }
```

- The plugin composes into `runtime/app/(minimal)/` so it inherits a
  simple, chrome-free layout (`100dvh`, safe-area insets).
- The **session gate applies by default** — the middleware enforces
  authentication before the plugin renders. `minimal` alone does not bypass
  auth; a plugin that also declares `public: true` (RFC 0089) does — see
  [`public` — fully public plugins](#public--fully-public-plugins-rfc-0089).
- Unlike `overlay`, a multi-segment `routePrefix` is allowed (e.g. `/kiosk/display`).
- A `minimal` plugin **may be configured as the root plugin** (kiosk use
  case). When set as root, `/` renders the plugin full-bleed — be aware there
  is no nav affordance back to the Launcher or other plugins unless the plugin
  provides it.

**Nav convention for minimal root plugins:** if your plugin is the root and
other plugins are installed, provide your own navigation (a menu, a link to
`/launcher`, etc.). The platform shell is absent, so users have no other way to
reach the Launcher or Console.

### Mobile header/footer toggle (RFC 0075)

A `shell: default` plugin can independently hide its **mobile header** and/or
**mobile footer** via `shellConfig`, both defaulting to `true` (today's
behavior). Useful for a mobile-first view — a chat thread, a canvas, a media
viewer — that wants more of the viewport without giving up the sidebar (or the
rest of the default shell) the way `shell: minimal` does.

```json
{
  "shell": "default",
  "shellConfig": { "mobileHeader": true, "mobileFooter": false }
}
```

- **Desktop is never affected.** The sidebar always renders regardless of
  these fields — this is a mobile-only, per-piece toggle.
- Only valid when `shell` is `default` (or omitted, since `default` is the
  implicit value) — setting either field under `minimal` or `overlay` fails
  manifest validation.
- The omitted element is removed from the page entirely, not CSS-hidden — no
  flash of chrome-then-removal, no wasted hydration.
- **If you hide both**, your plugin loses the platform's mobile nav (Home /
  Apps / Search) for that screen — the same navigation contract as `shell:
minimal`: your plugin is responsible for providing its own way back (e.g. a
  header affordance if you keep the header, or an in-page one if you hide
  both). The platform does not inject an escape hatch.
- This is a **per-plugin** setting, not per-route — every page under the
  plugin's `routePrefix` gets the same header/footer visibility. A plugin that
  needs per-screen variation (e.g. list view keeps the footer, detail view
  doesn't) is a `shell: minimal` candidate instead.

### `compatibility` (RFC 0024)

Every manifest must declare a `compatibility` object that tells the platform what
versions it can run on:

| Sub-field            | Type   | Required | Description                                                                                                                                                                                                                                              |
| -------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minPlatformVersion` | semver | yes      | The oldest platform version this plugin supports. **Hard-enforced** — the plugin is disabled at install, build, and boot if the running platform is below this version.                                                                                  |
| `maxPlatformVersion` | semver | no       | The newest platform version the plugin has been tested against. **Advisory only** — the plugin still loads on a newer platform, but Console and the health endpoint surface a warning so the operator knows the plugin is running in untested territory. |

Both values must be valid [semver](https://semver.org/) strings (e.g. `"0.6.0"`).

**Enforcement tiers:**

1. **Build** — `pnpm generate` / `scripts/generate-registry.ts` rejects a plugin
   that declares a `minPlatformVersion` higher than the running platform, so a CI
   build fails before producing an incompatible image.
2. **Install** — `sv plugin add` and `scripts/install-plugins.ts` reject the plugin
   with a human-readable error.
3. **Boot** — on startup, the runtime checks every installed plugin; incompatible
   ones are **disabled in `plugin_status`** (same effect as an operator pressing
   Disable in Console) and a reason is surfaced in the Console Plugins page
   ("Incompatible — cannot enable") and the admin health endpoint
   (`incompatiblePlugins[]`).

```json
"compatibility": {
  "minPlatformVersion": "0.5.0",
  "maxPlatformVersion": "1.0.0"
}
```

Set `minPlatformVersion` to the earliest platform release your plugin was built
and tested against. Omit `maxPlatformVersion` unless you have a specific reason
to warn operators (e.g. the next major uses a breaking SDK change).

### `data` — cross-plugin data sharing (RFC 0002)

Declare the contracts your plugin exposes or reads. Both directions are
consent-gated: the current user must explicitly grant a consumer permission to
read a provider's data. Consent is managed in the **Account → Data** tab.

**Sub-fields:**

| Field           | Type  | Description                                                                                                       |
| --------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `data.provides` | array | Contracts this plugin exposes. Each entry: `contract` (string), `version` (int), `description` (optional string). |
| `data.consumes` | array | Contracts this plugin reads. Each entry: `providerId` (manifest id), `contract` (string), `version` (int).        |

**Provider** — expose a contract and register its resolver:

```json
"permissions": ["db:readWrite", "data:provide"],
"data": {
  "provides": [
    { "contract": "expenses", "version": 1, "description": "Expense records for this user." }
  ]
}
```

```ts
// In a Server Component or route handler that runs when the plugin loads:
sdk.data.provide('expenses', async ({ since }: { since?: string }) => {
  const db = await sdk.db.getClient();
  return db.query.expenses.findMany({
    where: (t, { gte }) => (since ? gte(t.date, since) : undefined),
  });
});
```

**Consumer** — declare what you read and query it (throws `ConsentRequiredError`
when the user has not yet granted consent):

```json
"permissions": ["data:consume"],
"data": {
  "consumes": [
    { "providerId": "com.example.finance", "contract": "expenses", "version": 1 }
  ]
}
```

```ts
import { ConsentRequiredError } from '@sovereignfs/sdk';

try {
  const rows = await sdk.data.query(
    { providerId: 'com.example.finance', contract: 'expenses', version: 1 },
    { since: '2025-01-01' },
  );
} catch (e) {
  if (e instanceof ConsentRequiredError) {
    // Direct the user to Account → Data to grant consent.
  }
}
```

**Resolver registration timing:** resolvers are in-process and reset on server
restart. Call `sdk.data.provide()` from a server-side handler (Server Component,
Route Handler) that executes when the plugin is first loaded. Consumers can only
query after the provider has registered — if you receive a resolver-not-found
error, the provider plugin has not yet served a request in the current process.

### `tools` — plugin tool contracts (RFC 0047)

The write/action counterpart to `data` above: structured, permissioned,
auditable actions a plugin exposes to another trusted caller (an
assistant/automation layer, or another plugin) — rather than a raw
cross-plugin DB write or an undiscoverable server action. A tool's
fully-qualified id is `<pluginId>:<name>`.

**Entry fields:**

| Field                  | Type                            | Required | Description                                                                                                                                  |
| ---------------------- | ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | string (kebab-case)             | yes      | Local tool name, unique within the plugin. Namespaced to `<pluginId>:<name>` by the platform.                                                |
| `title`                | string                          | yes      | Human-readable name shown in confirmation UI.                                                                                                |
| `description`          | string                          | no       | Human-readable description of what the tool does.                                                                                            |
| `effect`               | `read` \| `write` \| `external` | yes      | `read` — no mutation. `write` — mutates plugin-owned data. `external` — network, email, model providers, or any effect beyond the instance.  |
| `requiresConfirmation` | boolean                         | no       | Overrides the effect-class default: `false` for `read`, `true` for `write`/`external`.                                                       |
| `inputSchema`          | object (JSON Schema subset)     | yes      | Validated by the platform before every `preview()`/`execute()` reaches your handler. Supports `type`/`properties`/`required`/`items`/`enum`. |
| `minVerificationLevel` | `0` \| `1` \| `2` \| `3`        | no       | Minimum progressive verification level (RFC 0035) the calling user must hold. Absent/0 = no gate.                                            |

**Provider** — declare a tool and register its handlers:

```json
"permissions": ["db:readWrite", "tools:provide"],
"tools": [
  {
    "name": "create-record",
    "title": "Create record",
    "description": "Create a new record in this plugin.",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": { "title": { "type": "string" } },
      "required": ["title"]
    }
  }
]
```

```ts
// In a Server Component or route handler that runs when the plugin loads:
await sdk.tools.provide('create-record', {
  // Must be genuinely non-mutating — called freely, with no confirmation gate.
  preview: async (input: { title: string }) => ({
    summary: `Create "${input.title}"`,
    details: input,
  }),
  // Only reached after confirmation-token verification (this tool's effect
  // is "write", so requiresConfirmation defaults to true).
  execute: async (input: { title: string }) => createRecord(input),
});
```

**Caller** — declare `tools:call`, preview, then execute with the returned
confirmation token:

```json
"permissions": ["tools:call"]
```

```ts
const ref = { providerId: 'com.example.tasks', tool: 'create-record' };
const input = { title: 'Ship the release notes' };

const preview = await sdk.tools.preview(ref, input);
// preview.summary / preview.details -> render your own confirmation UI
// (RFC 0047 leaves this caller-owned; there is no platform confirmation
// modal). preview.confirmationToken is present because "write" tools
// require confirmation by default.

const result = await sdk.tools.execute(ref, input, {
  confirmationToken: preview.confirmationToken,
});
```

A `read` tool (confirmation optional) skips the token entirely — `preview()`
returns no `confirmationToken`, and `execute()` needs none:

```ts
const summary = await sdk.tools.preview(
  { providerId: 'com.example.finance', tool: 'summarize-month' },
  { month: '2026-08' },
);
const report = await sdk.tools.execute(
  { providerId: 'com.example.finance', tool: 'summarize-month' },
  { month: '2026-08' },
);
```

An `external` tool (e.g. sending an email, calling a third-party API) is
declared and called identically to a `write` tool — only `effect: "external"`
differs, which changes nothing about the caller's code, only the confirmation
default and the audit-log `effect` field.

**Confirmation tokens are single-use and input-bound.** Changing `input`
between `preview()` and `execute()` invalidates the token — request a fresh
preview. A token also expires (a few minutes) and cannot be replayed.

**Authorization**, checked before your handler ever runs: the provider must
be installed, enabled, and hold `tools:provide`; the caller must be
installed, enabled, and hold `tools:call`; the current user's verification
level must meet `minVerificationLevel` if declared; a `write`/`external`
(or explicitly `requiresConfirmation: true`) tool needs a valid confirmation
token. Any failure throws before `preview`/`execute` is called — your
provider code never has to re-check these.

**Auditing:** every execution attempt (success or failure) is written to the
platform activity log — provider id, caller id, tool name, effect class,
actor user id, and outcome. Raw tool `input`/results are never logged (they
may contain sensitive data) — if a provider needs its own detailed history,
store it in its own tables via `sdk.db`.

**Handler registration timing:** same as `sdk.data.provide()` — in-process,
resets on server restart. Call `sdk.tools.provide()` from a server-side
handler that executes when the plugin is first loaded; a caller reaches a
"no handlers registered" error if the provider hasn't served a request yet
in the current process.

### `integrations` — optional sibling-plugin integrations (RFC 0051)

Purely informational metadata for install/discovery UX (Console, Account,
plugin UI hints) — declaring one here grants nothing by itself and is never an
install blocker. To actually read another plugin's data you still need
`data.consumes` + the `data:consume` permission + user consent (RFC 0002); use
`sdk.plugins.get()`/`list()` at runtime to check whether the sibling is
installed, enabled, and available before offering the integration.

**Sub-fields:**

| Field                   | Type  | Description                                                |
| ----------------------- | ----- | ---------------------------------------------------------- |
| `integrations.optional` | array | Sibling plugins this plugin can integrate with if present. |

Each entry: `provider` (the sibling's manifest `id`), `reason` (human-readable,
shown in install/discovery UI), `contracts` (optional array of data contract
names this integration would consume), `tools` (optional array of RFC 0047
tool names this integration would invoke — reserved, RFC 0047 not yet
implemented).

```json
"integrations": {
  "optional": [
    {
      "provider": "io.example.crm",
      "reason": "Link records to contacts",
      "contracts": ["crm.contacts"]
    }
  ]
}
```

### `env` — plugin-scoped environment variables (RFC 0018)

Plugins can declare environment variables in the manifest `env` object. Each key
must be `UPPER_CASE`. The platform auto-namespaces them so they cannot collide
with platform or other-plugin vars.

| Sub-field     | Type                 | Required | Description                                                                                                                                                |
| ------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string               | yes      | Human-readable description shown to operators.                                                                                                             |
| `scope`       | `runtime` \| `build` | yes      | `runtime` → `SV_PLUGIN_<SLUG>_<KEY>` (server-side only). `build` → `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>` (inlined at `next build`; do not use for secrets). |
| `required`    | boolean              | no       | When `true`, the platform warns at startup if the var is absent.                                                                                           |
| `secret`      | boolean              | no       | When `true`, the value must never appear in the manifest `default` or the plugin's `.env` file.                                                            |
| `default`     | string               | no       | Default value applied when the var is absent. Not allowed on `secret` vars.                                                                                |

**Example declaration:**

```json
{
  "env": {
    "API_KEY": {
      "description": "Third-party API key",
      "secret": true,
      "scope": "runtime",
      "required": true
    },
    "API_URL": {
      "description": "API base URL",
      "scope": "runtime",
      "default": "https://api.example.com"
    },
    "MAP_TOKEN": { "description": "Public map token", "scope": "build" }
  }
}
```

The effective namespaced keys for a plugin with `id: "io.example.tasks"`:

| Manifest key | Namespaced key                                     |
| ------------ | -------------------------------------------------- |
| `API_KEY`    | `SV_PLUGIN_IO_EXAMPLE_TASKS_API_KEY`               |
| `API_URL`    | `SV_PLUGIN_IO_EXAMPLE_TASKS_API_URL`               |
| `MAP_TOKEN`  | `NEXT_PUBLIC_SV_PLUGIN_IO_EXAMPLE_TASKS_MAP_TOKEN` |

**Reading vars in server code** (`scope: "runtime"`):

```ts
import { sdk } from '@sovereignfs/sdk';

// In a Server Component, Route Handler, or Server Action:
const apiKey = await sdk.env.get('API_KEY'); // → string | null
```

`sdk.env.get` reads `SV_PLUGIN_<SLUG>_<KEY>` scoped to the calling plugin
(determined from the `x-sovereign-plugin-id` header the middleware injects).
A plugin can only read its own declared vars — not platform vars or other
plugins' vars.

**Reading build-scope vars** (`scope: "build"`) in client components:

```ts
// Client Component — use process.env directly (Next.js inlines NEXT_PUBLIC_* at build time).
// Replace IO_EXAMPLE_TASKS with your plugin's derived slug.
const token = process.env.NEXT_PUBLIC_SV_PLUGIN_IO_EXAMPLE_TASKS_MAP_TOKEN;
```

**Operator setup:** operators set secret vars in the container environment
before starting the platform. The platform logs a warning at startup for any
`required` vars that are absent.

**Dev workflow:** create a `plugins/<dir>/.env` file (gitignored) for local
non-secret values. The generate script reads it and merges it as defaults.
Secret vars must always be set in the actual environment — never in `.env`.

### Runtime secrets (`sdk.secrets`, RFC 0043)

Use plugin-scoped env vars for deployment-time secrets that operators supply
before startup. Use `sdk.secrets` for secrets created at runtime, such as OAuth
refresh tokens, personal access tokens, webhook signing secrets, and per-user API
keys.

```ts
import { sdk } from '@sovereignfs/sdk';

const ref = await sdk.secrets.create({
  scope: 'user',
  label: 'GitHub connection',
  value: refreshToken,
  metadata: { provider: 'github' },
});

const token = await sdk.secrets.get(ref.id);
await sdk.secrets.update(ref.id, rotatedRefreshToken);
await sdk.secrets.delete(ref.id);
```

Scopes:

| Scope      | Use for                                                            |
| ---------- | ------------------------------------------------------------------ |
| `user`     | A credential for the current user and calling plugin.              |
| `plugin`   | A runtime secret shared by the calling plugin across users.        |
| `instance` | Instance-wide plugin configuration; requires `instance:configure`. |

`sdk.secrets.list(scope?)` returns metadata-only refs. Plaintext values are
never returned by list calls, never exported, and never shown in Account UI.
Account deletion hard-deletes user-scoped vault rows. User exports include
metadata only so users can see which connections need to be re-created after
import.

### Server-side field encryption (`sdk.crypto`, RFC 0092)

Encrypt a field's value in the runtime before it reaches the database, so the
database (and its operator) only ever stores ciphertext. Requires the
`crypto:use` manifest permission. Distinct from `sdk.e2ee` (RFC 0060): the
runtime can decrypt these fields — the protection is against the database
tier, not the app server.

```ts
import { sdk } from '@sovereignfs/sdk';

// Classify the value; the envelope is an opaque string for any text column.
const envelope = await sdk.crypto.encryptField(notes, {
  sensitivity: 'health', // 'pii' | 'health' | 'financial' | 'sensitive'
  context: 'notes', // optional binding scope (e.g. the column name)
});

const plaintext = await sdk.crypto.decryptField(envelope, { context: 'notes' });
```

**You classify; the operator decides.** Whether a sensitivity class is
actually encrypted is instance-wide policy (`SOVEREIGN_ENCRYPT_CLASSES` in
`docs/self-hosting.md`). When a class is not enabled, `encryptField` returns
an encoded passthrough envelope (`svf0:`) instead of ciphertext (`svf1:`) —
your code stays policy-agnostic, and `decryptField` handles both. Never
branch on the prefix yourself. Decryption ignores the policy: data written
while a class was enabled stays readable if the operator later disables it.

An envelope can only be decrypted by the plugin that produced it, with the
same `context` value it was encrypted under. Encrypted values lose SQL
`LIKE`/range/`ORDER BY` on their column — keep filterable metadata (dates,
categories, ids) in separate plaintext columns.

#### Declarative schema helpers (`@sovereignfs/sdk/drizzle`)

Most plugins should never call `encryptField`/`decryptField` directly.
Classify columns in your schema, then run rows through one mechanical
`seal()`/`open()` call per statement:

```ts
// db/schema.ts — classification lives here, visible to reviewers
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { encryptedText, blindIndex } from '@sovereignfs/sdk/drizzle';

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  loggedAt: integer('logged_at').notNull(), // plaintext metadata — filter/sort freely
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }), // `source` = the JS key of the encrypted column
});
```

```ts
// writes — seal() encrypts every classified value and computes every blind index
await db.insert(entries).values(await sdk.crypto.seal(entries, row));

// reads — open() decrypts every enveloped value
const rows = await sdk.crypto.open(entries, await db.select().from(entries));

// exact-match search over encrypted data, via the blind index —
// blindIndexMatch is rotation-safe (dual-reads during a key rotation window)
const candidates = await sdk.crypto.hashFieldCandidates(term, { sensitivity: 'health' });
const hits = await db.select().from(entries).where(blindIndexMatch(entries.notesIdx, candidates));
```

Rules and guarantees:

- **The tripwire.** An `encryptedText` column rejects any write that isn't a
  sealed envelope — a forgotten `seal()` throws at write time instead of
  silently storing plaintext. The one exception is raw ` sql` `` statements,
  which bypass drizzle's column mappers entirely: never write classified
  columns with raw SQL.
- **Read-modify-write:** `open()` the row, modify, `seal()` again. `seal()` is
  idempotent for a consistent envelope+index pair, but refuses to compute a
  blind index from an already-sealed source (the plaintext is gone).
- **Blind indexes are exact-match only** — a keyed HMAC per (class × plugin),
  never usable for `LIKE`, ranges, or ordering. Query them with
  `blindIndexMatch()` + `sdk.crypto.hashFieldCandidates()` (shown above):
  during a key rotation (`sv keys rotate-blind-index`) the candidates cover
  both the old and new key, so search results stay identical throughout. A
  bare `eq(col, await sdk.crypto.hashField(term, …))` works but misses
  not-yet-re-sealed rows mid-rotation. On an instance with no
  `SOVEREIGN_FIELD_KEK` configured, hashing falls back to an unkeyed
  domain-separated hash (such instances store plaintext anyway); enabling
  encryption later re-computes indexes via `sv db encrypt-fields`.
- **Register your classified tables once** at server-entry scope (the same
  lifecycle as `sdk.portability.provideExport`):

  ```ts
  await sdk.crypto.registerTables(entries, otherTable);
  ```

  Registration persists platform-side and is what lets the operator tools
  (`sv db encrypt-fields` backfill, `sv keys rotate-blind-index` re-seal)
  walk your tables from outside the runtime process. An unregistered
  classified table is skipped by those tools — visibly, in their output —
  which means an operator cannot backfill or rotate it.

- **Export/import:** your `sdk.portability` export resolver must `open()` rows
  before emitting them — users export their data in plaintext, not envelopes.
  `sdk.crypto` works inside portability resolvers (the host resolves your
  plugin identity from the portability context when no request is in flight).
- **The Postgres migration twin schema** (`db/schema.postgres.ts`, used only
  by `drizzle-kit generate`) declares these columns as plain `text(...)` — it
  is never queried through, so it needs neither metadata nor the tripwire.

Three sanctioned patterns for search/sort over classified data: a
`blindIndex()` for exact match; separate plaintext metadata columns for
filtering/sorting; and `open()`-then-filter in application code for anything
fuzzier, with the cost that implies.

#### Adopting field encryption: the checklist

The reference implementation is `example-plugins/example-encrypted` — a
complete, minimal plugin exercising everything below. Work through the steps
in this order:

1. **Classify first — this is design, not code.** For each column: does it
   hold sensitive data, and which class (`pii` / `health` / `financial` /
   `sensitive`)? Does the plugin genuinely query it by **exact match**? Only
   those columns get a `blindIndex()` — every index is a deterministic
   fingerprint, so index nothing you merely display. Keep filter/sort
   metadata (dates, categories, foreign keys) deliberately plaintext.
2. **Manifest:** add `crypto:use` to `permissions`; set
   `compatibility.minPlatformVersion` to at least `0.82.0` (the first
   version with the complete surface); bump the manifest `version`.
3. **Schema:** swap classified `text()` columns for `encryptedText()`; add
   `blindIndex()` companions. Only _new_ columns need a migration —
   encrypted columns are still SQL `text`, so there is no column-type
   migration and no data migration. The Postgres migration-twin schema
   declares the same columns as plain `text()`.
4. **Writes and reads:** `await sdk.crypto.seal(table, row)` before inserts
   and updates; `sdk.crypto.open(table, rows)` after reads; for
   read-modify-write, `open()` → modify → `seal()`. Exact-match queries use
   `hashFieldCandidates()` + `blindIndexMatch()`.
5. **Register:** one `sdk.crypto.registerTables(...)` call at server-entry
   scope (next to your portability registration). Without it, the
   operator's backfill and rotation tools cannot cover your tables.
6. **Export:** your `sdk.portability` export resolver must `open()` rows
   before emitting — exports are the user's own data, in plaintext.
7. **Nothing else.** Do not check whether encryption is on, branch on
   envelope prefixes, or document operator steps in your plugin — policy is
   the operator's (`SOVEREIGN_ENCRYPT_CLASSES`), the platform handles both
   states identically from your code's perspective, and pre-existing
   plaintext rows keep working until the operator runs the backfill.

Rollout story you get for free: the plugin behaves identically on instances
with encryption off (`svf0` passthrough); existing plaintext rows read fine
before any backfill; the operator converts history with
`sv db encrypt-fields --plugin <your-id>` on their own schedule.

### External connections (`sdk.connections`, RFC 0049)

Use `sdk.connections` for runtime connection metadata around external accounts
or providers. Store credential material first with `sdk.secrets`; store only the
returned secret reference and sanitized provider metadata on the connection row.

```jsonc
{
  "connections": {
    "providers": [
      {
        "id": "email.google",
        "title": "Google Mail",
        "callbackPath": "/connections/google/callback",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
        "config": {
          "public": {
            "clientId": {
              "label": "Client ID",
              "env": "GOOGLE_CLIENT_ID",
              "required": true,
            },
          },
          "secrets": {
            "clientSecret": {
              "label": "Client secret",
              "env": "GOOGLE_CLIENT_SECRET",
              "required": true,
            },
          },
        },
      },
    ],
  },
}
```

`scopes` is a free-form list of provider-defined OAuth/API scope identifiers
(e.g. GitHub's `"repo"`, `"read:user"`) — not the `sdk.secrets` storage-scope
enum (`user` / `plugin` / `instance`), which is a different, unrelated
concept. It's the manifest-declared default; an admin can override the
effective scopes for a connection independently.

```ts
import { sdk } from '@sovereignfs/sdk';

const state = await sdk.connections.createOAuthState({
  provider: 'email.google',
  callbackPath: '/connections/google/callback',
});

// In the callback route, validate `state`, exchange the provider code
// server-side, save tokens in the vault, then create/update metadata.
await sdk.connections.verifyOAuthState(stateFromProvider);
const secret = await sdk.secrets.create({
  scope: 'user',
  label: 'Google Mail tokens',
  value: JSON.stringify(tokens),
  metadata: { provider: 'email.google' },
});
await sdk.connections.create({
  scope: 'user',
  provider: 'email.google',
  label: 'Google Mail',
  secretRef: secret.id,
  metadata: { account: 'user@example.com' },
});
```

OAuth state tokens are signed, expiry-bound, tied to the calling plugin and
current user, and rejected after successful validation in the running process.
Disconnecting a connection removes the associated vault secret reference and
soft-deletes the linked secret where possible. Provider-side token revocation is
plugin-owned; call the provider first, then `sdk.connections.disconnect(id)`.
Token refresh failures should call `sdk.connections.markError(id, { error,
status: 'needs_reauth' })` with sanitized messages only. Account and Console
show connection metadata and status; they never show credentials.

Provider declarations may include `config.public` and `config.secrets` maps for
instance-level settings such as OAuth client IDs and client secrets. Console
shows those fields to admins, displays the absolute callback URL, stores public
values in platform metadata, and stores secret values through the plugin secret
vault. Field `env` names are plugin-scoped runtime fallbacks; for the example
above, `GOOGLE_CLIENT_ID` resolves as
`SV_PLUGIN_<PLUGIN_SLUG>_GOOGLE_CLIENT_ID`. Console-managed values take
precedence over env-provided values, so operators can rotate credentials without
changing deployment env vars or restarting the app. Leaving a secret input blank
keeps the stored secret; submitting a new value rotates the vault entry. Removing
the provider config deletes the linked vault secret reference.

Read the effective provider config server-side:

```ts
const config = await sdk.connections.getProviderConfig('email.google');
if (!config.configured) {
  throw new Error(`Google Mail is not configured: ${config.missingRequired.join(', ')}`);
}

const params = new URLSearchParams({
  client_id: config.publicValues.clientId,
  redirect_uri: config.callbackUrl ?? '',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
});
```

`getProviderConfig()` is scoped to the calling plugin from the request context,
so a plugin cannot read another plugin's provider settings. Secret values are
returned only to server-side plugin code through this SDK call; they are not
included in Console reads, activity logs, exports, generated files, or plugin
tables. Test failures and provider errors should be sanitized before storing
them with `sdk.connections.markError()` or showing them in Console.

### `capabilities` — plugin-declared capabilities (RFC 0022)

Plugins can declare their own fine-grained capabilities that gate features
inside the plugin. Each key is a **local capability name** (lowercase
kebab-case); the platform auto-namespaces it to `<pluginId>:<capName>` to keep
names globally unique.

| Sub-field      | Type                | Required | Description                                                                    |
| -------------- | ------------------- | -------- | ------------------------------------------------------------------------------ |
| `description`  | string              | no       | Human-readable description of what the capability grants.                      |
| `defaultGrant` | `'all'` \| `'none'` | no       | Who gets the capability by default. See below. Defaults to `'none'` if absent. |

**`defaultGrant` values:**

- `'all'` — every authenticated user automatically receives the capability.
  The platform injects it into `session.user.capabilities` alongside the
  platform-role capabilities, so `sdk.auth.hasCapability(session, cap)` works
  without any DB call.
- `'none'` (default) — no one is granted the capability by default. The plugin
  manages grants itself — use `sdk.db` to store per-user grants in the plugin's
  own table and check them with `sdk.auth.hasCapability` after loading the grant
  from the DB.

**Enforcement is inside the plugin, not the platform route gate.** The platform
never blocks a route because a plugin capability is absent — it only injects the
capabilities list. Plugins enforce feature access in their own server components
or API routes:

```ts
// In a Server Component or route handler:
import { sdk } from '@sovereignfs/sdk';

// The namespaced capability: '<pluginId>:<localName>'
const CAP_CREATE = 'com.acme.myapp:create-item';

export default async function Page() {
  const session = await sdk.auth.getSession();
  if (!sdk.auth.hasCapability(session, CAP_CREATE)) {
    return <p>You do not have permission to create items.</p>;
  }
  // ... render the guarded UI
}
```

**Manifest example:**

```json
"capabilities": {
  "create-item": {
    "description": "Create items in the list.",
    "defaultGrant": "all"
  },
  "admin-panel": {
    "description": "Access the admin configuration panel."
  }
}
```

In this example, `com.acme.myapp:create-item` is granted to all users
automatically; `com.acme.myapp:admin-panel` is not granted by default and the
plugin must manage who receives it.

### `notifications` — Notification Center (RFC 0015)

Plugins can send in-app notifications to users by declaring the `notifications:send` permission
and calling `sdk.notifications.send()`. Notifications appear in the bell icon in the platform
chrome; users see toasts for new items and can manage preferences in **Account → Notifications**.

```json
{
  "permissions": ["notifications:send"]
}
```

```ts
// Inside a plugin server action or route handler (server-side only):
import { sdk } from '@sovereignfs/sdk';
import { headers } from 'next/headers';

await sdk.notifications.send(
  {
    recipientUserId: userId,
    title: 'Your export is ready',
    body: 'Click to download your data archive.',
    url: '/myPlugin/exports',
    category: 'info', // 'info' | 'announcement' | 'security' | custom
    // icon is optional — a URL to an image shown in the OS push notification.
    // Defaults to your plugin's own /plugin-icons/<id>.svg; only set it to
    // override with a notification-specific image instead.
  },
  await headers(), // pass the request headers so the runtime can read the plugin ID
);
```

**Categories and muting:**

| Category       | Notes                                                             |
| -------------- | ----------------------------------------------------------------- |
| `info`         | Default. Users can mute.                                          |
| `announcement` | Admin-broadcast category. Users can mute.                         |
| `security`     | High-priority (password change, MFA change). **Cannot be muted.** |
| _custom_       | Any other string. Users can mute.                                 |

**Runtime enforcement:** the `source` and `sourceType` fields are stamped by the runtime from the
calling plugin's `x-sovereign-plugin-id` header — plugins cannot forge sender identity.

**Web Push fan-out (RFC 0016):** when an operator configures VAPID keys, the platform
automatically delivers a background push notification to every subscribed device for the
recipient — on top of the in-app bell delivery. Plugins call the same `sdk.notifications.send()`
API regardless; the push fan-out is invisible and requires no plugin changes. Users opt in and
out per-device via **Account → Notifications → Enable push notifications**.

### `schedules` — recurring background jobs (RFC 0046 Phase 1)

Plugins can declare recurring server-side jobs that run without any browser
request — e.g. sending scheduled reminders, cleaning up expired rows, or
refreshing cached data. The platform's in-process scheduler invokes each
declared handler every `intervalMinutes` while the plugin is installed and
enabled.

```json
"schedules": [
  { "id": "due-reminders", "intervalMinutes": 1, "entry": "app/_jobs/due-reminders.ts" }
]
```

| Field             | Notes                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable schedule identifier, unique within the plugin (lowercase kebab-case).                                                                                                  |
| `intervalMinutes` | Minimum minutes between invocations (integer ≥ 1). A floor, not an exact cadence.                                                                                             |
| `entry`           | Handler module path relative to the plugin root, inside `app/`. Must be a `.ts` module; use an underscore-prefixed directory (e.g. `app/_jobs/`) so it never becomes a route. |

The entry module's **default export** is a `ScheduleHandler` from
`@sovereignfs/sdk`:

```ts
// app/_jobs/due-reminders.ts
import { sdk, type ScheduleContext } from '@sovereignfs/sdk';

export default async function dueReminders(ctx: ScheduleContext): Promise<void> {
  const db = await sdk.db();
  // …query your plugin's tables, then notify:
  await sdk.notifications.send(
    { recipientUserId: userId, title: 'Task due', url: '/tasks' },
    ctx.headers, // synthetic headers carrying this plugin's identity
  );
}
```

**Handlers must be idempotent.** Phase 1 is deliberately not a job queue:
there is no persistence, no retries, and no backoff. The last-run marker lives
in memory, so a restarted instance re-arms every schedule, and each replica of
a multi-node deployment ticks independently — claim work with conditional
updates (e.g. `UPDATE … WHERE sent_at IS NULL`) before acting on it, and only
act when the claim succeeded. Thrown errors are caught and logged; the failed
schedule waits out its own interval before running again.

**No originating request.** There is no session and no user in scope —
handlers run as the plugin itself. `ctx.headers` carries the plugin's identity
for SDK surfaces that attribute by request headers (`sdk.notifications.send`).
Query the users to act for from your own tables (always scoped by `tenant_id`).

**Dev-mode caveat:** schedule handlers are composed into the runtime at
generate time and imported at server startup — editing a handler requires a
dev-server restart (unlike routes, they do not hot-reload). Operators can
disable all plugin schedules with `SOVEREIGN_SCHEDULER_DISABLED=1`.

### `jobs` — background jobs (RFC 0046)

`sdk.jobs` is the general-purpose complement to `schedules` above: a
persistent, retried, queue-backed mechanism for one-off and dynamically
recurring work, rather than a fixed manifest-declared interval. Use
`schedules` for a simple fixed-cadence tick (e.g. "run every 5 minutes");
use `jobs` when you need any of: work triggered by a user action (enqueue
a one-off export/import/sync), retries with backoff on failure, work that
must survive a runtime restart, progress reporting, or a recurring cadence
computed at runtime (a user-configurable cron schedule) rather than fixed
in the manifest. The two mechanisms coexist — neither is deprecated —
and share the same underlying idioms (synthetic `ctx.headers`, idempotent
handlers).

Requires the `jobs:write` permission. Declare each job **type** your plugin
handles and the handler module that implements it:

```json
"permissions": ["jobs:write"],
"jobs": [
  { "type": "sync.remote", "entry": "app/_jobs/sync-remote.ts", "maxAttempts": 5 }
]
```

| Field         | Notes                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | Plugin-local job type name, unique within the plugin, lowercase dot-separated segments (e.g. `"sync.remote"`). The runtime namespaces it to `<pluginId>:<type>` internally.   |
| `entry`       | Handler module path relative to the plugin root, inside `app/`. Must be a `.ts` module; use an underscore-prefixed directory (e.g. `app/_jobs/`) so it never becomes a route. |
| `maxAttempts` | Default max attempts for jobs of this type when a caller's `enqueue()`/`schedule()` call doesn't specify one (optional, integer ≥ 1; falls back to 3).                        |
| `description` | Optional human-readable note.                                                                                                                                                 |

The entry module's **default export** is a `JobHandler` from
`@sovereignfs/sdk` — invoked whenever a claimed job of that `type` becomes
due, exactly like `schedules`' `entry`/composed-at-generate-time model (this
is deliberate: a job handler must be reachable without any HTTP request ever
touching the plugin's routes, so it's wired the same way — a manifest entry
composed into the runtime's build graph — rather than a runtime `register()`
call a route module would only make on first load):

```ts
// app/_jobs/sync-remote.ts
import type { JobContext } from '@sovereignfs/sdk';

export default async function syncRemote(ctx: JobContext, payload: unknown): Promise<void> {
  const { accountId } = payload as { accountId: string };
  await ctx.reportProgress(10, 'Fetching remote data');
  // …do the work, calling ctx.reportProgress() periodically for long jobs…
  await ctx.reportProgress(100);
}
```

From a server action or route handler, callers enqueue or schedule work
through `sdk.jobs`:

```ts
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';

// One-off, run as soon as claimed:
await sdk.jobs.enqueue({ type: 'sync.remote', payload: { accountId } }, await headers());

// Recurring, cron + timezone:
await sdk.jobs.schedule(
  { type: 'cleanup.expired', cron: '0 3 * * *', timezone: 'UTC' },
  await headers(),
);
```

`enqueue()`/`schedule()`/`cancel()`/`get()` all take an explicit
`Headers` argument rather than reading `next/headers()` internally — this is
what lets a job handler call them too (pass `ctx.headers`), so a job can
enqueue further jobs. `dedupeKey` makes `enqueue()`/`schedule()` idempotent:
calling with a `dedupeKey` that matches an already-active (queued/scheduled/
running) job of your plugin returns that job instead of creating a
duplicate — useful for "at most one sync in flight per account" patterns.

**Lifecycle and retries.** A job is `queued` (one-off, due) or `scheduled`
(recurring, waiting for its next `cron` occurrence), then `running` once
claimed, then `succeeded`/`failed` (one-off) or back to `scheduled` at its
next occurrence (recurring — a successful or exhausted-retries run always
re-arms the schedule rather than killing it permanently). A thrown error
retries with exponential backoff up to the job's `maxAttempts` before the
job (or, for a recurring job, that occurrence) is marked failed.

**No originating request**, same as `schedules`: `ctx.headers` carries the
plugin's identity for SDK surfaces that attribute by request headers.
Payloads must be JSON-serializable and small — large inputs belong in
`sdk.storage`, referenced by id.

**Dev-mode caveat:** job handlers are composed into the runtime at generate
time and imported at server startup — editing a handler requires a
dev-server restart, same as `schedules`. Operators can disable the job
worker with `SOVEREIGN_JOB_WORKER_DISABLED=1`. Console → System health
shows queued/scheduled/running counts and recent failures.

### `events` — realtime channels (RFC 0045)

`sdk.events` is for low-latency, ephemeral application state updates — list
changes, presence, cursors, progress updates. **It is not a durable queue,
not a notification inbox (`sdk.notifications`), and not an audit log
(`sdk.activity`).** Events are best-effort, unordered across processes, and
not persisted by default — a disconnected client must refetch state on
reconnect rather than trust it received every event.

Requires the `events:publish` permission to publish. Declare a channel
authorizer for every channel pattern your plugin wants subscribable:

```json
"permissions": ["events:publish", "events:subscribe"],
"events": [
  { "pattern": "list:*", "entry": "app/_events/authorize-list.ts" }
]
```

| Field         | Notes                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pattern`     | Plugin-local channel pattern this handler authorizes — lowercase colon-separated segments, optionally ending in a `:*` wildcard segment (e.g. `"list:*"` or exact `"list:overview"`). |
| `entry`       | Handler module path relative to the plugin root, inside `app/`. Must be a `.ts` module; use an underscore-prefixed directory (e.g. `app/_events/`) so it never becomes a route.       |
| `description` | Optional human-readable note.                                                                                                                                                         |

The entry module's **default export** is an `EventChannelAuthorizer` from
`@sovereignfs/sdk` — invoked whenever a user tries to subscribe to a channel
matching `pattern`, wired the same way as `schedules`' `entry` (manifest
declaration + generate-time static import, not a runtime `register()` call —
there is no reliable moment for plugin code to register a callback before
the first subscribe request needs it):

```ts
// app/_events/authorize-list.ts
import type { EventChannelAuthorizerContext } from '@sovereignfs/sdk';

export default async function authorizeList(ctx: EventChannelAuthorizerContext): Promise<boolean> {
  const listId = ctx.channel.split(':')[1];
  return userCanReadList(ctx.userId, listId);
}
```

**No matching declared pattern, or every matching handler returning
falsy/throwing, denies — subscriptions fail closed, not open.**

From server-side plugin code (a server action, route handler, or job
handler), publish with `sdk.events.publish()`:

```ts
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';

await sdk.events.publish(
  { channel: `list:${listId}`, type: 'item.checked', payload: { itemId } },
  await headers(),
);
```

The runtime prefixes `channel` with your plugin's ID before publishing — you
never see or set the namespaced form, and you cannot publish into another
plugin's channel. Payloads are capped at 16 KB.

**There is no `sdk.events.subscribe()`.** The browser subscribes via a
runtime route, not a server-side SDK call:

```
GET /api/events/stream?pluginId=<your-plugin-id>&channel=list:1
```

An `EventSource` connection receives one `data:` line (JSON `EventEnvelope`)
per published event. When `SOVEREIGN_EVENTS_TRANSPORT=polling` (or as a
general fallback), poll instead:

```
GET /api/events/poll?pluginId=<your-plugin-id>&channel=list:1&sinceId=<last-seen-id>
```

`poll` reads from a small, bounded, **in-memory, per-process** buffer (a few
minutes of recent events, not a database) — it exists specifically so
polling clients have something to read even though events aren't persisted;
it is not a substitute for `sdk.notifications` if you need guaranteed
delivery. Both routes run the identical authorization check (session, your
plugin's `events:subscribe` permission and enabled state, then your declared
channel authorizer) — polling is not a lesser-checked shortcut.

**Dev-mode caveat:** channel authorizer handlers are composed into the
runtime at generate time and imported at server startup — editing one
requires a dev-server restart, same as `schedules`. Operators can select the
transport with `SOVEREIGN_EVENTS_TRANSPORT` (`sse` default, `redis`, or
`polling`) and point it at Redis with the existing `REDIS_URL`.

### `monetization` — plugin monetization (RFC 0003)

Plugins can declare a monetization model to require users to hold a valid signed
license before accessing the plugin's routes. Platform plugins (`type: "platform"`)
are always free and may not declare `monetization`.

```jsonc
"monetization": {
  "model": "recurring",       // "free" | "one_time" | "recurring" | "pay_what_you_want"
  "interval": "month",        // required when model is "recurring"
  "tiers": [                  // optional — omit for single-price plugins
    { "id": "basic", "name": "Basic", "price": { "amount": 500,  "currency": "USD" } },
    { "id": "pro",   "name": "Pro",   "price": { "amount": 1500, "currency": "USD" } }
  ],
  "license": {
    // Raw 32-byte Ed25519 public key (base64url). The author signs license tokens
    // with the corresponding private key; the platform verifies offline.
    "publicKey": "<base64url Ed25519 public key>"
  }
}
```

**Monetization models:**

| Model               | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `free`              | Default — no entitlement required. Equivalent to omitting the field. |
| `one_time`          | Single payment grants perpetual access.                              |
| `recurring`         | Active subscription required (billed every `interval`).              |
| `pay_what_you_want` | User-chosen amount ≥ optional floor; grants access like `one_time`.  |

**How it works:** the runtime middleware checks for an active entitlement before
serving the plugin's `routePrefix`. If no valid license exists, the user is
redirected to the platform paywall page (`/paywall/<pluginId>`), which shows the
tiers and prices and lets the user import a license token. API routes under the
prefix return `402 Payment Required`.

**License tokens** are issued by the plugin author's billing system on confirmed
payment. The token format is `<base64url(JSON payload)>.<base64url(Ed25519 signature)>`.
Verification happens **offline** against the public key in the manifest — no
call to any Sovereign service or author service is needed. For recurring licenses,
`expiresAt` is set in the payload and renewal issues a new token.

**Manual / bank transfer flow:** the author confirms payment out of band and sends
the token directly to the user, who imports it via the paywall page or
**Account → Billing**.

**In-plugin tier gating:** if your plugin has tiers and you want to gate specific
features by tier, use `sdk.billing.getEntitlement()` inside server components. The
route-level access check (entitlement exists + not expired) is done automatically
by the middleware — `requireEntitlement()` is only needed for fine-grained
in-plugin checks.

> **`sdk.billing` is reserved** — the stub is in place but the live implementation
> ships in a future release. `sdk.billing.getEntitlement()` and
> `sdk.billing.requireEntitlement()` throw `NotImplementedError` until then.
> Route-level access (middleware gating) is fully functional now.

#### Testing monetization locally

The `example-plugins/example-monetized` plugin ships with a committed demo
keypair and a pre-signed token so you can walk through the full flow without
any billing setup. Set `SOVEREIGN_EXAMPLES_ENABLED=1` in your `.env` (see
[Example plugins](#example-plugins) above), start the dev server, and go to
`/example-monetized` — on first visit you will be redirected to the paywall
page because you have no entitlement yet.

**Step 1 — Generate a keypair** (once per plugin; keep the private key secret):

> **Tip — browser-based generator:** If you're the operator of a self-hosted
> instance, **Console → Entitlements → Generate license token** lets you
> generate a keypair in-browser, save both keys to instance storage in one
> click, and sign tokens immediately — no Node.js required and no manifest
> update needed (see [Key rotation](#key-rotation) below).

Otherwise, generate via Node:

```bash
node -e "
const c = require('crypto');
const { publicKey: pub, privateKey: priv } = c.generateKeyPairSync('ed25519');
const { x } = pub.export({ format: 'jwk' });
const { d } = priv.export({ format: 'jwk' });
console.log('Public key  (put in manifest):', x);
console.log('Private key (keep in secret): ', d);
"
```

Put the public key (`x`) in `manifest.json → monetization.license.publicKey`.
Store the private key in your billing backend — never commit it.

**Step 2 — Declare monetization in your manifest:**

```jsonc
"monetization": {
  "model": "recurring",
  "interval": "month",
  "tiers": [
    { "id": "pro", "name": "Pro", "price": { "amount": 1500, "currency": "USD" } }
  ],
  "license": {
    "publicKey": "<your base64url Ed25519 public key>"
  }
}
```

Run `pnpm generate` after editing the manifest. Visiting the plugin's route now
redirects to the paywall.

**Step 3 — Sign a license token** (your billing backend does this after payment;
for local testing you can run it manually):

```bash
node -e "
const c = require('crypto');
const priv = c.createPrivateKey({
  key: {
    kty: 'OKP', crv: 'Ed25519',
    x: '<YOUR_PUBLIC_KEY>',
    d: '<YOUR_PRIVATE_KEY>'
  },
  format: 'jwk'
});
const payload = Buffer.from(JSON.stringify({
  pluginId:  'your.plugin.id',
  sub:       'user@example.com',
  issuedAt:  Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
  tier:      'pro'
})).toString('base64url');
const sig = c.sign(null, Buffer.from(payload), priv).toString('base64url');
console.log(payload + '.' + sig);
"
```

The output is the token to deliver to the user.

**Step 4 — Import the token:**

The user pastes the token on the paywall page (`/paywall/<pluginId>`) and clicks
**Activate license** — or imports it later in **Account → Billing**. The platform
verifies the Ed25519 signature offline and grants immediate access.

**Step 5 — Test error paths:**

| Scenario                  | How to reproduce                                 | Expected result                           |
| ------------------------- | ------------------------------------------------ | ----------------------------------------- |
| No entitlement            | Visit the plugin route without importing a token | 303 redirect to `/paywall/<pluginId>`     |
| API route, no entitlement | `curl /api/<slug>/anything`                      | `402 Payment Required`                    |
| Expired token             | Set `expiresAt` in the past and sign             | "License has expired" on the paywall form |
| Wrong plugin              | Use a token signed with a different `pluginId`   | "License is for plugin X, not Y"          |
| Tampered token            | Flip a character in the signature half           | "Signature verification failed."          |
| Cancelled entitlement     | Cancel in Account → Billing, then revisit        | Redirected to paywall                     |

#### Key rotation

You can rotate the signing keypair after deployment without rebuilding the image.

The platform resolves the public key for token verification in this order:

1. **Instance storage** (`platform_settings` key `license_public_key:<pluginId>`) — written
   when an operator saves a keypair via Console → Entitlements → Generate license token.
   Takes precedence over the manifest.
2. **Manifest** (`monetization.license.publicKey`) — the build-time default, used for
   third-party plugins where the operator never holds the private key.

**To rotate via the Console (no redeploy):**

1. Open Console → Entitlements → Generate license token.
2. Click **Generate new keypair** — browser generates a fresh Ed25519 pair.
3. Click **Save to instance** — both the private key (`d`) and public key (`x`) are stored
   in `platform_settings`. Existing tokens signed with the old key will immediately fail; issue
   new tokens to existing subscribers before rotating in production.
4. Done. New tokens verify against the stored key.

The manifest value is not required to change. If you do update it (e.g. when publishing a new plugin version), it has no effect while an instance-stored key is present.

**Token payload reference:**

| Field       | Type   | Required | Description                                           |
| ----------- | ------ | -------- | ----------------------------------------------------- |
| `pluginId`  | string | yes      | Must match the manifest `id` exactly                  |
| `sub`       | string | yes      | Subscriber identity (email or instance domain)        |
| `issuedAt`  | number | yes      | Unix epoch seconds                                    |
| `expiresAt` | number | no       | Unix epoch seconds. Omit for perpetual licenses.      |
| `tier`      | string | no       | Tier ID (e.g. `"pro"`). Omit for single-tier plugins. |

### Example `manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "io.example.tasks",
  "name": "Tasks",
  "version": "0.1.0",
  "description": "A minimal, privacy-first task manager.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/tasks",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "repository": "https://github.com/sovereignfs/sovereign-plugin-tasks",
  "compatibility": { "minPlatformVersion": "0.5.0" }
}
```

## Using the SDK

Import everything platform-related from `@sovereignfs/sdk`:

```ts
import { sdk } from '@sovereignfs/sdk';
```

The SDK surface (`sdk.*`):

- **`auth`** — session and account.
  - `getSession()` → `Session | null`; `requireSession()` → `Session` (throws
    `NotAuthenticatedError` if unauthenticated).
  - `hasCapability(session, capability)` → `boolean` — checks whether the
    session holds a given platform capability (RFC 0021). Use this instead of
    comparing `user.role` directly; the platform may change role-to-capability
    mappings without changing the role names.
  - `changePassword({ currentPassword, newPassword })`,
    `listSessions()`, `revokeSession(token)`, `signOut()` (ends the current
    session; the caller redirects afterwards).

  ```ts
  const session = await sdk.auth.requireSession();
  // session.user: { id, email, name, image, role, tenantId, capabilities, verificationLevel }
  const { user } = session;

  // user.verificationLevel: 0 | 1 | 2 | 3 (RFC 0035) — 0 registered,
  // 1 email_verified, 2 mfa_enrolled, 3 admin_vouched. Cached the same
  // ~300s window as role/capabilities. Enforced by the platform on the
  // `user:manage` (level 1) and `role:assign` (level 2) capabilities, and
  // on any plugin declaring `minVerificationLevel` — see that field above.
  // A plugin may also read this directly for its own finer-grained gating.

  // Prefer capability checks over role comparison:
  if (sdk.auth.hasCapability(session, 'user:manage')) {
    // current user can manage other users
  }
  ```

- **`db`** — `getClient()` returns the platform Drizzle client (await it — the
  data layer is dialect-agnostic and async). Query your own slug-prefixed tables
  with it (see Database).
  ```ts
  const db = await sdk.db.getClient();
  ```
- **`mailer`** — `send({ to, subject, text, html }, requestHeaders?)`. Requires
  `mailer:send` and `mailer:sendExternal` (RFC 0062 — see "Plugin email"
  above); pass `await headers()` as `requestHeaders`. No-ops when SMTP is
  unconfigured. `html`/`text` are pre-rendered strings — the SDK does not
  render templates for you. A plugin wanting polished HTML email can add
  [React Email](https://react.email) as its own dependency and render to a
  string itself before calling `send()`; the platform's own branded
  templates (`@sovereignfs/mailer`, RFC 0031) are internal and not
  importable by plugins (SDK boundary rule).
- **`email`** — `sendToUser({ recipientUserId, templateId, subject, html?, text?, data? }, requestHeaders?)`
  (RFC 0062). The recommended default over `mailer.send` — see "Plugin email"
  above. Requires `mailer:send`; pass `await headers()` as `requestHeaders`.
- **`platform`** — `getConfig()` → `{ tenantName, inviteOnly, version, instanceName, instancePrimaryColor?, instanceId, emailFromName?, emailLogo?, instanceUrl }`
  (await it). `instanceName` falls back to `tenantName` when no instance name is
  configured; `instancePrimaryColor` is a validated 6-digit hex string or
  `undefined`. `instanceId` is a stable UUID generated once at bootstrap.
  `emailFromName`/`emailLogo` (RFC 0031) are the operator's email-branding
  overrides, `undefined` when unset; `instanceUrl` is this instance's public
  base URL — use it instead of hardcoding a URL when building absolute links
  (e.g. in outbound email). Use these to display the operator's instance
  identity in plugin UI without reading CSS variables.
- **`directory`** — member selection for sharing, assignment, membership, and
  recipient flows (RFC 0041). No manifest permission is required. Use
  `searchUsers({ query, limit? })` for user-picker search and
  `resolveUsers({ ids })` to refresh profile labels for IDs already stored in
  your plugin tables. Both methods return only active users in the current
  tenant and only display-safe fields: `{ id, email, name, image }`.
  ```ts
  const matches = await sdk.directory.searchUsers({ query: 'kas', limit: 10 });
  const selected = await sdk.directory.resolveUsers({ ids: memberUserIds });
  ```
  Queries must be at least two characters and are capped to 20 results by
  default, 50 maximum. Do not call Console/admin user routes from plugins; store
  selected user IDs in your own membership/share table and resolve them through
  this SDK surface when rendering.
- **`secrets`** — encrypted runtime-created plugin secrets (RFC 0043). Use
  `create/get/list/update/delete` for OAuth tokens, PATs, webhook secrets, and
  other values created after deployment. `list` returns metadata only; exports
  never include plaintext values. Use plugin-scoped env vars for operator-supplied
  deployment secrets instead.
- **`data`** — cross-plugin data sharing (RFC 0002). `sdk.data.provide(contract,
resolver)` registers a resolver; `sdk.data.query(ref, params)` reads from
  another plugin's contract (throws `ConsentRequiredError` without a user grant).
  See the [`data` manifest field section](#data--cross-plugin-data-sharing-rfc-0002) above.
- **`activity`** — `sdk.activity.log(entry)` records a scoped audit event
  (RFC 0005). The runtime injects the actor identity, tenant, and plugin so a
  plugin cannot forge actor context. Plugin-sourced events are always
  `user`-scoped (visible to the acting user in their Activity feed, and to
  admins in the Console feed). Requires `activity:write` in the manifest.
  ```ts
  await sdk.activity.log({
    action: 'list.created',
    targetType: 'list',
    targetId: newList.id,
    summary: `Created list "${newList.title}"`,
    metadata: { title: newList.title },
  });
  ```
- **`portability`** — participate in user-initiated data export/import
  (RFC 0007, RFC 0052). Register an export resolver
  (`sdk.portability.provideExport(resolver)`) and/or an import handler
  (`sdk.portability.provideImport(handler)`) from a server-side handler (Server
  Component, Route Handler, or Server Action). The resolver receives an
  `ExportContext { userId, tenantId, options: { includeFiles } }` — respect
  `options.includeFiles` when deciding whether to attach large blobs — and must
  return a `PluginExportSection { pluginId, pluginVersion?, schemaVersion, data,
blobs?, secretMetadata?, warnings? }`. `pluginVersion` is optional; the runtime
  always overwrites it with your plugin's installed manifest version, so you
  can't misreport it. `secretMetadata` lists metadata for secrets your plugin
  owns (`{ label, provider, exists }`) — **never** include plaintext secret
  values anywhere in the export. `warnings` surfaces non-fatal notices (e.g. a
  file that was skipped) in the bundle manifest. If your resolver throws, the
  plugin is excluded from the bundle and recorded in the manifest's `failures`
  list — it does not abort the rest of the user's export. The import handler
  receives the stored section plus an `ImportContext { userId, tenantId,
remapId(originalId) }` — use `remapId` to translate stored IDs to fresh ones
  for the importing account (referential integrity). Declare `data:export` and/or
  `data:import` in the manifest; the runtime skips unregistered or un-permitted
  plugins silently.

  ```ts
  // Server Component or Route Handler in your plugin:
  import { sdk } from '@sovereignfs/sdk';

  await sdk.portability.provideExport(async ({ userId, options }) => ({
    pluginId: 'io.example.tasks',
    schemaVersion: 1,
    data: { tasks: await myDb.getTasksForUser(userId) },
    blobs: options.includeFiles ? await myDb.getAttachmentsForUser(userId) : undefined,
    secretMetadata: await myDb.listSecretMetadataForUser(userId),
  }));

  await sdk.portability.provideImport(async (section, { userId, remapId }) => {
    const { tasks } = section.data as { tasks: { id: string; title: string }[] };
    for (const task of tasks) {
      await myDb.createTask({ id: remapId(task.id), userId, title: task.title });
    }
  });
  ```

  **Account deletion (RFC 0033):** register a deletion handler via
  `sdk.portability.provideDelete(handler)` to clean up your plugin's data when a
  user account is deleted (self-service or admin-initiated). The handler receives
  `DeletionContext { userId, tenantId, db }` where `db` is your plugin's Drizzle
  client. Return `{ deleted: number; errors?: string[] }`. Plugins without a
  handler have their rows left in place — document this in your plugin's README.
  The runtime runs all handlers in parallel with a 30 s timeout each.

  ```ts
  await sdk.portability.provideDelete(async ({ userId, db }) => {
    const result = await (db as MyDb).delete(myTasks).where(eq(myTasks.userId, userId));
    return { deleted: result.rowsAffected ?? 0 };
  });
  ```

  **Cross-plugin references in exports (RFC 0051):** a `PluginExportSection`
  may also include `references?: PluginReference[]` — opaque links your plugin
  holds to another plugin's records (see `sdk.plugins` below for the shape).
  These are carried as **inert metadata only**: the platform never
  dereferences them on export or import, and importing a reference never
  grants access to the provider plugin.

  **Export completeness (RFC 0068):** `manifest.json`'s `installedPlugins`
  lists every plugin installed for the exporting user's tenant — regardless of
  export participation — each flagged with `enabled`, `participatesExport`,
  and `participatesImport`. A plugin that declares `data:export` and is
  enabled but has no registered exporter (e.g. it declared the permission
  without ever calling `provideExport`) is recorded in `notExported` with a
  reason (`no-export-hook` or `disabled`) instead of being silently absent
  from the bundle — the Account Data tab surfaces this list by name so a user
  can tell "no data" from "this app doesn't support export yet." **Declare
  `data:export`/`data:import` only once you've actually registered the
  matching hook** — an unearned permission declaration is exactly the gap this
  closes. Export is synchronous and capped at 50MB (`MAX_EXPORT_BYTES` in
  `runtime/app/api/account/export/route.ts`) — a bundle that would exceed the
  cap returns a clear error rather than a truncated or unimportable ZIP; keep
  large attachments behind `options.includeFiles` so a user can retry with a
  smaller export.

- **`plugins`** — dependency discovery and cross-plugin references
  (RFC 0051). `sdk.plugins.get(id)` / `sdk.plugins.list(filter?)` return
  `PluginAvailability { id, name, routePrefix, icon?, installed, enabled,
availableToUser, providesContracts }` for installed plugins —
  `availableToUser` folds in disabled/adminOnly/paywall status for the
  _current_ user (`false` outside an authenticated request). Use this before
  offering an integration with an optional sibling plugin — declare it in the
  manifest `integrations.optional` field (see above) for install/discovery UX.
  `sdk.plugins.getConsentStatus(ref)` checks whether the current user has
  granted your plugin's `data.consumes` contract without doing a full
  `sdk.data.query()` call. Also exports `PluginReference { providerId,
resourceType, resourceId, contract?, version?, labelSnapshot?, metadata?,
linkedAt }` — the standard shape for storing an opaque pointer to another
  plugin's record in your own tables. `resourceId` is opaque to you; treat a
  stored reference as a nullable link and handle the provider being
  uninstalled, disabled, revoked, or the resource deleted — a live dereference
  always goes through `sdk.data.query()` and current consent, never the
  reference alone.

  ```ts
  const crm = await sdk.plugins.get('io.example.crm');
  if (crm?.availableToUser) {
    // offer "Link to contact" — store a PluginReference pointing at the CRM record
  }
  ```

- **`device`** — surface detection (RFC 0080): `browser` | `mobile` | `desktop`.
  Server tier `sdk.device.getSurface()`/`getShellVersion()`/`isNativeShell()`
  reads the runtime-injected `x-sovereign-surface` header (`next/headers`), safe
  to call anywhere — returns `'browser'`/`null` outside a plugin route context,
  never throws. Client tier `useDeviceEnvironment()`/`readEnvironment()` live on
  the dedicated `@sovereignfs/sdk/device-client` subpath (import from the
  barrel fails to build in a `'use client'` component — it transitively reaches
  `next/headers`). **A presentation hint only, never a security boundary** —
  see [Building for mobile](#building-for-mobile) below and the hard rule in
  `docs/architecture-rules.md`. The same `device-client` subpath also exports
  the device **bridge** capability surface (RFC 0083): `supports(capability,
version?)` (sync, `false` until the handshake resolves — capabilities are
  progressive enhancement, don't block render on them), `getTransport()`,
  `getShellInfo()`, `haptics.impact(style?)` (no permission needed — falls
  back to the Vibration API on the web transport), and
  `nativeNotifications.{getPermission, requestPermission, show}()` (needs the
  `device:notifications` permission; requires `pluginId` on
  `requestPermission()` since this module can't read a server-injected
  header — see the permission table below for the enforcement caveat this
  implies), and `biometrics.confirm(reason?, pluginId?)` (needs the
  `device:biometrics` permission; Face ID/Touch ID/Android `BiometricPrompt`
  via the Capacitor transport — **a local presence confirmation only, never
  a session or platform-auth grant**; `unavailable` on the web transport and
  on desktop, and on any device with no biometrics enrolled). Returns typed
  `DeviceResult` (`ok`/`unavailable`/`denied`/`dismissed`/`failed`) instead
  of throwing for expected outcomes. On a native-bridge transport (Tauri
  today; `supports('notifications.native')`), `getPermission()`/
  `requestPermission()` always report `'granted'` — the bridge exposes a
  one-shot `show`, not a queryable permission state, and the OS gates the
  real permission at `show()`-time, surfaced through that call's own
  `DeviceResult` rather than an up-front check (workstream 0003 leg 3).
- **`env`** — plugin-scoped environment variables (RFC 0018). `sdk.env.get(key)`
  reads the calling plugin's `SV_PLUGIN_<SLUG>_<KEY>` env var, identified by
  the `x-sovereign-plugin-id` request header. Returns `null` when absent or
  called outside a plugin route. Declare vars in the manifest `env` field
  (see above). Server-side only (uses `next/headers`).
- **`connections`** — external provider connection metadata (RFC 0049).
  `sdk.connections.create/list/get/update/disconnect/markUsed/markError`
  manages platform-owned metadata rows for the calling plugin; all credential
  values stay in `sdk.secrets`. `createOAuthState` and `verifyOAuthState` provide
  signed OAuth callback state helpers. `getProviderConfig(provider)` returns the
  calling plugin's effective server-side provider config, merging plugin-scoped
  runtime env vars with Console-managed config where Console values take
  precedence.
- **`notifications`** — Notification Center (RFC 0015). `sdk.notifications.send(input, requestHeaders)`
  delivers a notification to a user's inbox. Requires the `notifications:send` manifest
  permission. The runtime injects `source` (plugin ID) and `sourceType` automatically —
  plugins supply `recipientUserId`, `title`, and optionally `body`, `url`, `category`,
  and `icon`. Users can mute categories (except `security`) in their Account Notifications
  tab. See [notifications (RFC 0015)](#notifications-rfc-0015) below.
- **`billing`** — plugin monetization / entitlement gating (RFC 0003).
  `sdk.billing.getEntitlement(headers)` returns the current user's active
  entitlement for the calling plugin (tier + expiry), or `null` if none exists.
  `sdk.billing.requireEntitlement(headers)` throws `EntitlementRequiredError`
  when absent. Route-level access is gated automatically by the middleware —
  these helpers are only needed for **in-plugin feature gating by tier**.
  See [`monetization` manifest field](#monetization--plugin-monetization-rfc-0003) above.
  > **Reserved** — stubs are in place; the live implementation ships in a future
  > release. Both methods throw `NotImplementedError` until then.
- **`storage`** — plugin-scoped binary object storage (RFC 0044). Requires the
  `storage:readWrite` manifest permission. See
  [Plugin file storage (RFC 0044)](#plugin-file-storage-rfc-0044) below.
- **`webhooks`** — public plugin webhook helpers (RFC 0050).
  `sdk.webhooks.verifyHmac(input, requestHeaders)` verifies a signature
  against a `'plugin'`-scoped secret; `sdk.webhooks.checkReplay(input,
requestHeaders)` claims a `(provider, eventId)` pair for replay
  protection. Both take `requestHeaders` as a **required** argument and
  fail closed (`false`) rather than defaulting to `'unknown'` if it's
  missing a plugin id — there's no legitimate call site without one. See
  [`webhooks` — public plugin webhooks (RFC 0050)](#webhooks--public-plugin-webhooks-rfc-0050)
  above.
- **`events`** — ephemeral realtime channels (RFC 0045). `sdk.events.publish(input,
requestHeaders)` publishes to a plugin-scoped channel; requires the
  `events:publish` manifest permission. There is no `sdk.events.subscribe()` —
  clients subscribe via `GET /api/events/stream` (or `/api/events/poll` as a
  fallback), gated by a manifest-declared `events[]` channel authorizer. See
  [`events` — realtime channels (RFC 0045)](#events--realtime-channels-rfc-0045)
  above.

### The SDK boundary rule

Plugins **must not** import from `runtime/src` or internal `@sovereignfs/*`
packages (`db`, `manifest`, `mailer`) directly — only `@sovereignfs/sdk` and
`@sovereignfs/ui`. ESLint enforces this; violations fail `pnpm lint`.

### UI

Build your interface with the Sovereign Design System (`@sovereignfs/ui`):

```ts
import { Button, Input, Textarea, Dialog, Drawer, Icon } from '@sovereignfs/ui';
```

Design tokens (`--sv-*` CSS custom properties) are injected globally by the
runtime shell — reference them directly in your CSS, e.g.
`color: var(--sv-color-text-primary)`. See [design-system.md](design-system.md).

#### Building forms

Wrap a labeled control in `FormField` rather than hand-rolling a
`<label htmlFor>` + hint/error paragraph. Its `children` is a render prop —
it receives the props (`id`, `aria-describedby`, `aria-invalid`, `required`)
that must be spread onto the control so the label, hint, and error stay
correctly associated:

```tsx
import { Button, FormField, Input, Select, Textarea } from '@sovereignfs/ui';

<FormField label="Email" hint="Used for sign-in" required>
  {(field) => <Input {...field} type="email" />}
</FormField>

<FormField label="Role" error={errors.role}>
  {(field) => (
    <Select {...field}>
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    </Select>
  )}
</FormField>

<FormField label="Notes">
  {(field) => <Textarea {...field} rows={4} />}
</FormField>
```

`id` is generated automatically via `useId()` if you don't pass one. `field`
works with any control — `Input`, `Select`, `Textarea`, or a native element —
as long as it forwards `id`/`aria-*` to the underlying form element.

#### Editor workflow primitives

Content and data-entry plugins should use the editor primitives before adding
plugin-local generic control CSS:

```tsx
import {
  CodeTextarea,
  FormField,
  SplitPane,
  StatusBadge,
  TagInput,
} from '@sovereignfs/ui';

<StatusBadge status="draft">Draft</StatusBadge>

<SplitPane
  primary={<CodeTextarea aria-label="Markdown source" defaultValue={source} />}
  secondary={<article>{preview}</article>}
/>

<FormField label="Tags" hint="Press Enter or comma to add a tag.">
  {(field) => <TagInput {...field} value={tags} onChange={setTags} />}
</FormField>

<FormField label="Raw frontmatter" error={yamlError}>
  {(field) => <CodeTextarea {...field} invalid={Boolean(yamlError)} defaultValue={yaml} />}
</FormField>
```

Use `StatusBadge` for file sync and lifecycle states such as draft, synced,
conflict, pending delete, warning, and error. Use `SplitPane` for editor/preview
or list/detail layouts instead of hand-rolled resizable panes; it stacks to one
column on narrow screens and keeps the separator keyboard-operable. Use
`TagInput` for frontmatter arrays and lightweight labels; it handles Enter,
comma, Backspace, paste splitting, duplicate rejection, and validation messages.
Use `CodeTextarea` for Markdown/YAML/JSON where whitespace and monospace
rendering matter.

#### When to reach for a primitive vs. local CSS

Use a `@sovereignfs/ui` primitive (`Button`, `Input`, `Select`, `Textarea`,
`CodeTextarea`, `TagInput`, `Checkbox`, `FormField`, `Card`, `Badge`,
`StatusBadge`, `SplitPane`, `PageHeader`, `PageContainer`, `SystemBanner`, …) for any generic
control or page-structure pattern — anything another plugin, or the platform
shell, would plausibly need too. Keep CSS local for layout that is genuinely
specific to your plugin's domain (a custom data table, a graph, a canvas) — the
design system does not try to cover every possible layout, only the repeated
primitives.

A short "do not" list:

- Don't reference primitive colour tokens (`--sv-grey-*`, `--sv-red-*`, …) —
  use semantic tokens (`--sv-color-*`) only.
- Don't hardcode hex/`rgb()` colours in your CSS — use a token, or a status
  token (`--sv-color-error-text`, etc.) if none fits.
- Don't remove the focus ring (`outline: none`) without providing an
  equivalent `:focus-visible` treatment.
- Don't nest a `Card` inside another `Card` — pick one surface per visual
  group.
- Don't ship an icon-only control without an accessible name (`aria-label`
  on the control, or a visually-hidden label).

#### Page layout

The runtime shell already pads your plugin's main content (32px desktop /
16px mobile) — don't add your own outer `padding` or `max-width` in your
`app/layout.tsx` or page CSS. If you want to additionally constrain content to
a readable width, wrap it in `PageContainer` instead of local container CSS:

```tsx
import { PageContainer } from '@sovereignfs/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageContainer maxWidth="md">{children}</PageContainer>;
}
```

See `docs/design-system.md`'s ["Page layout"](./design-system.md#page-layout--pagecontainer)
section for the full `maxWidth` scale and the `data-plugin-fullbleed` opt-out
for plugins that manage their own full-bleed layout.

#### Using icons

```tsx
import { Icon } from '@sovereignfs/ui';

// Decorative (described by surrounding text — hide from screen readers)
<Icon name="trash-2" size="md" aria-hidden />

// Meaningful (standalone — add a screen-reader label)
<Icon name="log-out" aria-label="Sign out" />
```

Available sizes: `"sm"` (16px), `"md"` (20px, default), `"lg"` (24px). Color
follows `currentColor` automatically — icons inherit the surrounding text color
and recolor with theme changes.

The full icon list is in `scripts/icon-list.ts`. To request a new icon for the
platform set, open an issue; to use an icon not in the set today, copy the SVG
inline in your plugin (Lucide icons are ISC-licensed).

#### Plugin-identity icons vs UI-affordance icons

Your plugin's `icon.svg` (the `icon` manifest field) is your plugin's **identity**
— it appears in the Launcher tile and the sidebar. It is rendered as
`<img src="/plugin-icons/<id>.svg" alt="">` by the platform, never as raw SVG, so
arbitrary SVG features (scripts, foreignObject) are inert.

For UI-affordance icons _within_ your plugin UI, use `<Icon name="…">` from
`@sovereignfs/ui`. Do **not** use `dangerouslySetInnerHTML` to inject third-party
SVG content — this is an XSS vector.

**Guidance for your `icon.svg`:** draw a `24×24` `viewBox="0 0 24 24"` stroke
icon with `fill="none" stroke="currentColor" stroke-width="2"` so your icon sits
visually with the Lucide-based platform icons. The monogram (first two initials of
your plugin name) is shown as a fallback when no `icon.svg` is present.

## Database

Plugins access the database through `await sdk.db.getClient()`. Every plugin gets its own
dedicated store — a separate SQLite file (or `sqld` namespace) or Postgres schema. There is
no `shared`/`isolated` choice to make: no table prefix is required, and uninstalling a
plugin drops its entire store. Migrations live at `plugins/<id>/migrations/` and always
run against the plugin's own dedicated store — once a migration file ships, treat it as
append-only (see ["Migration files are append-only once shipped"](#migration-files-are-append-only-once-shipped) below).

`type: "platform"` plugins (`account`, `console`, `launcher`) are the one exception — they
administer the platform's own core data directly, the same as `apps/auth`, rather than
owning data of their own, so they are never isolated. This isn't something a plugin author
configures; it follows automatically from `type`, and only applies to first-party platform
plugins in this monorepo.

A plugin cannot request a database dialect — the operator's instance-wide
`DB_DIALECT` choice applies to every database the platform opens, including
every isolated plugin store. There is no manifest override (workstream 0009
leg 1 removed the `database.dialect` field that used to allow one).

On a SQLite-dialect instance, a plugin's dedicated store is always an sqld
**namespace** — sqld is a required part of a SQLite deployment, not
optional, and there is no plain-file fallback for any plugin. See
[docs/self-hosting.md's sqld section](self-hosting.md#sqld-libsql-server-rfc-0091).

There is no `database` field left in the manifest — the `database.isolation`
option was retired first (task 8.28, every plugin is unconditionally
isolated), and `database.requireEncryption` (RFC 0071's at-rest encryption
opt-in) was retired after it. Neither dialect currently has an
application-level at-rest encryption option; rely on disk/volume-level
encryption if this matters for your deployment. A future resolution covering
both dialects is tracked separately, not yet designed — this section will be
updated if a manifest field returns for it.

```ts
const db = await sdk.db.getClient();
```

**Rules that apply:**

- `tenant_id` on every user-scoped table (multi-tenancy readiness).
- Your `schema.ts` can target one dialect (typically `sqlite-core`) — Drizzle's
  query builder is bound to the client connection, not the table object, so it
  works against Postgres too, **but only if Postgres columns serialize
  identically** (plain `integer` for booleans/timestamps, never native
  `boolean`/`bigint`). You still need a separate `pgTable`-based schema file to
  generate Postgres migrations — `drizzle-kit` cannot read a `sqliteTable()`
  schema for that. See `docs/plugin-database.md` for the full pattern.

See **[`docs/plugin-database.md`](../docs/plugin-database.md)** for the full reference:
shared conventions, isolated provisioning details (SQLite file path, Postgres schema
naming), migration setup, lifecycle (provision / uninstall / `--keep-data`), and backup.

## Plugin file storage (RFC 0044)

`sdk.storage` gives a plugin a scoped place to put binary objects — attachments,
generated documents, imports/exports, thumbnails, media captured from the browser —
without inventing ad hoc paths. Requires the `storage:readWrite` manifest permission.

```ts
import { sdk } from '@sovereignfs/sdk';

const object = await sdk.storage.put({
  key: 'receipts/2026-01.pdf',
  body: fileBytes, // Blob | ArrayBuffer | Uint8Array
  contentType: 'application/pdf',
  ownerUserId: session.user.id, // omit for a plugin-scoped (not per-user) object
  metadata: { source: 'import' },
});

const found = await sdk.storage.get('receipts/2026-01.pdf'); // StorageObject & { body: ReadableStream } | null
found?.metadata; // { source: 'import' } — round-tripped back exactly as passed to put()
await sdk.storage.delete('receipts/2026-01.pdf');
const all = await sdk.storage.list('receipts/'); // optional key prefix filter

// Short-lived, read-only download URL (default 5 min, max 1 hour):
const url = await sdk.storage.getSignedUrl('receipts/2026-01.pdf', { expiresInSeconds: 600 });
```

**Ownership and access.** An object created with `ownerUserId` is only readable/listable
by that user (or, once other users can see it, never — there is no sharing). Omitting
`ownerUserId` makes an object plugin-scoped: any request in that plugin/tenant can read
it, which is the right shape for plugin-generated assets nobody "owns" (a shared logo, a
generated report template). `key` is the plugin-facing logical path — the physical
filename on disk is always a server-generated opaque ID, so a caller-supplied `key` can
never path-traverse into another object or outside the plugin's storage directory.

**Files are private by default.** `sdk.storage.get()`/`getSignedUrl()` are the only ways
to read bytes back — there is no public URL construction. Serve a file to the browser
either from your own authenticated route handler (call `sdk.storage.get()` there after
your own membership/ownership check) or via `getSignedUrl()`, which returns a
`/api/storage/<token>` URL good for one object until it expires. The token is
HMAC-signed and cannot be extended or widened by editing it; the runtime serves it with
`Cache-Control: private, no-store` and does not require a session cookie (so it works
from a plain `<img src>` or direct download link). Public, permanent file hosting is out
of scope for v1 — combine a public plugin route (RFC 0042) with your own authorization
check if you need that.

**Backend.** v1 ships a local-filesystem backend only, under
`data/plugins/<pluginId>/storage/` — no S3/CDN configuration is required or possible yet.
This is intentionally invisible to plugin code: if the platform later adds an
S3-compatible backend, `sdk.storage` calls do not change.

**Quotas.** Conservative default limits apply per object and per plugin (see
[`SOVEREIGN_STORAGE_MAX_OBJECT_BYTES` / `SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES`](self-hosting.md)
in `self-hosting.md`); `sdk.storage.put()` throws when either limit would be exceeded.
`metadata` has its own, separate 8 KiB cap, enforced at write time.

**Metadata.** `metadata` is opaque, plugin-defined JSON — the platform never inspects
it. It round-trips unchanged through `get()`/`list()`/`put()`'s return value, which is
what makes it the right place for the small, non-sensitive routing fields an encrypted
object needs alongside its ciphertext (see
[Client-side encryption](#client-side-encryption-rfc-0060) below) — there is no
separate metadata table or schema to extend.

**Lifecycle.** User-owned storage objects (rows and physical files) are deleted
automatically when that user's account is deleted (RFC 0033). Deleting an object via
`sdk.storage.delete()` removes both the metadata row and the physical file immediately.

## Client-side encryption (RFC 0060)

`sdk.e2ee` (requires the `e2ee:use` manifest permission) persists client-side
encryption metadata — a user's encryption profile, recovery-secret wrapper, and
enrolled-device records. It only ever stores **opaque wrapped ciphertext and
non-sensitive algorithm/KDF metadata**; the runtime and server-side plugin code
never see a plaintext Client Master Key (CMK), Data Encryption Key (DEK), or
decrypted object content. All actual cryptography happens in the browser via
separate, browser-only subpath exports rather than the main `@sovereignfs/sdk`
barrel — the barrel also reaches server-only modules, and importing it from a
`'use client'` component fails to build:

```ts
// Key material — CMK generation, master-key wrap/unwrap, per-object DEK wrap/unwrap.
import {
  generateCmk,
  generateDek,
  generateRecoverySecret,
  wrapCmkWithRecoverySecret,
  unwrapCmkWithRecoverySecret,
  wrapDekWithCmk,
  unwrapDekWithCmk,
} from '@sovereignfs/sdk/e2ee-crypto';

// This device's local wrapping key, persisted in IndexedDB.
import { getOrCreateDeviceId, storeDeviceKey, getDeviceKey } from '@sovereignfs/sdk/e2ee-device';

// Encrypt/decrypt actual object content under a DEK.
import { encryptBlob, decryptBlob, encryptJson, decryptJson } from '@sovereignfs/sdk/e2ee-object';

// Normalized locked/unlocked/not-set-up/unsupported state detection.
import { getE2eeLocalState } from '@sovereignfs/sdk/e2ee-state';
```

**Key hierarchy.** Recovery secret or an enrolled device's local key unlocks the
CMK; the CMK wraps per-object DEKs; a DEK encrypts one object's binary content
(`encryptBlob`/`decryptBlob`) and/or its human-readable metadata
(`encryptJson`/`decryptJson`). Generate a fresh DEK per object — never reuse
one across objects — so compromising a single object's key never exposes any
other object.

**Setup and unlock** (already built into the Account plugin's Security page —
plugins do not need to build their own setup UX): `generateCmk()` in the
browser, wrap it with a user-recorded recovery secret
(`wrapCmkWithRecoverySecret`) and with this device's own key
(`wrapCmkWithDeviceKey`), then persist both wrapped copies via
`sdk.e2ee.setRecoveryWrapper()`/`sdk.e2ee.enrollDevice()`. A lost device and a
lost recovery secret both mean the encrypted data is unrecoverable — there is
no operator escrow, by design (the threat model assumes an operator can be
compromised).

**Checking state before touching encrypted data:** call `getE2eeLocalState(profile,
devices)` with the profile/enrollments loaded from `sdk.e2ee`. It returns
`{ state, deviceId, deviceKey, activeEnrollment }` where `state` is one of
`'not-set-up' | 'locked' | 'unlocked' | 'unsupported'` — plugins must show
locked-state UX (not silently fail) when `state !== 'unlocked'`, and must never
attempt to unwrap a CMK/DEK unless `state === 'unlocked'`.

**Encrypting an object and storing it via `sdk.storage` (RFC 0060 step 5):**
there is no dedicated `sdk.e2ee` storage method — `sdk.storage`'s `metadata`
field (opaque, plugin-defined JSON, round-tripped unchanged on `get()`/`list()`,
see [Plugin file storage](#plugin-file-storage-rfc-0044) above) is exactly
where the wrapped DEK and algorithm version belong, so the two SDK surfaces
compose directly. Encryption happens in the browser; the resulting ciphertext
`Blob` and metadata object are then passed to a server action or route handler
that calls `sdk.storage`, same as any other upload:

```ts
// In the browser, once state.state === 'unlocked' (cmk from unwrapCmkWithDeviceKey):
const dek = await generateDek();
const wrappedDek = await wrapDekWithCmk(dek, cmk);
const encryptedBlob = await encryptBlob(dek, fileBlob);
const encryptedMetadata = await encryptJson(dek, { title, notes });
// Hand `encryptedBlob`/`encryptedMetadata`/`wrappedDek` to your upload action.

// Server-side (route handler / server action) — never sees plaintext:
await sdk.storage.put({
  key: `documents/${crypto.randomUUID()}`,
  body: encryptedBlob.ciphertext, // opaque ciphertext Blob
  contentType: 'application/octet-stream', // never the real content type — that's encrypted too
  ownerUserId: session.user.id,
  metadata: {
    wrappedDek: wrappedDek.wrappedDek,
    dekAlgorithmVersion: wrappedDek.algorithmVersion,
    blobIv: encryptedBlob.iv,
    blobAlgorithmVersion: encryptedBlob.algorithmVersion,
    encryptedMetadata: encryptedMetadata.ciphertext,
    metadataIv: encryptedMetadata.iv,
  },
});

// Later, server-side: fetch the object (ciphertext + its own wrapped-DEK metadata)...
const object = await sdk.storage.get(key);

// ...then back in the browser, unwrap the DEK from that metadata and decrypt:
const objectDek = await unwrapDekWithCmk(
  { wrappedDek: object.metadata.wrappedDek, algorithmVersion: object.metadata.dekAlgorithmVersion },
  cmk,
);
const fileBlob = await decryptBlob(objectDek, {
  ciphertext: await new Response(object.body).blob(),
  iv: object.metadata.blobIv,
  algorithmVersion: object.metadata.blobAlgorithmVersion,
  contentType: 'application/pdf', // whatever the plugin actually stored, decided by its own logic
});
```

**Export/delete (RFC 0060 step 6).** The platform handles the core encryption
profile/recovery-wrapper/device-enrollment rows itself — they're included in
every account export (still wrapped ciphertext only) and removed
unconditionally on account deletion, same as everything else `sdk.e2ee`
persists. Your own encrypted objects are a different story: they're plugin
data, so they go through your plugin's own `sdk.portability`
`ExportResolver`/`ImportHandler`/`DeletionHandler` like any other plugin data —
call `sdk.storage.list()`/`get()` yourself inside your export resolver to
include the ciphertext `Blob`s and their `metadata` (wrapped DEK included) in
your section's `blobs`, and `sdk.storage.put()` inside your import handler to
restore them. There is no separate mechanism to learn — `sdk.storage` and
`sdk.portability` already compose the same way they do for any other file a
plugin stores.

## Local development

Run a plugin against a local platform checkout:

1. **Create it** — scaffold a new plugin skeleton (monorepo context):
   ```bash
   pnpm sv plugin new io.example.my-plugin
   ```
   or install an existing plugin from its repository:
   ```bash
   pnpm sv plugin add https://github.com/you/sovereign-plugin-foo
   ```
   or declare it in `sovereign.plugins.json` and run `pnpm install:plugins`.
   All paths clone into `plugins/<id>/` and compose it.
2. **Develop** — `pnpm dev` starts the runtime (`:3000`) and auth (`:3001`) by
   default, or the `RUNTIME_PORT` / `AUTH_PORT` values from the root `.env`.
   Edits under `plugins/<id>/app/` are re-composed and hot-reloaded
   automatically.
3. **Remove it** — `pnpm sv plugin remove <id>` (deletes the directory and
   re-composes; built-in platform plugins are protected).

Never edit the composed copies under
`runtime/app/(platform)/(plugins)/` — they are generated and git-ignored. Your
`plugins/<id>/` directory is the source of truth.

### Developing a sovereign plugin inside the platform monorepo

If you are building a `type: sovereign` plugin — one that lives in its own
repository but you want to test against a local platform checkout before
publishing — clone it under `plugins/` with a `.local` suffix:

```bash
git clone git@github.com:yourorg/your-plugin.git plugins/your-plugin.local
```

> **Tip — automate this from the workbench.** Rather than cloning each plugin
> by hand, the `sovereignfs/sovereignfs` workbench repo's `workbench plugins pull`
> command reads a personal, git-ignored `sovereign.plugins.local` list at its
> own root and clones every listed repo into this checkout's
> `plugins/<name>.local` (skipping ones already present). See that repo's
> `AGENTS.md` for details — this repo has no equivalent script of its own.

The `.local` suffix is the project convention for this pattern. It signals to
other contributors that the directory is not part of this repository:

- **git** — `plugins/<name>.local` is covered by the root `.gitignore`'s
  generic `plugins/*/` catch-all and is never tracked or committed here.
- **pnpm** — it is a full workspace member, so `pnpm dev` resolves its
  dependencies and serves its routes live at the plugin's `routePrefix`,
  exactly like a first-party plugin. No symlinks, no separate install step.
- **pre-commit hook** — `scripts/validate-plugin-boundary.ts` runs on every
  commit and automatically removes `pnpm-lock.yaml` and
  `runtime/generated/registry.ts` from the staged set if they contain entries
  for an untracked plugin directory — your on-disk files are left untouched.
  You never need to clean up manually before committing unrelated platform work.

The plugin's own source files stay in their own git history; only the
platform's generated outputs drift locally, and the pre-commit hook handles
those silently.

#### Database mode

There is no mode to choose, and no `database` field left in the manifest at
all — every plugin owns a dedicated sqld namespace / Postgres schema,
always. No risk of table conflicts with the platform or other plugins, no
slug prefix required. Before writing your first migration, see
["Migration files are append-only once shipped"](#migration-files-are-append-only-once-shipped)
below — regenerating a migration file after release breaks every instance
that already applied it.

There is no per-plugin dialect field either (workstream 0009 leg 1 removed
it). A plugin's store always resolves to the operator's instance-wide
`DB_DIALECT` choice:

| Platform dialect | Resolved plugin dialect |
| ---------------- | ----------------------- |
| SQLite           | SQLite                  |
| Postgres         | Postgres                |

#### Database setup for local plugins

If your plugin declares a database mode, add migration files before running
`pnpm dev`. The platform applies pending migrations at server startup — but it
will error on the first boot if the migrations folder is missing or malformed.

**Required layout** (same for both modes):

```
plugins/your-plugin.local/
  manifest.json
  migrations/
    sqlite/
      0000_initial_schema.sql
      meta/
        _journal.json    ← Drizzle journal — every migration must be registered here
```

**`meta/_journal.json` format:**

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1751270400000,
      "tag": "0000_initial_schema",
      "breakpoints": true
    }
  ]
}
```

Each SQL file gets one entry. `tag` is the filename without `.sql`. `when` is a
Unix millisecond timestamp (any reasonable value; used for display only).

For `isolated` plugins the migration runs against the plugin's own DB file in
`data/plugins/`. For `shared` plugins it runs against the platform DB
(`data/sovereign.db`) — table-name prefixing (e.g. `tasks_`, `myapp_`) is
mandatory to avoid conflicts.

#### Applying migrations without restarting the server

When you add a new migration file, apply it immediately without restarting:

```bash
# Apply pending migrations for a specific plugin (by manifest ID or dir name)
pnpm sv plugin migrate fs.sovereign.your-plugin

# Apply pending migrations for all plugins in plugins/
pnpm sv plugin migrate
```

The command reads from your plugin's `migrations/sqlite/` folder and updates
the DB (plugin file for `isolated`, platform DB for `shared`). The running dev
server picks up the new schema on the next request — no restart needed.

#### Migration files are append-only once shipped

Never regenerate an already-released migration file — not even to fix a typo
in a comment, and not even if the regenerated contents would be byte-for-byte
identical to what shipped. Once a plugin version with a given migration file
has been released, that file is frozen; any further change is a **new**
migration file, added on top.

**Why this matters:** Drizzle's SQLite migrator decides whether a migration
has "already applied" by comparing the migration folder's embedded
timestamp (`meta/_journal.json`'s `when` field) against the
`__drizzle_migrations` tracking table in the target database — it does not
hash file contents. Regenerating a migration file (e.g. via `drizzle-kit
generate`) gives it a new timestamp, so the migrator treats it as a brand
new, unapplied migration and re-runs it against a database that already has
the objects that migration creates. The result is a boot-time `already
exists` error on every instance that already applied the original file —
exactly the kind of failure that looks like a data-corruption bug but is
actually just a stale mental model of how the migrator tracks state.

If you need to fix a mistake in an already-released migration, write a new
migration file that corrects it (e.g. `ALTER TABLE` to fix a wrong column
type) — never edit or regenerate the original.

See [`docs/plugin-database.md`](plugin-database.md) for the full migration
reference: SQL conventions, journal format, Postgres variant, lifecycle, and
backup.

## Accessibility

Sovereign targets **WCAG 2.1 AA** on all platform-owned UI, and plugin developers are expected to ship accessible plugins. The `eslint-plugin-jsx-a11y` recommended ruleset is enforced across the entire monorepo — `pnpm lint` will catch common violations at build time.

### Semantic HTML

Use the correct native element for the job. Browsers provide free keyboard behaviour, role announcements, and focus management:

- `<button>` for actions, `<a>` for navigation, `<input>` for form fields
- `<nav>`, `<main>`, `<section>`, `<header>`, `<footer>` for landmarks
- `<ul>` / `<ol>` + `<li>` for lists — never add `role="list"` (it is implicit on `<ul>`)
- `<table>` / `<th>` / `<td>` for tabular data — not CSS grids dressed as tables

### Form labels

Every form control must have a visible, programmatically associated label. The `Input` component accepts `id` and spreads it to the underlying `<input>` — always pair it with `htmlFor`:

```tsx
<label htmlFor="plugin-title">
  Title
  <Input id="plugin-title" type="text" value={title} onChange={...} />
</label>
```

Placeholder text is not a label — it disappears on input and is never announced as the field's accessible name.

### Icon accessibility

The `<Icon>` component from `@sovereignfs/ui` enforces the correct pattern via prop types:

```tsx
// Decorative icon (next to visible text) — hide from screen readers
<Icon name="trash-2" size="md" aria-hidden />

// Meaningful icon (no adjacent text) — provide a label
<Icon name="log-out" aria-label="Sign out" />
```

Never use emoji or Unicode symbols as icons in interactive UI — they have inconsistent screen-reader announcements.

### Keyboard operability

Every feature a mouse user can reach must be reachable by keyboard alone:

- All interactive elements must be in the tab order (or reachable via a documented keyboard shortcut)
- Custom widgets (menus, comboboxes, trees, carousels) must follow the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) keyboard conventions for their role
- Never use `div` or `span` with `onClick` — use `<button>` or an element with an appropriate role, `tabIndex`, and keyboard handler

### Colour independence

Never convey meaning through colour alone. Pair colour with an icon, label, or pattern:

```tsx
// ✗ colour-only: fails for colour-blind users
<span style={{ color: 'red' }}>Error</span>

// ✓ colour + text/icon
<span className={styles.error}>
  <Icon name="alert-circle" aria-hidden />
  Error: field is required
</span>
```

Use `--sv-color-error-*`, `--sv-color-warning-*`, and `--sv-color-success-*` tokens (not hardcoded hex) so the palette remains consistent and accessible in dark mode.

### Live regions

For status messages that appear without a page reload (async saves, error toasts, form validation), use `role="status"` (polite) or `role="alert"` (assertive) so screen readers announce the change:

```tsx
{
  error && (
    <p role="alert" className={styles.error}>
      {error}
    </p>
  );
}
{
  saved && (
    <p role="status" className={styles.notice}>
      Saved.
    </p>
  );
}
```

### Reduced motion

Animate only when the user has not requested reduced motion:

```css
.mySlideIn {
  animation: slideIn 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .mySlideIn {
    animation: none;
  }
}
```

### Custom ARIA patterns

If you must build a custom interactive widget (tabs, accordion, carousel), follow the [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) for the corresponding pattern. Key points:

- Assign the correct `role` to the container and children
- Manage `aria-selected`, `aria-expanded`, `aria-controls`, `aria-labelledby` as the pattern requires
- Implement the full keyboard model (arrow keys, Home/End, Enter/Space) expected for that role
- Ensure focus is moved programmatically when content changes visibility

## Building for mobile

Sovereign runs as an installable PWA as well as a browser tab, and the platform shell already carries the baseline that makes that feel native rather than "a website on a phone" — global touch hygiene, safe-area insets, the mobile breakpoint, and gesture primitives all live in `@sovereignfs/ui` and `runtime/app/globals.css`. This section is the practical, plugin-author-facing version of that; the full component-level internals (why each rule exists, exact token values, CSS specifics) live in [`docs/design-system.md`](./design-system.md#responsive--mobile) — this section links out to it rather than duplicating it.

### Surface vs. breakpoint — two different questions

`sdk.device.*` (RFC 0080) answers **where am I running** — `browser`,
`mobile` (the Capacitor shell), or `desktop` (the Tauri shell). `useIsMobile()`
below answers a completely different question, **how wide is the viewport** —
a desktop browser window narrowed to 700px is still `surface: 'browser'` but
`isMobile === true`. Don't conflate them: use `sdk.device.getSurface()` to
gate a genuinely shell-specific affordance (e.g. "show the native photo-picker
button only inside the Capacitor shell"), and `useIsMobile()` for responsive
layout. Three tiers answer three different kinds of question — pick the
narrowest one that actually answers yours:

| Tier                                                       | Answers                                           | Where            |
| ---------------------------------------------------------- | ------------------------------------------------- | ---------------- |
| `sdk.device.getSurface()` (server)                         | `browser`/`mobile`/`desktop`, no hydration flash  | Server Component |
| `useDeviceEnvironment()` (client, `device-client` subpath) | Same, plus `installed` (PWA) — `null` until mount | Client Component |
| `useIsMobile()` (`@sovereignfs/ui`)                        | Viewport ≤768px, independent of shell             | Either           |

```tsx
// Server Component — no flash, since the surface is known before render.
import { sdk } from '@sovereignfs/sdk';

async function PhotoPicker() {
  const isNative = await sdk.device.isNativeShell();
  return isNative ? <NativePickerButton /> : <FileInputFallback />;
}
```

```tsx
'use client';
import { useDeviceEnvironment } from '@sovereignfs/sdk/device-client';

function InstallHint() {
  const env = useDeviceEnvironment();
  if (env === null || env.installed) return null; // not known yet, or already installed
  return <p>Add Sovereign to your Home Screen for the full experience.</p>;
}
```

**Never gate authorization, entitlement, paywall, or data-access decisions on
surface** — it derives from the shell's own User-Agent, which any caller can
set to anything. It is a presentation hint, exactly like `useIsMobile()`; the
one difference is _what_ it tells you, not how much you can trust it. See the
hard rule in `docs/architecture-rules.md`.

### Breakpoint

Fork behaviour by viewport with `useIsMobile()`, not a hand-rolled `matchMedia` call — it is SSR-safe (defaults to `false` until the client mounts, avoiding a hydration mismatch) and defaults to the platform's single canonical breakpoint:

```tsx
import { useIsMobile } from '@sovereignfs/ui';

function Toolbar() {
  const isMobile = useIsMobile(); // true at ≤768px
  return isMobile ? <MobileToolbar /> : <DesktopToolbar />;
}
```

768px is the platform default (matches the shell chrome and `Dialog`'s own mobile switch) — reach for it first. A layout with a genuinely different fork point (e.g. a three-column layout that needs to collapse earlier) may pass its own `breakpointPx`, but document why inline; an undocumented custom threshold is how breakpoints silently drift across a codebase. See [design-system.md's breakpoint convention](./design-system.md#breakpoint-convention) for the full rationale.

### Touch targets

Every tappable control needs a **44px** minimum hit area (Apple HIG / Material Design / WCAG 2.5.5) — below that, taps misfire and read as broken UI, not just "small." `@sovereignfs/ui` components already handle this themselves (`Button` grows to 44px under `@media (pointer: coarse)`; `Checkbox`'s hit area expands past its visible 18px box the same way); if you build your own icon-only control, size it against `--sv-touch-target-min`:

```css
.myIconButton {
  min-width: var(--sv-touch-target-min, 44px);
  min-height: var(--sv-touch-target-min, 44px);
}
```

Gate any coarse-pointer-only sizing behind `@media (pointer: coarse)`, not a viewport-width media query — a touchscreen laptop with a mouse/trackpad as its primary pointer should keep desktop density, and `pointer: coarse` (the _primary_ pointer) is what distinguishes that from an actual touch device. See [design-system.md's touch-target and Button/Checkbox sections](./design-system.md#touch-targets-—-sv-touch-target-min) for the full pattern.

### Hover guards

Every `:hover` rule needs `@media (hover: hover)`, or a tap generates a synthetic hover state that **sticks** until the next tap elsewhere — a button reads as stuck mid-transition to its hover color after the tap already completed its action:

```css
@media (hover: hover) {
  .myControl:hover {
    background-color: var(--sv-color-surface-sunken);
  }
}
```

`:focus-visible` and `:active` are never guarded — both are wanted on every input type. `@sovereignfs/ui` follows this convention throughout; apply the same guard in your own plugin CSS. Full writeup, including the hover-_reveal_ case (`:not(:hover)` is unconditionally true with no hover capability at all): [design-system.md's hover guard convention](./design-system.md#hover-guard-convention-—-media-hover-hover).

### The long-press recipe

A bare `setTimeout` on `pointerdown` is not a long-press gesture — it misfires on finger jitter, survives a `pointercancel` (the browser converting the touch into a scroll) and fires mid-scroll, and does nothing to suppress the OS's own reaction to a long hold (iOS's link-preview callout, Android's context menu). `useLongPress` carries the full fix:

```tsx
import { useLongPress } from '@sovereignfs/ui';

function TaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const longPress = useLongPress({ onLongPress: onSelect });
  return (
    <div {...longPress} className={styles.row}>
      {task.title}
    </div>
  );
}
```

The returned props (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`/`onPointerLeave`/`onContextMenu`/`onClick`/`style`) spread directly onto the target element — nothing else to wire up. It only ever fires for genuine touch input (`pointerType === 'touch'`); a mouse holding the same element for 500ms never triggers it, so desktop interactions (e.g. ctrl/cmd-click for bulk select) are unaffected. Full mechanism: [design-system.md's interaction hooks section](./design-system.md#interaction-hooks).

### Double-tap — use sparingly, and prefer an explicit affordance

`useDoubleTapHandler` and `useSingleOrDoubleTap` exist for double-tap gestures, but **`useSingleOrDoubleTap` defers every single tap by the double-tap detection window (350ms)** — touch has no equivalent to a mouse's native `e.detail === 2`, so the only way to know a second tap isn't coming is to wait out the window before committing to the single action. That latency is paid on **every** tap through it, not just the double, which reads as sluggish on a primary navigation gesture.

Before reaching for double-tap on mobile, consider whether the action it guards (rename, secondary options) is better served by an explicit affordance instead — a visible "⋯" button, or `useLongPress` — so a single tap can navigate immediately with no latency tax. This is a real lesson from the reference implementation: `sovereign-tasks` originally double-tap-to-renamed a list row on mobile, paying the 350ms tax on every navigating tap; it was replaced with immediate single-tap navigation plus an explicit "⋯" menu entry for rename.

```tsx
import { useDoubleTapHandler } from '@sovereignfs/ui';

// Safe here: the single tap on a colour swatch has no default action to preempt.
function ColorSwatch({ color, onPick }: { color: string; onPick: () => void }) {
  const handleDoubleClick = useDoubleTapHandler(onPick);
  return <button onClick={handleDoubleClick} style={{ background: color }} />;
}
```

### Committing quick-entry input — Enter vs. iOS's keyboard toolbar

iOS Safari adds its own "Previous / Next / Done" toolbar above the software
keyboard whenever a Sheet or form has more than one focusable field nearby —
there is no supported way to suppress it (it's WebKit's own field-detection
heuristic, not something the page controls). Tapping that toolbar's
Done/checkmark only ever fires a native `blur`; it is **not** a form submit
and dispatches no keydown. A quick-entry input that commits only on Enter
(`onKeyDown` checking `e.key === 'Enter'`) silently discards whatever was
typed the moment a user dismisses the keyboard that way instead of pressing
the on-screen Return key — the two dismissal paths look identical to the user
but produce different outcomes. This was a real bug across `sovereign-tasks`
and `sovereign-shopper`'s add-list/add-task/add-subtask rows before
`useCommitOnEnterOrBlur` existed.

```tsx
import { useCommitOnEnterOrBlur } from '@sovereignfs/ui';

function AddTaskRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const commit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  };
  const commitHandlers = useCommitOnEnterOrBlur(commit);
  return <input value={title} onChange={(e) => setTitle(e.target.value)} {...commitHandlers} />;
}
```

Reach for this whenever Enter is the _sole_ way to commit a field (a quick-add
row, an inline rename with no persistent Save button). It is the wrong tool
for a field inside a form with its own always-visible submit button (login,
a dialog's "Save", payment details) — there, silently submitting on blur would
be surprising and possibly unsafe; leave Enter as a convenience shortcut and
let the visible button be the real commit action. Full mechanism: [design-system.md's interaction hooks section](./design-system.md#interaction-hooks).

### PWA-feel checklist

The shell already handles the following globally — nothing to add per plugin:

- [x] No translucent tap-highlight flash (`-webkit-tap-highlight-color: transparent`)
- [x] No text auto-inflation on orientation change (`text-size-adjust: 100%`)
- [x] No ~300ms tap delay / double-tap-to-zoom on interactive elements (`touch-action: manipulation` on links, buttons, inputs, `[role="button"]`)
- [x] No iOS Safari rubber-band bounce at the document level (`overscroll-behavior: none`)
- [x] No iOS Safari viewport zoom on focusing a small-font input (native inputs clamped to ≥16px in standalone/PWA mode)
- [x] Safe-area insets (`env(safe-area-inset-*)`) already factored into the shell header/footer and `Dialog`'s mobile inset

Still your responsibility per component:

- [ ] A custom drag handle (dnd-kit or hand-rolled) sets its own `touch-action: none` — the global `manipulation` default lets the browser's own scroll/zoom gestures compete with a drag unless overridden
- [ ] Any element you position `fixed` or `sticky` yourself accounts for `env(safe-area-inset-bottom)` if it can sit near the device's home-indicator area — `@sovereignfs/ui`'s own overlays (`Drawer`, `Sheet`, `Dialog`) already do this; a plugin-local fixed element does not get it for free
- [ ] A quick-entry input that only commits on Enter also commits on blur via `useCommitOnEnterOrBlur` — see "Committing quick-entry input" above; otherwise iOS's native keyboard toolbar silently discards typed input
- [ ] Test in **both** Safari-the-browser-tab and the installed **PWA standalone** mode on iOS — behaviour genuinely differs (the standalone-mode zoom-persists-after-blur case above is one example) and testing only the browser tab misses it
- [ ] Verify on Android Chrome too — long-press, swipe, and scroll-vs-gesture arbitration have platform-specific quirks that don't always match iOS

## Publishing & the registry

To distribute a plugin, set `type` to `sovereign` or `community` and point
`repository` at its public git URL. Today, instances install declared plugins
from `sovereign.plugins.json` — a local, gitignored file each operator
maintains (see [self-hosting.md](self-hosting.md#bundled-default-plugins));
it's not part of the committed repository:

```json
{
  "plugins": [
    { "id": "io.example.tasks", "repository": "https://github.com/you/sovereign-plugin-tasks" }
  ]
}
```

### Private repositories

A plugin's repository doesn't have to be public. Add an optional `tokenEnv` field naming an
environment variable that holds a personal access token — the **variable name** is what you
write, never the token itself, so it's safe even though `sovereign.plugins.json` is a local,
gitignored file (epic task 3.31) rather than something meant to be shared or committed:

```json
{
  "plugins": [
    {
      "id": "com.acme.crm",
      "repository": "https://github.com/acme/sovereign-crm",
      "tokenEnv": "ACME_CRM_PLUGIN_TOKEN"
    }
  ]
}
```

Set `ACME_CRM_PLUGIN_TOKEN` in the environment before running `pnpm install:plugins`. `tokenEnv`
requires an `https://` `repository` URL (an SSH URL authenticates via your shell's own SSH
key/agent instead, with no field needed). The one-off equivalent is `sv plugin add`'s
`--token-env` flag:

```sh
pnpm sv plugin add https://github.com/acme/sovereign-crm --token-env ACME_CRM_PLUGIN_TOKEN
```

The token is only ever read at clone time — written to a short-lived, mode-`0600` git credential
file for the duration of the `git clone`/`fetch` call, then deleted. It is never embedded in a
logged URL or passed as a process argument. A subsequent `pnpm install:plugins` run skips a
plugin already present under `plugins/<id>/`, so the token is only needed again if that directory
is deleted and re-cloned — not on every rebuild. See "Maintaining a fork" and "Private plugins on
a hosted instance" in [`docs/self-hosting.md`](self-hosting.md) for the full operator workflow,
including what's required for a private plugin to survive version upgrades.

### Submitting to the registry

The [`registry/plugins.json`](../registry/plugins.json) file is the public index
of installable plugins — listing there makes a plugin discoverable. The registry
stores a **thin record** per plugin — a pointer to your source plus display
metadata — **not** a copy of your manifest. The manifest stays in your repository
and is fetched from there at install time, so it never drifts out of sync with
the registry. An entry is:

```jsonc
{
  "id": "io.example.tasks",
  "repository": {
    "type": "git",
    "url": "https://github.com/you/sovereign-plugin-tasks",
    "ref": "v1.0.0",
  },
  "name": "Tasks",
  "description": "A simple task manager.",
  "author": { "name": "Ada Lovelace", "email": "ada@example.com" },
  "license": "MIT", // SPDX identifier
  "keywords": ["productivity"], // optional
  // "provenance" is added by `pnpm registry:validate` — do not hand-write it.
}
```

Operational fields (`version`, `permissions`, `compatibility`, …) are **not**
duplicated in the registry; they come from the fetched manifest. A submission
must:

- be a **valid registry entry** (validated by the `registry/__tests__` suite via
  `validateRegistryEntry`, which fails CI on an invalid entry);
- point `repository` at a **public/accessible** source (`{ type: "git", url, ref? }`,
  or `{ type: "path", url }` for a first-party/local source);
- have a **valid manifest** at that source (`type: "sovereign"`/`"community"`,
  `id` matching the entry);
- include a **`LICENSE`** file in that source, an SPDX **`license`**, an
  **`author`**, a **compatible** `compatibility.minPlatformVersion`, and a
  **globally-unique** `id`.

Before opening the PR, run **`pnpm registry:validate`**: it clones your source,
checks the manifest and LICENSE, hashes the source tree, and writes a
`provenance` block (resolved commit + content hash) into your entry. The
**Registry validate** CI job re-runs `pnpm registry:check` to confirm the hash
is fresh. The full process, requirements, and PR template are in
[`registry/CONTRIBUTING.md`](https://github.com/sovereignfs/sovereign/blob/main/registry/CONTRIBUTING.md).
Until your plugin is listed, you can still share your repository URL and
instances add it to `sovereign.plugins.json` as above.
