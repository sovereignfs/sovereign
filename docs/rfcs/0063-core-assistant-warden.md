---
rfc: 0063
title: Warden — core assistant platform plugin and harness engine (formerly "Jarvis")
status: >
  Implemented (second rewrite — phase 1's foundation revamped to
  bring-your-own model providers; the first rewrite's local-engine-only
  design shipped in full as epic tasks 22.1-22.3, workstream 0014, and was
  then deliberately disabled — see Motivation. This revision's own scope,
  epic tasks 22.4 (workstream 0019 leg 1 — provider registry and model
  discovery on sdk.connections/sdk.secrets) and 22.5 (leg 2 — persisted
  chat, incognito, re-enable), are both done; the plugin is re-enabled.
  Tool execution/task handoff/floating button/voice/multi-thread UI remain a
  future, not-yet-scheduled phase per this RFC's own Adoption path, not part
  of incorporated_into_plan)
date: August 2026 (second rewrite; originally drafted July 2026, first rewrite August 2026)
author: kasunben
scope: >
  plugins/warden (rewritten); no code changes required to apps/harness,
  packages/sdk, or packages/manifest; builds on RFC 0043 (plugin secret
  vault, reused unchanged for provider API keys), RFC 0040 (Sovereign
  Harness — this RFC resolves its deferred "user-supplied API keys" open
  question), RFC 0092 (app-level field encryption, considered and
  deliberately not used — see Alternatives); supersedes this RFC's own first
  rewrite's local-engine-only design
incorporated_into_plan: 'Yes — epic tasks 22.4-22.5 (workstream 0019)'
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

## Summary

Revamp Warden's phase 1 foundation: instead of requiring a bundled local
inference engine, each user configures their own model provider(s) — any
endpoint compatible with the OpenAI chat completions API, with an API key
(OpenRouter, a direct provider, or the user's own self-hosted server).
Warden fetches and caches each provider's model list. If the existing
`apps/harness` local-engine service (unchanged, from the first rewrite) is
reachable and has a model ready, its model is folded into the same list
automatically — no configuration needed, and its absence is not an error.

Chat becomes a single, persisted conversation per user (not yet
multi-threaded — that's future work), reversing the original phase 1's
ephemeral-only decision. An **incognito** toggle preserves the original
ephemeral behavior as an opt-in escape hatch: while on, nothing is written
to durable storage.

Tool execution, task handoff, a floating quick-access button, voice, and
multi-threaded conversations remain explicit future phases — unchanged from
the first rewrite's discipline of shipping foundation only.

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

## Proposed design

### 1. Naming and boundaries

Unchanged from the first rewrite: Warden is the plugin, `apps/harness` is
the local-engine service. What changes is `apps/harness`'s standing: it was
"the" backend; it is now one optional provider among several, with no
special status in the UI beyond "free, no API key needed, only available if
the operator runs it."

### 2. Product scope — phase 1 (this rewrite)

Warden v1 (revised) supports:

- per-user model provider configuration — label, base URL, API key — added
  through a first-run setup flow and editable later;
- fetching and caching each configured provider's model list
  (`GET {baseUrl}/models`, OpenAI-compatible shape);
- folding `apps/harness`'s local model into the same list automatically
  when it's reachable and has a model ready — zero configuration, silently
  absent otherwise;
- explicit model selection per conversation (a default, changeable);
- a single, persisted conversation per user — not yet multiple named
  threads (see Open questions);
- an **incognito** toggle: while on, no message is written to durable
  storage — the original phase 1's ephemeral behavior, now opt-in rather
  than the default;
- health/unavailable/auth-failure states per provider, and a clear
  first-run empty state when no provider is configured yet;
- install/enable through the existing plugin system, unchanged;
- **no privileged runtime access beyond an ordinary plugin** — unchanged
  from the first rewrite. Warden still has no tools to call, so there's
  nothing to be privileged about yet.

Warden v1 (revised) still explicitly does **not** support, unchanged from
the first rewrite:

- tool selection or execution of any kind;
- task handoff to other plugins;
- a floating quick-access action button;
- voice input or output;
- per-user preferences beyond ordinary plugin visibility rules;
- automatic/silent fallback between providers or models — switching is
  always an explicit user action, the same principle RFC 0040 §5 already
  established for local-vs-external ("must never silently fall back"),
  extended here to apply between any two configured providers;
- multiple named conversation threads (the sidebar/thread-switcher a
  ChatGPT/Claude-style UI usually has) — phase 1 ships one continuous
  thread per user; the data model doesn't block adding more later (see
  Data model), but the UI to manage them is future work.

All of the above are real, intended future phases, not rejected ideas —
listed under "Adoption path."

### 3. Data model

Three plugin-owned tables, `sdk.db`-scoped like any other plugin (tenant +
user scoped, following `docs/architecture-rules.md`'s "plugin tables are
slug-prefixed" rule):

```ts
warden_providers {
  id: text primary key
  tenantId: text not null
  userId: text not null
  label: text not null            // user-facing name, e.g. "OpenRouter"
  baseUrl: text not null
  secretRefId: text not null      // sdk.secrets ref — the API key itself
                                   // never lives in this table
  createdAt, updatedAt
}

warden_conversation {
  id: text primary key
  tenantId: text not null
  userId: text not null
  createdAt
}
// Exactly one row per user in phase 1 — modeled as a real entity now so
// multi-thread later is "add more rows plus a picker," not a migration.

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

Incognito messages never reach `warden_messages` — the request/response
round-trips the in-progress transcript directly, exactly like the original
phase 1's ephemeral design (`plugins/warden/app/_lib/harness-client.ts`'s
existing shape already does this; it's reused, not rebuilt).

The API key itself is never a column in `warden_providers` — only the
`sdk.secrets` ref id is. Deleting a provider row also deletes its secret
(`sdk.secrets.delete(ref.id)`) in the same action, so nothing outlives its
owning row.

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

A visible toggle in Warden's chat UI. While on:

- the conversation is a fresh, separate scratch context — not a "pause" of
  the persisted thread — so there's no ambiguity about which messages
  count as saved;
- nothing is written to `warden_messages`;
- turning it off (or navigating away, or reloading) discards it entirely;
  there is no "recover my incognito session" path, by design — the same
  posture as a browser's own incognito window.

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

`warden_providers`, `warden_conversation`, and `warden_messages` participate
in the existing plugin portability hooks
(`sdk.portability.provideExport`/`provideDelete`) like any other plugin's
data — a user's account deletion or data export must include (or
deliberately, visibly exclude) chat history, same as any other plugin is
expected to wire up. Deleting a provider deletes its `sdk.secrets` row in
the same action (see Data model).

## UI flows

### First run

1. User installs/opens Warden. No provider is configured and `apps/harness`
   isn't reachable (or is, but that's just one more option).
2. Setup screen: add a provider (label, base URL, API key) or, if a local
   model is available, start chatting with that immediately.
3. Once at least one option exists, the ordinary chat view opens.

### Ongoing chat

1. User opens Warden, sees their persisted conversation continue where it
   left off.
2. User picks a model (defaults to last-used), asks a question.
3. Warden's server code routes to the right provider (§5), persists both
   sides of the exchange, and streams the response.

### Incognito

1. User toggles incognito.
2. A fresh, unsaved scratch context starts; the persisted thread underneath
   is untouched.
3. Toggling off (or leaving) discards the incognito context permanently.

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

### Multi-threaded conversations now

**Rejected for this phase, revisited later.** A thread list/switcher is
real, expected work for a Claude/ChatGPT-style UI, but it's UI-layer scope,
not foundation — the data model already avoids blocking it (see Data
model), so building it later isn't wasted effort, just sequenced after this
foundation proves out. Consistent with the first rewrite's own discipline
of shipping foundation before extending capability.

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

- **Multi-thread scaling.** `warden_conversation` is modeled as a real
  entity specifically so a future thread list doesn't require a migration —
  but the actual UI/UX for creating, naming, and switching threads is
  undesigned. Future phase.
- **Real memory beyond recency truncation.** Phase 1's context-window
  handling is "replay the last N turns." Whether Warden eventually needs
  summarization or a proper memory layer — the "multi-agentic harness"
  direction this plugin is ultimately meant to grow into — is real, and
  explicitly out of scope here.
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

## Adoption path

Phase 1 (this rewrite) — foundation revamp:

- Provider registry: `warden_providers` table, `sdk.secrets`-backed
  create/edit/delete, first-run setup UI, empty state.
- Model discovery: per-provider `/models` fetch, `apps/harness` health
  check folded into the same merged list, explicit model selection.
- Persisted chat: `warden_conversation`/`warden_messages`, updated chat UI
  (single thread, no sidebar yet), request-limit carryover including the
  new max-recent-turns context guard.
- Incognito toggle, reusing the existing ephemeral request/response shape.
- Data deletion/export wiring via the existing portability hooks.
- Re-enable the plugin (`manifest.json`'s `disabled: true` removed) once
  the above is verified end to end.

No epic tasks are assigned yet — this RFC precedes that scheduling pass,
same as the original draft did. `apps/harness` and `packages/sdk` need no
changes; this revision is scoped entirely to `plugins/warden`.

Phase 2+ — unchanged from the first rewrite, still future and unscheduled:

- Tool selection and execution via RFC 0047.
- A floating quick-access action button.
- Voice input/output.
- Multi-threaded conversations (thread list/switcher).
- Per-user preferences beyond plugin-level visibility.
- The RFC 0040 (Sovereign Harness) full revisit.

Semver impact:

- `apps/harness`: **no change** — it keeps its existing internal API and
  version; this RFC changes only how Warden treats it.
- `packages/sdk` / `packages/manifest`: **no change** — `sdk.secrets` (RFC 0043) already covers everything this design needs; no new permission, no
  new SDK surface.
- `plugins/warden`: manifest `version` bump at implementation time (plugins
  version only their own manifest, never `package.json`); `disabled: true`
  removed once this phase ships and is verified.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft — "Jarvis," runtime-owned, optional `apps/inference` sidecar, any OpenAI-compatible endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2     | August 2026 | First rewrite — renamed to Warden; architecture reversed from runtime-owned to a first-party platform plugin (`plugins/warden`) backed by a dedicated `apps/harness` engine service (auth/relay pattern); engine choice (llama.cpp vs. Ollama) deferred to a real benchmark (Research 0015); tool execution, task handoff, floating quick-access button, and voice moved to explicit, undesigned future phases; phase 1 scoped to exactly 3 tasks per direct developer instruction to ship foundation only                                                                                                             |
| 0.3     | August 2026 | Corrected "Current state": `sovereign-mobile`/`sovereign-desktop` don't run local inference — `sovereign-edge` and `sovereign-os` are the real local-inference precedents, the latter having already run its own llama.cpp-vs-Ollama benchmark for a differently constrained target                                                                                                                                                                                                                                                                                                                                    |
| 0.4     | August 2026 | Phase 1 shipped in full (epic tasks 22.1-22.3, workstream 0014), verified end to end, then deliberately disabled — hardware-constrained per Research 0015's own benchmark data                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0.5     | August 2026 | **Second rewrite.** Revamped to bring-your-own OpenAI-API-compatible model providers per user, with the existing local `apps/harness` engine folded in as one optional entry rather than the required backend; persisted single-threaded conversation history (reversing the first rewrite's ephemeral-only decision) with an incognito toggle preserving that behavior as an opt-in; provider API keys stored via the existing `sdk.secrets` vault (RFC 0043), no new secret-storage mechanism; no code changes required to `apps/harness`, `packages/sdk`, or `packages/manifest`. Not yet implemented or scheduled. |
