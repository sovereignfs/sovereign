# API Composer

**Version:** 0.1\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign API Composer plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

API Composer is a GUI API builder. Developers routinely need small APIs — for a
mobile app, a script, a prototype — and building, deploying, and maintaining a
codebase for each one is disproportionate effort. API Composer removes that
cost: create an API project, define resources and their fields, enable CRUD
methods, and assign relationships entirely in the UI. The platform then serves
the API at `/api/<project-slug>/*` — no code, no deploy step.

**Design principles:** declarative over programmable. In v0.1 an API is
_configured_, never coded — methods are CRUD presets with validation, filtering,
and pagination, not custom handlers. Custom logic (sandboxed hooks) is a later
milestone with its own security design, consistent with the platform's v1
decision to defer plugin sandboxing.

v0.1 targets REST. The architecture is built around a **protocol adapter**
interface over a protocol-neutral metadata model, so GraphQL (and other
standards) plug in later without touching core logic — the same seam pattern as
Plainwrite's git-provider and SSG adapters.

The plugin is `type: sovereign` — maintained in a separate external repository
and the reference implementation for plugins that serve public, key-authenticated
endpoints under the platform's `/api` namespace (PLT-16).

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Architecture: metadata model + managed JSON storage](#architecture-metadata-model--managed-json-storage)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| `id`                               | `io.openfs.sovereign.apicomposer`                             |
| `name`                             | `API Composer`                                                |
| `type`                             | `sovereign`                                                   |
| `runtime`                          | `native`                                                      |
| `routePrefix`                      | `/api-composer`                                               |
| `shell`                            | `default`                                                     |
| `adminOnly`                        | omitted (`false`)                                             |
| `icon`                             | `icon.svg`                                                    |
| `permissions`                      | `auth:session`, `db:readWrite`                                |
| `repository`                       | `https://github.com/sovereignfs/sovereign-plugin-apicomposer` |
| `compatibility.minPlatformVersion` | `0.5.0`                                                       |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.apicomposer",
  "name": "API Composer",
  "version": "0.1.0",
  "description": "GUI API builder — design and serve REST APIs without writing code.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/api-composer",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "repository": "https://github.com/sovereignfs/sovereign-plugin-apicomposer",
  "compatibility": {
    "minPlatformVersion": "0.5.0"
  }
}
```

`minPlatformVersion` is `0.5.0` — not `0.4.0` like the other sovereign plugins —
because the generated APIs depend on the platform's `/api` namespace delegation
(PLT-16), which ships as a v0.5 platform task. The **builder UI** at
`/api-composer` has no such dependency, but a builder that cannot serve what it
builds is not a meaningful v0.1.

---

## Access control

The **builder UI** is available to all authenticated users via the
`plugin:access` capability. There is no admin-only gate.

Access within the plugin is project-scoped, following the Plainwrite pattern:

- A user sees only projects they created or were invited to.
- **Roles:** `owner` (full control: settings, members, API keys, schema, data)
  and `editor` (edit resources, methods, and records; cannot manage project
  settings, membership, or API keys).
- An owner cannot remove themselves if they are the only owner (transfer
  ownership or archive the project instead).

The **generated APIs** are not session-authenticated — external callers (mobile
apps, scripts) cannot present a Sovereign cookie. Instead:

- Each project has **API keys** (created by owners, hashed at rest). A caller
  sends `Authorization: Bearer <key>`; a valid, unrevoked key grants access to
  every enabled method in that project.
- A method may be marked **public** — callable with no credential at all.
- Requests under `/api/*` are exempt from the runtime's session-redirect
  middleware (PLT-16); API Composer enforces key auth itself in the serve
  handler.

---

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse an APC-\* id.

### v0.1 — Builder + REST

#### Project management

| ID     | Requirement                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APC-01 | Create a project: name, slug (auto-generated from the name, editable, unique per tenant, validated against a reserved-word list), optional description.                                                                    |
| APC-02 | Edit project settings (name, description) and enable/disable the project. Requests to a disabled project's generated API return 404 — disabling does not leak the project's existence.                                     |
| APC-03 | Archive a project (soft-delete). Archived projects are hidden from the default listing and their generated API stops serving. Hard delete is a separate, confirmation-required action that destroys the project's records. |
| APC-04 | Share a project with other Sovereign instance users. Roles: `owner` and `editor`. Owners can invite and remove members; an owner cannot remove themselves if they are the only owner.                                      |
| APC-05 | Manage API keys: create a key with a label — the plaintext key is displayed exactly once at creation; list keys (label, display prefix, created date, last-used date); revoke a key with immediate effect.                 |

#### Resources

| ID     | Requirement                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| APC-06 | Create a resource: name (slugified, unique within the project), display name, and a field schema. Field types: `string`, `number`, `boolean`, `date`, `datetime`, `enum`, `json`, `reference`.                                                                     |
| APC-07 | Define validation rules per field: required, default value, min/max (length for strings, value for numbers), regex pattern, enum value list. Rules are enforced by the engine on every create and update — via the generated API and the data browser alike.       |
| APC-08 | Define relationships via reference fields: a `reference` field points at another resource in the same project (many-to-one). A relationship editor visualises and edits these links. Deleting a record that other records reference is blocked in v0.1 (restrict). |

#### Methods

| ID     | Requirement                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APC-09 | Enable or disable each CRUD preset per resource: `list`, `get`, `create`, `update`, `delete`. A call to a disabled method returns 405.                                                  |
| APC-10 | Configure each method: filterable fields and sortable fields (list), default and maximum page size (list), writable fields (create/update — fields not listed are rejected with a 400). |
| APC-11 | Mark a method as public — callable without an API key. All non-public methods require a valid key.                                                                                      |

#### Generated REST API

| ID     | Requirement                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| APC-12 | Serve REST endpoints at `/api/<project-slug>/<resource>` and `/api/<project-slug>/<resource>/:id` for every enabled method. Responses are JSON with a consistent envelope (`data`, plus `meta` for pagination).                                        |
| APC-13 | List endpoints support equality filtering on filterable fields (`?field=value`), sorting (`?sort=field` ascending, `?sort=-field` descending), and page-based pagination (`?page=`, `?limit=`, capped at the method's maximum page size).              |
| APC-14 | Create and update validate the request body against the resource's field schema. Validation failure returns 400 with a per-field error map.                                                                                                            |
| APC-15 | List and get endpoints support `?expand=<reference-field>` — the referenced record is embedded in place of the foreign id. Multiple comma-separated fields may be expanded; one level deep in v0.1.                                                    |
| APC-16 | Authenticate non-public methods via `Authorization: Bearer <key>`. A missing, malformed, unknown, or revoked key returns 401. Key verification uses a constant-time hash comparison; `last_used_at` is updated on success.                             |
| APC-17 | Return standard, consistently shaped errors: 400 (validation, with field errors), 401 (auth), 404 (unknown project, resource, or record — including disabled/archived projects), 405 (disabled method). Error bodies follow one documented JSON shape. |

#### Data browser

| ID     | Requirement                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| APC-18 | Browse, create, edit, and delete a resource's records from within the builder UI (table view). The browser goes through the same engine validation as the generated API. |

---

### v0.2 — Observability and richer modelling

| ID     | Requirement                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| APC-19 | Auto-generated OpenAPI 3.1 document per project, served at `/api/<project-slug>/openapi.json`, derived entirely from the project's metadata. |
| APC-20 | Request log per project: method, path, status, key used, latency, timestamp — with a configurable retention window.                          |
| APC-21 | Per-key rate limiting with configurable limits; exceeded limits return 429.                                                                  |
| APC-22 | Many-to-many relationships between resources (junction handled by the engine), with `?expand=` support.                                      |
| APC-23 | Unique constraints on fields, enforced by the engine at write time.                                                                          |
| APC-24 | Import and export a resource's records as JSON or CSV from the data browser.                                                                 |

---

### v0.3 — GraphQL and custom logic

| ID     | Requirement                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APC-25 | GraphQL protocol adapter: serve a GraphQL endpoint at `/api/<project-slug>/graphql`, with the schema generated from the same resource metadata. Queries in the first cut; mutations follow. |
| APC-26 | Sandboxed custom logic hooks (before/after an operation, computed fields) using a restricted expression language — never arbitrary JavaScript. Requires its own security design review.     |
| APC-27 | Webhooks: POST a configurable URL on record create/update/delete events, with retry and delivery log.                                                                                       |

---

## Architecture: metadata model + managed JSON storage

Everything a user builds in the UI is **metadata** — projects, resources, field
schemas, methods, relationships. Records created through the generated API are
**data**. Both live in ordinary, migration-managed plugin tables; the plugin
never executes DDL at runtime.

```
┌────────────────────────────────────────────┐
│        Builder UI (metadata editing)        │
└──────────────────────┬─────────────────────┘
                       │ writes
            ┌──────────▼──────────┐
            │   Metadata tables    │  projects · resources · methods · keys
            └──────────┬──────────┘
                       │ read per request
┌──────────────────────▼─────────────────────┐
│              Execution engine               │
│  resolve project → auth → match method →    │
│  validate → query → serialize               │
└─────┬───────────────────────────────┬──────┘
      │                               │
┌─────▼────────┐               ┌──────▼────────────┐
│ Protocol     │               │ Managed JSON      │
│ adapters     │               │ storage           │
│ REST · (GQL) │               │ apicomposer_      │
└──────────────┘               │ records           │
                               └───────────────────┘
```

### Managed JSON storage

Records are stored as JSON documents in a single shared `apicomposer_records`
table — one row per record, with the document in a `data` column (SQLite JSON1 /
Postgres JSONB via Drizzle).

Why not real tables per resource? Creating tables at runtime (dynamic DDL)
conflicts with the platform's file-based migration model and forces
dialect-specific DDL handling, violating the dialect-agnostic hard rule. With
managed JSON storage, a schema change in the UI is a metadata update — no
migration, no DDL, identical behaviour on SQLite and Postgres.

The trade-off is accepted consciously: constraints (validation, uniqueness,
referential integrity) are enforced by the **engine**, not the database. For
the target use case — small APIs with modest data volumes — this is the right
trade. A "export to real tables" path can be explored post-v1 if demand exists.

### Protocol adapters

The metadata model is protocol-neutral. Each protocol implements a common
interface:

```typescript
interface ProtocolAdapter {
  // Translate an incoming request under /api/<slug>/* into an engine operation,
  // or null if the request doesn't match this protocol's routing shape.
  match(req: ApiRequest, project: Project, resources: Resource[]): EngineOperation | null;

  // Serialize an engine result or engine error into a protocol-shaped response.
  serialize(result: EngineResult | EngineError): ApiResponse;
}
```

- **`RestAdapter`** (v0.1) — maps `GET/POST/PATCH/DELETE` on
  `/<resource>[/:id]` to `list/get/create/update/delete` operations; serializes
  the JSON envelope and the standard error shape.
- **`GraphQLAdapter`** (v0.3) — maps `POST /<graphql>` queries against a schema
  generated from the same resource metadata.

Core engine code calls only the adapter interface — adding GraphQL must require
zero changes to the engine, validation, or storage layers.

### Execution engine

Every generated-API request flows through one pipeline:

```
request → resolve project by slug (404 if missing/disabled/archived)
        → authenticate (public method? else Bearer key → hash compare)
        → adapter.match → resource + method (405 if method disabled)
        → validate input against field schema (400 with field errors)
        → execute against apicomposer_records (filter/sort/paginate/expand)
        → adapter.serialize → response
```

### `/api` namespace delegation (platform dependency)

Plugins compose only under their own `routePrefix`, so the top-level
`/api/<slug>/*` URLs require platform support — specified as **PLT-16**:

- The runtime reserves the top-level `/api/*` namespace for plugin-served
  public APIs.
- Middleware exempts `/api/*` from the session-redirect rule (PLT-02); the
  serving plugin owns authentication for these routes.
- The runtime rewrites `/api/<segment>/*` to the registered API-provider
  plugin's serve route — for API Composer,
  `/api-composer/serve/<segment>/*` (`app/serve/[slug]/[...path]/route.ts`).
- If no provider plugin is installed, `/api/*` returns 404.

The registration mechanism is the **`apiProvider: true` manifest flag**
(implemented in the platform, PLT-16 / Task 0.5.08). Exactly one provider is
allowed per instance — the generate script fails the build on a second — and the
middleware rewrites `/api/<slug>/*` to the provider's serve route
(`<routePrefix>/serve/<slug>/*`), exempt from the session gate. So this plugin
declares `apiProvider: true` and serves `app/serve/[slug]/[[...path]]/route.ts`.

### API keys

- Generated as 32 bytes of cryptographically random data, presented once as
  `svk_<base62>`; never stored in plaintext.
- The database stores a SHA-256 hash plus the first 8 characters
  (`key_prefix`) for display in the key list.
- Verification hashes the presented key and compares in constant time.
- Revocation is a timestamp — revoked keys fail auth immediately, and the row
  is retained for the audit trail.

---

## Directory structure

```
sovereign-plugin-apicomposer/
├── manifest.json
├── icon.svg                              # API Composer icon — sidebar middle section + Launcher grid
├── app/
│   ├── layout.tsx                        # builder shell — project sidebar + content area
│   ├── page.tsx                          # all projects overview
│   ├── serve/
│   │   └── [slug]/
│   │       └── [...path]/
│   │           └── route.ts              # generated-API entry — platform rewrites /api/<slug>/* here (PLT-16)
│   └── [projectId]/
│       ├── page.tsx                      # project dashboard — resource list
│       ├── resources/
│       │   └── [resourceId]/
│       │       └── page.tsx              # field schema + methods editor (APC-06–11)
│       ├── data/
│       │   └── [resourceId]/
│       │       └── page.tsx              # record browser (APC-18)
│       ├── keys/
│       │   └── page.tsx                  # API key management (APC-05)
│       └── settings/
│           └── page.tsx                  # project settings + members (APC-02–04)
├── db/
│   └── schema.ts                         # all apicomposer_* tables
├── migrations/
├── components/
│   ├── FieldSchemaEditor.tsx             # typed field rows + validation rules
│   ├── MethodConfig.tsx                  # per-method enable/config/public toggle
│   ├── RelationshipEditor.tsx            # reference-field visualisation
│   ├── RecordTable.tsx                   # data browser grid
│   └── ApiKeyPanel.tsx                   # key list + create (reveal-once) + revoke
├── lib/
│   ├── engine/
│   │   ├── operations.ts                 # list/get/create/update/delete over JSON storage
│   │   ├── validate.ts                   # field-schema validation (shared by API + data browser)
│   │   └── query.ts                      # filter / sort / paginate / expand
│   ├── protocols/
│   │   ├── types.ts                      # ProtocolAdapter interface + shared types
│   │   ├── rest.ts                       # REST adapter (v0.1)
│   │   └── index.ts                      # getAdapter factory
│   ├── keys.ts                           # key generation, hashing, constant-time verify
│   └── slug.ts                           # slug generation + reserved-word list
└── package.json
```

---

## Data model

Six tables, all prefixed `apicomposer_`. All carry `tenant_id` per the platform
architectural rule (SRS hard rules).

### `apicomposer_projects`

| Column        | Type       | Notes                                                                  |
| ------------- | ---------- | ---------------------------------------------------------------------- |
| `id`          | uuid / pk  |                                                                        |
| `tenant_id`   | string     |                                                                        |
| `created_by`  | string     | FK → users.                                                            |
| `name`        | string     |                                                                        |
| `slug`        | string     | URL segment under `/api/`. Unique per tenant; reserved words rejected. |
| `description` | string?    | Nullable.                                                              |
| `enabled`     | boolean    | Default `true`. Disabled → generated API returns 404 (APC-02).         |
| `archived_at` | timestamp? | Nullable. Soft-archive timestamp (APC-03).                             |
| `created_at`  | timestamp  |                                                                        |
| `updated_at`  | timestamp  |                                                                        |

Unique index: (`tenant_id`, `slug`).

### `apicomposer_project_members`

| Column       | Type                | Notes                                                        |
| ------------ | ------------------- | ------------------------------------------------------------ |
| `project_id` | uuid                | FK → `apicomposer_projects`.                                 |
| `tenant_id`  | string              |                                                              |
| `user_id`    | string              | FK → users.                                                  |
| `role`       | `owner` \| `editor` | Owner row is inserted automatically on project creation.     |
| `invited_by` | string?             | Nullable. FK → users. Null for the original project creator. |
| `joined_at`  | timestamp           |                                                              |

Composite PK: (`project_id`, `user_id`).

### `apicomposer_resources`

| Column         | Type      | Notes                                                                                                                                                |
| -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid / pk |                                                                                                                                                      |
| `tenant_id`    | string    |                                                                                                                                                      |
| `project_id`   | uuid      | FK → `apicomposer_projects`.                                                                                                                         |
| `name`         | string    | Resource slug used in URLs (e.g. `posts`). Unique per project.                                                                                       |
| `display_name` | string?   | Nullable.                                                                                                                                            |
| `fields`       | json      | Array of field definitions: `{ name, type, required, default?, min?, max?, pattern?, values?, resource? }`. `resource` is set on `reference` fields. |
| `created_at`   | timestamp |                                                                                                                                                      |
| `updated_at`   | timestamp |                                                                                                                                                      |

Unique index: (`project_id`, `name`).

### `apicomposer_methods`

| Column        | Type      | Notes                                                                                                    |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `id`          | uuid / pk |                                                                                                          |
| `tenant_id`   | string    |                                                                                                          |
| `project_id`  | uuid      | FK → `apicomposer_projects`.                                                                             |
| `resource_id` | uuid      | FK → `apicomposer_resources`.                                                                            |
| `kind`        | string    | Enum: `list` \| `get` \| `create` \| `update` \| `delete`.                                               |
| `enabled`     | boolean   | Disabled → 405 (APC-09).                                                                                 |
| `is_public`   | boolean   | Default `false`. Public methods require no API key (APC-11).                                             |
| `config`      | json      | Per-kind config: `{ filterable?, sortable?, defaultPageSize?, maxPageSize?, writableFields? }` (APC-10). |
| `created_at`  | timestamp |                                                                                                          |
| `updated_at`  | timestamp |                                                                                                          |

Unique index: (`resource_id`, `kind`).

### `apicomposer_api_keys`

| Column         | Type       | Notes                                                             |
| -------------- | ---------- | ----------------------------------------------------------------- |
| `id`           | uuid / pk  |                                                                   |
| `tenant_id`    | string     |                                                                   |
| `project_id`   | uuid       | FK → `apicomposer_projects`.                                      |
| `label`        | string     | Human-readable purpose (e.g. "iOS app").                          |
| `key_hash`     | string     | SHA-256 of the full key. Plaintext is never stored.               |
| `key_prefix`   | string     | First 8 characters, for display in the key list.                  |
| `created_by`   | string     | FK → users.                                                       |
| `created_at`   | timestamp  |                                                                   |
| `last_used_at` | timestamp? | Nullable. Updated on successful authentication.                   |
| `revoked_at`   | timestamp? | Nullable. Set on revoke; revoked keys fail auth but are retained. |

### `apicomposer_records`

| Column        | Type      | Notes                                                       |
| ------------- | --------- | ----------------------------------------------------------- |
| `id`          | uuid / pk | The record id exposed by the generated API.                 |
| `tenant_id`   | string    |                                                             |
| `project_id`  | uuid      | FK → `apicomposer_projects`.                                |
| `resource_id` | uuid      | FK → `apicomposer_resources`.                               |
| `data`        | json      | The record document, shaped by the resource's field schema. |
| `created_at`  | timestamp |                                                             |
| `updated_at`  | timestamp |                                                             |

Index: (`project_id`, `resource_id`).

---

## SDK dependencies

| SDK surface | Used for                                                | Available from |
| ----------- | ------------------------------------------------------- | -------------- |
| `sdk.auth`  | Current user session; user lookup for member management | Task 0.4.02    |
| `sdk.db`    | Read/write all `apicomposer_*` tables                   | Task 0.5.05    |

API Composer requires no `sdk.mailer` in v1.

**Platform dependency:** the `/api/*` namespace delegation (PLT-16) must exist
before the generated APIs are reachable at their public URLs. This is a v0.5
platform task; hence `minPlatformVersion: 0.5.0`.

---

## UI

API Composer consumes `@sovereignfs/ui` (components and `--sv-*` tokens)
exclusively.

**Layout:** Two-panel on desktop — project/resource sidebar on the left, content
area on the right (schema editor, method config, data browser, keys, settings).
Collapses to a single-pane stack on mobile.

**Net-new primitives likely needed in `packages/ui`:**

- **Schema field row** — a composite row editor (name input + type select +
  rule toggles) with add/remove/reorder. Reusable for any plugin that edits
  structured schemas (Plainwrite's collection schema editor has overlapping
  needs).
- **Reveal-once secret** — modal that displays a generated secret a single time
  with a copy button and a "I've stored it" confirmation. Reusable for any
  credential-issuing flow.
- **Data grid** — sortable, paginated table with inline cell editing for the
  record browser. Broadly reusable.
- **Code block** — monospace, copyable display for endpoint URLs and example
  `curl` calls.

Drive these into `packages/ui` rather than building them inline.

---

## Build plan

Four milestones, each a separate branch + PR in the
`sovereign-plugin-apicomposer` repo. Requires Sovereign platform ≥ v0.5.0
(`/api` namespace delegation, PLT-16).

### v0.1 — Builder + REST (APC-01–18)

Project CRUD with slug management, sharing with owner/editor roles, API key
issue/list/revoke (hashed, reveal-once), resource and field-schema editing with
validation rules, reference fields with relationship editor, per-resource CRUD
method presets with config and public toggles, the REST protocol adapter, the
execution engine over managed JSON storage, and the record browser.

**Done when:** A user can build an API entirely in the UI — project, resources,
fields, methods — then call it from outside Sovereign at
`/api/<slug>/<resource>` with a Bearer key: list with filters and pagination,
create with validation errors on bad input, expand a reference, and get a 401
with a revoked key — without writing or deploying any code.

### v0.2 — Observability and richer modelling (APC-19–24)

OpenAPI 3.1 generation, request logs, per-key rate limiting, many-to-many
relationships, unique constraints, import/export.

**Done when:** A project's `openapi.json` imports cleanly into Postman/Insomnia;
the request log shows live traffic; a rate-limited key receives 429s.

### v0.3 — GraphQL and custom logic (APC-25–27)

GraphQL protocol adapter from the same metadata, sandboxed expression hooks,
webhooks. Adding GraphQL must require only a new `ProtocolAdapter`
implementation — no changes to the engine, validation, or storage layers.

**Done when:** The same project answers both REST and GraphQL queries; a
computed-field expression evaluates without arbitrary code execution; a webhook
fires on record creation with delivery retry.

### v1.0 — Stable

Polish, documentation, plugin developer guide entry. API Composer is the
reference implementation for plugins serving public, key-authenticated
endpoints under the `/api` namespace.

---

## Open questions

1. **Resolved (Task 0.5.08) — `/api/*` delegation mechanism (PLT-16).** The
   runtime knows the provider via the `apiProvider: true` manifest flag
   (`packages/manifest`). The generate script and middleware wire the rewrite
   (`/api/<slug>/*` → provider's `<routePrefix>/serve/<slug>/*`); exactly one
   provider per instance (the generate script fails loudly on two), and `/api/*`
   returns 404 when no enabled provider is installed.

2. **Dialect-agnostic JSON filtering.** Filtering/sorting on JSON document
   fields differs between SQLite (`json_extract`) and Postgres (`jsonb`
   operators). The hard rule forbids dialect-specific SQL in app code. Options:
   (a) Drizzle's dialect-abstracted JSON helpers where they cover the need;
   (b) app-layer filtering with a bounded row scan for v0.1 (acceptable at
   small-API scale, with a documented record-count guideline); (c) extracted
   index columns for filterable fields. Recommendation: (a) where possible with
   (b) as fallback in v0.1; revisit (c) if performance demands.

3. **Row-level authorization.** In v0.1 an API key grants access to all records
   in the project — there is no per-user record ownership on the generated API.
   Fine for prototypes and single-owner apps; multi-user apps backed by API
   Composer would need an ownership concept (e.g. an automatic `owner` system
   field bound to a key or end-user identity). Defer; decide before any
   "user-facing app backend" positioning.

4. **CORS.** Browser-based callers need CORS headers on the generated API.
   v0.1 recommendation: public methods respond with `Access-Control-Allow-Origin: *`;
   key-authenticated methods default to no CORS (server-to-server) — a
   per-project origin allowlist lands with the v0.2 observability work.

5. **Reserved slugs.** The slug validator needs a reserved-word list (e.g.
   `auth`, `verify`, `health`, `openapi`, future platform endpoints under
   `/api`). Maintain the list in `lib/slug.ts`; revisit when the platform adds
   its own `/api` endpoints.

6. **Record size and abuse limits.** Before rate limiting arrives in v0.2,
   v0.1 should enforce a maximum request body size and a maximum record count
   per resource (configurable, generous defaults) to keep a single project from
   degrading the shared database.

---

## Changelog

| Version | Date     | Change                                                                                                         |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft — GUI API builder: managed JSON storage, protocol adapters, API keys, `/api` namespace (PLT-16). |
