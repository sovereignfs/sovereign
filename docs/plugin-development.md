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

Reference plugins ship with the platform and serve as both documentation and
runtime test fixtures. They live in their own repository —
[`sovereignfs/sovereign-plugins-examples`](https://github.com/sovereignfs/sovereign-plugins-examples)
— and the platform bundles them at build time: `scripts/install-plugins.ts`
clones them (pinned to a commit in `sovereign.plugins.json`) into
`plugins/<slug>/`, and the generate step composes them like any other plugin.
They are enabled by default; an operator can disable them per-instance from the
Console:

| Plugin ID                             | Route                     | What it shows                                                                |
| ------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `fs.sovereign.example-basic`          | `/example-basic`          | Session reading, `@sovereignfs/ui`, CSS tokens, plugin-declared capabilities |
| `fs.sovereign.example-overlay-small`  | `/example-overlay-small`  | `shell: "overlay"` with `overlaySize: "sm"`                                  |
| `fs.sovereign.example-overlay-medium` | `/example-overlay-medium` | `shell: "overlay"` with `overlaySize: "md"`                                  |
| `fs.sovereign.example-overlay-large`  | `/example-overlay-large`  | `shell: "overlay"` with `overlaySize: "lg"`                                  |
| `fs.sovereign.example-minimal`        | `/example-minimal`        | `shell: "minimal"` chrome-free/fullscreen composition                        |
| `fs.sovereign.example-api`            | `/example-api`            | API provider serve-route pattern (PLT-16)                                    |
| `fs.sovereign.example-monetized`      | `/example-monetized`      | Monetization manifest field, Ed25519 license gating, paywall flow (RFC 0003) |

Browse the [`sovereign-plugins-examples`](https://github.com/sovereignfs/sovereign-plugins-examples)
repository for fully-working code to adapt. After a build (or a local
`pnpm install:plugins`) the cloned copies are also under `plugins/example-*/`,
but those are git-ignored working copies — the repository is the source of truth.
See [Sovereign repositories](repositories.md) for the full first-party repository
map.

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
  manifest.json          # required — identity, routing, capabilities (see below)
  package.json           # name, version, deps (react, @sovereignfs/sdk, @sovereignfs/ui)
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

| Field           | Type                                     | Required                             | Description                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | integer                                  | yes                                  | Manifest format version. Currently `1`.                                                                                                                                                                                                                                                            |
| `id`            | string                                   | yes                                  | Globally-unique reverse-DNS id, e.g. `io.example.tasks`. Also the install directory name.                                                                                                                                                                                                          |
| `name`          | string                                   | yes                                  | Human-readable name shown in the sidebar and Launcher.                                                                                                                                                                                                                                             |
| `version`       | string                                   | yes                                  | Plugin version (semver recommended).                                                                                                                                                                                                                                                               |
| `description`   | string                                   | no                                   | Short description.                                                                                                                                                                                                                                                                                 |
| `database`      | `shared` \| `isolated` \| object         | no                                   | Data isolation model. `shared` (default) keeps plugin tables in the platform DB with a slug prefix. `isolated` gives the plugin its own dedicated store — a separate SQLite file or Postgres schema. Object form can request SQLite for an isolated plugin. See the [Database](#database) section. |
| `type`          | `platform` \| `sovereign` \| `community` | yes                                  | Origin/trust tier (see below).                                                                                                                                                                                                                                                                     |
| `runtime`       | `native`                                 | yes                                  | Execution model. v1 plugins use `native`. Other runtime models are planned but are not accepted manifest values until implemented.                                                                                                                                                                 |
| `routePrefix`   | string starting with `/`                 | yes                                  | URL prefix the plugin serves under, e.g. `/tasks`. The single source of truth for the plugin's URL.                                                                                                                                                                                                |
| `permissions`   | array of permission strings              | yes (may be `[]`)                    | SDK capabilities the plugin declares (see below).                                                                                                                                                                                                                                                  |
| `shell`         | `default` \| `minimal` \| `overlay`      | no                                   | Presentation mode. `default` = full page under the platform sidebar; `overlay` = dialog over the current page (see below); `minimal` = chrome-free, full-bleed (see below).                                                                                                                        |
| `shellConfig`   | object (see below)                       | no                                   | Per-shell tuning. Holds `overlaySize` (`sm` \| `md` \| `lg`, default `lg`) for `shell: overlay` plugins. Only valid when `shell` is `overlay`.                                                                                                                                                     |
| `adminOnly`     | boolean                                  | no (default `false`)                 | When `true`, only `platform:admin` users may reach the plugin's routes (403 otherwise).                                                                                                                                                                                                            |
| `apiProvider`   | boolean                                  | no (default `false`)                 | When `true`, the plugin serves the public `/api/*` namespace (PLT-16). One provider per instance — see below.                                                                                                                                                                                      |
| `example`       | boolean                                  | no (default `false`)                 | Marks the plugin as a bundled reference/example. Classification only — no effect on routing or permissions. Example plugins are hidden by default and shown via the Console → Settings → Example plugins toggle; each can also be toggled individually on the Plugins page.                        |
| `icon`          | string                                   | no                                   | Path to an SVG icon relative to the plugin root. A monogram is generated if omitted.                                                                                                                                                                                                               |
| `compatibility` | object (see below)                       | yes                                  | Platform version constraints. Hard-gates install/boot on `minPlatformVersion`; surfaces an advisory warning in Console/health when the platform exceeds the optional `maxPlatformVersion`.                                                                                                         |
| `data`          | object (see below)                       | no                                   | Cross-plugin data sharing declarations (RFC 0002). Declare the contracts this plugin exposes (`data.provides`) and the ones it reads (`data.consumes`). Requires the matching `data:provide` / `data:consume` permissions.                                                                         |
| `env`           | object (see below)                       | no                                   | Plugin-scoped environment variable declarations (RFC 0018). Keys are auto-namespaced to `SV_PLUGIN_<SLUG>_<KEY>`; read them via `sdk.env.get('KEY')` in server code.                                                                                                                               |
| `capabilities`  | object (see below)                       | no                                   | Plugin-declared capabilities (RFC 0022). Each key is a local name auto-namespaced to `<pluginId>:<capName>`; enforce access inside the plugin via `sdk.auth.hasCapability`.                                                                                                                        |
| `schedules`     | array (see below)                        | no                                   | Recurring background schedules (RFC 0046 Phase 1). Each entry names a server-side handler module inside `app/` that the platform's in-process scheduler invokes every `intervalMinutes` while the plugin is enabled.                                                                               |
| `connections`   | object (see below)                       | no                                   | External provider connection declarations (RFC 0049). Lists OAuth/connect-account providers and callback paths for platform-visible connection metadata.                                                                                                                                           |
| `monetization`  | object (see below)                       | no                                   | Monetization model (RFC 0003). Declares the billing model, tiers, and the author's Ed25519 public key for offline license verification. Only `sovereign`/`community` plugins may declare this.                                                                                                     |
| `repository`    | string (URL)                             | required for `sovereign`/`community` | Git repository URL. Required unless `type` is `platform`.                                                                                                                                                                                                                                          |

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

| Permission     | Declares                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------ |
| `auth:session` | Read the current session via `sdk.auth`.                                                   |
| `db:readWrite` | Read/write access to the platform DB via `sdk.db`.                                         |
| `db:readOnly`  | Read-only DB access.                                                                       |
| `mailer:send`  | Send email via `sdk.mailer`.                                                               |
| `data:provide` | Expose read-only data contracts for other plugins to query (RFC 0002, `sdk.data`).         |
| `data:consume` | Read data from another plugin's contracts, subject to user consent (RFC 0002, `sdk.data`). |
| `data:export`  | Participate in a user's data export bundle — `sdk.portability.provideExport()` (RFC 0007). |
| `data:import`  | Participate in a data import/restore — `sdk.portability.provideImport()` (RFC 0007).       |
| `admin:*`      | Administrative capabilities (platform plugins).                                            |

| `activity:write` | Record activity-log events via `sdk.activity.log()` (RFC 0005). |

| `notifications:send` | Send notifications to users via `sdk.notifications.send()` (RFC 0015). |

| `storage:readWrite` | Read/write plugin-scoped binary objects via `sdk.storage` (RFC 0044). |

Reserved (declaring them is allowed; the backing surfaces throw `NotImplementedError` until
implemented): `events:publish`, `events:subscribe`, `e2ee:use` (client-side encryption,
`sdk.e2ee` — RFC 0060; distinct from any future server-side `sdk.crypto.encryptField()`
field crypto, which the runtime _can_ decrypt).

Permission declarations are part of the manifest contract and are used by
platform flows such as portability (`data:export` / `data:import`). Other SDK
host surfaces currently rely on the declaration as compatibility metadata rather
than a complete runtime authorization boundary; plugins should still declare the
permissions they use so future host-side gates can be enforced without changing
the manifest.

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
- The **session gate still applies** — the middleware enforces authentication
  before the plugin renders. `minimal` does not bypass auth.
- Unlike `overlay`, a multi-segment `routePrefix` is allowed (e.g. `/kiosk/display`).
- A `minimal` plugin **may be configured as the root plugin** (kiosk use
  case). When set as root, `/` renders the plugin full-bleed — be aware there
  is no nav affordance back to the Launcher or other plugins unless the plugin
  provides it.

**Nav convention for minimal root plugins:** if your plugin is the root and
other plugins are installed, provide your own navigation (a menu, a link to
`/launcher`, etc.). The platform shell is absent, so users have no other way to
reach the Launcher or Console.

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
    icon: 'download', // optional <Icon> name from @sovereignfs/ui
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

The `plugins/example-monetized` plugin ships with a committed demo keypair and a
pre-signed token so you can walk through the full flow without any billing setup.
Start the dev server and go to `/example-monetized` — on first visit you will be
redirected to the paywall page because you have no entitlement yet.

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
  "repository": "https://github.com/sovereignfs/sovereign-tasks",
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
  // session.user: { id, email, name, image, role, tenantId, capabilities }
  const { user } = session;

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
- **`mailer`** — `send({ to, subject, text, html })`. No-ops when SMTP is
  unconfigured.
- **`platform`** — `getConfig()` → `{ tenantName, inviteOnly, version, instanceName, instancePrimaryColor? }`
  (await it). `instanceName` falls back to `tenantName` when no instance name is
  configured; `instancePrimaryColor` is a validated 6-digit hex string or
  `undefined`. Use these to display the operator's instance identity in plugin UI without
  reading CSS variables.
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
- **`portability`** — participate in user-initiated data export/import (RFC 0007).
  Register an export resolver (`sdk.portability.provideExport(resolver)`) and/or
  an import handler (`sdk.portability.provideImport(handler)`) from a server-side
  handler (Server Component, Route Handler, or Server Action). The resolver
  receives an `ExportContext { userId, tenantId }` and must return a
  `PluginExportSection { pluginId, schemaVersion, data, blobs? }`. The handler
  receives the stored section plus an `ImportContext { userId, tenantId,
remapId(originalId) }` — use `remapId` to translate stored IDs to fresh ones
  for the importing account (referential integrity). Declare `data:export` and/or
  `data:import` in the manifest; the runtime skips unregistered or un-permitted
  plugins silently.

  ```ts
  // Server Component or Route Handler in your plugin:
  import { sdk } from '@sovereignfs/sdk';

  await sdk.portability.provideExport(async ({ userId }) => ({
    pluginId: 'io.example.tasks',
    schemaVersion: 1,
    data: { tasks: await myDb.getTasksForUser(userId) },
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
- **Reserved** (throw `NotImplementedError` in v1): `events`.

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
`StatusBadge`, `SplitPane`, `PageHeader`, `SystemBanner`, …) for any generic
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

Plugins access the database through `await sdk.db.getClient()`. There are two isolation
modes, set in the manifest:

|              | `shared` (default)                             | `isolated`                           |
| ------------ | ---------------------------------------------- | ------------------------------------ |
| Store        | Platform DB (shared with all plugins)          | Dedicated file or schema per plugin  |
| Table prefix | Required (slug, e.g. `tasks_lists`)            | Not required                         |
| Uninstall    | Tables remain                                  | Entire store dropped                 |
| Migrations   | `plugins/<id>/migrations/` against platform DB | Same path, routed to dedicated store |

**For most plugins, shared is the right choice.** Use `"database": "isolated"` when you
need a clean data lifecycle (e.g. uninstall should delete all plugin data), per-plugin
backup, or blast-radius isolation.

An isolated plugin can also request SQLite explicitly:

```json
{
  "database": {
    "isolation": "isolated",
    "dialect": "sqlite"
  }
}
```

Omitting `dialect` inherits the platform database dialect. `dialect: "postgres"` is not
a valid manifest value; an isolated plugin gets Postgres by inheriting it from a
Postgres platform.

```ts
// Same call regardless of mode — the runtime routes transparently:
const db = await sdk.db.getClient();
```

**Rules that apply in both modes:**

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

const found = await sdk.storage.get('receipts/2026-01.pdf'); // { ...metadata, body: ReadableStream } | null
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

**Lifecycle.** User-owned storage objects (rows and physical files) are deleted
automatically when that user's account is deleted (RFC 0033). Deleting an object via
`sdk.storage.delete()` removes both the metadata row and the physical file immediately.

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

> **Tip — automate this with `setup.sh`.** Rather than cloning each plugin by
> hand, list its git URL in `sovereign.plugins.local` — a personal, **git-ignored**
> file at the repo root, one URL per line — then run `./setup.sh`. It clones every
> listed repo into `plugins/<name>.local` (skipping ones already present) and, if
> the file is absent, skips the step with a one-line note. Because the file is
> git-ignored and unreferenced by any code, the plugins you clone are never
> declared in the codebase. Format and examples are documented in `setup.sh`'s
> header and in `CONTRIBUTING.md` → "Cloning your own plugins with `setup.sh`".

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

#### Choosing a database mode

Set `"database"` in your manifest to a string value or the object form:

| Value        | What it means                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"isolated"` | Plugin owns a dedicated SQLite file / Postgres schema. No risk of table conflicts with the platform or other plugins. **Recommended for all third-party plugins.**                                      |
| `"shared"`   | Plugin writes into the platform DB. Can join against platform tables (tenants, users, etc.). **For trusted first-party plugins only** — a schema conflict or buggy migration can corrupt platform data. |

Omitting `"database"` is equivalent to `"shared"`.

Object form is useful when an isolated plugin should use SQLite even on a Postgres
platform:

```json
{
  "database": {
    "isolation": "isolated",
    "dialect": "sqlite"
  }
}
```

Allowed combinations:

| Platform dialect | Manifest declaration                               | Resolved plugin dialect | Allowed |
| ---------------- | -------------------------------------------------- | ----------------------- | ------- |
| SQLite           | omitted                                            | SQLite                  | yes     |
| SQLite           | `"isolated"`                                       | SQLite                  | yes     |
| SQLite           | `{ "isolation": "isolated" }`                      | SQLite                  | yes     |
| SQLite           | `{ "isolation": "isolated", "dialect": "sqlite" }` | SQLite                  | yes     |
| Postgres         | omitted                                            | Postgres                | yes     |
| Postgres         | `"isolated"`                                       | Postgres                | yes     |
| Postgres         | `{ "isolation": "isolated" }`                      | Postgres                | yes     |
| Postgres         | `{ "isolation": "isolated", "dialect": "sqlite" }` | SQLite                  | yes     |

The platform dialect is a ceiling. SQLite is embedded in every deployment, so a
Postgres platform can host a SQLite-backed isolated plugin. A SQLite platform has no
Postgres server to lend to a plugin, so manifests cannot declare
`{ "dialect": "postgres" }`; the schema rejects it at validation time.

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

Gate any coarse-pointer-only sizing behind `@media (pointer: coarse)`, not a viewport-width media query — a touchscreen laptop with a mouse/trackpad as its primary pointer should keep desktop density, and `pointer: coarse` (the _primary_ pointer) is what distinguishes that from an actual touch device. See [design-system.md's touch-target and Button/Checkbox sections](./design-system.md#touch-targets---sv-touch-target-min) for the full pattern.

### Hover guards

Every `:hover` rule needs `@media (hover: hover)`, or a tap generates a synthetic hover state that **sticks** until the next tap elsewhere — a button reads as stuck mid-transition to its hover color after the tap already completed its action:

```css
@media (hover: hover) {
  .myControl:hover {
    background-color: var(--sv-color-surface-sunken);
  }
}
```

`:focus-visible` and `:active` are never guarded — both are wanted on every input type. `@sovereignfs/ui` follows this convention throughout; apply the same guard in your own plugin CSS. Full writeup, including the hover-_reveal_ case (`:not(:hover)` is unconditionally true with no hover capability at all): [design-system.md's hover guard convention](./design-system.md#hover-guard-convention--media-hover-hover).

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
- [ ] Test in **both** Safari-the-browser-tab and the installed **PWA standalone** mode on iOS — behaviour genuinely differs (the standalone-mode zoom-persists-after-blur case above is one example) and testing only the browser tab misses it
- [ ] Verify on Android Chrome too — long-press, swipe, and scroll-vs-gesture arbitration have platform-specific quirks that don't always match iOS

## Publishing & the registry

To distribute a plugin, set `type` to `sovereign` or `community` and point
`repository` at its public git URL. Today, instances install declared plugins
from `sovereign.plugins.json`:

```json
{
  "plugins": [
    { "id": "io.example.tasks", "repository": "https://github.com/you/sovereign-plugin-tasks" }
  ]
}
```

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
