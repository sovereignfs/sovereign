---
rfc: 0030
title: Privacy-First Analytics
status: Accepted
date: June 2026
author: kasunben
scope: >
  packages/manifest, packages/sdk, packages/db, runtime, plugins/analytics (new),
  plugins/console
incorporated_into_plan: 'Yes — epic tasks 6.1 (server-side infrastructure) and 6.2 (client-side tracking + heatmaps) [post-v1]'
---

# RFC 0030 — Privacy-First Analytics

## Summary

Adds a fully self-hosted, operator-controlled analytics system to Sovereign as a new
**platform plugin** (`plugins/analytics/`, id `fs.sovereign.analytics`). All data stays
on the instance. Third-party analytics services are explicitly out of scope — they
contradict Sovereign's privacy-first, cloud-autonomy positioning.

The system respects the browser's Do Not Track (`DNT`) and Global Privacy Control
(`Sec-GPC`) signals as a **hard block** (zero data collected when either signal is set).
Data collection is **off by default** — the plugin is installed and enabled, but collects
nothing until an admin explicitly enables it in Analytics → Settings.

Analytics being a plugin (not a built-in feature) means operators who want zero analytics
footprint can disable it via Console → Plugin Management, which blocks all routes, no-ops
the SDK write path, and makes the config endpoint return `{ enabled: false }` — exactly
like disabling any other plugin.

Implementation is split across two roadmap tasks: **Task 1.0.5** (server-side
infrastructure: plugin scaffold, page-view recording, `sdk.analytics`, Analytics
dashboard + settings) and **Task 1.0.6** (client-side click/scroll tracking and the
heatmap visualization).

---

## Motivation

Sovereign targets operators who self-host for privacy and autonomy. They need usage
insights — which plugins are most used, when the platform is busiest, which pages users
get stuck on — but they should not have to route that data through a third-party service.
Existing self-hosted analytics tools (Plausible, Umami, Matomo) solve this but require
running a separate service and accepting its data model. A native analytics surface gives
operators zero-configuration insights inside their existing deployment.

The activity log (RFC 0005, Task 0.5.12) captures explicit user actions for audit
purposes. Analytics is a separate concern: aggregate usage patterns, page-view counts,
click density, and plugin-authored conversion events. Mixing the two would dirty the audit
trail with high-volume page-view noise and break the personal-feed guarantees of the
activity log.

Making analytics a plugin (rather than built-in) is philosophically consistent with
Sovereign's core thesis: the plugin system IS the product. Analytics is an optional
feature, and optional features should be plugins. This also creates a clear extension
point — third-party operators could build and install alternative analytics plugins.

---

## Current state

- The **activity log** (`activity_log` table, `sdk.activity.log()`) records explicit
  mutations. It is an audit trail, not a usage-metrics system.
- The **Console health dashboard** shows liveness indicators but no usage data.
- The **middleware** already has access to every request's plugin ID, pathname, session
  token, locale, and role — all the raw material for page-view analytics — but does
  nothing with it today.
- There is **no client-side telemetry** of any kind.
- The disabled-plugin list (`fetchDisabledPluginIds`) is only fetched inside the
  middleware **when the request is under a plugin prefix** (line 237 in
  `runtime/middleware.ts`). It is not fetched for every request. Analytics page-view
  gating therefore requires its own lightweight config fetch (`GET /api/analytics/config`),
  not a reuse of the disabled-plugin list.

---

## Proposed design

### 1. Core principles

1. **Platform plugin, not runtime built-in.** Analytics ships as
   `plugins/analytics/` (`type: platform`, `adminOnly: true`). Disabling the plugin via
   Console → Plugin Management removes the UI, blocks its routes, and no-ops all SDK
   writes — exactly the same as disabling any other plugin.
2. **Collection off by default.** The analytics plugin is installed and enabled by
   default (it is a platform plugin), but data collection is disabled until an admin
   explicitly enables it in Analytics → Settings. There are two separate controls:

   | Control            | Location                    | Effect                                                                                              |
   | ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
   | Collection enabled | Analytics → Settings tab    | Toggles `analytics_collection_enabled` in `platform_settings`. UI still accessible.                 |
   | Plugin enabled     | Console → Plugin Management | Disables plugin entirely: routes blocked, SDK no-ops, config endpoint returns `{ enabled: false }`. |

3. **Hard DNT / GPC block.** When either `DNT: 1` or `Sec-GPC: 1` is present in the
   request headers, zero data is collected for that request. The client-side script
   additionally checks `navigator.doNotTrack` and `navigator.globalPrivacyControl` before
   initializing — if either is truthy, the script exits immediately with no event
   listeners attached.
4. **No user IDs in analytics tables.** Events are keyed to a daily-rotating session hash
   (`SHA-256(session_token + daily_salt)`). The salt is stored in `platform_settings`
   alongside the date it was issued; when the date changes, a new salt is generated and
   the old one is discarded. Cross-day individual tracking is architecturally impossible.
5. **Admin-only access.** Analytics data is never returned to `platform:user` sessions.
   All analytics API routes require the `health:view` capability or the admin key.
6. **Configurable retention with automated cleanup.** Default 90 days. Rows older than
   `analytics_retention_days` are deleted at startup. No indefinite accumulation.
7. **No third-party services, CDNs, or external endpoints.** The client script is served
   from the runtime. All data is written to the platform DB.

### 2. Analytics as a platform plugin

```
plugins/analytics/
├── manifest.json
│   { "id": "fs.sovereign.analytics",
│     "name": "Analytics",
│     "type": "platform",
│     "shell": "default",
│     "routePrefix": "/analytics",
│     "adminOnly": true,
│     "database": "shared",
│     "permissions": ["auth:session", "db:readWrite"],
│     "compatibility": { "minPlatformVersion": "1.0.0" } }
├── icon.svg
├── app/
│   ├── layout.tsx         # nav tabs: Dashboard / Heatmap (Task 1.0.6) / Settings
│   ├── page.tsx           # Dashboard: DAU, page views by plugin, custom events
│   ├── heatmap/
│   │   └── page.tsx       # Click heatmap + scroll depth (Task 1.0.6)
│   └── settings/
│       └── page.tsx       # Collection toggle, retention, export, clear-all
├── db/
│   └── schema.ts          # EMPTY — analytics tables live in packages/db
└── package.json
```

`shell: "default"` — full-page navigation (suitable for a dashboard with charts). The
analytics icon appears in the sidebar's middle section for admin users alongside other
installed plugins. `adminOnly: true` means `platform:user` sessions see no icon and get
403 on any `/analytics` route.

#### Why API routes live in the runtime, not the plugin

The middleware must call `GET /api/analytics/config` on **every request** (before the
session gate, before any plugin routing) to decide whether to record the page view. If
this were a plugin route at `/analytics/api/*`, the middleware would need to complete its
own gating logic before calling it — a circular dependency.

Similarly, `POST /api/analytics/internal/page-view` is called fire-and-forget by the
middleware. It must be a runtime route. The client-side `POST /api/analytics/event` and
`GET /api/analytics/script.js` are excluded from the session gate and are simpler as
runtime routes.

All analytics API routes live in `runtime/app/api/analytics/`. `'analytics'` is added to
`RESERVED_API_SEGMENTS` (dir-parity test passes).

### 3. Analytics config endpoint

`GET /api/analytics/config` (edge-cached 60 s) returns:

```json
{
  "enabled": true,
  "salt": "a1b2c3...",
  "saltDate": "2026-06-22",
  "retentionDays": 90
}
```

`enabled = plugin_status.is_enabled('fs.sovereign.analytics') AND platform_settings.analytics_collection_enabled == 'true'`

The middleware reads this endpoint at the top of every request. If `enabled: false`, it
skips all page-view recording for that request. If `enabled: true` but `DNT`/`GPC` header
is present, it also skips.

### 4. Database tables

Four new tables in `packages/db` (shared platform DB, same precedent as `activity_log`,
`notifications`). All carry `tenant_id` for the v1 multi-tenancy forward-compatibility rule.

#### `analytics_page_views` _(Task 1.0.5)_

| Column         | Type           | Notes                                                                                     |
| -------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `id`           | text (ULID)    | PK                                                                                        |
| `tenant_id`    | text           | Multi-tenant scoping                                                                      |
| `session_hash` | text           | SHA-256(session_token + daily_salt); never a user ID                                      |
| `plugin_id`    | text nullable  | Plugin whose route was visited; null = platform chrome                                    |
| `pathname`     | text           | URL path only — no query string (query strings can contain tokens or PII)                 |
| `locale`       | text nullable  | From `x-sovereign-user-locale` header                                                     |
| `screen_class` | text nullable  | `'mobile'`\|`'tablet'`\|`'desktop'` bucketed from screen width; NOT the User-Agent string |
| `created_at`   | integer/bigint | Unix seconds                                                                              |

Indexes: `(tenant_id, plugin_id, created_at DESC)`, `(session_hash)`, `(created_at)`.

#### `analytics_events` _(Task 1.0.5)_

Plugin-authored custom events via `sdk.analytics.track()`.

| Column         | Type           | Notes                                                            |
| -------------- | -------------- | ---------------------------------------------------------------- |
| `id`           | text (ULID)    | PK                                                               |
| `tenant_id`    | text           |                                                                  |
| `session_hash` | text           | Same daily hash                                                  |
| `plugin_id`    | text           | Source plugin; runtime auto-namespaces the event name            |
| `event_name`   | text           | `<pluginId>.<event>`, e.g. `fs.sovereign.console.plugin_enabled` |
| `properties`   | text nullable  | JSON blob; plugin-provided (PII warning in docs)                 |
| `created_at`   | integer/bigint |                                                                  |

Indexes: `(tenant_id, event_name, created_at DESC)`, `(plugin_id, created_at)`.

#### `analytics_click_events` _(Task 1.0.6)_

Click positions collected by the client script.

| Column             | Type           | Notes                                                                                                                       |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`               | text (ULID)    | PK                                                                                                                          |
| `tenant_id`        | text           |                                                                                                                             |
| `session_hash`     | text           |                                                                                                                             |
| `plugin_id`        | text nullable  |                                                                                                                             |
| `pathname`         | text           |                                                                                                                             |
| `x_norm`           | real           | Click X as fraction of viewport width (0.0–1.0)                                                                             |
| `y_norm`           | real           | Click Y as fraction of document height (0.0–1.0, scroll-offset included)                                                    |
| `element_selector` | text nullable  | `tag.firstClass` only. IDs excluded (can contain user data). Form fields (`input`, `textarea`, `select`) excluded entirely. |
| `created_at`       | integer/bigint |                                                                                                                             |

Indexes: `(tenant_id, plugin_id, pathname, created_at DESC)`.

#### `analytics_scroll_events` _(Task 1.0.6)_

One row per page visit, sent on page unload.

| Column           | Type           | Notes                                                      |
| ---------------- | -------------- | ---------------------------------------------------------- |
| `id`             | text (ULID)    | PK                                                         |
| `tenant_id`      | text           |                                                            |
| `session_hash`   | text           |                                                            |
| `plugin_id`      | text nullable  |                                                            |
| `pathname`       | text           |                                                            |
| `max_scroll_pct` | integer        | 0–100: deepest scroll position reached                     |
| `time_on_page_s` | integer        | Seconds capped at 1 800 (30 min) to prevent idle inflation |
| `created_at`     | integer/bigint |                                                            |

### 5. Platform settings keys

| Key                            | Default             | Notes                                                 |
| ------------------------------ | ------------------- | ----------------------------------------------------- |
| `analytics_collection_enabled` | `'false'`           | Master collection switch; set in Analytics → Settings |
| `analytics_retention_days`     | `'90'`              | Row age limit; cleanup runs at startup                |
| `analytics_daily_salt`         | auto-generated UUID | Rotated lazily when `analytics_salt_date` ≠ today     |
| `analytics_salt_date`          | today's ISO date    | Rotation trigger                                      |

Salt rotation is **lazy**: on every page-view write, compare `analytics_salt_date` against
today's UTC date. If they differ, generate a new `analytics_daily_salt`, update both keys
atomically, use the new salt for the current request.

### 6. Manifest permission: `analytics:write`

A new permission string for OTHER plugins to call `sdk.analytics.track()`. Follows the
existing permission model in `packages/manifest/src/schema.ts`.

```json
{ "permissions": ["auth:session", "analytics:write"] }
```

The analytics plugin itself uses `db:readWrite` (to query analytics tables for the
dashboard). It does not need `analytics:write` — the SDK host writes directly.

### 7. `sdk.analytics` surface

New `packages/sdk/src/analytics.ts`, exported from `packages/sdk/src/index.ts` in the
**experimental** group:

```ts
export const analytics: {
  /**
   * Track a custom analytics event.
   *
   * No-ops when:
   * - The analytics plugin is disabled.
   * - Analytics collection is disabled in Analytics → Settings.
   * - The current plugin lacks the `analytics:write` manifest permission.
   * - The request carries `DNT: 1` or `Sec-GPC: 1`.
   *
   * The event name is auto-namespaced to `<pluginId>.<event>` by the runtime.
   * Never put PII in `properties` — the platform does not redact it.
   */
  track(event: string, properties?: Record<string, unknown>): Promise<void>;

  /**
   * Returns true if the analytics plugin is enabled AND collection is enabled AND
   * the current request does not carry a DNT/GPC opt-out signal.
   * Useful for conditionally rendering analytics-related UI in a plugin.
   */
  isEnabled(): Promise<boolean>;
};
```

`SdkHost` gains an `analytics` key. Implementation in `runtime/src/sdk-host.ts`:

- Checks `isAnalyticsEnabled()` (reads plugin status + collection setting, 60 s in-process
  cache).
- Checks `DNT`/`Sec-GPC` headers from the request context.
- Writes to `analytics_events` via `packages/db` helpers.

### 8. Middleware changes

After the session-verification step, before the plugin gate, the middleware performs
page-view recording:

```
1. GET /api/analytics/config (edge-cached 60 s)
   → { enabled: boolean, salt, saltDate, retentionDays }
2. If enabled = false → skip (analytics plugin disabled or collection off).
3. If header DNT === '1' OR Sec-GPC === '1' → skip (hard block).
4. Lazy salt rotation check: if saltDate ≠ today, call POST /api/analytics/internal/rotate-salt.
5. session_hash = SHA-256(session_token + salt) in hex.
6. Fire-and-forget: POST /api/analytics/internal/page-view
   { session_hash, plugin_id, pathname, locale, screen_class }
   (non-blocking — analytics must never add latency to the response path).
```

`screen_class` is derived from the `sv-screen-class` cookie (set by the client script on
first load), NOT from User-Agent parsing. If the cookie is absent, `screen_class` is null.

### 9. Runtime API routes

| Route                                    | Auth                     | Notes                                                       |
| ---------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| `GET /api/analytics/config`              | admin key                | Edge-cached; reads plugin status + collection setting       |
| `POST /api/analytics/internal/page-view` | admin key (internal)     | Node-only; writes `analytics_page_views`                    |
| `GET /api/admin/analytics`               | `health:view` capability | Aggregate query endpoint: DAU, page views by plugin, events |
| `POST /api/analytics/event`              | session cookie           | Client-side click/scroll receiver (Task 1.0.6)              |
| `GET /api/analytics/script.js`           | public                   | Self-hosted client script (Task 1.0.6)                      |

All analytics routes excluded from the middleware session gate (they handle their own
auth). `'analytics'` added to `RESERVED_API_SEGMENTS`.

### 10. Analytics plugin UI

#### Dashboard page (`/analytics`)

- **Active sessions / day** — bar chart, count of unique `session_hash` values per day
  (proxy for DAU without naming individuals).
- **Page views by plugin** — stacked bar chart, last 7 / 30 / 90 days (date range picker).
- **Top pages** — table: pathname, view count, median time on page.
- **Custom events** — table: event name, plugin, count, last seen.
- Charts rendered with native `<canvas>` (no charting library dependency).

#### Heatmap page (`/analytics/heatmap`) _(Task 1.0.6)_

- **Route selector**: plugin dropdown + free-text path input (e.g. `/console/users`).
- **Click heatmap**: a `<canvas>` sized to a 1×1 normalized coordinate space. Each click
  position is rendered as a radial gradient dot; overlapping dots accumulate color
  intensity (cold = blue, warm = yellow, hot = red). Optional `<iframe
sandbox="allow-same-origin allow-scripts" style="pointer-events:none">` behind the
  canvas shows the live plugin page as layout reference.
- **Scroll depth bar**: segmented bar showing % of sessions that reached 25/50/75/100%.
- Date range filter.

#### Settings page (`/analytics/settings`)

| Setting           | Control                             | Effect                                             |
| ----------------- | ----------------------------------- | -------------------------------------------------- |
| Enable collection | Toggle                              | Writes `analytics_collection_enabled`              |
| Retention period  | Dropdown: 30 / 60 / 90 / 180 days   | Writes `analytics_retention_days`                  |
| Export data       | Button                              | `GET /api/admin/analytics?format=csv` — all tables |
| Clear all data    | Destructive button (confirm dialog) | Truncates all `analytics_*` tables                 |

### 11. Console changes (minimal)

Analytics moves OUT of Console. Console gets smaller:

- No Analytics settings section in Console Settings.
- No Analytics tab.
- The plugin list in Console → Plugin Management shows the Analytics plugin (same as all
  platform plugins), including the enable/disable toggle.
- Console → Health page gets a "View analytics →" link to `/analytics`.

### 12. Client-side analytics script _(Task 1.0.6)_

Self-hosted at `GET /api/analytics/script.js`. Returns empty 200 if analytics is disabled
or collection is off. Loaded in `runtime/app/layout.tsx` via `<Script
src="/api/analytics/script.js" strategy="afterInteractive">`.

On load, the script:

1. Checks `navigator.doNotTrack === '1'` and `navigator.globalPrivacyControl`. If either
   is truthy, exits immediately — no event listeners, no network calls.
2. Derives `screen_class` from `window.innerWidth`, sends it once to a lightweight route
   that sets the `sv-screen-class` cookie (skipped if cookie already exists).
3. Attaches a delegated `click` listener on `document`. On each click:
   - `x_norm = event.clientX / window.innerWidth`
   - `y_norm = (event.clientY + window.scrollY) / document.body.scrollHeight`
   - `element_selector = tag.firstClass` (excludes `input`, `textarea`, `select`,
     `option`, `label`; excludes IDs).
   - Adds to a local batch (capped at 50 events per flush).
4. Tracks `max_scroll_pct` via a throttled `scroll` listener.
5. On page unload (`visibilitychange` hidden + `pagehide`), sends the batch to
   `POST /api/analytics/event` via `navigator.sendBeacon`.

~3 KB minified. No cookies, no localStorage, no persistent identifier in the browser.

---

## Data flow diagrams

### Page view (server-side, Task 1.0.5)

```
Browser           Edge Middleware                Node Runtime              DB
  │                     │                              │                    │
  │──GET /launcher──────▶                              │                    │
  │                     │── GET /api/analytics/config ─▶                   │
  │                     │◀─ { enabled: true, salt }────│                   │
  │                     │── check DNT/GPC header        │                   │
  │                     │   (DNT absent → proceed)      │                   │
  │                     │── fire-and-forget ────────────▶                  │
  │                     │   POST /analytics/internal/   │── INSERT ─────────▶
  │                     │   page-view                   │   analytics_page_views
  │◀── 200 page HTML ───│                              │                    │
```

### Plugin enabled/disabled effect on collection

```
Admin: Console → Plugin Management → disable Analytics
  → plugin_status.is_enabled = false for 'fs.sovereign.analytics'
  → GET /api/analytics/config cache invalidated (60 s max staleness)
  → Middleware sees { enabled: false } → stops recording page views
  → sdk.analytics.track() called by any plugin → isEnabled() returns false → no-op
  → GET /analytics → 404 (middleware blocks disabled plugin routes)
```

### Custom event (plugin server component)

```
Plugin server component        sdk-host.ts                  DB
  │                                 │                         │
  │──await sdk.analytics.track(     │                         │
  │    'feature.used', { plan:'pro'}│                         │
  │  )                              │                         │
  │                                 │── isEnabled() (cached)  │
  │                                 │── check DNT header      │
  │                                 │── namespace event name  │
  │                                 │── INSERT ───────────────▶
  │                                 │   analytics_events       │
```

---

## Privacy guarantees

| Guarantee                                | Mechanism                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| No PII in analytics tables               | User IDs, email addresses, names never stored; only daily-rotating anonymous session hash |
| Hard DNT / GPC block                     | Middleware and client script check both signals; zero-write when either is set            |
| Daily amnesia window                     | Salt rotates daily; cross-day session correlation is architecturally impossible           |
| No third-party exfiltration              | All writes go to `/api/analytics/*` on the same origin; no external HTTP calls            |
| Admin-only read access                   | All analytics query routes require `health:view` capability or admin key                  |
| Configurable retention                   | Rows older than `analytics_retention_days` deleted at startup                             |
| No User-Agent strings stored             | Screen class is bucketed (3 values); UA strings dropped                                   |
| No query strings in page views           | `pathname` is stripped of query strings before storage                                    |
| Form fields excluded from click tracking | `input`/`textarea`/`select` elements excluded from `element_selector`                     |
| True disable via plugin management       | Disabling the plugin stops all collection — no partial state                              |

---

## Alternatives considered

### Built-in runtime feature with a settings toggle

Keeping analytics as a runtime built-in with `analytics_enabled` in `platform_settings` was
the initial plan (RFC 0030 rev 1). Rejected because:

- It is inconsistent with Sovereign's plugin philosophy — analytics is an optional feature,
  and optional features should be plugins.
- "Disable analytics entirely" becomes a buried settings toggle rather than a first-class
  plugin management action.
- Third-party operators cannot replace the built-in with their own analytics plugin.
- Routes, DB write paths, and SDK registrations exist in the runtime even when analytics
  is "off" — unnecessary footprint.

### Third-party self-hosted analytics (Plausible, Umami, Matomo)

Purpose-built and feature-rich, but require a separate service, add a compose entry, and
put data in an external DB with no Console integration. Rejected.

### Extending the activity log

The activity log is an audit trail per-user. Adding page-view noise (hundreds of rows per
session per day) breaks its primary purpose and personal-feed performance. Rejected.

### Soft DNT (aggregate always, per-session suppressed)

Some tools count all requests and suppress only per-session attribution for DNT users. This
interpretation is contested and inconsistently applied. Hard block is simpler, safer, and
more honest. Rejected.

---

## Open questions

1. **`Sec-GPC` equality.** `Sec-GPC: 1` (Global Privacy Control) is sent by Firefox with
   Enhanced Tracking Protection and by most privacy-focused browsers. The recommendation
   is to treat it identically to `DNT: 1`. Any objection?

2. **Per-user opt-out without browser DNT.** Should Account Preferences expose an
   "Analytics opt-out" toggle so users can opt out without setting DNT globally? Would add
   an `account_prefs` flag and one more middleware read. Deferred — the hard block covers
   users who set DNT at the browser level.

3. **Salt rotation precision.** Lazy rotation means the salt changes on the first
   analytics-eligible request after midnight UTC, not exactly at midnight. Sessions
   straddling midnight may appear as "new sessions" in daily counts. Acceptable tradeoff
   for avoiding a cron job?

4. **Element selector safety.** The simplified selector `tag.firstClass` excludes IDs and
   form fields. Should it also strip classes that are purely numeric or utility-named
   (e.g. `p-4`, `text-sm`)? These carry no semantic information and inflate cardinality.

5. **Iframe heatmap background.** An `<iframe>` with `pointer-events: none` showing the
   live plugin page behind the canvas is useful for spatial context. Alternative: show no
   background (just a coordinate grid). Open for implementation to decide.

6. **Custom event PII in `properties`.** The platform does not validate or redact the JSON
   blob. A lint warning for known PII key names (`email`, `name`, `userId`) in
   `sdk.analytics.track()` calls would be a useful future hardening step.

7. **Analytics plugin icon.** The icon should be visually distinct from Console (⚙) and
   semantically clear. A bar-chart or activity graph icon (available in the existing Lucide
   icon set via RFC 0011) would work — e.g. `BarChart2` or `Activity`.

---

## Adoption path

### Task 1.0.5 — Analytics Phase 1: Server-side infrastructure + plugin scaffold

**Deliverables:**

- `plugins/analytics/` scaffold: `manifest.json`, `icon.svg`, `app/layout.tsx`,
  `app/page.tsx` (Dashboard), `app/settings/page.tsx`, empty `db/schema.ts`, `package.json`.
- `packages/db`: `analytics_page_views` + `analytics_events` table schemas for both
  dialects; drizzle-kit migrations `0005_analytics_phase1`; DB helpers
  `recordPageView()`, `recordAnalyticsEvent()`, `queryAnalyticsAggregates()`,
  `cleanupOldAnalyticsRows()`; bootstrap seeds `analytics_collection_enabled`,
  `analytics_retention_days`, `analytics_daily_salt`, `analytics_salt_date`.
- `packages/manifest`: new `analytics:write` permission string.
- `packages/sdk`: `sdk.analytics.track()` + `sdk.analytics.isEnabled()` (experimental
  group); `SdkHost` gains `analytics` key.
- `runtime`:
  - `GET /api/analytics/config` (edge-cached 60 s; reads plugin status + collection flag).
  - `POST /api/analytics/internal/page-view` (Node-only write route, admin-key-authed).
  - `GET /api/admin/analytics` (aggregate queries, `health:view`-gated).
  - `'analytics'` added to `RESERVED_API_SEGMENTS`; dir-parity test passes.
  - Middleware page-view recording (DNT guard, session hash, fire-and-forget POST).
  - SDK host `analytics` implementation (60 s in-process cache for enabled check).
  - Startup cleanup: `cleanupOldAnalyticsRows()` in `runtime/instrumentation.ts` `register()`.
- `plugins/console`: Health page gets "View analytics →" link.
- Docs: `sdk.analytics` + `analytics:write` in `plugin-development.md`; settings keys
  in `self-hosting.md`; `sdk-stability.md`; `packages/sdk/CHANGELOG.md`.
- Version bumps: `@sovereignfs/manifest` minor, `@sovereignfs/sdk` minor,
  `@sovereignfs/db` minor, `runtime` minor, `plugins/console` patch.
- Root `package.json` does not bump (post-v1 task; ships after v1.0.0).

### Task 1.0.6 — Analytics Phase 2: Client-side click tracking + heatmaps

**Deliverables:**

- `packages/db`: `analytics_click_events` + `analytics_scroll_events` schemas + migrations
  `0006_analytics_phase2`; batch-insert and heatmap aggregate DB helpers.
- `runtime`:
  - `POST /api/analytics/event` (client-side event receiver; session-cookie-authed;
    re-checks DNT; batch-inserts click and scroll rows).
  - `GET /api/analytics/script.js` (self-hosted client script, ~3 KB minified; returns
    empty 200 when analytics disabled or collection off).
  - Root layout: `<Script src="/api/analytics/script.js" strategy="afterInteractive">`.
  - `GET /api/admin/analytics?type=clicks` and `?type=scroll` — heatmap aggregate queries.
- `plugins/analytics/app/heatmap/page.tsx`: click density canvas, scroll depth bar,
  optional iframe background.
- Version bumps: `@sovereignfs/db` minor, `runtime` minor, `plugins/analytics` minor.
- Root `package.json` does not bump (post-v1 task; ships after v1.0.0).

---

## Review checklist (Task 1.0.5)

```bash
# Analytics plugin appears in Console → Plugin Management
# GET /analytics → Dashboard renders (admin session)
# GET /analytics → 403 for platform:user session

# Collection off by default: visit pages, confirm NO rows in analytics_page_views
SELECT COUNT(*) FROM analytics_page_views; -- → 0

# Enable collection in Analytics → Settings, then visit a plugin page:
curl -H "x-sovereign-admin-key: $KEY" 'http://localhost:3000/api/admin/analytics?range=7d'
# → { pageViews: [...], activeSessionsPerDay: [...], topPages: [...], events: [...] }

# Hard DNT block:
curl -H "DNT: 1" http://localhost:3000/launcher
# → no new row in analytics_page_views

# sdk.analytics.track() from plugin WITH analytics:write permission:
# → row in analytics_events with event_name = '<pluginId>.my_event'

# sdk.analytics.track() from plugin WITHOUT analytics:write permission:
# → silent no-op, no row, no error thrown

# Disable analytics plugin via Console → Plugin Management:
# GET /analytics → 404
# sdk.analytics.track() → no-op (isEnabled() returns false)
# GET /api/analytics/config → { enabled: false }

# Retention cleanup: set retention to 1 day, restart → old rows deleted at startup

pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
# Docs-parity: analytics:write permission + sdk.analytics documented
```

## Review checklist (Task 1.0.6)

```bash
# Load a plugin page, interact (click, scroll), navigate away:
SELECT COUNT(*) FROM analytics_click_events;    -- → > 0
SELECT COUNT(*) FROM analytics_scroll_events;   -- → > 0

# Form field clicks produce no element_selector:
SELECT element_selector FROM analytics_click_events WHERE element_selector LIKE 'input%';
# → 0 rows

# GET /api/analytics/script.js with collection disabled → empty 200 body

# Browser with navigator.doNotTrack = '1':
# → DevTools Network: no request to /api/analytics/event on page unload

# Console Heatmap tab: select plugin + path → canvas renders click density gradient
```

---

## Versioning impact

| Package                 | Bump type       | Task                                                         |
| ----------------------- | --------------- | ------------------------------------------------------------ |
| `@sovereignfs/manifest` | minor           | 0.9.6 (new `analytics:write` permission)                     |
| `@sovereignfs/sdk`      | minor           | Task 1.0.5 (new experimental `sdk.analytics` surface)        |
| `@sovereignfs/db`       | minor           | Task 1.0.5 (new tables + helpers), again minor in Task 1.0.6 |
| `runtime`               | minor           | both tasks                                                   |
| `plugins/analytics`     | initial `0.1.0` | Task 1.0.5 (new plugin), minor in Task 1.0.6                 |
| `plugins/console`       | patch           | Task 1.0.5 (health-page link only)                           |
| Root `package.json`     | no bump         | post-v1 tasks; ships after v1.0.0                            |

---

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                      |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2     | June 2026 | Revised: analytics becomes a platform plugin (`plugins/analytics/`); two-control model (collection toggle + plugin enable/disable); Console Analytics section removed; API routes remain in runtime to avoid circular middleware dependency |
| 0.1     | June 2026 | Initial draft (analytics as runtime built-in + Console section)                                                                                                                                                                             |
