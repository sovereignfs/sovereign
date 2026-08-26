# Workstream 0019 — Warden: bring-your-own model providers

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0063](../rfcs/0063-core-assistant-jarvis.md) (Accepted, second
rewrite, August 2026)\
**Epics touched:** 22 (Warden / Core Assistant)

---

## Goal

Replace Warden's local-engine-only phase 1 (shipped as workstream 0014,
then deliberately disabled) with a foundation where each user configures
their own OpenAI-API-compatible model provider(s), with the existing local
`apps/harness` engine folded in as one optional, auto-detected entry rather
than the required backend. Add persisted single-threaded chat history
(reversing phase 1's ephemeral-only decision) with an incognito toggle. At
the end: a user can install Warden, add a provider — or use a running local
engine, if there is one — and hold a real, remembered conversation, with
zero new secret-storage mechanism and zero `apps/harness` code changes.

## Definition of done

- [ ] `22.4` — a user can configure one or more model providers (label,
      base URL, API key via `sdk.secrets`), see a merged model list that
      also includes `apps/harness`'s local model when reachable, and
      select a model to chat with.
- [ ] `22.5` — chat is persisted by default (single conversation per user),
      an incognito toggle provides a non-persisted scratch mode, request
      limits (including a max-recent-turns context guard) are enforced
      server-side, and the plugin's `disabled: true` is removed.

## Decisions locked

| Decision                     | Choice                                                                                       | Rejected alternative and why                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                        | Exactly 22.4 and 22.5 — provider registry/discovery, then persisted chat/incognito/re-enable | Bundling tool execution or multi-threaded UI into this workstream — rejected, same foundation-first discipline as workstream 0014; both are real future phases, not designed here                |
| Secret storage               | Reuse `sdk.secrets` (RFC 0043), scope `'user'`                                               | Inventing a new mechanism, or reaching for `sdk.crypto` field encryption (RFC 0092) — rejected; RFC 0063's Alternatives already resolved this, `sdk.secrets` is the purpose-built, existing tool |
| `apps/harness`'s role        | Folded in as one optional, auto-detected provider; zero code changes                         | Rewriting `apps/harness` into a generic external-provider proxy — rejected in RFC 0063; it keeps doing exactly one job                                                                           |
| Provider configuration scope | Per-user                                                                                     | Instance-wide admin configuration — rejected per direct developer instruction; Warden is framed as a personal assistant, per-user key/budget fits better                                         |
| Conversation model           | A single persisted thread per user in phase 1; data model allows more later                  | Building multi-thread UI now — rejected as UI-layer scope beyond this foundation, deferred to a future phase                                                                                     |
| Incognito semantics          | A fresh, separate, never-persisted scratch context (like a browser's incognito window)       | Pausing/resuming the persisted thread mid-conversation — rejected for ambiguity about which messages count as saved                                                                              |
| Leg order                    | Strict 22.4 → 22.5                                                                           | Building persistence before the provider/model layer exists — rejected; there's nothing to persist a conversation about until a provider can be selected and called                              |

## Prerequisites

None blocking leg 1. `sdk.secrets` (RFC 0043) and `apps/harness` (workstream 0014) already exist and need no changes. Leg 2 depends on leg 1's provider
registry and request-routing existing.

## Legs

| Leg | Name                                     | Epic tasks | Epics | Gate? | Done when                                                                                                                                                                        |
| --- | ---------------------------------------- | ---------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Provider registry and model discovery    | 22.4       | 22    | No    | A user can add/edit/delete a provider and see a merged model list (their providers + local `apps/harness` if reachable), with per-provider health/auth-failure states            |
| 2   | Persisted chat, incognito, and re-enable | 22.5       | 22    | No    | Chat persists by default, incognito works as a non-persisted scratch mode, request/context limits are enforced server-side, and the plugin is re-enabled and verified end to end |

Neither leg is marked a gate — unlike workstream 0014's engine benchmark,
there's no upstream unknown here that could redirect leg 2's scope. Leg 1's
PR must still merge before leg 2's branch is cut, per the standard leg
contract.

## Leg detail

### Leg 1 — Provider registry and model discovery

**Epic tasks:** 22.4

**Why this leg is first:** there's nothing to route a chat request to, and
nothing to persist a conversation about, until a provider or a reachable
local model exists and can be selected.

**Technical notes:**

- `warden_providers` table (`sdk.db`, tenant + user scoped): label, base
  URL, and an `sdk.secrets` ref id — never the raw key. See RFC 0063 §3.
- Use `sdk.secrets.create({ scope: 'user', ... })` for the API key;
  `sdk.secrets.delete()` when a provider row is deleted, in the same
  action — nothing should outlive its owning row.
- Model discovery: `GET {baseUrl}/models` per configured provider, plus a
  check against `apps/harness`'s existing health/model endpoint (no
  changes needed there — see RFC 0063 §4). A provider fetch failure marks
  that provider unreachable; it must not fail the whole list.
- First-run empty state: no chat UI reachable until at least one provider
  (or a reachable local model) exists.
- Reuse the existing enrollment-token client (`harness-client.ts`) for the
  local-engine health check — don't reimplement that trust boundary.

**Do not proceed if:** a provider's API key ends up reachable anywhere
outside server-side code (browser payload, client-visible props, logs) —
that's a security regression, not a minor bug, given this is the first
plugin to store third-party billing credentials via `sdk.secrets`.

### Leg 2 — Persisted chat, incognito, and re-enable

**Epic tasks:** 22.5

**Why this leg is second:** it builds directly on leg 1's provider/model
selection to have something to route a persisted conversation through.

**Technical notes:**

- `warden_conversation`/`warden_messages` tables per RFC 0063 §3 — one
  conversation row per user in this phase, but a real entity so multi-thread
  later doesn't need a migration.
- Incognito: reuse the existing ephemeral request/response shape
  (`harness-client.ts`'s current behavior) unchanged — it already does
  exactly what incognito needs. Persisted mode is the new path, not
  incognito.
- Context-window guard: cap replayed history to the last N turns
  server-side, same request-limit posture as the original phase 1 (input
  chars, output tokens, concurrency cap all carried forward).
- Wire `warden_providers`/`warden_conversation`/`warden_messages` into the
  existing plugin portability hooks
  (`sdk.portability.provideExport`/`provideDelete`) so account export/
  deletion covers chat history like any other plugin's data.
- Remove `plugins/warden/manifest.json`'s `disabled: true` only after the
  above is verified end to end against a real provider (not just the
  fake-engine/mock path) — matching how leg 3 of workstream 0014 required
  real-instance verification, not just CI green.

**Do not proceed if:** re-enabling the plugin surfaces any reachable tool
call, task handoff, or cross-plugin action — same scope-creep tripwire
workstream 0014 already established; check by trying to find one, not just
by reading the diff.

## Risks

- **First real consumer of `sdk.secrets` for third-party billing
  credentials.** A leaked key has real financial blast radius for the user
  (unlike, say, a leaked webhook signing secret). Leg 1's "do not proceed
  if" condition exists specifically for this.
- **Context-window truncation is a blunt instrument.** Simple
  recency-based truncation (leg 2) will eventually drop context a user
  expected the assistant to remember — acceptable for phase 1, but worth
  flagging so it isn't mistaken for a bug later; real memory is explicitly
  future work (RFC 0063's Open questions).
- **Re-enabling a previously-disabled plugin risks reintroducing whatever
  made it worth disabling, if the new design doesn't actually fix the
  underlying problem.** The original disable reason was hardware
  constraints on the _local_ engine, not a bug in the plugin itself — this
  workstream addresses that directly by making the local engine optional,
  but leg 2's real-instance verification should confirm the
  external-provider path is genuinely usable in practice, not just sound
  in the RFC's reasoning.

## Kill criteria

Leg 1 stands alone — a working provider registry and merged model list is
useful even if leg 2 stalls, though the plugin would stay disabled until
chat itself works. If leg 2 surfaces a design gap in the incognito/
persistence split (e.g. the "fresh scratch context" model turns out to
confuse users in practice), hold re-enabling the plugin rather than
shipping a confusing toggle — the re-enable step is explicitly the last
action in leg 2, not a foregone conclusion.

## Changelog

| Version | Date        | Change                                                                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft, sequencing RFC 0063's second rewrite (bring-your-own model providers, persisted chat, incognito) into two legs |
