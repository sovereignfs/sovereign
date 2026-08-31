# Workstream 0021 — Warden: multi-session UI

**Status:** ✅ Done — all 4 legs shipped\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0063](../rfcs/0063-core-assistant-warden.md) (Implemented, third
revision, August 2026)\
**Epics touched:** 22 (Warden / Core Assistant)

---

## Goal

Replace Warden's single persisted conversation (workstream 0019) with the
multi-session UI RFC 0063's second rewrite explicitly deferred as "a future,
not-yet-scheduled phase": a collapsible sidebar listing multiple named,
pinnable sessions; a consolidated Settings surface replacing the standalone
provider/model routes; and a Claude-style composer redesign. At the end: a
user can hold several independent, resumable conversations, pin the ones
they return to often, and manage providers/models/general preferences from
one place — without touching request routing, provider/model discovery, or
incognito's core semantics, all of which carry forward unchanged from
workstream 0019.

## Definition of done

- [x] `22.8` — `warden_sessions` replaces `warden_conversation` (clean-slate
      migration, no backfill); a user can create (lazily, on first send),
      list, pin (max 5)/unpin, rename, and delete sessions; the chat API
      routes by session id instead of assuming one conversation per user.
- [x] `22.9` — `/warden/settings` (General/Providers/Models tabs) replaces
      the standalone `/warden/providers` and `/warden/models` routes, which
      are removed outright (no redirect).
- [x] `22.10` — a collapsible two-column layout ships: left sidebar with
      pinned/recent session groups, "+ New," per-row rename/pin/delete,
      LLM-generated session titles, and a Settings entry point pinned to
      the sidebar's bottom.
- [x] `22.11` — the composer is redesigned: Claude-style card, model picker
      as a popover linking into Settings, incognito relocated into the
      toolbar as an icon, and the chat header's "Manage providers"/"Manage
      models" links and the disabled web-search toggle removed.

## Decisions locked

| Decision                     | Choice                                                                                                                                                            | Rejected alternative and why                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                        | Exactly 22.8-22.11 — sessions data model, settings consolidation, sidebar UI, composer redesign                                                                   | Bundling the reserved third sidebar column's actual functionality, mobile shells, tool execution, or voice into this workstream — rejected, same foundation-first discipline as 0014/0019                        |
| Session creation             | Lazy — a session row is created only on first send, not when "+ New" is clicked                                                                                   | Eager creation on "+ New" — rejected; idle clicking would clutter the sidebar with empty rows                                                                                                                    |
| Session recency              | `lastActiveAt` bumps only when a message is sent in that session                                                                                                  | Bumping on merely opening/viewing a session — rejected; browsing history shouldn't reorder it                                                                                                                    |
| Pinning                      | Up to 5 pinned sessions, own group above the rest, sorted by `pinnedAt` descending                                                                                | Unlimited pins (defeats the point of a small, scannable pinned group) — rejected                                                                                                                                 |
| 6th pin attempt              | Rejected with a message asking the user to unpin one first                                                                                                        | Silently auto-evicting the oldest pin — rejected; silently undoing a deliberate earlier action is surprising                                                                                                     |
| Sidebar visible depth        | 10 most recently active non-pinned sessions; older ones unreachable from the sidebar this phase                                                                   | A "load more"/search affordance now — deferred; left as an explicit open question in RFC 0063, not designed here                                                                                                 |
| Session titles               | LLM-generated after the first exchange; manually renameable                                                                                                       | A fixed "Untitled" placeholder with no auto-title — rejected per direct developer instruction; matches the Claude/ChatGPT-style UI this design is modeled on                                                     |
| Existing single conversation | Clean slate — not migrated into a first session                                                                                                                   | Backfilling a synthetic title/`lastActiveAt` for the one existing row — rejected per direct developer instruction; negligible real usage exists this early                                                       |
| Incognito semantics          | Unchanged from workstream 0019 — a fresh, separate, never-persisted scratch context, orthogonal to session selection                                              | Making incognito a per-session flag (mixing persisted and non-persisted turns in one session's history) — rejected for the same saved/unsaved ambiguity workstream 0019 already rejected                         |
| Settings routing             | `/warden/providers`/`/warden/models` removed outright, no redirect                                                                                                | A 301/308 redirect for old bookmarks — rejected; not worth two permanent forwarding-only routes given how little real usage exists this early                                                                    |
| Right (third) sidebar column | Not built or shown this phase; `ThreeColumnLayout`'s existing conditional-third-child support means adding it later needs no layout rework                        | Building an inert toggle/placeholder for it now — rejected; a control with no function yet is a dead affordance, and this codebase's own conventions warn against designing for hypothetical future requirements |
| Sidebar collapse state       | Persisted client-side via `localStorage`, default expanded                                                                                                        | A cookie (to avoid an SSR flash-of-wrong-state) — rejected; not worth the added complexity for a cosmetic preference                                                                                             |
| Input box position           | Centered for an empty session, docks to bottom the instant the first message posts — keyed off the same `turns.length === 0` condition `ChatView.tsx` already has | New position-tracking logic — rejected; the existing optimistic-append state shape already flips at exactly the right moment                                                                                     |
| Mobile                       | Out of scope for this workstream; components split desktop-shell/mobile-shell-ready (state and hooks shared) so a mobile shell can be added later without rework  | Designing a mobile layout now — deferred per direct developer instruction ("focus on web now, but keep space for mobile")                                                                                        |
| Leg order                    | 22.8 → 22.9 → 22.10 → 22.11                                                                                                                                       | Building the sidebar before the settings route it links to exists, or before the data model it lists sessions from exists — rejected; see Prerequisites                                                          |

## Prerequisites

`22.8` has no new prerequisites beyond what workstream 0019 already shipped
(`sdk.connections`/`sdk.secrets` for providers, the existing
`warden_conversation`/`warden_messages` tables it replaces). `22.9`
(settings) only needs `22.8`'s schema to exist in principle, but not its UI —
it can move `ProvidersView`/`ModelsView` into tabs independently. `22.10`
(sidebar) depends on `22.8` for session data and `22.9` for the Settings
route its entry point links to. `22.11` (composer) depends on `22.10` for the
two-column shell it now sits inside, though its model-picker-popover and
incognito-relocation changes are otherwise independent of session data.

A new curated icon (sidebar toggle, likely also a pin icon) is needed in
`packages/ui`'s `Icon` set (`packages/ui/src/components/Icon/icons.ts`) —
per `packages/ui`'s own Storybook-hygiene convention, adding it requires a
story update (`TokenGallery`/`DesignSystemOverview` as applicable) in the
same PR as whichever leg first uses it (`22.10`).

## Legs

| Leg | Name                           | Epic tasks | Epics | Gate? | Done when                                                                                                                                                     |
| --- | ------------------------------ | ---------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sessions data model and API ✅ | 22.8       | 22    | No    | `warden_sessions` replaces `warden_conversation`; create/list/pin/unpin/rename/delete all work; the chat API routes by session id                             |
| 2   | Settings consolidation ✅      | 22.9       | 22    | No    | `/warden/settings` (General/Providers/Models) is live with `ProvidersView`/`ModelsView` behavior unchanged; `/warden/providers`/`/warden/models` are removed  |
| 3   | Sidebar UI ✅                  | 22.10      | 22    | No    | Collapsible two-column layout ships; sidebar lists pinned + recent sessions, supports "+ New," rename/pin/delete, LLM titles, and a Settings entry point      |
| 4   | Composer redesign ✅           | 22.11      | 22    | No    | Claude-style composer ships with a model-picker popover (linking into Settings), incognito as a toolbar icon, and the old header links/web-search toggle gone |

No leg is marked a gate — there's no upstream unknown here that could
redirect a later leg's scope, unlike workstream 0014's engine benchmark.
Each leg's PR must still merge before the next leg's branch is cut, per the
standard leg contract.

## Leg detail

### Leg 1 — Sessions data model and API ✅

**Epic tasks:** 22.8

**Why this leg is first:** every other leg either lists sessions (leg 3) or
assumes they exist (leg 4's incognito-vs-session interaction) — there's
nothing to build a sidebar or composer around until sessions themselves
exist.

**Technical notes:**

- `warden_sessions` table (RFC 0063 §3): `id`, `tenantId`, `userId`,
  `title` (nullable), `pinnedAt` (nullable), `lastActiveAt` (not null),
  `createdAt`. `warden_messages.conversationId` renamed to `sessionId`.
- Migration drops and recreates rather than backfilling — see Decisions
  locked. Confirm with a real review pass that no other code path
  (portability export/delete, `sdk.db` isolation) still assumes the old
  table/column names before merging.
- `getOrCreateConversation()`'s "always return the one existing row"
  behavior is replaced with explicit session creation, still lazy (on first
  send, not on "+ New") — see RFC 0063 §3, §10.
- Pin cap of 5 enforced server-side, not just in the UI — reject a 6th pin
  with a clear error, not a silent no-op or auto-evict.
- Chat API (`app/api/chat/route.ts`) gains a required `sessionId` in its
  persisted-mode request shape; incognito's request shape is unaffected
  (RFC 0063 §6, §10 — incognito doesn't reference a session id at all).
- Title generation: a short summarization prompt fires after the first
  exchange. Which model answers it (the session's own selected
  provider/model vs. a fixed lightweight default) is an open question in
  RFC 0063 — pick one and record the choice in this leg's completion note,
  don't leave it implicit in the code.
- Update `provideExport`/`provideDelete` (`_lib/portability.ts`) for the
  renamed tables and the now-many-sessions-per-user shape — export must
  return every session, not one flat list.

**Do not proceed if:** a session's messages become readable from a
different session's request context (a sessionId mix-up cross-contaminating
history) — that's a data-integrity regression, not a minor bug, given each
session is supposed to be an independent thread.

**Leg outcome:** shipped as planned, with two decisions made at
implementation time that RFC 0063 had deliberately left open. First, title
generation uses no model call at all — `deriveTitle()` derives a title
synchronously from the session's first user message (trimmed,
whitespace-collapsed, truncated to 60 chars) rather than spending a real LLM
request on something the user can always rename; this closes RFC 0063's
"which model generates the title" open question in favor of the cheaper,
zero-failure-mode option. Second, `drizzle-kit generate` could not run
non-interactively for a schema change this size (table rename + new
columns + a sibling-table column rename triggers its "renamed or created
new?" TTY prompt) — migration 0002 was hand-authored for both dialects to
exactly match drizzle-kit's own output format (a straight drop/create pair,
per the clean-slate decision), then verified two ways: `drizzle-kit check`
confirms the hand-written snapshot/journal metadata is internally
consistent, and a follow-up `drizzle-kit generate` against the updated
`schema.ts`/`schema.postgres.ts` reports "No schema changes, nothing to
migrate" — proving the hand-authored snapshot exactly matches what
drizzle-kit itself would have produced. Every session-scoped function in
`_lib/sessions.ts` is ownership-checked via a private `getOwnSession()` that
re-verifies `userId` after the read (not just via a query filter), closing
this leg's own "do not proceed if" condition — verified by a dedicated
cross-user-isolation test exercising every mutation against a foreign
session id. `app/page.tsx`/`ChatView.tsx` were adapted to keep the existing
single-thread UX working unchanged end to end (auto-selecting the most
recently active session) since the sidebar that lets a user actually
switch sessions doesn't ship until leg 3. Full detail in the epic file's
task 22.8 completion note.

### Leg 2 — Settings consolidation ✅

**Epic tasks:** 22.9

**Why this leg is second, not third:** it doesn't depend on leg 1's session
data at all (it only relocates existing provider/model management), and
leg 3's sidebar needs a real settings route to link to before it ships.

**Technical notes:**

- New `/warden/settings` route, General/Providers/Models tabs (RFC 0063
  §11). `ProvidersView`/`ModelsView` move here with behavior unchanged — no
  redesign of their own content in this leg, just relocation.
- General tab: default model for new sessions, a manual (not scheduled)
  retention action, an export action. Which export mechanism (deep link to
  account-wide portability export vs. a new Warden-only download) is an
  open question in RFC 0063 — resolve and record it in this leg's
  completion note.
- `/warden/providers` and `/warden/models` are deleted outright (no
  redirect) — check for any remaining internal links to the old paths
  (chat header, docs) before removing.

**Do not proceed if:** removing the old routes breaks anything that isn't
also updated in this same leg (an internal link left pointing at a 404) —
grep for the literal route strings, don't assume the composer redesign
(leg 4) will clean it up later.

**Leg outcome:** shipped as planned. All three RFC 0063 open questions this
leg owned were resolved: default model via a new `warden_user_settings`
table (get-or-create, one row per user); retention as a manual "delete
sessions inactive for over N days" action excluding pinned sessions,
explicitly not a scheduled job (confirmed `manifest.json` declares no
`sdk.schedules` capability); export as a deep link to the existing
account-wide `/account/data` flow, not a new mechanism. Tabs use
`@sovereignfs/ui`'s `Tabs` (confirmed the only tab component with any real
consumer in this repo) with the active tab synced to `?tab=` via
`router.replace`, deliberately not just local state, so leg 4's composer
model-picker popover can deep-link straight to a tab. `ProvidersView`/
`ModelsView` needed zero content changes, only their page-level wrapper
moved. A `grep` for the literal old route strings (not assumed complete
from memory) found and fixed two link sites this leg's own technical notes
hadn't named: `ChatView.tsx`'s three links and `SetupPrompt.tsx`'s one —
`pnpm generate`'s `assertNoOrphanedRouteDirectories()` check confirmed no
stale composed route directory survived the old pages' removal. Verified
live end to end against a real logged-in session (a seeded dev test
account, `pnpm sv seed` with `SOVEREIGN_SEED_ALLOW_PROD=true` per direct
developer authorization for this dev database, since self-registration is
disabled on this instance) — tab switching, URL sync, and the retention
action's real server round-trip (`POST /warden/settings 200`, "No inactive
sessions to delete" for a fresh account) were all confirmed live, not just
via unit tests. The Providers tab's add-provider flow surfaced a
pre-existing, unrelated `SOVEREIGN_VAULT_KEY`-unset environment gap
(`sdk.secrets`' own requirement, thrown from unchanged `providers.ts` code)
— not a regression from this leg. Full detail in the epic file's task 22.9
completion note.

### Leg 3 — Sidebar UI ✅

**Epic tasks:** 22.10

**Why this leg is third:** it needs leg 1's session data to list and leg
2's settings route for its own entry point to link to.

**Technical notes:**

- Two-column layout via `@sovereignfs/ui`'s `ThreeColumnLayout` (sidebar +
  main only; no third child passed — see RFC 0063 §10 and Decisions
  locked). Collapse toggle icon lives in the main column's top-left corner,
  not inside the sidebar, so collapsing it doesn't hide the way to bring it
  back.
- Collapse state in `localStorage`, default expanded.
- Sidebar groups: pinned (≤5, sorted by `pinnedAt` desc) above recent (≤10,
  sorted by `lastActiveAt` desc); "+ New" above both; Settings pinned to
  the bottom, outside the scrollable list.
- Per-row overflow menu: rename, pin/unpin, delete. No "recently deleted"
  recovery — matches incognito's own no-recovery posture.
- New curated icon(s) needed in `packages/ui` (sidebar toggle, pin) — see
  Prerequisites; add the Storybook entries in the same PR per that
  package's own hygiene convention.

**Do not proceed if:** the sidebar's session list and the composer's active
session can disagree about which session is "open" (a stale highlight, or
sending a message to a session other than the one visually selected) — a
correctness bug, not a polish issue, given users will be switching sessions
frequently.

**Leg outcome:** shipped as planned. `WardenLayoutShell` (new) bypasses
`ThreeColumnLayout` entirely when collapsed rather than passing
`sidebarWidth={0}` — that component's `.sidebar` slot always carries a
`border-right`, which a zero-width flex item still renders as a visible
1px hairline, not a real "collapsed" look; collapse state reads
`localStorage` only inside `useEffect`, defaulting to expanded, per this
repo's hydration-mismatch rule. `WardenSidebar` (new) is purely
presentational — `app/page.tsx` does the pinned/recent split and sort, so
the component never re-derives grouping itself. The active session
resolves from `?session=` (falling back to the most recent session for a
missing/foreign value); the one change to `ChatView.tsx` needed to close
this leg's own "do not proceed if" condition was having it call
`router.replace('/warden?session=' + id)` once a brand-new session's id
comes back from the chat API, so the sidebar and the composer can never
disagree about which session is open. Two new curated icons (`panel-left`,
`pin`) added via `pnpm generate:icons` (93 total; fixed an unrelated stale
"52 bundled icons" count in `DesignSystemOverview.stories.tsx` as a
drive-by) — `Icon.stories.tsx`'s `AllIcons` story derives from `ICONS`
directly, so no manual per-icon story edit was needed.

Verified live end to end, but not against the first account tried:
`owner@sovereign.local` turned out to carry a pre-existing, unrelated
data-corruption gap from an earlier session (a `plugin_secrets` row
encrypted under a `SOVEREIGN_VAULT_KEY` no longer configured, throwing on
every Warden page load) — not something to fix as part of this leg, so
verification moved to a second seeded account instead
(`user@sovereign.local`, `pnpm sv seed` per direct developer authorization
for this dev database). That account needed a real `SOVEREIGN_VAULT_KEY`
set (leg 2's own outcome note already flagged this env gap) and a real
provider to exercise session creation — added OpenRouter's actual
`https://openrouter.ai/api/v1` with a deliberately-fake key, whose
`/v1/models` endpoint is public and returned a real model catalog (only
the chat-completion call itself needs a valid key), enough to create real
sessions without needing a genuinely reachable model backend. Confirmed
live: a session is created server-side on the very first send attempt
regardless of whether the model call itself succeeds, and survives a
reload even after a failed send; rename/pin/unpin/delete all round-trip
correctly through the sidebar's overflow menu; pinning a 6th session is
rejected with a clear toast while the sidebar stays correctly unchanged,
not silently corrupted. All test data created for this verification was
deleted again before finishing. Full detail in the epic file's task 22.10
completion note.

### Leg 4 — Composer redesign ✅

**Epic tasks:** 22.11

**Why this leg is last:** it depends on leg 3's two-column shell existing,
and its model-picker popover links into leg 2's settings route.

**Technical notes:**

- Claude-style card container; input centered for an empty session, docks
  to bottom the instant the first message posts — keyed off the existing
  `turns.length === 0` condition (`ChatView.tsx`), not new logic (RFC 0063
  §12).
- Model picker becomes a `Popover`, grouped by provider (mirroring
  `ModelsView`'s existing grouping), with a footer linking to Settings →
  Providers and Settings → Models.
- Incognito moves from the chat header `Toggle` + label into the composer
  toolbar as an icon toggle. Semantics unchanged (RFC 0063 §6).
- Remove outright: the chat header's "Manage providers"/"Manage models"
  links, and the disabled "Web search — Soon" toggle. Not hidden — deleted.

**Do not proceed if:** the model-picker popover's footer links leave
Settings unable to return to the exact session that was open (a navigation
dead-end) — verify the round trip live, not just that each page renders.

**Leg outcome:** shipped as planned, with one implementation-time correction
beyond what the technical notes anticipated. `ModelPickerPopover` (new)
groups models by provider, local first, mirroring `ModelsView`'s own
`displayLabel`/grouping logic (duplicated, not imported — that component's
version is entangled with search/badge concerns this popover doesn't need),
with a footer linking into Settings → Providers/Models; incognito became an
icon `Button` (`eye-off`, `Tooltip`, `aria-pressed`) in the composer toolbar;
the chat header, its "Manage providers"/"Manage models" links, and the
disabled "Web search — Soon" toggle were all removed outright. The
centered/docked composer positioning needed more than "swap between two JSX
trees on `turns.length === 0`" — an initial implementation nested the
composer inside a wrapper only rendered in the empty-state branch, which
remounted the entire composer subtree (including the incognito button) on
every empty/non-empty transition, caught by a unit test asserting the
incognito toggle survives a send as the same DOM node. Fixed by keeping the
composer and the `EmptyState`/message-list branch as permanently-stable
siblings of `.chat` in both states, with only a `chatCentered` modifier
class changing — never the tree shape. Verified live end to end against the
same dev database leg 3 used (re-adding, then re-removing, the same test
provider and model), confirming the popover's grouping/footer round trip,
the incognito toggle's visual pressed state, and the old header/toggle
elements' absence from the DOM. Full detail in the epic file's task 22.11
completion note.

## Risks

- **Clean-slate migration deletes real (if minimal) existing chat
  history.** Accepted per direct developer instruction given how little
  usage exists this early (see Decisions locked) — but this is a one-way
  door once leg 1 merges; confirm that instruction still holds immediately
  before merging leg 1, not just at planning time.
- **Four sequential legs is a longer chain than workstream 0019's two** —
  more surface for an early leg's design to need revisiting once later legs
  expose a gap (e.g., leg 3's sidebar might reveal that leg 1's pin-cap
  enforcement needs a different error shape than first designed). Treat
  each leg's own "Leg outcome" note (once implemented) as the place to
  record any such correction, same convention as workstream 0019.
- **Several open questions in RFC 0063 (title-generation model, export
  mechanism, sidebar cutoff-vs-search) are left for implementation to
  resolve**, not pre-decided here beyond what's in Decisions locked above —
  each affected leg's completion note should record what was actually
  chosen and why, so it isn't lost the way workstream 0019's own
  superseded-`warden_providers`-table decision could have been.

## Kill criteria

Leg 1 stands alone as a real improvement (multi-session data + API) even if
later legs stall — though without leg 3's sidebar there's no way to reach a
second session from the UI, so leg 1 alone isn't user-facing. Leg 2 also
stands alone (a consolidated settings page is useful regardless of session
work). If leg 3's live sidebar UX turns out confusing in practice (e.g., the
pinned/recent split doesn't read clearly at real session counts), hold leg 4
rather than redesigning the composer around a sidebar shape that itself
needs rework first.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft, sequencing RFC 0063's third revision (multi-session UI, settings consolidation, composer redesign) into four legs                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.2     | August 2026 | Leg 1 (task 22.8) done — `warden_sessions` shipped replacing `warden_conversation` (clean-slate migration, hand-authored since `drizzle-kit generate` needed an unavailable interactive prompt), full CRUD, chat API routed by session id, no-model-call title derivation. Leg 2 unblocked                                                                                                                                                                                                                                                                                                     |
| 0.3     | August 2026 | Leg 2 (task 22.9) done — `/warden/settings` (General/Providers/Models tabs, `?tab=`-synced) replaces `/warden/providers`/`/warden/models`; default model (`warden_user_settings`), manual retention excluding pinned sessions, and export-via-account-deep-link all resolved. Verified live against a seeded dev account. Leg 3 unblocked                                                                                                                                                                                                                                                      |
| 0.4     | August 2026 | Leg 3 (task 22.10) done — collapsible two-column layout (`WardenLayoutShell`) + sidebar (`WardenSidebar`) ship: pinned/recent session groups, "+ New," per-row rename/pin/delete, a bottom Settings entry point, and two new curated icons (`panel-left`, `pin`). `ChatView.tsx` now syncs the URL to a lazily-created session's id so the sidebar and composer can never disagree about which session is open. Verified live against a second seeded dev account after the first turned out to carry unrelated pre-existing data corruption. Leg 4 unblocked                                  |
| 0.5     | August 2026 | Leg 4 (task 22.11) done — workstream complete. `ModelPickerPopover` (new) replaces the inline `<select>` with a provider-grouped `Popover` and a footer linking into Settings; incognito moved into the composer toolbar as an icon toggle; the chat header, its "Manage providers"/"Manage models" links, and the disabled web-search toggle are all removed outright. Fixed a remount bug found via a unit test — the composer (and incognito button) now stays a stable DOM sibling of `.chat` across the centered/docked transition instead of being re-parented. Verified live end to end |
