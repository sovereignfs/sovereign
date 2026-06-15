# Plugin development

This guide is for building a Sovereign plugin. A plugin is a self-contained app
— Next.js App Router routes plus an optional database schema — that the platform
composes into the runtime at build time and serves under a URL prefix you
choose. Plugins talk to the platform **only** through the SDK
(`@sovereignfs/sdk`); they never import runtime internals.

If you are deploying an instance rather than building a plugin, see
[self-hosting.md](self-hosting.md). For the platform internals, see
[architecture.md](architecture.md).

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

| Field           | Type                                                                    | Required                             | Description                                                                                            |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | integer                                                                 | yes                                  | Manifest format version. Currently `1`.                                                                |
| `id`            | string                                                                  | yes                                  | Globally-unique reverse-DNS id, e.g. `io.example.tasks`. Also the install directory name.              |
| `name`          | string                                                                  | yes                                  | Human-readable name shown in the sidebar and Launcher.                                                 |
| `version`       | string                                                                  | yes                                  | Plugin version (semver recommended).                                                                   |
| `description`   | string                                                                  | no                                   | Short description.                                                                                     |
| `database`      | `shared` \| `isolated`                                                  | no                                   | Data isolation model. v1 supports `shared` (the default behaviour); `isolated` is reserved (RFC 0004). |
| `type`          | `platform` \| `sovereign` \| `community`                                | yes                                  | Origin/trust tier (see below).                                                                         |
| `runtime`       | `native` \| `static` \| `iframe-local` \| `iframe-remote` \| `external` | yes                                  | Execution model. v1 plugins use `native`; the others are reserved for future runtimes.                 |
| `routePrefix`   | string starting with `/`                                                | yes                                  | URL prefix the plugin serves under, e.g. `/tasks`. The single source of truth for the plugin's URL.    |
| `permissions`   | array of permission strings                                             | yes (may be `[]`)                    | SDK capabilities the plugin declares (see below).                                                      |
| `shell`         | `default` \| `minimal`                                                  | no                                   | Chrome to render in. `default` = platform sidebar; `minimal` is reserved (not wired in v1).            |
| `adminOnly`     | boolean                                                                 | no (default `false`)                 | When `true`, only `platform:admin` users may reach the plugin's routes (403 otherwise).                |
| `icon`          | string                                                                  | no                                   | Path to an SVG icon relative to the plugin root. A monogram is generated if omitted.                   |
| `compatibility` | object `{ minPlatformVersion: string }`                                 | yes                                  | Minimum platform version the plugin supports.                                                          |
| `repository`    | string (URL)                                                            | required for `sovereign`/`community` | Git repository URL. Required unless `type` is `platform`.                                              |

### `type`

- `platform` — built-in plugins that ship in this monorepo (Console, Launcher,
  Account). No `repository` required.
- `sovereign` — first-party plugins maintained by the project, installed from
  their own repos. `repository` required.
- `community` — third-party plugins. `repository` required.

### `permissions`

Declared capabilities. The v1-functional ones:

| Permission     | Grants                                             |
| -------------- | -------------------------------------------------- |
| `auth:session` | Read the current session via `sdk.auth`.           |
| `db:readWrite` | Read/write access to the platform DB via `sdk.db`. |
| `db:readOnly`  | Read-only DB access.                               |
| `mailer:send`  | Send email via `sdk.mailer`.                       |
| `admin:*`      | Administrative capabilities (platform plugins).    |

Reserved for post-v1 (declaring them is allowed; the backing surfaces throw
`NotImplementedError` until implemented): `storage:readWrite`,
`notifications:send`, `events:publish`, `events:subscribe`, the cross-plugin
data-sharing pair `data:provide` / `data:consume` (RFC 0002), and
`activity:write` (record activity-log events via `sdk.activity`, RFC 0005).

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
  - `changePassword({ currentPassword, newPassword })`,
    `listSessions()`, `revokeSession(token)`.
  ```ts
  const { user } = await sdk.auth.requireSession();
  // user.id, user.email, user.name, user.image, user.role, user.tenantId
  ```
- **`db`** — `getClient()` returns the platform Drizzle client (await it — the
  data layer is dialect-agnostic and async). Query your own slug-prefixed tables
  with it (see Database).
  ```ts
  const db = await sdk.db.getClient();
  ```
- **`mailer`** — `send({ to, subject, text, html })`. No-ops when SMTP is
  unconfigured.
- **`platform`** — `getConfig()` → `{ tenantName, inviteOnly, version }`
  (await it).
- **Reserved** (throw `NotImplementedError` in v1): `storage`, `notifications`,
  `events`, `data` (cross-plugin data sharing, RFC 0002), and `activity`
  (activity log — `activity.log(entry)` records a scoped event; the runtime
  injects the actor/tenant/plugin, RFC 0005).

### The SDK boundary rule

Plugins **must not** import from `runtime/src` or internal `@sovereignfs/*`
packages (`db`, `manifest`, `mailer`) directly — only `@sovereignfs/sdk` and
`@sovereignfs/ui`. ESLint enforces this; violations fail `pnpm lint`.

### UI

Build your interface with the Sovereign Design System (`@sovereignfs/ui`):

```ts
import { Button, Card, Input, Badge } from '@sovereignfs/ui';
```

Design tokens (`--sv-*` CSS custom properties) are injected globally by the
runtime shell — reference them directly in your CSS, e.g.
`color: var(--sv-color-text-primary)`. See [design-system.md](design-system.md).

## Database

Plugins share the single platform database; isolation is by **convention**:

- **Prefix every table with your plugin slug** — `tasks_lists`, `tasks_items`,
  `splitify_groups`. There are no per-plugin databases in v1.
- **Use Drizzle**, defined in `db/schema.ts`, and stay dialect-agnostic: the
  same schema must run on SQLite (default) and Postgres. Don't write
  SQLite-specific SQL.
- **Add `tenant_id` to user-scoped tables** from day one, even though v1 is
  single-tenant — it keeps the door open for multi-tenancy.

Get a client with `await sdk.db.getClient()` and query through your schema.

## Local development

Run a plugin against a local platform checkout:

1. **Add it** — either clone with the CLI:
   ```bash
   pnpm sv plugin add https://github.com/you/sovereign-plugin-foo
   ```
   or declare it in `sovereign.plugins.json` and run `pnpm install:plugins`.
   Both clone into `plugins/<id>/` and compose it.
2. **Develop** — `pnpm dev` starts the runtime (`:3000`) and auth (`:3001`).
   Edits under `plugins/<id>/app/` are re-composed and hot-reloaded
   automatically.
3. **Remove it** — `pnpm sv plugin remove <id>` (deletes the directory and
   re-composes; built-in platform plugins are protected).

Never edit the composed copies under
`runtime/app/(platform)/(plugins)/` — they are generated and git-ignored. Your
`plugins/<id>/` directory is the source of truth.

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

A formal registry and contribution/review process is planned for v1.0 (see the
roadmap in [sovereign-implementation-tasks.md](sovereign-implementation-tasks.md)).
Until then, share your repository URL and instances add it as above.
