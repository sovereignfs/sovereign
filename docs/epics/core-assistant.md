# Epic: Warden (Core Assistant)

> Phase 1 foundation for Sovereign's built-in assistant: a first-party
> platform plugin (Warden, formerly "Jarvis") backed by a dedicated
> `apps/harness` engine service. See
> [RFC 0063](../rfcs/0063-core-assistant-jarvis.md) for the full design and
> its August 2026 rewrite — this epic reflects that rewrite, not the
> original draft.

## Status

📋 Planned

## Overview

Warden is Sovereign's built-in workspace assistant: a first-party platform
plugin (`plugins/warden`) with its own routed space, providing basic
conversational chat. It's backed by `apps/harness`, a new dedicated
first-party service — structurally the same as `apps/auth`/`apps/relay` —
wrapping a local inference engine (llama.cpp or Ollama; the choice is
benchmark-gated, see [Research 0015](../research/0015-harness-engine-benchmark.md)).

**This epic is phase 1 only: the foundation.** Three tasks, no tool
execution, no task handoff, no floating quick-access button, no voice — all
of those are real future phases, listed in RFC 0063's Adoption path but
deliberately not scheduled as epic tasks here. The instruction behind this
scope was explicit: ship a working chat surface first, extend capability
later.

Warden gets no privileged runtime access beyond an ordinary plugin in this
phase — there's nothing to call privileges on yet, since there's no tool
execution. When tool selection is eventually designed (a future phase, not
this epic), the intended path is RFC 0047's plugin tool contracts, with
Warden as the first flagship consumer — not a runtime-level bypass. See RFC
0063 §3 for the full reasoning.

RFC 0040 (Sovereign Harness) currently describes a different architecture
for Sovereign's assistant roadmap — a separate-repo plugin, built on this
RFC's _original_ runtime-owned design. Both of those are now stale relative
to this rewrite. RFC 0040 is flagged pending revisit; that revisit is not
part of this epic.

## Tasks

#### 📋 22.1 — Resolve the harness engine benchmark (Research 0015)

**Goal:** Decide, with real measurements rather than priors, whether
`apps/harness` wraps llama.cpp server or Ollama.

**Deliverables:**

- Run [Research 0015](../research/0015-harness-engine-benchmark.md)'s
  proposed benchmark: cold-start/model-load time, idle memory footprint,
  tokens/sec, and time-to-first-token for both engines running
  `qwen3:1.7b` on representative self-hosting hardware (not a high-end
  workstation).
- Repeat the measurement for `qwen3:0.6b`, the low-resource fallback
  profile — don't skip it; it's the case where engine daemon overhead is
  most likely to matter.
- Record the qualitative engineering cost for each: how much wrapper code
  each needs to expose the internal chat API `apps/harness` requires, and
  whether model download/verification needs to be hand-built (llama.cpp)
  or comes free (Ollama's own pull mechanism).
- Check licensing/distribution posture for both engines in a self-hosting
  context — not a performance question, but part of a complete decision
  record.
- Update Research 0015 in place with a filled-in "Decision" section and
  move its Status line from `Exploratory` to `Decided`. Do not leave the
  research doc stale once this task completes — that was exactly the kind
  of drift found and fixed elsewhere in this same documentation pass.

**Dependencies:** None.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- Both engines were actually measured on the same hardware class, not
  estimated from vendor claims.
- Both model profiles (`qwen3:1.7b` and `qwen3:0.6b`) were covered.
- Research 0015 reflects the decision and the reasoning, not just a
  one-line verdict.

---

#### 📋 22.2 — `apps/harness` engine service scaffold

**Goal:** Stand up `apps/harness` as a standalone first-party service
wrapping the engine Task 22.1 selected, following the `apps/auth`/`apps/relay`
pattern rather than a loosely-coupled sidecar.

**Deliverables:**

- `apps/harness/` — own `package.json`, `Dockerfile`, health endpoint,
  joins `sovereign_net`. Never exposed to the public internet by default.
- Engine wrapper (`apps/harness/src/engine/`) for whichever engine Task
  22.1 chose. If llama.cpp was chosen, this includes model
  download/verification/storage, since llama.cpp server doesn't provide
  that itself (see Research 0015's findings).
- Trust boundary: reuse `apps/relay/src/enrollment.ts`'s signed-token
  pattern for authenticating calls between `apps/harness` and Warden's
  server-side code — do not invent a new mechanism.
- Internal-only chat completion API — its exact shape (literally
  OpenAI-compatible, or a narrower purpose-built contract) is this task's
  own decision, since `apps/harness` has exactly one consumer (Warden) in
  this phase, unlike the original draft's "any consumer" framing.
- Docker Compose: an optional `harness` profile (dev and prod), a named
  volume for model storage, no port exposed publicly by default.
- Deterministic fake-engine response path for CI — tests must not download
  or run a real model.
- Failure-mode handling: unreachable engine, missing model, timeout — see
  RFC 0063 §6 for the expected states.
- `docs/self-hosting.md` and `docs/architecture-rules.md` updated in the
  same PR that adds the `harness` profile.

**Dependencies:** Task 22.1 (engine decision).

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- The baseline Sovereign stack (no `harness` profile) is provably
  unaffected — verified by actually running `docker compose up` without
  the profile, not just reading the compose file.
- The engine's model data plane is unexposed to the public internet by
  default; if a debug port is opened, docs warn against public exposure.
- CI runs with no real model download, using the fake-engine path.
- The enrollment/trust-boundary pattern matches `apps/relay`'s, not a new
  invention.

---

#### 📋 22.3 — Warden platform plugin: basic chat

**Goal:** Ship Warden as a first-party plugin with its own routed space and
basic ephemeral chat, wired to `apps/harness`, with zero tool execution.

**Deliverables:**

- `plugins/warden/` — `manifest.json`, `icon.svg`, `app/` route tree,
  following `plugins/account`/`plugins/console`/`plugins/launcher`'s shape.
  Install/enable through the existing plugin system — no bespoke
  runtime-owned config or settings surface.
- A routed chat page: basic conversational UI, no persisted history by
  default (ephemeral session context only).
- Server-side-only calls from Warden to `apps/harness`, authenticated via
  Task 22.2's enrollment-token pattern. The browser client never talks to
  `apps/harness` directly.
- Explicitly **no** tool selection, tool execution, or task handoff in this
  task — chat only. No floating quick-access button, no voice.
- Health/unavailable UI states matching `apps/harness`'s failure modes
  (Task 22.2): not installed, installed-but-unreachable, model missing,
  timeout.
- Request limits: max input characters, max output tokens, max recent
  turns, a concurrency cap — reused server-side, not left to the client to
  self-limit.

**Dependencies:** Task 22.2 (`apps/harness` must exist and expose its
internal chat API before Warden can call it).

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- A user can install Warden, open its routed page, and hold a basic
  conversation end to end against a real `apps/harness` instance — not
  just against the fake-engine test path.
- No tool call, task handoff, or cross-plugin action is reachable from
  Warden in this phase — verify by trying to find one, not just by reading
  the diff.
- Uninstalling Warden leaves no dangling entry point or broken route.
- `apps/harness` unreachable produces a clean unavailable state, not an
  unhandled error or an infinite retry loop.

## Future phases (not yet scheduled)

Real, intended work — listed per RFC 0063's Adoption path, deliberately not
given epic task IDs until a future scheduling pass:

- **Tool selection and execution**, via RFC 0047's plugin tool contracts —
  Warden as the first flagship consumer of that model, not a runtime-level
  bypass. Depends on RFC 0047 shipping (task 3.18, workstream 0015).
- **A floating quick-access action button** reachable from any screen —
  needs a new shell-chrome extension point that doesn't exist today; a
  small design question of its own.
- **Voice input/output.**
- **Opt-in persisted chat history**, with export/deletion semantics.
- **Per-user preferences** beyond plugin-level visibility.
- **The RFC 0040 (Sovereign Harness) revisit** — whether Harness becomes
  this foundation extended with memory/orchestration/tool-routing, or a
  separate later product built on top of it. Not decided by this epic.

## Review checklist (epic-level)

- Model/engine decisions are based on Task 22.1's real benchmark, not
  vendor claims or ecosystem-consistency assumptions alone.
- Warden introduces no runtime-internal coupling to a future Harness
  plugin or Council — it's a self-contained plugin + service pair.
- Any future `packages/*` extraction waits for at least two real
  consumers, matching this repo's standing convention.

## Related RFCs

- [RFC 0063 — Warden: core assistant platform plugin and harness engine](../rfcs/0063-core-assistant-jarvis.md)
- [RFC 0040 — Sovereign Harness](../rfcs/0040-sovereign-harness.md) (pending revisit)
- [RFC 0055 — Sovereign Council](../rfcs/0055-sovereign-council.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)
- [RFC 0005 — Activity log](../rfcs/0005-activity-log.md)

## Related research

- [Research 0015 — `apps/harness` engine: llama.cpp vs. Ollama benchmark](../research/0015-harness-engine-benchmark.md)

## Related Docs

- [architecture-rules.md](../architecture-rules.md)
- [self-hosting.md](../self-hosting.md)
- [plugin-development.md](../plugin-development.md)
