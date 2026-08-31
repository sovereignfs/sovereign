# Workstream 0021 — Warden: multi-session UI

**Status:** 📋 Planned — not started\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0063](../rfcs/0063-core-assistant-warden.md) (Partially
implemented, third revision, August 2026)\
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

- [ ] `22.8` — `warden_sessions` replaces `warden_conversation` (clean-slate
      migration, no backfill); a user can create (lazily, on first send),
      list, pin (max 5)/unpin, rename, and delete sessions; the chat API
      routes by session id instead of assuming one conversation per user.
- [ ] `22.9` — `/warden/settings` (General/Providers/Models tabs) replaces
      the standalone `/warden/providers` and `/warden/models` routes, which
      are removed outright (no redirect).
- [ ] `22.10` — a collapsible two-column layout ships: left sidebar with
      pinned/recent session groups, "+ New," per-row rename/pin/delete,
      LLM-generated session titles, and a Settings entry point pinned to
      the sidebar's bottom.
- [ ] `22.11` — the composer is redesigned: Claude-style card, model picker
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

| Leg | Name                        | Epic tasks | Epics | Gate? | Done when                                                                                                                                                     |
| --- | --------------------------- | ---------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sessions data model and API | 22.8       | 22    | No    | `warden_sessions` replaces `warden_conversation`; create/list/pin/unpin/rename/delete all work; the chat API routes by session id                             |
| 2   | Settings consolidation      | 22.9       | 22    | No    | `/warden/settings` (General/Providers/Models) is live with `ProvidersView`/`ModelsView` behavior unchanged; `/warden/providers`/`/warden/models` are removed  |
| 3   | Sidebar UI                  | 22.10      | 22    | No    | Collapsible two-column layout ships; sidebar lists pinned + recent sessions, supports "+ New," rename/pin/delete, LLM titles, and a Settings entry point      |
| 4   | Composer redesign           | 22.11      | 22    | No    | Claude-style composer ships with a model-picker popover (linking into Settings), incognito as a toolbar icon, and the old header links/web-search toggle gone |

No leg is marked a gate — there's no upstream unknown here that could
redirect a later leg's scope, unlike workstream 0014's engine benchmark.
Each leg's PR must still merge before the next leg's branch is cut, per the
standard leg contract.

## Leg detail

### Leg 1 — Sessions data model and API

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

### Leg 2 — Settings consolidation

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

### Leg 3 — Sidebar UI

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

### Leg 4 — Composer redesign

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

| Version | Date        | Change                                                                                                                           |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft, sequencing RFC 0063's third revision (multi-session UI, settings consolidation, composer redesign) into four legs |
