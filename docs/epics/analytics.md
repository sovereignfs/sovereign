# Epic: Analytics

> Self-hosted, privacy-first usage analytics — all data stays on the instance, DNT/GPC are hard-blocked, and collection is off by default.

## Status

📋 Planned

## Overview

Analytics ships as a platform plugin (`fs.sovereign.analytics`) so operators who want no analytics at all can simply disable it in Console. Phase 1 delivers server-side page-view recording via middleware and a `sdk.analytics.track()` surface for custom plugin events, with an aggregate dashboard using native `<canvas>` charts. Phase 2 adds a self-hosted client-side click and scroll tracking script and a heatmap visualization — no third-party CDN ever involved.

## Tasks

#### 📋 6.1 — Analytics, Phase 1 — Plugin scaffold + server-side infrastructure (RFC 0030)

**Goal:** Introduce a self-hosted, operator-controlled analytics system as a new
**platform plugin** (`plugins/analytics/`, id `fs.sovereign.analytics`). All data stays
on the instance. Page views are recorded server-side by the middleware (hard DNT/GPC
block). Plugins can emit custom analytics events via `sdk.analytics.track()`. Admins view
aggregate usage data in the Analytics plugin's Dashboard. Data collection is **off by
default** — enabled explicitly in Analytics → Settings. Operators who want no analytics
at all can disable the plugin in Console → Plugin Management.

**Deliverables:**

- `plugins/analytics/` scaffold: `manifest.json` (`type: platform`, `shell: default`,
  `routePrefix: /analytics`, `adminOnly: true`, `database: shared`, `permissions:
["auth:session", "db:readWrite"]`), `icon.svg`, `app/layout.tsx` (Dashboard / Settings
  nav), `app/page.tsx` (Dashboard), `app/settings/page.tsx` (collection toggle, retention
  dropdown, export, clear-all), empty `db/schema.ts`, `package.json`.
- `packages/db`: `analytics_page_views` + `analytics_events` table schemas for both
  SQLite and Postgres dialects; drizzle-kit migrations; DB helpers `recordPageView()`,
  `recordAnalyticsEvent()`, `queryAnalyticsAggregates()`, `cleanupOldAnalyticsRows()`;
  bootstrap seeds four new `platform_settings` keys: `analytics_collection_enabled`
  (`'false'`), `analytics_retention_days` (`'90'`), `analytics_daily_salt`
  (auto-generated), `analytics_salt_date` (today).
- `packages/manifest`: new `analytics:write` permission string in the manifest schema.
- `packages/sdk`: `sdk.analytics.track(event, properties?)` and
  `sdk.analytics.isEnabled()` in the experimental group; `SdkHost` gains `analytics` key.
- `runtime`:
  - `GET /api/analytics/config` — edge-cached (60 s); reads analytics plugin's
    `plugin_status.is_enabled` AND `analytics_collection_enabled` platform setting.
    Returns `{ enabled: bool, salt, saltDate, retentionDays }`.
  - Middleware page-view recording: fetch analytics config at request start, check
    `DNT`/`Sec-GPC` headers (hard block on either), compute daily-rotating session hash
    (`SHA-256(session_token + daily_salt)`), fire-and-forget
    `POST /api/analytics/internal/page-view` (non-blocking).
  - `POST /api/analytics/internal/page-view` — Node-runtime write route (admin-key-authed).
  - `GET /api/admin/analytics` — aggregate query endpoint (`health:view`-gated); supports
    `?range=7d|30d|90d` and `?type=pageviews|events|sessions`.
  - `'analytics'` added to `RESERVED_API_SEGMENTS`; dir-parity test passes.
  - Cleanup runner in `runtime/instrumentation.ts` `register()`: `cleanupOldAnalyticsRows()`.
  - SDK host `analytics` implementation: 60 s in-process cache for enabled state; checks
    plugin status + collection flag + DNT header; namespaces event to `<pluginId>.<event>`.
- `plugins/analytics/app/page.tsx`: Dashboard with active sessions/day bar chart, page
  views by plugin bar chart, top pages table, custom events table. Native `<canvas>`
  charts — no charting library dependency.
- `plugins/analytics/app/settings/page.tsx`: collection toggle (writes
  `analytics_collection_enabled`), retention dropdown (30/60/90/180 days), export button
  (`GET /api/admin/analytics?format=csv`), clear-all destructive button.
- `plugins/console`: Health page gains a "View analytics →" link to `/analytics`.
- Docs:
  - `plugin-development.md`: `sdk.analytics` surface documented; `analytics:write`
    permission in manifest reference table; plugin custom-event pattern + PII warning.
  - `self-hosting.md`: `analytics_collection_enabled`, `analytics_retention_days` settings
    documented.
  - `sdk-stability.md`: `sdk.analytics` added to the experimental-implemented group.
  - `packages/sdk/CHANGELOG.md`: minor entry.
  - Docs-parity test must pass for `analytics:write` permission and `sdk.analytics`.

**Dependencies:** None (independent post-v1 task)

**SRS reference:** RFC 0030

**Review checklist:**

- `GET /analytics` (admin session) → Dashboard renders
- `GET /analytics` (platform:user session) → 403
- Analytics plugin visible in Console → Plugin Management with enable/disable toggle
- Collection off by default: visit pages → no rows in `analytics_page_views`
- Enable collection in Analytics → Settings; visit plugin page → row in `analytics_page_views`
- `curl -H "DNT: 1" http://localhost:3000/launcher` → no row inserted (hard block)
- `curl -H "Sec-GPC: 1" http://localhost:3000/launcher` → no row inserted (hard block)
- Plugin WITH `analytics:write` permission: `sdk.analytics.track('feature.used', {})` → row in `analytics_events` with namespaced `event_name`
- Plugin WITHOUT `analytics:write` permission: `sdk.analytics.track()` → silent no-op, no row, no error
- Disable analytics plugin in Console → Plugin Management: `GET /analytics` → 404; `GET /api/analytics/config` → `{ enabled: false }`; `sdk.analytics.track()` from any plugin → no-op
- Retention cleanup: set `analytics_retention_days` to `1`, restart → old rows deleted at startup
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass
- Docs-parity test passes: `analytics:write` + `sdk.analytics` documented

---

#### 📋 6.2 — Analytics, Phase 2 — Client-side click tracking + heatmaps (RFC 0030)

**Goal:** Extend the analytics plugin with client-side click and scroll tracking (collected
by a self-hosted JS snippet served from the runtime — never a third-party CDN) and a
heatmap visualization in the Analytics plugin's Heatmap tab. The client script checks
`navigator.doNotTrack` and `navigator.globalPrivacyControl` before initializing — hard
block if either is set.

**Deliverables:**

- `packages/db`: `analytics_click_events` + `analytics_scroll_events` table schemas for
  both dialects; drizzle-kit migrations; DB helpers for batch insert and heatmap aggregate
  queries.
- `runtime`:
  - `POST /api/analytics/event` — client-side event receiver: session-cookie-authed,
    re-checks DNT/GPC, computes session hash, batch-inserts click and scroll rows.
  - `GET /api/analytics/script.js` — self-hosted analytics client script: returns empty
    200 when analytics is disabled or collection is off; otherwise returns the minified
    tracking script (~3 KB). Checks `navigator.doNotTrack` / `navigator.globalPrivacyControl`
    before attaching any listeners — exits immediately if either is truthy.
  - Root layout (`runtime/app/layout.tsx`): `<Script src="/api/analytics/script.js"
strategy="afterInteractive">` (excluded from session gate).
  - `GET /api/admin/analytics?type=clicks&path=<pathname>` and `?type=scroll` —
    heatmap aggregate queries.
- `plugins/analytics/app/heatmap/page.tsx`: **Heatmap** tab added to Analytics plugin:
  - Plugin selector + path input.
  - Click heatmap rendered on `<canvas>` as radial-gradient density overlay (blue → yellow → red).
  - Optional `<iframe sandbox="allow-same-origin allow-scripts" style="pointer-events:none">` for live page background.
  - Scroll depth segmented bar (% of sessions reaching 25/50/75/100%).
  - Date range filter.
- CSP: `connect-src 'self'` already covers `/api/analytics/event` — no change needed.

**Dependencies:** Task 1.0.5

**SRS reference:** RFC 0030

**Review checklist:**

- Load a plugin page, click several elements, scroll to bottom; navigate away; confirm rows appear in `analytics_click_events` and `analytics_scroll_events`
- Form field clicks (`<input>`, `<textarea>`) produce no `element_selector` recording
- Browser with `navigator.doNotTrack = '1'`: reload — no network request to `/api/analytics/event` (verify in DevTools Network tab)
- `GET /api/analytics/script.js` with analytics disabled → empty body, 200 OK
- Analytics plugin Heatmap tab: select a plugin + path → canvas renders click density gradient
- Scroll depth bar: reflects actual scrolling depth from test session
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass

---

## Related RFCs

- [RFC 0030 — Privacy-first analytics](../rfcs/0030-privacy-first-analytics.md)

## Related Docs

- [plugin-development.md — `sdk.analytics` (post-v1)](../plugin-development.md)
- [self-hosting.md — Analytics settings (post-v1)](../self-hosting.md)
