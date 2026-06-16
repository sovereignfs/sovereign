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

| Field           | Type                                                                    | Required                             | Description                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | integer                                                                 | yes                                  | Manifest format version. Currently `1`.                                                                                                                                                                                                  |
| `id`            | string                                                                  | yes                                  | Globally-unique reverse-DNS id, e.g. `io.example.tasks`. Also the install directory name.                                                                                                                                                |
| `name`          | string                                                                  | yes                                  | Human-readable name shown in the sidebar and Launcher.                                                                                                                                                                                   |
| `version`       | string                                                                  | yes                                  | Plugin version (semver recommended).                                                                                                                                                                                                     |
| `description`   | string                                                                  | no                                   | Short description.                                                                                                                                                                                                                       |
| `database`      | `shared` \| `isolated`                                                  | no                                   | Data isolation model. `shared` (default) keeps plugin tables in the platform DB with a slug prefix. `isolated` gives the plugin its own dedicated store; not implemented in v1 — scheduled for post-v1 Task 1.0.08 (RFC 0004, Accepted). |
| `type`          | `platform` \| `sovereign` \| `community`                                | yes                                  | Origin/trust tier (see below).                                                                                                                                                                                                           |
| `runtime`       | `native` \| `static` \| `iframe-local` \| `iframe-remote` \| `external` | yes                                  | Execution model. v1 plugins use `native`; the others are reserved for future runtimes.                                                                                                                                                   |
| `routePrefix`   | string starting with `/`                                                | yes                                  | URL prefix the plugin serves under, e.g. `/tasks`. The single source of truth for the plugin's URL.                                                                                                                                      |
| `permissions`   | array of permission strings                                             | yes (may be `[]`)                    | SDK capabilities the plugin declares (see below).                                                                                                                                                                                        |
| `shell`         | `default` \| `minimal` \| `overlay`                                     | no                                   | Presentation mode. `default` = full page under the platform sidebar; `overlay` = dialog over the current page (see below); `minimal` is reserved (not wired in v1).                                                                      |
| `shellConfig`   | object (see below)                                                      | no                                   | Per-shell tuning. Holds `overlaySize` (`sm` \| `md` \| `lg`, default `lg`) for `shell: overlay` plugins. Only valid when `shell` is `overlay`.                                                                                           |
| `adminOnly`     | boolean                                                                 | no (default `false`)                 | When `true`, only `platform:admin` users may reach the plugin's routes (403 otherwise).                                                                                                                                                  |
| `apiProvider`   | boolean                                                                 | no (default `false`)                 | When `true`, the plugin serves the public `/api/*` namespace (PLT-16). One provider per instance — see below.                                                                                                                            |
| `icon`          | string                                                                  | no                                   | Path to an SVG icon relative to the plugin root. A monogram is generated if omitted.                                                                                                                                                     |
| `compatibility` | object `{ minPlatformVersion: string }`                                 | yes                                  | Minimum platform version the plugin supports.                                                                                                                                                                                            |
| `repository`    | string (URL)                                                            | required for `sovereign`/`community` | Git repository URL. Required unless `type` is `platform`.                                                                                                                                                                                |

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
    `listSessions()`, `revokeSession(token)`, `signOut()` (ends the current
    session; the caller redirects afterwards).
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
[`registry/CONTRIBUTING.md`](../registry/CONTRIBUTING.md). Until your plugin is
listed, you can still share your repository URL and instances add it to
`sovereign.plugins.json` as above.
