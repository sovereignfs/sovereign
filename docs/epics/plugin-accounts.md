# Epic: Plugin — Accounts

> Per-user self-service — profile, security, preferences, data portability, activity, and account deletion.

## Status

⏳ In Progress

## Overview

The Account plugin (`fs.sovereign.account`) is a `type: platform`, `shell: overlay` plugin accessible to all authenticated users. It lives in the sidebar bottom chrome as the user's avatar. The plugin has grown through several epics as new capabilities were added: the initial profile/security/preferences trio, then a Data tab for cross-plugin consent management and portability export/import, an Activity tab for the personal audit feed, MFA enrollment, and subscription management for monetized plugins.

## Tasks

#### ✅ 14.1 — Account plugin

**Goal:** Per-user profile, preferences, and credential management for all authenticated users.

**Deliverables:**

- `plugins/account/` with:
  - `manifest.json` — id: `fs.sovereign.account`, type: `platform`, runtime: `native`, routePrefix: `/account`, shell: `default`, icon: `icon.svg`, permissions: `["auth:session", "db:readWrite"]`, minPlatformVersion: `0.4.0`
  - `icon.svg` — user silhouette or similar. Note: the sidebar bottom section renders the user's avatar (or initials) for `fs.sovereign.account`, not this icon; `icon.svg` is used in the Launcher grid only.
  - `app/layout.tsx` — three-tab sub-navigation: Profile / Security / Preferences
  - `app/page.tsx` — redirect to `/account/profile`
  - `app/profile/page.tsx` — display name + avatar upload (ACC-01, ACC-02, ACC-03). Avatar stored on disk at `data/avatars/<user_id>` and served via a Next.js route; `avatar_url` written to the user record.
  - `app/security/page.tsx` — password change with current-password confirmation (ACC-04); active sessions list with revoke (ACC-05, ACC-06)
  - `app/preferences/page.tsx` — timezone (searchable IANA dropdown, ACC-07) + appearance toggle Light / Dark / System (ACC-08)
  - `db/schema.ts` — `account_prefs` table: `user_id` (PK/FK), `tenant_id`, `timezone` (IANA string, default `UTC`), `theme` (`system` | `light` | `dark`, default `system`), `updated_at`
  - `components/AvatarUpload.tsx`, `components/SessionList.tsx`, `components/TimezoneSelect.tsx`
- Appearance preference written to both `account_prefs` (authoritative) and a `sv-theme` cookie so the shell can apply `data-theme` on the server without a DB round-trip (prevents SSR flash — see ACC-08 open question in `docs/plugins/account.md`)

**Dependencies:** Task 0.4.02 (`sdk.auth` — session, password change via `better-auth`, sessions API)

**SRS reference:** ACC-01–ACC-08, `docs/plugins/account.md`

**Review checklist:**

- User can update display name; change persists on reload
- Avatar upload stores file, updates `avatar_url`, and is reflected in the sidebar bottom section's avatar slot
- Password change succeeds with the correct current password; rejected with wrong current password; current session is preserved after a successful change
- Active sessions list shows all sessions with device hint, IP, and last-active timestamp; any session except the current one can be revoked
- Timezone preference stored in `account_prefs`
- Appearance toggle applies `data-theme` immediately without reload; preference survives page reload via the `sv-theme` cookie
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass

---

#### ✅ 14.2 — Account plugin workflow coverage

**Status (August 2026): shipped — workstream 0012 leg 1.** Added
`app/__tests__/actions.test.ts` (display-name update, password validation +
`changePasswordAction`, sidebar-preference save via
`updateSidebarPluginsAction`), exported `buildEntries` from
`SidebarControl.tsx` for a dedicated read/merge-behavior test, and a
component test for `NotificationsPage`'s mute-toggle/save path. The security
panel deliverable was already satisfied by the pre-existing
`device-hint.test.ts` (SRS ACC-05), not new work. Along the way, found and
fixed a real dependency gap: `actions.ts` imports `qrcode` directly but only
`runtime/package.json` declared it — pnpm's strict per-package resolution
meant this plugin could never actually resolve its own import in isolation;
now declared in `plugins/account/package.json` itself.

**Goal:** Add meaningful regression coverage for Account workflows that users
depend on, beyond private helper functions.

**Deliverables:**

- Cover profile and display-name update behavior.
- Cover password validation and password-change action paths.
- Cover sidebar plugin preference save and read behavior.
- Cover notification preference update behavior.
- Cover security panel helper behavior where it can be tested without browser
  APIs.

**Dependencies:** Task 14.1 (Account plugin), Task 2.13 (sidebar
customization), Task 4.2 (Web Push notifications), Task 1.4 (Passkeys and TOTP
MFA).

**SRS reference:** ACC-01, ACC-04, ACC-07, ACC-08.

**Review checklist:**

- Critical Account actions have either unit/action tests or E2E coverage.
- Tests avoid depending on generated route copies under `runtime/app`.
- Existing user-facing Account behavior is unchanged.

Subsequent tasks added Account sections as part of other epics:

| Task   | Feature added to Account                                              | Primary epic                                  |
| ------ | --------------------------------------------------------------------- | --------------------------------------------- |
| 0.5.11 | Data tab — active consent grants with per-grant revoke                | [Platform Shell](platform-shell.md)           |
| 0.5.12 | Security tab — Log out action for current session                     | [Users & Auth](users-auth.md)                 |
| 0.5.13 | Activity tab — personal audit feed                                    | [Activity Logs](activity-logs.md)             |
| 0.5.15 | Data tab — Export and Import buttons for data portability             | [Data Sovereignty](data-sovereignty.md)       |
| 0.5.27 | Security tab — TOTP enrollment/disable, passkey add/list/remove       | [Users & Auth](users-auth.md)                 |
| 0.7.1  | Preferences tab — push notification opt-in                            | [Notification Center](notification-center.md) |
| 0.8.0  | New Subscriptions section — purchase, import license, manage renewals | [Monetization](monetization.md)               |
| 1.7    | Data tab — "Delete your account" section                              | [Users & Auth](users-auth.md)                 |

---

#### ✅ 14.3 — Sweep Account's user-facing copy from "plugin" to "app"

**Goal:** Account (`plugins/account/`) is an unambiguous end-user surface, so every string it renders is user-facing copy and falls under CLAUDE.md's naming-conventions table row "User-facing UI strings, labels, placeholders, empty states → app". A grep audit (`grep -rniE '\bplugin' plugins/account/app --include='*.tsx'`) finds nine live occurrences of "plugin(s)" in copy actually rendered to users, spread across six files, distinct from the `pluginId`/`PluginInfo`/`PluginEntry` identifiers and better-auth's own `createAuthClient({ plugins: [...] })` option name that correctly stay "plugin" per the same table's code/types/APIs row. The clearest is `SidebarControl.tsx:91`'s `"No plugins installed."` empty state — the direct structural counterpart of CLAUDE.md's own canonical correct example (`"No apps found"`) and of Launcher's already-fixed reference pattern (`plugins/launcher/app/_components/LauncherOfflineView.tsx:147`, `"No apps installed yet"`). `PortabilityPanel.tsx` shows this has never been done as a deliberate pass: the same paragraph block already says "participating apps" (line 123) and "installed app{s}" (line 153) right next to a leftover "participating plugins" (line 117) — the file is mid-inconsistent, not untouched.

**Deliverables:**

- plugins/account/app/_components/SidebarControl.tsx:91 — change "No plugins installed." to "No apps installed."
- plugins/account/app/billing/page.tsx:106 — change "No active plugin licenses." to "No active app licenses."
- plugins/account/app/billing/page.tsx:142-144 — reword "Paste the signed license token you received from the plugin author or payment provider. When a paid plugin redirects you to its paywall page, you can also import the token directly from there." to use "app" (e.g. "...from the app's developer or payment provider... When a paid app redirects you to its paywall page...").
- plugins/account/app/billing/page.tsx:147 — change the FormField label="Plugin ID" to label="App ID" (label text only — leave id="billing-plugin-id" and the importPluginId/pluginId POST field name untouched, since those are code identifiers, not copy).
- plugins/account/app/data/page.tsx:133 — change "These plugins can read your data from other plugins. Revoke any consent you no longer want." to "These apps can read your data from other apps. Revoke any consent you no longer want."
- plugins/account/app/data/page.tsx:359 — change "...activity history, notifications, and any data held by installed plugins. This cannot be undone." to "...any data held by installed apps. This cannot be undone."
- plugins/account/app/preferences/page.tsx:115-116 — change "Drag to reorder plugin icons. Toggle to show or hide individual plugins. The home icon and platform controls are always visible." to "Drag to reorder app icons. Toggle to show or hide individual apps. The home icon and platform controls are always visible."
- plugins/account/app/security/page.tsx:68 — change "Some plugins and features require a verified email or enrolled MFA (RFC 0035)." to "Some apps and features require a verified email or enrolled MFA (RFC 0035)."
- plugins/account/app/notifications/page.tsx:20 — change the 'info' category description "General informational notifications from plugins." to "General informational notifications from apps."
- plugins/account/app/_components/PortabilityPanel.tsx:115-117 — change "...profile, preferences, avatar, and any participating plugins — as a ZIP archive..." to "...and any participating apps — as a ZIP archive...", matching the "participating apps"/"installed app{s}" wording already used two lines below (line 123, 153) in the same component.
- plugins/account/app/notifications/**tests**/page.test.tsx and plugins/account/app/_components/**tests**/DeviceStorageKeySection.test.tsx (or any other **tests** file under plugins/account/app) — update any test assertion that matches the old "plugin" copy strings by exact text (e.g. getByText/toHaveTextContent) so the suite doesn't regress; grep for the exact strings being changed before editing each test file.
- Do not touch pluginId/PluginInfo/PluginEntry/importPluginId identifiers, the id="billing-plugin-id" DOM id, sidebar-plugins-dnd DndContext id, or better-auth's plugins: [...] client-option arrays in PasskeySection.tsx/DeviceStorageKeySection.tsx — these are code/API surface, not user-facing copy, and are out of scope per CLAUDE.md's naming table.

**Dependencies:** None.

**SRS reference:** none — this is remediation of a documented CLAUDE.md naming-convention rule (the plugin/app terminology split), not new design; Launcher's existing fix (plugins/launcher/app/_components/LauncherOfflineView.tsx) is the direct precedent this task extends to Account.

**Review checklist:**

- grep -rniE '\bplugins?\b' plugins/account/app --include='*.tsx' | grep -viE 'pluginId|PluginInfo|PluginEntry|pluginName|pluginCount|pluginNames|infoMap|importPluginId|createAuthClient|plugins: \[' returns no remaining user-facing copy matches (only code identifiers/comments).
- pnpm --filter @sovereignfs/account-plugin test (or the repo-wide pnpm test -- plugins/account) passes, including any test files updated for the new copy strings.
- Manually load /account/preferences, /account/billing, /account/data, /account/security, /account/notifications in a dev instance with zero and non-zero installed plugins, and confirm every empty state, label, and help/subtitle string reads "app"/"apps", never "plugin"/"plugins".
- pnpm format:check and pnpm lint pass with no new violations introduced by the copy edits.
- PortabilityPanel.tsx's export-summary paragraph (lines ~115-123) reads consistently — no sentence within it still says "plugin" while an adjacent one says "app".

---

#### ✅ 14.4 — Add error feedback to Account's Data & Privacy revoke/disconnect handlers

**Goal:** Close a UX gap found via code audit in `plugins/account/app/data/page.tsx`: the four mutation handlers on the Data & Privacy tab — `revoke` (lines 99–102, consent-grant DELETE), `revokeDeviceGrant` (104–115, device-consent DELETE), `revokeSecret` (117–120, vault-secret DELETE), and `disconnectConnection` (122–125, connection DELETE) — each check `if (res.ok)` before updating local state and do nothing at all in the failure branch: no `else`, no try/catch around the `fetch` call itself, no error state set. A user who clicks "Revoke"/"Disconnect" and hits a 401 (session expired — both `data-grants/[id]/route.ts` and `device-grants/route.ts` return `{ error: 'unauthenticated' }` on missing `x-sovereign-user-id`), a 500, or an offline network error (an uncaught `fetch` rejection, since `onClick={() => void revoke(...)}` discards the promise without a `.catch`) sees the row silently stay in the list, indistinguishable from a click that never registered. The same file's own `load()` (lines 62–93) demonstrates the established pattern — `try { ... } catch (e) { setError(...) }` — and `plugins/account/app/billing/page.tsx`'s `cancel()` (lines 50–63) shows the sibling per-row-mutation pattern: set an error state before the request, on `!res.ok` set a user-facing message via `<p className={billingStyles.error} role="alert">`, matching `billing.module.css`'s `.error` class. `plugins/account/app/account.module.css` already defines an equivalent `.error` class (lines 182–190), already used this way by every other `_components/*.tsx` file in the Account plugin (`AvatarUpload.tsx`, `EncryptionSection.tsx`, `PortabilityPanel.tsx`, `PasskeySection.tsx`, `TotpSection.tsx`, `DeviceStorageKeySection.tsx`, `PasswordChangeForm.tsx`) — `data/page.tsx` is the outlier that never adopted it for its own mutations, despite importing the same `styles` module and already using an inline error-colored `<p>` for `load()`'s failures at line 139.

**Deliverables:**

- In `plugins/account/app/data/page.tsx`, add four new `useState<string | null>(null)` variables — `grantError`, `deviceGrantError`, `secretError`, `connectionError` — one per section, distinct from the existing page-level `error` state (which is reserved for `load()` failures and only rendered under the first section).
- Rewrite `revoke` (lines 99–102) to: clear `grantError` before the request, wrap the `fetch` + `res.ok` check in try/catch, and on failure — non-2xx response or thrown error (network failure, offline) — call `setGrantError(...)` with a message derived from the response status (mirroring `billing/page.tsx`'s `cancel()`), e.g. `'Could not revoke this consent — please try again.'` on `!res.ok`, or `e instanceof Error ? e.message : 'Could not revoke this consent.'` in the catch block. Do not touch `grants` state on failure.
- Apply the identical try/catch + error-state pattern to `revokeDeviceGrant` (lines 104–115, sets `deviceGrantError`), `revokeSecret` (lines 117–120, sets `secretError`), and `disconnectConnection` (lines 122–125, sets `connectionError`) — same shape as `revoke`, one call site each.
- Render `{grantError && <p className={styles.error} role="alert">{grantError}</p>}` inside the "Data access consents" section (after the existing `{error && ...}` block around line 139), and the equivalent `{deviceGrantError && ...}`, `{secretError && ...}`, `{connectionError && ...}` paragraphs inside the "Device app permissions" (around line 172), "Connected accounts" (around line 210), and "Saved app credentials" (around line 248) sections respectively — none of these three sections currently render any error paragraph at all.
- Add `plugins/account/app/data/__tests__/page.test.tsx` (new file; no test file currently exists for this page), modeled on `plugins/account/app/notifications/__tests__/page.test.tsx`'s `@vitest-environment jsdom` + `vi.stubGlobal('fetch', ...)` + Testing Library pattern: mock the four GET endpoints (`/api/account/data-grants`, `/api/account/device-grants`, `/api/account/secrets`, `/api/account/connections`) to return one row each, then for each of the four DELETE endpoints assert (a) a `Response` with `ok: false` (e.g. 401 or 500) leaves the row rendered and shows the corresponding `role="alert"` error message, and (b) a rejected fetch (network error) is caught, not left as an unhandled rejection, and also surfaces the error text.

**Dependencies:** None. Modifies `plugins/account/app/data/page.tsx`, which shipped across tasks 0.5.11 (consent grants), 0.5.15 (portability), and 1.7 (account deletion) per `docs/epics/plugin-accounts.md`'s task table — no new backend surface, no manifest/SDK change.

**SRS reference:** None — this is remediation of a UX consistency gap found via code audit, not new design or an SRS-specified behavior. SRS §3.13 (RFC 0002, cross-plugin data sharing / consent grants) and §3.16 (RFC 0007, data portability) describe the underlying features whose revoke/disconnect UI this task hardens, but neither specifies mutation error-handling behavior.

**Review checklist:**

- Each of the four handlers (`revoke`, `revokeDeviceGrant`, `revokeSecret`, `disconnectConnection`) is wrapped in try/catch and sets its own section-scoped error state on both a non-2xx response and a thrown/rejected fetch — grep `plugins/account/app/data/page.tsx` confirms no handler still has a bare `if (res.ok) ...` with no else/catch branch.
- Simulating a 401/500 response from any of the four DELETE endpoints (e.g. via a mocked `fetch` in a test, or by expiring the session and clicking Revoke in a real browser) leaves the row in the list and renders a visible `role="alert"` message in that row's own section — not silence, not a console-only error.
- Simulating an offline/rejected `fetch` for any of the four handlers does not produce an unhandled promise rejection in the browser console and still surfaces a user-facing error message.
- A subsequent successful retry (same row, same handler) clears the prior error message and removes the row as before.
- `pnpm --filter @sovereignfs/plugin-account exec vitest run` passes, including the new `plugins/account/app/data/__tests__/page.test.tsx`.
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass.
- No new hardcoded color literals introduced — `pnpm design:tokens:check` passes (the added error paragraphs reuse the existing `styles.error` class, not new inline styles like the pre-existing `style={{ color: 'var(--sv-color-error-text, red)' }}` at line 139, which this task does not need to touch).

---

#### ✅ 14.5 — Vertical section nav for Account (re-scoped from RFC 0085)

**Status (September 2026): shipped, in three rounds — each correcting the
previous round's own sizing call.** Round 1 kept both `shell: "overlay"` and
`overlaySize: "lg"` unchanged, deliberately deviating from this task's
original `"lg" → "md"` resize: `Dialog.tsx`'s own code comment on
`DialogSize` said `lg`'s fixed 100%/100% box exists specifically so "the
panel holds still while [Account] switch[es] internal views," while `md` is
content-driven height (capped, not fixed), which would have made the dialog
visibly grow/shrink between a short section (Profile) and a tall one
(Security). That trade-off held functionally but produced a real, separately
reported UX problem: a full-viewport dialog for what is a compact settings
form reads as oversized, with distracting empty space around the rail+content
pair on any screen wider than the content actually needs — the developer
flagged this directly from a live screenshot. Their first proposed fix
(fully custom, manifest-driven per-plugin dialog dimensions) was assessed and
set aside as more public-contract surface than the problem needed — `Dialog`
size is deliberately a small curated enum, not free-form per-plugin values.
**Round 2** instead extended that enum: `@sovereignfs/ui`'s existing `auto`
`DialogSize` (content-driven on both width and height, each capped at
`min(48rem, 100%)`) already covered exactly this shape and already existed
for runtime-direct `<Dialog>` callers (e.g. Kanban's `CardDetailOverlay`) —
`runtime/src/overlay.ts`'s own doc comment even named this as the intended
extension point ("extend the manifest enum if a real plugin use case for
manifest-declared `auto` ever surfaces"). `packages/manifest/src/schema.ts`'s
`overlaySize` enum gained `"auto"`, and Account's own manifest switched to it
— no new `packages/ui` component or `Dialog.module.css` change needed, since
`auto` already existed. To make `auto`'s content-driven sizing suitable for a
7-section rail+content layout, `account.module.css`'s desktop grid gained an
explicit `width: min(48rem, 100%)` (pins to `auto`'s own cap instead of an
arbitrary `fit-content` measurement) and a light `min-height: 24rem` floor
(keeps the shortest sections, e.g. Notifications, from rendering as a tiny,
oddly-shaped stub). This bounds but does not fully eliminate
resize-between-sections the way `lg`'s true fixed box did — a section taller
than the floor still grows the panel up to the shared cap — accepted as the
right trade-off for solving the reported problem. Verified live end to end:
the dialog now renders as a compact, centered, scrim-bounded box for short
sections (Profile) and grows for long ones (Security) up to the cap, with
the sticky rail and full scroll depth both confirmed still correct at the
smaller size. `packages/manifest` bumped `5.10.0` → `5.11.0` (a real schema
capability addition, private/internal package per this file's own semver
convention); no `@sovereignfs/ui` version bump (nothing in that package
changed).

**Round 3** found a real, concrete flaw in round 2's `auto` choice, reported
directly: the dialog now read as too small ("appropriate for the content"
was the ask), and — separately, but from the same root cause — opening
Account from the sidebar avatar visibly flashed a smaller dialog before the
correctly-sized one appeared. The second symptom traced to a genuine
structural gap: `/account`'s own `page.tsx` (and its `@modal`-composed copy)
client-side redirects to `/account/profile`, so the very first paint after
opening the dialog briefly renders `AccountLayout`'s rail next to
essentially no content — `auto`'s `fit-content` sizing measured that
near-empty intermediate page, then visibly grew once the redirect landed and
real content replaced it. No width/min-height tuning of `auto` fixes this;
only a size that doesn't measure content at all does. `@sovereignfs/ui`
gained a new `DialogSize`, `fixed` — a true fixed box like `lg` (width AND
height both set, content never resizes it) but capped at `64rem × 44rem`
rather than filling the viewport. Named `fixed` rather than the initially-
attempted `panel` specifically to avoid colliding with `Dialog`'s own
always-applied `.panel` CSS class (`Dialog.module.css`) — caught before
shipping by checking real `size="md"` consumers before touching shared
Dialog behavior at all in an earlier, discarded approach (redefining `md`
itself), which turned up a real, shipped consumer —
`plugins/console/app/groups/ManageGroupDialog.tsx` — that a redefinition
would have silently regressed. `packages/manifest`'s `overlaySize` enum
gained `"fixed"` alongside the already-shipped `"auto"` (kept as a
legitimate, generically useful option for a plugin whose footprint varies a
lot with no redirect-shaped gap in its own route tree — just no longer
Account's own choice); Account's manifest switched to it. With the panel now
a true fixed box, `account.module.css`'s round-2 `width`/`min-height`
overrides on the desktop grid became unnecessary and were removed — the
panel itself dictates the box; the grid just fills it. Verified live end to
end: the panel is now visibly larger (1024×704 at typical desktop
viewports, vs. `auto`'s 768px cap) and — confirmed directly, opening the
dialog fresh and re-opening it once the route was already compiled — never
visibly resizes between the Profile→Security open sequence the way `auto`
did; sticky rail and full scroll depth reconfirmed correct at the new size;
mobile reconfirmed unaffected. `packages/ui` bumped `0.80.0` → `0.81.0`
(new `DialogSize` value, additive/non-breaking — no `docs/upgrade.md`
migration note needed, unlike `auto`'s own original breaking introduction);
`packages/manifest` bumped `5.11.0` → `5.12.0`. Every other deliverable
below shipped as scoped in round 1.

**Goal:** Replace Account's hand-rolled horizontal `.tabs`/`.tab` strip
(`plugins/account/app/layout.tsx`, `account.module.css`) with
`@sovereignfs/ui`'s existing `NavList` component (`variant="static"`, a
single ungrouped group of the 7 existing sections) — reusing RFC 0085's
design intent for Account without building the originally-proposed `NavRail`
component, since `NavList` already fits: unlike Console's workstream 0022
conversion, it has no dependency on `ThreeColumnLayout`'s `data-plugin-
fullbleed` height-unlock hook, which only exists in the hard-navigation
`(platform)` shell tree and not inside `Dialog`. Re-derived from RFC 0085 per
that RFC's own note that Account's half survives independently of Console's
rejected task 9.22 (`docs/epics/design-system.md`) — see the RFC's "Update"
block for the full history of why Console and Account diverged.

**Deliverables:**

- ~~Redefine `Dialog`'s `.md` size... `shellConfig.overlaySize` `"lg" →
"md"`~~ — not done in any round. Round 2 added `"auto"` to the manifest's
  `overlaySize` enum; round 3 superseded that with a new `"fixed"` value
  instead (`@sovereignfs/ui`'s `DialogSize`, `packages/manifest/src/schema.ts`)
  once `auto`'s content-driven sizing proved to have a real, reported flaw.
  `plugins/account/manifest.json`'s `shellConfig.overlaySize` is `"fixed"`
  as shipped — see Status note above for the full three-round reasoning.
- Replaced `.tabs`/`.tab` in `plugins/account/app/layout.tsx` +
  `account.module.css` with `NavList variant="static"`, one ungrouped group
  of the 7 existing sections (Profile/Security/Preferences/Notifications/
  Billing/Data/Activity), `renderLink` wired to `next/link` — mirroring
  `plugins/console/app/layout.tsx`'s existing usage, with one addition
  Console's own didn't need: `<Link replace>`, not a plain push — Account
  stayed inside its overlay Dialog (dismissed via `router.back()`), so
  push-based navigation between sections would have stacked history and
  made a single back close only one section, not the dialog (`CLAUDE.md`'s
  overlay-navigation rule). Verified live: visiting all 7 sections in
  sequence then pressing back exits the dialog in one step.
- Restructured `account.module.css`'s root layout from a flex column to a
  CSS Grid with a `grid-template-areas` swap per breakpoint (`mobileHeader`
  above `content` on mobile; `rail` beside `content` on desktop) — keeps
  `{children}` mounted exactly once regardless of viewport, rather than
  duplicating it into a mobile copy and a desktop copy.
- Added the `credit-card` icon to `packages/ui`'s curated `Icon` set
  (`scripts/icon-list.ts` + `pnpm generate:icons`) for Billing — `NavList`
  requires a per-item `icon`, unlike RFC 0085's original `NavRail` sketch,
  which had it optional. The other 6 sections already had a suitable icon
  (`user`/`shield`/`sliders-horizontal`/`bell`/`lock`/`activity`). Matches
  how workstream 0022 leg 3 added `panel-left`/`pin` — confirmed via that
  precedent (`4ae79d85`) that a curated-icon-only addition doesn't require
  bumping `@sovereignfs/ui`'s own `package.json`.
- Desktop title: `<h1>Account</h1>` is a compact header above the `NavList`
  column, not duplicated in the content pane — resolves RFC 0085's "Desktop
  title placement" open question for Account.
- Standalone hard-navigation route (`/account` visited directly, no `Dialog`
  ancestor — a real, reachable case since `useOverlaySecondRow` no-ops
  outside a Dialog): renders the same vertical-nav layout as the Dialog
  case, since the grid's breakpoint swap is purely viewport-width-driven,
  not overlay-context-driven — resolves RFC 0085's "Standalone
  hard-navigation route treatment" open question for Account with no extra
  code needed.
- Mobile: **no change**, confirmed live at 375px in both the standalone and
  Dialog-overlay cases — the horizontal scrollable strip still renders via
  `useOverlaySecondRow`; the full mobile drill-down redesign stays
  explicitly deferred, matching RFC 0085's original scoping.
- Grouping: not needed — `NavList`'s `groups` prop already accepts a single
  ungrouped group (omit `label`), which fits Account's flat 7-section list
  without waiting on future grouped-rail API work.

**Dependencies:** None on other in-flight tasks. Independent of workstream
0022 (Console's own, separate, already-shipped conversion) — Account was
untouched by that workstream.

**SRS reference:** [RFC 0085](../rfcs/0085-vertical-section-nav-overlay-shell.md)

**Review checklist:**

- Verified live (real dev login, not just the type system): all 7 Account
  sections reachable via the rail, both inside the Dialog overlay and via a
  direct `/account/<section>` hard navigation; active section highlights
  correctly in both; rail stays visible (sticky) through Security's full
  scroll depth; a single browser back after visiting all 7 sections exits
  the dialog entirely rather than stepping through each section.
- Verified mobile (375px) is visually unchanged in both the standalone and
  Dialog-overlay cases.
- `pnpm --filter @sovereignfs/ui typecheck` and `pnpm --filter runtime
build` both pass — the latter specifically because composed plugin
  directories are excluded from `runtime`'s own `tsc --noEmit` scope
  (`docs/architecture-rules.md`), so only a real build compiles Account's
  actual route files.
- Full repo `pnpm exec vitest run` (3478 passed), `pnpm lint`,
  `pnpm format:check`, and `pnpm exec tsx scripts/design-tokens-check.ts`
  all green, across all three rounds.
- Round 2 verified live: the dialog renders as a compact, scrim-bounded box
  (not full-viewport) for short sections, grows for long ones up to the
  shared `auto` cap; sticky rail and full scroll depth (Security) both
  reconfirmed correct at the new size; mobile (375px) reconfirmed unaffected.
- Round 3 verified live: the dialog is now visibly larger (1024×704) than
  round 2's `auto` box; opening it fresh no longer flashes a smaller size
  before settling — confirmed both on first open (route freshly compiled)
  and on a subsequent open (route already compiled), box dimensions
  identical to the settled state in both; box size confirmed identical
  between Profile (short) and Security (tall) — no resize at all, unlike
  `auto`; sticky rail and full scroll depth reconfirmed correct; mobile
  reconfirmed unaffected; `pnpm --filter @sovereignfs/ui typecheck` and the
  `Dialog` test suite (18 tests, including a new one for `size="fixed"`)
  both green.
- `plugins/account/manifest.json` bumped `0.3.7` → `0.4.0` → `0.4.1` →
  `0.4.2`; `packages/manifest` bumped `5.10.0` → `5.11.0` → `5.12.0`;
  `@sovereignfs/ui` bumped `0.80.0` → `0.81.0` in round 3 only (see
  Deliverables notes on `credit-card`, `auto`, and `fixed`).

---

## Related Docs

- [docs/plugins/account.md](../plugins/) (plugin spec)
- [plugin-development.md](../plugin-development.md)
