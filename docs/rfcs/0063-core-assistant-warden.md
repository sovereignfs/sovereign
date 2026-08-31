---
rfc: 0063
title: Warden — core assistant platform plugin and harness engine (formerly "Jarvis")
status: >
  Partially implemented (third revision — the second rewrite's phase
  (bring-your-own model providers, single persisted conversation, incognito)
  is Implemented: epic tasks 22.4-22.5 (workstream 0019) both done, plugin
  re-enabled. This third revision specs the multi-session UI phase that RFC
  0063's own second rewrite explicitly deferred as "a future,
  not-yet-scheduled phase" — a collapsible sidebar with multiple named,
  pinnable sessions; a consolidated Settings surface (General/Providers/
  Models) replacing the standalone /warden/providers and /warden/models
  routes; and a redesigned composer. Sequenced as epic tasks 22.8-22.11,
  workstream 0021 — leg 1 (22.8, the sessions data model and API) is done;
  legs 2-4 (settings consolidation, sidebar UI, composer redesign) remain,
  see that workstream for legs. Tool execution/task handoff/floating
  button/voice remain a future, not-yet-scheduled phase, unchanged from the
  second rewrite)
date: >
  August 2026 (second rewrite; originally drafted July 2026, first rewrite
  August 2026; third revision August 2026)
author: kasunben
scope: >
  plugins/warden (rewritten); this third revision also touches packages/ui
  (one or two new curated icons — sidebar toggle, pin — see Semver impact) but
  no code changes required to apps/harness, packages/sdk, or
  packages/manifest; builds on RFC 0043 (plugin secret vault, reused
  unchanged for provider API keys), RFC 0040 (Sovereign Harness — this RFC
  resolves its deferred "user-supplied API keys" open question), RFC 0092
  (app-level field encryption, considered and deliberately not used — see
  Alternatives); supersedes this RFC's own first rewrite's local-engine-only
  design and its second rewrite's single-conversation UI
incorporated_into_plan: >
  Yes — epic tasks 22.4-22.5 (workstream 0019, done) and 22.8-22.11
  (workstream 0021, leg 1/22.8 done, legs 2-4 planned)
---

# RFC 0063 - Warden: core assistant platform plugin and harness engine

> **This RFC was rewritten a second time, August 2026.** The first rewrite
> (also August 2026) replaced the original runtime-owned "Jarvis" design with
> a first-party plugin (`plugins/warden`) backed by a dedicated local-engine
> service (`apps/harness`, wrapping llama.cpp). That design shipped in full —
> epic tasks 22.1-22.3, workstream 0014, verified end to end against a real
> engine — and was then deliberately disabled
> (`plugins/warden/manifest.json`'s `disabled: true`) because it was
> hardware-constrained: [Research 0015](../research/0015-harness-engine-benchmark.md)'s
> own benchmark shows even the smaller `qwen3:0.6b` model straining on
> representative self-hosting hardware (2 vCPU / 3.7GB RAM, no GPU). This
> second rewrite reflects a direct architectural decision from the developer
> (kasunben): keep the local engine as an optional bonus, and make
> bring-your-own OpenAI-API-compatible model providers the primary path. See
> the Changelog for what changed and "Alternatives considered" for what was
> weighed.

> **This RFC was revised a third time, August 2026.** The second rewrite
> shipped in full (epic tasks 22.4-22.5, workstream 0019) and explicitly
> deferred "multi-threaded conversations (the sidebar/thread-switcher a
> ChatGPT/Claude-style UI usually has)" as a named, undesigned future phase —
> see that rewrite's own "Product scope" and Open questions. This revision is
> that phase: a collapsible three-column-capable layout (two columns used
> today, a third reserved for later), multiple named/pinnable sessions
> replacing the single persisted conversation, a consolidated Settings
> surface, and a redesigned composer. It does not touch request routing,
> provider/model discovery, or incognito's core semantics — those carry
> forward unchanged from the second rewrite. See §10-12 for the new design
> and the Changelog for what changed.

## Summary

Revamp Warden's phase 1 foundation: instead of requiring a bundled local
inference engine, each user configures their own model provider(s) — any
endpoint compatible with the OpenAI chat completions API, with an API key
(OpenRouter, a direct provider, or the user's own self-hosted server).
Warden fetches and caches each provider's model list. If the existing
`apps/harness` local-engine service (unchanged, from the first rewrite) is
reachable and has a model ready, its model is folded into the same list
automatically — no configuration needed, and its absence is not an error.

Chat became a single, persisted conversation per user in the second rewrite;
this third revision replaces that with **multiple named, pinnable sessions**
per user, listed in a collapsible left sidebar ordered by last-active
timestamp, with a "+ New" action that always starts a fresh one. An
**incognito** toggle (relocated into the composer) preserves the second
rewrite's ephemeral behavior as an opt-in escape hatch: while on, nothing is
written to durable storage. Provider/model management moves out of the chat
header and into a consolidated Settings surface (General/Providers/Models
tabs), reachable from the bottom of the sidebar; the composer itself is
redesigned around a Claude-style card with the model picker as a popover.

Tool execution, task handoff, a floating quick-access button, and voice
remain explicit future phases — unchanged from the first rewrite's
discipline of shipping foundation before capability. A third sidebar column
is reserved in the layout for later, undesigned functionality, but is not
built or shown in this revision.

No new secret-storage mechanism is introduced. Provider API keys are stored
via the existing plugin secret vault (`sdk.secrets`, RFC 0043) — the same
mechanism every other plugin already uses for per-user OAuth tokens and API
keys.

## Motivation

The first rewrite's phase 1 shipped completely and worked — workstream
0014's leg 3 outcome was verified end-to-end against a real
`apps/harness`/`harness-engine` pair. It was disabled anyway, because
[Research 0015](../research/0015-harness-engine-benchmark.md)'s decisive
finding — llama.cpp's ability to disable Qwen3's "thinking" mode — was a
comparison between two constrained options on real self-hosting hardware,
not a comparison that produced a genuinely good one. Running any useful
local model needs resources most self-hosted instances (a modest VPS) don't
have, and building Sovereign's own model-download/verification/GPU story
further before a single real user had asked to use it was the wrong place
to keep spending effort.

Bring-your-own-provider removes Sovereign from the inference-hosting
business entirely, for phase 1's purposes. It also happens to be work this
codebase already anticipated and then punted on:
[RFC 0040](../rfcs/0040-sovereign-harness.md) §3-5 describes almost exactly
this design — an `openrouter` / `openai-compatible` / `local` provider
abstraction, explicit external-model disclosure, and a consent gate for
sending data externally — but deferred "user-supplied API keys per user"
specifically because it needed "a secure secret store... likely field-level
encryption" that didn't exist at the time. That gap has since closed:
[RFC 0043](../rfcs/0043-plugin-secret-vault.md) (`sdk.secrets`) shipped
afterward and is the documented, canonical mechanism for exactly this case —
"per-user API keys" is one of its own worked examples in
`docs/plugin-development.md`. This RFC is the first real consumer of that
combination.

This is not a retreat from Sovereign's privacy-first posture — it's an
explicit, disclosed, user-controlled tradeoff, not a silent one. The user
chooses which provider(s) see their conversation, that choice is visible and
revocable at any time (deleting a provider deletes its key with it, via
`sdk.secrets.delete`), and a user who wants zero third-party data flow can
still point Warden at their own self-hosted OpenAI-compatible server — that
path costs the same one row of configuration as OpenRouter does. What
Sovereign no longer does is bundle, host, or manage that inference itself.
Everything else — conversation history, provider configuration, and the
memory layer this is ultimately meant to grow into — stays in the
operator's own database, under the same ownership model as every other
plugin's data.

## Current state

- The first rewrite's design fully shipped and still works: `plugins/warden`
  (chat UI, streaming Route Handler) and `apps/harness` (llama.cpp wrapper,
  enrollment trust boundary, lazy model download, Compose profile) — none of
  it is abandoned code. `manifest.json` has `disabled: true`
  (`docs/architecture-rules.md`'s hard-disable primitive), set specifically
  to take the shipped result out of reach until re-prioritized. This RFC is
  that re-prioritization.
- **`apps/harness` needs no code changes for this revision.** It keeps doing
  exactly what it does today: wrap one local engine, expose an internal-only
  chat API, stay unreachable from the public internet, authenticate Warden's
  server code via the enrollment-token pattern. What changes is only how
  Warden's server code _treats_ it — as one optional entry in a merged model
  list instead of the only backend, degrading to "not offered" rather than
  "unavailable" when it's unreachable.
- **`sdk.secrets` (RFC 0043) already exists and fits exactly.** `scope:
'user'` secrets, AES-256-GCM envelope (`runtime/src/secrets.ts`), AAD bound
  to `{tenantId, pluginId, scope, userId}`, metadata-only listing, hard
  deletion on account deletion, never exported or shown in Account UI. No
  manifest permission is required for `user`-scoped secrets (only
  `instance`-scoped secrets require `instance:configure`) — Warden's
  manifest needs no new permission for this.
- **RFC 0092 (`sdk.crypto` field encryption) also exists, but is the wrong
  tool here** — see "Alternatives considered."
- **RFC 0047 (plugin tool contracts) is Implemented but has zero real
  consumers today.** It remains the sanctioned mechanism for the deferred
  tool-execution phase; this RFC does not touch it.
- **RFC 0040 (Sovereign Harness) is still `Draft`, "pending revisit."** This
  RFC materially advances that revisit — it resolves RFC 0040's own deferred
  "user-supplied API keys" open question — but does not attempt the full
  revisit RFC 0040 itself still needs (whether Harness ends up _being_ this
  foundation extended with orchestration, or a separate later product). That
  remains open.
- **This third revision starts from a genuinely single-conversation schema.**
  `plugins/warden/app/_db/schema.ts`'s `wardenConversation` table is, today,
  exactly one row per user, enforced by `getOrCreateConversation()` in
  `_lib/conversations.ts` always returning the same existing row rather than
  ever creating a second one. `@sovereignfs/ui`'s `ThreeColumnLayout`
  component already exists and fits this design's shape (sidebar + main,
  optionally + a third column) but is deliberately unopinionated — no
  built-in collapse/toggle behavior, no responsive/mobile handling of its
  own; several `.local` plugins (docs, sheets, tally, tasks, ledger) already
  hand-roll a collapsible-sidebar-plus-mobile-shell pattern on top of it,
  which this revision follows rather than inventing a new one.

## Proposed design

### 1. Naming and boundaries

Unchanged from the first rewrite: Warden is the plugin, `apps/harness` is
the local-engine service. What changes is `apps/harness`'s standing: it was
"the" backend; it is now one optional provider among several, with no
special status in the UI beyond "free, no API key needed, only available if
the operator runs it."

### 2. Product scope

Warden supports, as of the second rewrite (workstream 0019, done):

- per-user model provider configuration — label, base URL, API key — added
  through a first-run setup flow and editable later;
- fetching and caching each configured provider's model list
  (`GET {baseUrl}/models`, OpenAI-compatible shape);
- folding `apps/harness`'s local model into the same list automatically
  when it's reachable and has a model ready — zero configuration, silently
  absent otherwise;
- health/unavailable/auth-failure states per provider, and a clear
  first-run empty state when no provider is configured yet;
- install/enable through the existing plugin system, unchanged;
- **no privileged runtime access beyond an ordinary plugin** — unchanged
  from the first rewrite. Warden still has no tools to call, so there's
  nothing to be privileged about yet;
- automatic/silent fallback between providers or models is still never
  allowed — switching is always an explicit user action, the same principle
  RFC 0040 §5 already established for local-vs-external ("must never
  silently fall back"), extended here to apply between any two configured
  providers.

This third revision (workstream 0021, planned) additionally adds:

- **multiple named, pinnable sessions per user**, replacing the single
  persisted conversation — a collapsible sidebar lists them ordered by
  last-active timestamp, with up to 5 pinned to a group above the rest;
  model selection is per-session (a default, changeable), not per-account
  (see §10);
- a consolidated **Settings** surface (General/Providers/Models tabs)
  replacing the standalone `/warden/providers` and `/warden/models` routes
  (see §11);
- a redesigned composer — model picker as a popover (linking into Settings),
  incognito relocated from the chat header into the composer toolbar as an
  icon toggle, the disabled "Web search — Soon" placeholder removed outright
  (see §12).

Warden still explicitly does **not** support, unchanged from the first
rewrite:

- tool selection or execution of any kind;
- task handoff to other plugins;
- a floating quick-access action button;
- voice input or output;
- per-user preferences beyond ordinary plugin visibility rules.

A third sidebar column is reserved in this revision's layout (§10) for
undesigned future functionality — space is kept, nothing is built or shown
there yet.

All of the above are real, intended future phases, not rejected ideas —
listed under "Adoption path."

### 3. Data model

As implemented (second rewrite): provider configuration lives on
`sdk.connections`/`sdk.secrets` (RFC 0049/0043), not a bespoke table — see
workstream 0019 leg 1's outcome. Conversation history is plugin-owned,
`sdk.db`-scoped (tenant + user scoped, following
`docs/architecture-rules.md`'s "plugin tables are slug-prefixed" rule):

```ts
warden_conversation {
  id: text primary key
  tenantId: text not null
  userId: text not null
  createdAt
}
// Exactly one row per user as shipped — enforced by getOrCreateConversation()
// always returning the same existing row.

warden_messages {
  id: text primary key
  conversationId: text not null   // fk -> warden_conversation
  role: text not null             // 'user' | 'assistant'
  content: text not null
  providerId: text                // fk -> warden_providers, null for local
  model: text not null
  createdAt
}
```

**This third revision replaces `warden_conversation` with `warden_sessions`,
dropping the "exactly one row per user" invariant:**

```ts
warden_sessions {
  id: text primary key
  tenantId: text not null
  userId: text not null
  title: text                     // nullable until an LLM-generated title
                                   // lands (see §10) or the user renames it
  pinnedAt: integer                // nullable; non-null = pinned, sorts the
                                   // pinned group (max 5 enforced at pin
                                   // time, see §10); null = unpinned
  lastActiveAt: integer not null   // bumped on every message sent in this
                                   // session — sidebar sort key
  createdAt: integer not null
}

warden_messages {
  id: text primary key
  sessionId: text not null        // fk -> warden_sessions (renamed from
                                   // conversationId)
  role: text not null             // 'user' | 'assistant'
  content: text not null
  providerId: text                // fk -> warden_providers/sdk.connections,
                                   // null for local
  model: text not null
  createdAt
}
```

**Migration is a clean slate, not a backfill.** Per direct developer
instruction: existing users' single `warden_conversation` row and its
messages are not carried forward into a first session — negligible real
usage exists this early, and computing a synthetic title/`lastActiveAt` for
legacy rows isn't worth the complexity. The migration drops and recreates
these tables under their new names/shapes rather than an in-place `ALTER`
plus backfill.

A session is created lazily, only on first send — not eagerly when "+ New"
is clicked — so idle clicking through empty sessions doesn't clutter the
sidebar (same lazy-creation principle `getOrCreateConversation()` already
uses today, just no longer collapsing to a single row).

Incognito messages never reach `warden_messages` — the request/response
round-trips the in-progress transcript directly, exactly like the original
phase 1's ephemeral design (`plugins/warden/app/_lib/harness-client.ts`'s
existing shape already does this; it's reused, not rebuilt) — see §10 for
how incognito interacts with session selection.

The API key itself is still never a column anywhere Warden owns — it lives
behind the `sdk.secrets` ref `sdk.connections` already carries (RFC
0049/0043). Deleting a provider connection also deletes its secret
(`sdk.connections.disconnect()`, verified to cascade in
`runtime/src/platform-db.ts`), so nothing outlives its owning row.

### 4. Model discovery and merge

Warden's server-side code resolves the model list on demand (cached, short
TTL — an implementation detail, not architecture):

1. For each `warden_providers` row the user has configured: fetch
   `GET {baseUrl}/models` using the `sdk.secrets`-retrieved key. A fetch
   failure marks that provider "unreachable" in the UI; it does not fail
   the whole list.
2. Independently, check `apps/harness`'s existing health/model endpoint. If
   reachable and a model is ready, add it as a distinct, clearly-labeled
   "local" entry — no key, no user configuration.
3. Present the merged list. The user's last-used (or explicitly set
   default) model is preselected; switching is manual.

### 5. Request routing

- **Local model selected:** Warden's server code calls `apps/harness` over
  the internal network, authenticated via the existing enrollment-token
  pattern — completely unchanged from the first rewrite.
- **External provider selected:** Warden's server code calls that
  provider's `baseUrl` directly (chat completions, streaming), using the
  key retrieved from `sdk.secrets` for that request only — never cached in
  application memory beyond the request's lifetime, never sent to the
  browser.

The browser never talks to any provider directly, local or external — same
non-negotiable as the first rewrite: every request is proxied through
Warden's own server-side code, matching how no plugin's client code talks
to `apps/relay`/`apps/auth` directly either.

`apps/harness` is not a proxy for external providers — it has no reason to
sit in that path, and adding one would introduce a dependency (and
reimplement a trust boundary already solved elsewhere) that buys nothing.
It keeps doing exactly one job: wrap the local engine.

### 6. Incognito mode

A visible toggle — in the chat header as shipped, relocated into the
composer toolbar as an icon in this third revision (§12). Semantics are
unchanged either way. While on:

- the conversation is a fresh, separate scratch context — not a "pause" of
  the persisted thread — so there's no ambiguity about which messages
  count as saved;
- nothing is written to `warden_messages`;
- turning it off (or navigating away, or reloading) discards it entirely;
  there is no "recover my incognito session" path, by design — the same
  posture as a browser's own incognito window.

In the multi-session UI (§10), incognito stays a single global scratch
context orthogonal to session selection — not a per-session mode and not a
session of its own in the sidebar. Toggling it on shows the same ephemeral
transcript regardless of which session is open underneath; toggling it off
returns to whichever session was selected. This mirrors the second
rewrite's existing state shape (`persistedTurns` vs. `incognitoTurns` in
`ChatView.tsx`) exactly — persisted turns simply become "whichever session
is selected" instead of one fixed thread.

### 7. Docker and deployment

Unchanged from the first rewrite. `apps/harness`'s Compose profile
(`profiles: ['harness']`, never started by a plain `up`, no port exposed to
the public internet by default) is untouched — it was already fully
optional infrastructure before this revision, and stays exactly that
afterward. This revision only changes how "the profile isn't running" is
perceived: from "Warden is unavailable" to "the local option isn't offered
today, everything else still works."

### 8. Failure modes and limits

| State                                           | Expected behavior                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| No provider configured, local unreachable       | First-run setup screen — not a broken chat UI.                                 |
| A configured provider unreachable or auth-fails | That provider shows an error and retry in the picker; others unaffected.       |
| Local `apps/harness` unreachable                | Silently absent from the model list — not an error state.                      |
| Selected provider fails mid-conversation        | Request fails with a retry affordance; no silent fallback to another provider. |
| Provider deleted while it's the active model    | Falls back to prompting for a new selection, not a crash.                      |

Limits carried forward unchanged from the first rewrite's reasoning: request
timeout, max input characters, max output tokens, a concurrency cap — plus,
new for persisted history, **max recent turns replayed as context** on each
request, since a thread with no length cap will eventually exceed any
model's context window. Phase 1 uses simple recency-based truncation; real
memory/summarization is future work (see Open questions).

### 9. Data deletion and export

`warden_sessions` and `warden_messages` (renamed from `warden_conversation`
in this revision, see Data model) participate in the existing plugin
portability hooks (`sdk.portability.provideExport`/`provideDelete`) like any
other plugin's data — a user's account deletion or data export must include
(or deliberately, visibly exclude) chat history, same as any other plugin is
expected to wire up. `provideExport`'s current implementation returns one
flat message list for the single conversation; this revision updates it to
export every session, grouped by session id/title, since there are now
genuinely many. Deleting a provider connection deletes its `sdk.secrets` row
in the same action (see Data model), unchanged.

### 10. Sessions and sidebar

Replaces the single persisted conversation (§3) with multiple named,
pinnable sessions, surfaced in a collapsible left sidebar.

**Layout.** Two columns today — sidebar and main — composed with
`@sovereignfs/ui`'s existing `ThreeColumnLayout` (a third child is added
only when the reserved third column gets real content in a later phase; no
inert placeholder is shown for it now, following this codebase's own
no-premature-abstraction convention). The sidebar collapses via a toggle
icon rendered in the main column's own top-left corner — deliberately not
inside the sidebar itself, so the only way to bring it back isn't hidden by
collapsing it. Collapsed/expanded state persists in `localStorage` (a
client-only cosmetic preference; no SSR flash-of-wrong-state concern
justifies a cookie here).

**Creating a session.** "+ New" at the top of the sidebar always starts a
fresh, unsaved session — the input box is centered in the main column (see
§12) until the first message is sent. The session row itself is created
lazily, on that first send, not when "+ New" is clicked (§3) — clicking
through several empty "+ New" states must not clutter the sidebar with
empty rows.

**Ordering.** Non-pinned sessions sort by `lastActiveAt` descending — bumped
only when a message is actually sent in that session, not merely by opening
it to look. Pinned sessions (up to 5) form a separate group above the rest,
sorted by `pinnedAt` descending (most-recently-pinned first). Attempting to
pin a 6th session is rejected with a message asking the user to unpin one
first — not a silent auto-evict of the oldest pin (see Alternatives
considered).

**Visible history depth.** The sidebar shows the 10 most recently active
sessions (pinned sessions count separately, up to their own cap of 5, and
don't consume a slot in the 10). Sessions beyond that cutoff are not
reachable from the sidebar in this revision — no "load more" or search
affordance yet (see Open questions).

**Titles.** A session's title is LLM-generated after its first exchange (a
short summarization prompt against the session's own selected model — see
Open questions for the cost/latency tradeoff of that choice vs. a fixed
lightweight default) and manually renameable at any time via a per-row
overflow menu, which also carries pin/unpin and delete actions. Deleting a
session removes its `warden_messages` rows and its own `warden_sessions`
row; there is no "recently deleted" recovery path, matching incognito's own
no-recovery posture.

**Settings entry point.** A "Settings" item is pinned to the bottom of the
sidebar (always visible, not part of the scrollable session list), opening
`/warden/settings` (§11) in the main column.

### 11. Settings

Consolidates provider and model management — currently the standalone
`/warden/providers` and `/warden/models` routes — into one settings surface
reachable only from the sidebar (§10), with three tabs:

- **General** — default model for new sessions, a retention control, and an
  export action. v1 scope for retention is a manual action (e.g. "delete
  sessions older than N days," run on demand), not a recurring background
  job — automatic scheduled retention would need a new `sdk.schedules`
  capability Warden doesn't declare today, and is left to a future phase
  rather than designed here (see Open questions). Whether "export" reuses
  the account-wide portability export flow (a deep link into Account's
  existing "export my data") or adds a new Warden-only JSON download by
  invoking `provideExport`'s callback directly from plugin UI is also left
  open (see Open questions) — the latter isn't how that hook is normally
  invoked today.
- **Providers** — the existing `ProvidersView` content (add/edit/remove,
  live health status), relocated unchanged in behavior.
- **Models** — the existing `ModelsView` content (per-model visibility
  curation, "Recheck models"), relocated unchanged in behavior.

`/warden/providers` and `/warden/models` are removed outright, not
redirected — given how little real usage exists this early (same reasoning
as the clean-slate session migration in §3), a redirect isn't worth the
added surface.

### 12. Composer redesign

The composer keeps its existing capabilities (text input, attach, send,
streaming) but is restyled around a Claude-style card and reorganized:

- **Positioning.** Centered in the main column for a session with no
  messages yet; docks to the bottom the instant the first message is sent.
  This isn't new logic — `ChatView.tsx` already appends the user's message
  to its turn list optimistically, synchronously, before the network
  request even starts, so the existing `turns.length === 0` condition
  already flips at exactly the right moment; the layout only needs to key
  off that same condition instead of introducing a new one.
- **Model picker.** Moves from an inline `<select>` to a popover, grouped by
  provider like `ModelsView` already groups its list, with a footer linking
  into Settings → Providers and Settings → Models (§11) — so "I don't see
  the model I want" resolves in one click instead of a separate navigation
  hunt.
- **Incognito.** Moves from the chat header into the composer toolbar as an
  icon toggle (§6), replacing the header's `Toggle` + label.
- **Removed outright:** the chat header's "Manage providers"/"Manage
  models" links (superseded by the model picker's popover footer and the
  sidebar's Settings entry) and the disabled "Web search — Soon" placeholder
  toggle — not hidden, deleted.

## UI flows

### First run

1. User installs/opens Warden. No provider is configured and `apps/harness`
   isn't reachable (or is, but that's just one more option).
2. Setup screen: add a provider (label, base URL, API key) or, if a local
   model is available, start chatting with that immediately.
3. Once at least one option exists, the ordinary chat view opens.

### Ongoing chat

1. User opens Warden, sidebar shows their sessions (pinned group, then up to
   10 most recently active).
2. User opens a session and sees it continue where it left off, or clicks
   "+ New" for a fresh one (input centered until the first send, §12).
3. User picks a model via the popover (defaults to the session's last-used
   model, or the account default for a new session — §11), asks a question.
4. Warden's server code routes to the right provider (§5), persists both
   sides of the exchange against that session, bumps its `lastActiveAt`, and
   streams the response. On the very first exchange, a title-generation
   request also fires (§10).

### Managing sessions

1. User pins a session from its overflow menu — it moves into the pinned
   group; a 6th pin attempt is rejected with a message to unpin one first.
2. User renames a session from the same menu, or deletes it (no recovery
   path, same posture as incognito).

### Settings

1. User clicks "Settings" at the bottom of the sidebar.
2. The main column shows the General/Providers/Models tabs (§11); Providers
   and Models behave exactly as the standalone pages did.
3. Leaving Settings returns to whichever session was open before.

### Incognito

1. User toggles incognito from the composer toolbar icon (§6, §12).
2. A fresh, unsaved scratch context starts; whichever session is selected
   underneath is untouched.
3. Toggling off (or leaving) discards the incognito context permanently and
   returns to the underlying session's own transcript.

## Alternatives considered

### Keep the bundled local engine as the only option (status quo)

**Rejected.** This is the design being replaced — see Motivation.
Hardware-constrained per Research 0015; the plugin has been `disabled: true`
since it shipped for exactly this reason.

### Route external-provider traffic through `apps/harness` too

**Rejected.** `apps/harness` exists to wrap the local engine and nothing
else. Making it a generic outbound proxy for arbitrary external endpoints
would add a hop and a service dependency to the common case (a user running
no local engine at all) for no benefit — Warden's own server-side code can
call an external HTTPS endpoint directly with the same trust properties
(browser never involved) that `apps/harness`'s dedicated internal API gives
for the local case.

### Instance-wide (admin-configured) provider config instead of per-user

**Considered, rejected per direct developer instruction.** RFC 0040's
original sketch used instance-level env vars specifically because per-user
secret storage didn't exist yet. It does now (`sdk.secrets`). Given
Warden's framing as a _personal_ assistant, per-user configuration (each
person's own key, own usage/billing) fits better than one shared
instance-wide credential — an operator wanting a shared default for
everyone remains a possible future addition, not designed here.

### New field-level encryption classification (`sdk.crypto`, RFC 0092) for the keys

**Considered, rejected.** RFC 0092's classification/policy model is built
for structured or free-text _data_ columns (health notes, financial
records) with fuzzy-search tradeoffs and an operator-controlled policy that
can be off by default. Provider API keys are exactly the runtime-created,
per-user, individually revocable credential that `sdk.secrets` (RFC 0043)
was purpose-built for — using it means zero new mechanism, zero new
manifest permission, and the same code path every other connection-style
plugin already exercises
([RFC 0049](../rfcs/0049-plugin-external-connections.md) builds on
`sdk.secrets` the same way).

### Multi-threaded conversations in the second rewrite

**Rejected at the time, done in this third revision.** A thread
list/switcher was real, expected work for a Claude/ChatGPT-style UI, but was
UI-layer scope, not foundation — the data model deliberately avoided
blocking it (see Data model), so building it later wasn't wasted effort,
just sequenced after the provider/persistence foundation proved out.
Consistent with the first rewrite's own discipline of shipping foundation
before extending capability; this revision is that later sequencing playing
out.

### Preserve the existing single conversation as a user's first session

**Considered, rejected per direct developer instruction.** Migrating the one
existing row into a titled/timestamped first session would need synthetic
values for columns that didn't exist before (title, `pinnedAt`,
`lastActiveAt`) and extra migration logic for a case with negligible real
usage this early — a clean slate (drop and recreate under the new
name/shape, §3) costs nothing meaningful and avoids inventing placeholder
data no one asked for.

### Auto-evict the oldest pin when a 6th pin is attempted

**Rejected.** Silently unpinning something the user deliberately pinned
earlier — without them asking for it — is a surprising, easy-to-miss data
loss of intent. Rejecting the 6th pin with a clear message asking the user
to choose what to unpin keeps the action explicit, at the cost of one extra
click in the (presumably rare) case of wanting more than 5 pins at once.

### Redirect the retired `/warden/providers`/`/warden/models` routes

**Considered, rejected.** A 301/308 redirect protects external bookmarks/
deep links at the cost of two permanent routes that do nothing but forward.
Given how little real usage exists this early (same reasoning as the
session migration above), that cost isn't justified — the routes are
removed outright.

### Persist chat history by default

**Reversed from the first rewrite.** The original phase 1 rejected
persistence to avoid opening storage/deletion/export/moderation questions
before they were needed. Revisited here because a Claude/ChatGPT-style
assistant with no memory of the conversation so far isn't really the
product being asked for, and the actual new surface area is smaller than it
looked in the abstract: personal chat logs, deletable per the existing
portability hook pattern every plugin already implements, with incognito as
an explicit, low-effort escape hatch for anyone who wants the old
ephemeral-only behavior for a given session.

### Allow tool execution or task handoff in this revision

**Not revisited — still rejected**, for the same reason the first rewrite
gave: shipping foundation and capability in the same change is exactly the
scope creep this plugin's own workstream previously flagged as its biggest
risk. OpenAI-compatible chat APIs already carry `tools`/`tool_calls` at the
wire level, so nothing about this design blocks wiring RFC 0047's tool
contracts in later — it's deferred by choice, not by architecture.

## Open questions

- **Real memory beyond recency truncation.** Context-window handling is
  "replay the last N turns." Whether Warden eventually needs summarization
  or a proper memory layer — the "multi-agentic harness" direction this
  plugin is ultimately meant to grow into — is real, and explicitly out of
  scope here.
- **Provider "test connection" UX.** Should saving a new provider validate
  it (a live `/models` call) before accepting it, or save first and surface
  errors on first use? An implementation detail, not resolved here.
- **Model list cache TTL / manual refresh.** Left to implementation.
- **Should Warden ever offer a shared, admin-configured default provider**
  for users who don't want to bring their own key? Not designed here — see
  "Alternatives considered."
- **RFC 0040's full revisit remains open.** This RFC resolves RFC 0040's
  specific deferred "user-supplied API keys" question but not its larger
  one: whether Sovereign Harness ends up being this foundation extended
  with orchestration/memory, or a separate later product built on top of
  it.
- **Sidebar cutoff beyond 10 sessions.** Hard cutoff (older sessions simply
  unreachable from the sidebar) vs. a "load more"/search affordance — left
  to implementation; §10 currently specs the hard-cutoff version as the v1
  behavior.
- **Which model generates a session's title.** The session's own
  currently-selected provider/model (consistent, but could be an expensive
  vendor call for a trivial title) vs. a fixed lightweight default
  independent of the user's provider choice (cheaper/faster, but a second
  code path and possibly a second, unconfigured provider dependency).
  Undecided — see §10.
- **Retention mechanism.** §11 scopes General's retention control to a
  manual, on-demand action for v1. Whether Warden ever needs automatic
  scheduled retention (which would require declaring a new `sdk.schedules`
  capability) is a real future question, not designed here.
- **Export mechanism.** §11 leaves open whether Settings → General's export
  action deep-links to the existing account-wide portability export (no new
  mechanism) or adds a new Warden-only JSON download by invoking
  `provideExport`'s callback directly from plugin UI (a new, not-currently-
  supported invocation path for that hook).
- **Mobile shell timing.** This revision is scoped to desktop/web only
  (§10); componentization should keep the door open for a dedicated mobile
  shell later (matching how `.local` plugins like docs/sheets/tally split a
  desktop shell from a mobile one sharing state/hooks), but no mobile UI is
  designed or scheduled here.
- **New curated icon(s) in `packages/ui`.** A sidebar-toggle icon (and
  likely a pin icon) don't exist in the current curated `Icon` set
  (`packages/ui/src/components/Icon/icons.ts`) and need adding — a small,
  real cross-package touch worth flagging, not yet designed (exact icon
  choice, whether it's one icon or two).

## Adoption path

Phase 1 (second rewrite, workstream 0019) — foundation revamp, **done**:

- Provider registry on `sdk.connections`/`sdk.secrets`, first-run setup UI,
  empty state (epic task 22.4).
- Model discovery: per-provider `/models` fetch, `apps/harness` health check
  folded into the same merged list, explicit model selection (22.4).
- Persisted chat: `warden_conversation`/`warden_messages`, single-thread
  chat UI, request-limit carryover including the max-recent-turns context
  guard (22.5).
- Incognito toggle, reusing the existing ephemeral request/response shape
  (22.5).
- Data deletion/export wiring via the existing portability hooks (22.5).
- Plugin re-enabled (`manifest.json`'s `disabled: true` removed) (22.5).

Phase 1.5 (this third revision, workstream 0021) — multi-session UI,
**planned, not started:**

- `warden_sessions` schema (replacing `warden_conversation`, clean-slate
  migration) and multi-session CRUD — create (lazy, on first send),
  list/order, pin (max 5)/unpin, rename, delete; chat API updated to route
  by session id (epic task 22.8, see §3, §10).
- Settings consolidation: new `/warden/settings` (General/Providers/Models
  tabs), `/warden/providers` and `/warden/models` removed (22.9, see §11).
- Sidebar UI: collapsible two-column layout, "+ New," pinned/recent session
  groups, per-row rename/pin/delete, LLM-generated titles, Settings entry
  point (22.10, see §10).
- Composer redesign: Claude-style card, model picker popover linking into
  Settings, incognito relocated into the toolbar, "Manage providers"/
  "Manage models" links and the disabled web-search toggle removed (22.11,
  see §12).

See [workstream 0021](../workstreams/0021-warden-multi-session-ui.md) for
leg sequencing, decisions locked, and dependencies between these four tasks.
`apps/harness` and `packages/sdk` need no changes for this phase either;
`packages/ui` gains one or two new curated icons (see Open questions).

Phase 2+ — unchanged, still future and unscheduled:

- Tool selection and execution via RFC 0047.
- A floating quick-access action button.
- Voice input/output.
- Per-user preferences beyond plugin-level visibility.
- The reserved third sidebar column's actual functionality (§10) —
  space is kept, nothing is designed for it yet.
- The RFC 0040 (Sovereign Harness) full revisit.

Semver impact:

- `apps/harness`: **no change** — it keeps its existing internal API and
  version; this RFC changes only how Warden treats it.
- `packages/sdk`: **no change** for this phase either — `sdk.secrets`/
  `sdk.connections`/`sdk.portability` already cover everything this design
  needs; no new permission, no new SDK surface.
- `packages/ui`: **minor bump** — one or two new curated icons added to the
  `Icon` set (additive, non-breaking); `ThreeColumnLayout` is consumed
  as-is, no change needed to that package itself.
- `plugins/warden`: manifest `version` bump at implementation time for each
  leg (plugins version only their own manifest, never `package.json`); a
  real schema migration (§3) ships with the first leg that touches it.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft — "Jarvis," runtime-owned, optional `apps/inference` sidecar, any OpenAI-compatible endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.2     | August 2026 | First rewrite — renamed to Warden; architecture reversed from runtime-owned to a first-party platform plugin (`plugins/warden`) backed by a dedicated `apps/harness` engine service (auth/relay pattern); engine choice (llama.cpp vs. Ollama) deferred to a real benchmark (Research 0015); tool execution, task handoff, floating quick-access button, and voice moved to explicit, undesigned future phases; phase 1 scoped to exactly 3 tasks per direct developer instruction to ship foundation only                                                                                                                                                                                                                                                                                        |
| 0.3     | August 2026 | Corrected "Current state": `sovereign-mobile`/`sovereign-desktop` don't run local inference — `sovereign-edge` and `sovereign-os` are the real local-inference precedents, the latter having already run its own llama.cpp-vs-Ollama benchmark for a differently constrained target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.4     | August 2026 | Phase 1 shipped in full (epic tasks 22.1-22.3, workstream 0014), verified end to end, then deliberately disabled — hardware-constrained per Research 0015's own benchmark data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.5     | August 2026 | **Second rewrite.** Revamped to bring-your-own OpenAI-API-compatible model providers per user, with the existing local `apps/harness` engine folded in as one optional entry rather than the required backend; persisted single-threaded conversation history (reversing the first rewrite's ephemeral-only decision) with an incognito toggle preserving that behavior as an opt-in; provider API keys stored via the existing `sdk.secrets` vault (RFC 0043), no new secret-storage mechanism; no code changes required to `apps/harness`, `packages/sdk`, or `packages/manifest`. Not yet implemented or scheduled.                                                                                                                                                                            |
| 0.6     | August 2026 | Second rewrite shipped in full (epic tasks 22.4-22.5, workstream 0019), verified end to end against a self-hosted mock provider; plugin re-enabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 0.7     | August 2026 | **Third revision.** Specs the multi-session UI phase explicitly deferred in 0.5/0.6 as future/undesigned: `warden_sessions` replaces the single `warden_conversation` (clean-slate migration, no backfill of existing rows), collapsible two-column sidebar with pinnable (max 5) named sessions ordered by last-active timestamp and LLM-generated titles, a consolidated `/warden/settings` (General/Providers/Models) replacing the standalone provider/model routes, and a Claude-style composer redesign (model picker as a popover, incognito relocated into the toolbar, web-search placeholder removed). Incognito's own semantics, request routing, and provider/model discovery are unchanged. Sequenced as epic tasks 22.8-22.11, workstream 0021. Planning only — not yet implemented |
