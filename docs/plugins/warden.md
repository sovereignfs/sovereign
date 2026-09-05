# Warden

**Version:** 0.1\
**Date:** September 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Warden plugin — the single source of truth for its manifest, access model, functional requirements, data model, and build plan.\
**Status:** Fully implemented (RFC 0063, three revisions) — epic tasks 22.1–22.12, all ✅

---

Warden is Sovereign's built-in personal AI chat assistant. Each user connects
their own OpenAI-API-compatible model provider(s) — OpenRouter, a direct
vendor, or a self-hosted server — with an API key, and chats against them in
multiple named, pinnable sessions. If the operator also runs the optional
local inference add-on (`apps/harness`), its model is folded into the same
picker automatically, with no configuration and no special status beyond
"free, no key needed."

**`type` is `sovereign`, not `platform`.** Unlike Account, Console, and
Launcher — the three chrome plugins that administer the platform's own core
data and are exempt from plugin activation entirely — Warden is an ordinary
installable app. It ships in this monorepo (built into the runtime image by
default, unlike a `community` plugin an operator clones separately, or an
`example-plugins/` entry gated behind `SOVEREIGN_EXAMPLES_ENABLED`), but on a
fresh instance it starts with no `plugin_status` row and is therefore
inactive until an admin activates it from Console's Plugins page (CON-07),
the same as any other non-chrome plugin. It also gets its own fully isolated
database store rather than sharing the platform schema — see
[Data model](#data-model). The manifest's `repository` field (required for
`sovereign`/`community` types) points back at this same monorepo path, since
Warden has no separate repository of its own.

The plugin is reachable at `/warden` (`routePrefix`) through the ordinary
Launcher grid and sidebar, not as shell chrome. Its manifest also currently
carries `development: true` — an amber "in development" badge next to its
name in Console's Plugins table and on its Launcher tile (CON-15), purely
informational and with no effect on routing or access.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                               | `fs.sovereign.warden`                                                                                              |
| `name`                             | `Warden`                                                                                                           |
| `type`                             | `sovereign`                                                                                                        |
| `runtime`                          | `native`                                                                                                           |
| `routePrefix`                      | `/warden`                                                                                                          |
| `shell`                            | `default`                                                                                                          |
| `adminOnly`                        | omitted (`false`)                                                                                                  |
| `icon`                             | `icon.svg`                                                                                                         |
| `development`                      | `true` — "in development" badge only (CON-15); no effect on routing, access policy, or the enable/disable default. |
| `disabled`                         | `false` — the build-time hard-disable flag; was `true` throughout phase 1 (see [Build plan](#build-plan)).         |
| `repository`                       | `https://github.com/sovereignfs/sovereign/tree/main/plugins/warden`                                                |
| `permissions`                      | `auth:session`, `db:readWrite`, `data:export`, `data:import`                                                       |
| `compatibility.minPlatformVersion` | `0.87.0`                                                                                                           |

```json
{
  "schemaVersion": 1,
  "id": "fs.sovereign.warden",
  "name": "Warden",
  "development": true,
  "disabled": false,
  "version": "0.11.0",
  "description": "A personal AI chat assistant, powered by a model provider you choose.",
  "type": "sovereign",
  "repository": "https://github.com/sovereignfs/sovereign/tree/main/plugins/warden",
  "runtime": "native",
  "routePrefix": "/warden",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite", "data:export", "data:import"],
  "compatibility": {
    "minPlatformVersion": "0.87.0"
  }
}
```

Notes:

- No `sdk.connections`/`sdk.secrets` permission is declared because none is
  required — `user`-scoped secrets and connections need no manifest
  permission at all (RFC 0043), unlike `instance`-scoped ones.
- No `storage:readWrite` permission either: attachments are processed
  in-memory for the current request only and are never written to
  `sdk.storage` or any table (see [Functional requirements](#functional-requirements)).
- **`data:import` is declared but currently unearned.** Warden's own
  `_lib/portability.ts` registers `provideExport`/`provideDelete` only — no
  `sdk.portability.provideImport()` handler exists anywhere in the plugin
  (confirmed by grep). `docs/plugin-development.md`'s portability section
  says to "declare `data:export`/`data:import` only once you've actually
  registered the matching hook," and `runtime/src/portability/restore.ts`
  bears this out at runtime: an import bundle containing a
  `fs.sovereign.warden` section is accepted (the plugin is "eligible" per
  the declared permission) but always resolves to
  `status: 'skipped', warning: 'no import handler registered for this
plugin'` — safe (nothing is silently dropped or corrupted), but the
  permission grants no actual capability today. See
  [SDK dependencies](#sdk-dependencies).
- `type` changed from `platform` to `sovereign` mid-implementation (task
  22.5), once Warden's first real tables were added — a `platform` plugin
  routes `sdk.db` to the shared, unisolated schema, which is wrong for a
  plugin that owns genuine data of its own. The `repository` field became
  required at the same time as a consequence of that type change.
- `shell: "default"` — a full page under the platform sidebar, not a dialog.

---

## Access control

Warden has no `adminOnly` gate. Every read and write is scoped strictly to
the calling user: providers, sessions, messages, model-visibility choices,
and the default-model setting are all looked up by `userId`/`tenantId`, and
every function that takes a caller-supplied id — `_lib/sessions.ts`'s
`getOwnSession()`, `_lib/providers.ts`'s `getOwnProvider()` — re-verifies
ownership in code after the read rather than trusting a query filter alone.
A guessed or leaked session/connection id belonging to another user returns
"not found," never that user's data.

Two access layers apply above the plugin's own per-user scoping, both
standard for any non-chrome plugin (`docs/plugins/console.md`'s CON-07/CON-13):

- **Activation.** A fresh instance creates no `plugin_status` row for
  Warden, so it is inactive by default until an admin activates it from
  Console's Plugins page.
- **Access policy.** Once active, Console's per-plugin access policy
  (Everyone, Admins and owners, Selected users, Selected groups, or
  Disabled) governs who may open `/warden` at all, independent of the
  plugin's own enabled/disabled state.

Provider API keys never live in a Warden-owned column. They're stored via
`sdk.secrets` (`scope: 'user'`, RFC 0043), referenced from an `sdk.connections`
row (RFC 0049) that Warden's `_lib/providers.ts` manages — deleting a
provider deletes its linked secret in the same action. A key is never
returned from a server action to the client or rendered into the DOM; only a
provider's label, base URL, and live health status are.

A user-supplied provider base URL is validated by `_lib/url-safety.ts`
(loopback, link-local, cloud-metadata, and known internal Compose service
names are rejected) both when the provider is saved and again immediately
before every request; the exact IP address that validation resolves is then
pinned for the outbound connection itself (`_lib/pinned-fetch.ts`, an undici
`Agent` with a caller-supplied `lookup`) so a second, independent DNS lookup
at connection time can't answer differently and reintroduce the rebind the
validation step exists to close.

---

## Functional requirements

Requirements below reflect Warden as shipped across RFC 0063's three
revisions — there is no separate future milestone the way Account's v0.2
or Console's phased CON-\* additions are; see
[Build plan](#build-plan) for how the requirements arrived in three phases.

### Core (RFC 0063)

#### Providers

| ID     | Requirement                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WRD-01 | Configure one or more OpenAI-API-compatible model providers (label, base URL, API key) via a first-run setup flow or Settings → Providers; edit or remove any provider later. The API key is never re-displayed once saved.                 |
| WRD-02 | Each provider's reachability is checked live (unreachable, auth-rejected, or OK) and shown per-provider without failing the rest of the list; a "Recheck providers" action forces a fresh check instead of the short-lived discovery cache. |
| WRD-03 | A provider's base URL is validated against an SSRF guard at save time and again before every request, with the resolved address pinned for the connection itself to close a DNS-rebind race between validation and use.                     |

#### Models

| ID     | Requirement                                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WRD-04 | Discover and merge every configured provider's live model catalog with the local `apps/harness` engine's model (when reachable and ready) into one selectable list; refreshed on a short server-side cache and by explicit "Recheck providers"/"Recheck models" actions that bypass it. |
| WRD-05 | Curate per-model visibility from Settings → Models: a provider-sourced model is hidden from the picker by default (a single catalog can run into the hundreds), the local model is shown by default, and either can be flipped per user.                                                |
| WRD-06 | Set a default model for brand-new sessions from Settings → General; existing sessions keep whichever model they were already using.                                                                                                                                                     |

#### Sessions and sidebar

| ID     | Requirement                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WRD-07 | Hold multiple independent, named chat sessions per user instead of one persisted thread. A session row is created lazily, only on its first sent message — never eagerly when "+ New" is clicked.                                 |
| WRD-08 | List sessions in a collapsible sidebar (collapsed by default), grouped into Pinned (up to 5, most-recently-pinned first) above Recent (the 10 most-recently-active); collapse state persists per browser.                         |
| WRD-09 | Rename, pin/unpin, or delete a session from its row's overflow menu. Pinning a 6th session is rejected with a message to unpin one first rather than silently evicting the oldest pin; delete has no "recently deleted" recovery. |
| WRD-10 | A new session's title defaults to a synchronous truncation of its first user message (no model call involved) and can be renamed manually at any time.                                                                            |

#### Chat

| ID     | Requirement                                                                                                                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WRD-11 | Send a message to the session's selected model and stream the reply incrementally, with controls to stop an in-progress reply and to copy any reply to the clipboard. Both sides of the exchange persist to that session in the background once the reply completes, without blocking the visible stream. |
| WRD-12 | Attach one image per message (sent to the model for that turn only and never persisted — a text placeholder stands in for it in history) or one text/Markdown/PDF document (extracted to plain text server-side, truncated past a size ceiling, and folded into the message as ordinary persisted text).  |
| WRD-13 | Toggle Incognito from the composer toolbar: a separate, never-written-to-storage scratch conversation, orthogonal to whichever session is selected underneath. Turning it off, or navigating away, discards it permanently with no recovery path; it cannot be combined with an attachment.               |
| WRD-14 | Pick a model from a provider-grouped popover in the composer (local model first, then each connected provider's own group), with a footer linking directly into Settings → Providers and Settings → Models.                                                                                               |
| WRD-15 | Server-enforced limits apply regardless of what the client sends: a maximum input length, a maximum output length, and a bounded number of recent turns replayed to the model as context on every request.                                                                                                |

#### Settings and portability

| ID     | Requirement                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WRD-16 | From Settings → General, delete every unpinned session inactive for longer than a user-chosen number of days, on demand; pinned sessions are never touched regardless of age. Not a scheduled job — Warden declares no `sdk.schedules` capability.                                           |
| WRD-17 | Provide an entry point to the account-wide data export from Settings → General ("Export my data"). Warden participates in that export and in account deletion for all of its own data — chat history, per-model visibility overrides, and the default-model setting — via `sdk.portability`. |

---

## Directory structure

Warden lives in the monorepo under `plugins/warden/`, with its own isolated
database store (migrations under `migrations/sqlite/` and
`migrations/postgres/` — see [Data model](#data-model)).

```
plugins/warden/
├── manifest.json
├── icon.svg
├── package.json
├── drizzle.config.ts / drizzle.config.pg.ts
├── migrations/
│   ├── sqlite/                       # warden_sessions/messages, visibility overrides, user settings
│   └── postgres/                     # mirrored Postgres migrations
└── app/
    ├── layout.tsx                    # best-effort sdk.portability registration
    ├── error.tsx
    ├── actions.ts                    # server actions: providers, model visibility, sessions, settings
    ├── warden.module.css
    ├── api/
    │   └── chat/
    │       └── route.ts              # streaming chat completion Route Handler (RFC 0063 §5)
    ├── (chat)/                       # route group sharing one sidebar/shell across its children
    │   ├── layout.tsx                #   resolves sessions + sidebar data once for /warden and /warden/new
    │   ├── loading.tsx
    │   ├── page.tsx                  #   /warden — continues the most recently active session
    │   ├── new/page.tsx              #   /warden/new — always a blank composer
    │   ├── providers/page.tsx        #   /warden/providers — rendered inside the same shell
    │   └── models/page.tsx           #   /warden/models — rendered inside the same shell
    ├── _components/                  # WardenChatPage, ChatView, ModelPickerPopover, WardenSidebar,
    │                                 # WardenLayoutShell, WardenSettingsDialog, GeneralSettings,
    │                                 # ProvidersView/ProviderRow/AddProviderForm, ModelsView/ModelToggleRow,
    │                                 # SetupPrompt
    ├── _lib/                         # sessions, providers, model-discovery, model-visibility(-policy),
    │                                 # user-settings, harness-client, provider-chat, pinned-fetch,
    │                                 # url-safety, attachments, limits, active-session, stream-capture,
    │                                 # portability
    └── _db/
        └── schema.ts / schema.postgres.ts
```

`app/api/chat/route.ts` is a plugin-owned Next.js Route Handler rather than a
server action — the one way to stream a completion incrementally to the
browser, and (per its own doc comment) the first precedent in this repo for
a plugin using a Route Handler instead of server actions exclusively.

`/warden/providers` and `/warden/models` were briefly consolidated into a
single `/warden/settings` (tabs) route during RFC 0063's third revision, then
split back into standalone routes once the persistent sidebar existed — a
full-page settings surface meant the sidebar disappeared out from under the
user. What remains of that consolidation is the small General tab (default
model, retention, export link), now a `Dialog` (`WardenSettingsDialog`)
opened from the sidebar footer rather than a route. See
[Build plan](#build-plan).

---

## Data model

Warden's four tables live in its own **isolated** database store — a
dedicated sqld namespace or Postgres schema (`plugin_fs_sovereign_warden`,
per `docs/plugin-database.md`'s `plugin_<id-with-underscores>` naming rule),
never the shared platform schema, since `type: sovereign` plugins are always
isolated (the one exception, `type: platform`, applies only to Account,
Console, and Launcher). Every table is tenant- and user-scoped.

### `warden_sessions`

| Column           | Type    | Notes                                                                                          |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `id`             | text    | PK.                                                                                            |
| `tenant_id`      | string  |                                                                                                |
| `user_id`        | string  |                                                                                                |
| `title`          | text    | Nullable until the first user message sets it (`deriveTitle()`), or the user renames it.       |
| `pinned_at`      | integer | Nullable. Non-null = pinned; sorts the pinned group (most-recently-pinned first), max 5.       |
| `last_active_at` | integer | Bumped only when a message is actually sent in this session — the sidebar's "recent" sort key. |
| `created_at`     | integer |                                                                                                |

### `warden_messages`

| Column        | Type    | Notes                                                                                                                                                                         |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | text    | PK.                                                                                                                                                                           |
| `session_id`  | text    | References `warden_sessions.id`.                                                                                                                                              |
| `role`        | text    | `'user'` \| `'assistant'`.                                                                                                                                                    |
| `content`     | text    | Plain text — never encrypted; see the schema's own doc comment on why (not classified as sensitive, same posture as any other plugin's free-text content).                    |
| `provider_id` | text    | The `sdk.connections` id that answered, or null for the local `apps/harness` model. Not a DB foreign key — connections live in the platform's own `plugin_connections` table. |
| `model`       | text    |                                                                                                                                                                               |
| `created_at`  | integer |                                                                                                                                                                               |

### `warden_model_visibility_overrides`

| Column       | Type    | Notes                                                                                                                       |
| ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`         | text    | PK.                                                                                                                         |
| `tenant_id`  | string  |                                                                                                                             |
| `user_id`    | string  |                                                                                                                             |
| `model_key`  | text    | `'local'`, or `${providerId}:${modelId}`. A row means "flip this key away from its own computed default" — exceptions only. |
| `created_at` | integer |                                                                                                                             |

### `warden_user_settings`

| Column              | Type    | Notes                                                                |
| ------------------- | ------- | -------------------------------------------------------------------- |
| `id`                | text    | PK.                                                                  |
| `tenant_id`         | string  |                                                                      |
| `user_id`           | string  | One row per user, get-or-create.                                     |
| `default_model_key` | text    | Nullable — no row/null means "fall back to the first visible model." |
| `created_at`        | integer |                                                                      |

Provider configuration itself is **not** a Warden-owned table — a provider
is an `sdk.connections` row (`provider: 'openai-compatible'`, `scope: 'user'`,
RFC 0049) with its API key held behind an `sdk.secrets` reference (RFC 0043).
Both live in the platform's own `plugin_connections`/`plugin_secrets` tables,
shared by every plugin that uses those SDK surfaces — not in
`plugin_fs_sovereign_warden`.

---

## SDK dependencies

| SDK surface       | Used for                                                                    | Available from |
| ----------------- | --------------------------------------------------------------------------- | -------------- |
| `sdk.auth`        | Current user session (`requireSession()` in every page and action)          | Task 0.4.2     |
| `sdk.db`          | Read/write Warden's own isolated tables (above)                             | Task 0.5.5     |
| `sdk.connections` | Per-user provider registry — label, base URL, live health status (RFC 0049) | Task 22.4      |
| `sdk.secrets`     | Provider API key storage, `scope: 'user'` (RFC 0043)                        | Task 22.4      |
| `sdk.portability` | `provideExport`/`provideDelete` for chat history and preferences (RFC 0007) | Task 22.5      |

`sdk.connections` and `sdk.secrets` need no manifest permission for
`user`-scoped use, which is why neither appears in Warden's `permissions`
array (see [Identity and manifest](#identity-and-manifest)'s notes).
`sdk.storage` is deliberately never used — an attached image is sent to the
model for one request and discarded; nothing about attachments is written to
disk or a table. No `provideImport` handler is registered despite the
manifest declaring `data:import` — see the note in
[Identity and manifest](#identity-and-manifest).

---

## UI

Warden consumes `@sovereignfs/ui` exclusively: `PageContainer`, `PageHeader`,
`ThreeColumnLayout` (via `WardenLayoutShell`), `NavList`, `Dialog`,
`ConfirmDialog`, `Popover`, `Menu`, `Button`, `Select`, `QuantityStepper`,
`Textarea`, `Message`/`MessageScroller`, `Markdown`, `EmptyState`, `Spinner`,
`Icon`, `Tooltip`, `useToast`, and `useCommitOnEnterOrBlur`.

**Layout.** A collapsible two-column shell (`WardenLayoutShell`) wraps
`/warden`, `/warden/new`, `/warden/providers`, and `/warden/models` — the
sidebar (`WardenSidebar`) and its collapse state live in the shared
`(chat)` route-group layout, so they persist across navigation between those
routes instead of being torn down and rebuilt on every click. Collapsed is
the default; the collapse toggle relocates with visibility (main column when
collapsed, inside the sidebar itself when expanded) so collapsing it never
also hides the only way to bring it back. A third sidebar column is reserved
in the layout for a future, undesigned phase (RFC 0063 §10) but is not built
or shown today.

**Composer.** Centered in the main column for a session with no messages
yet; docks to the bottom the instant the first message is sent — the same
tree in both states, only a modifier class changes, so nothing in the
composer (including the incognito toggle) ever remounts across that
transition. The model picker is a `Popover` grouped by provider; incognito is
an icon toggle in the composer toolbar (not the old chat header).

**Settings.** General (default model, retention, export link) is a `Dialog`
opened from the sidebar footer. Providers and Models are full routes
rendered inside the same shell, not tabs on a separate page — see
[Directory structure](#directory-structure) for why.

**Rendering.** Assistant replies render through `@sovereignfs/ui`'s
`Markdown` component (extended with ordered lists and fenced code blocks for
LLM output), not as raw text or via `dangerouslySetInnerHTML`.

Two curated icons were added to `@sovereignfs/ui`'s `Icon` set specifically
for this plugin's sidebar: `panel-left` (collapse toggle) and `pin`.

For the optional local inference add-on this UI can fold in automatically
(`apps/harness` — health checks, model download, environment variables), see
[docs/self-hosting.md](../self-hosting.md#wardens-harness-engine-rfc-0063-workstream-0014-legs-2-3),
which stays the operational reference for that one piece; this document
covers the plugin as a whole.

---

## Build plan

Fully implemented, shipped across three RFC 0063 revisions as epic tasks
22.1–22.12 (all ✅). Summarized here as shipped history rather than a
forward-looking task list — see `docs/epics/core-assistant.md` for full
task-by-task deliverables and verification, and RFC 0063 for the design
rationale behind each revision.

### Phase 1 — local-engine-only chat (tasks 22.1–22.3)

Benchmarked and stood up `apps/harness` (a first-party llama.cpp wrapper,
Research 0015) and shipped Warden as a plugin with ephemeral, unpersisted
chat against it only, with zero tool execution. Shipped and verified end to
end against a real local model, then deliberately hard-disabled
(`disabled: true`) — Research 0015's own benchmark showed representative
self-hosting hardware straining even on the smallest supported model.

### Phase 2 — bring-your-own provider chat, persistence, incognito (tasks 22.4–22.5)

Replaced the local engine as the only option with per-user
OpenAI-API-compatible provider configuration, live per-provider model
discovery merged with `apps/harness`'s model as one optional zero-config
entry, a single persisted conversation per user by default, and an
Incognito toggle preserving the original ephemeral behavior as an opt-in.
Verified against a real self-hosted mock provider; `disabled: true` removed.

### Phase 3 — multi-session UI: sidebar, settings, composer (tasks 22.8–22.11)

Replaced the single persisted conversation with `warden_sessions` —
multiple named, pinnable sessions — behind a collapsible sidebar
(Pinned/Recent groups, rename/pin/delete), a consolidated Settings surface,
and a Claude-style composer with a provider-grouped model-picker popover and
incognito relocated into the toolbar. Verified live at each of the four
legs (workstream 0021), confirming the sidebar's selected session and the
composer's active session could never disagree and that a 6th pin attempt
was rejected server-side.

### Correctness and follow-through pass (task 22.12)

Closed defects found reviewing the phase 3 legs together: session switching
now actually remounts the conversation; the collapsible shell no longer
discards in-flight streams or incognito content on toggle; an attachment
staged before Incognito can no longer leak into persisted history; a
stranded user turn is cleaned up if streaming fails mid-response; account
deletion covers all four of Warden's tables (two preference tables were
previously missed); and assistant replies render through `Markdown` instead
of raw text. Also reversed part of task 22.9's settings consolidation:
Providers and Models are standalone routes again, rendered inside the
persistent sidebar shell rather than as tabs on a page that hid it.

### Unrelated remediation (tasks 22.6–22.7)

Two audit-driven fixes, not part of any phase above: pinning the
DNS-resolved address for outbound provider requests to close a rebind race
in the SSRF guard (task 22.6), and collapsing the account-deletion handler
from a per-session query loop to a fixed 4 queries via `inArray` (task
22.7).

---

## Open questions

Carried forward from RFC 0063 — genuinely undesigned or unscheduled, not
gaps in this document:

1. **Tool selection and execution.** RFC 0047's plugin tool contracts are
   the sanctioned mechanism, with Warden as the intended first flagship
   consumer — not started; depends on RFC 0047 shipping.
2. **A floating quick-access action button**, reachable from any screen.
   Needs a new shell-chrome extension point that doesn't exist yet.
3. **Voice input/output.** Not designed.
4. **The reserved third sidebar column's actual functionality.** Space is
   kept in the layout; nothing is designed for it yet.
5. **Real memory beyond recency-based context truncation** — whether
   Warden eventually needs summarization or a proper memory layer, the
   "multi-agentic harness" direction this plugin is ultimately meant to
   grow into.
6. **RFC 0040 (Sovereign Harness)'s full revisit** — whether Harness ends up
   being this foundation extended with orchestration/memory, or a separate
   later product built on top of it. This RFC only resolved RFC 0040's
   narrower "user-supplied API keys" question.
7. **Sidebar cutoff beyond 10 recent sessions.** Currently a hard cutoff
   (older sessions unreachable from the sidebar); a "load more" or search
   affordance is unbuilt.
8. **A dedicated mobile shell.** All of RFC 0063's third revision is scoped
   to desktop/web; componentization keeps the door open, but no mobile UI
   is designed or scheduled.
9. **A shared, admin-configured default provider** for users who don't want
   to bring their own key — considered and rejected as out of scope for the
   current per-user design, not ruled out permanently.

---

## Changelog

| Version | Date      | Change                                                                                                                       |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Sept 2026 | Initial documentation — captures Warden as implemented through RFC 0063's third revision and epic tasks 22.1–22.12 (all ✅). |
