# Epic: Warden (Core Assistant)

> Phase 1 foundation for Sovereign's built-in assistant: a first-party
> platform plugin (Warden, formerly "Jarvis"). See
> [RFC 0063](../rfcs/0063-core-assistant-jarvis.md) for the full design.
> Tasks 22.1-22.3 shipped RFC 0063's **first** rewrite (local-engine-only
> chat, backed by a dedicated `apps/harness` service) and were then
> deliberately disabled — hardware-constrained, see task 22.3's completion
> note and Research 0015. Tasks 22.4-22.5 implement RFC 0063's **second**
> rewrite: bring-your-own OpenAI-API-compatible model providers per user,
> with the local engine folded in as one optional, auto-detected entry
> instead of the required backend, plus persisted chat and an incognito
> toggle. This epic file reflects the second rewrite; read RFC 0063 itself
> for the full reasoning behind the change.

## Status

📋 Planned

## Overview

Warden is Sovereign's built-in workspace assistant: a first-party platform
plugin (`plugins/warden`) with its own routed space, providing basic
conversational chat. Each user configures their own model provider(s) — any
OpenAI-API-compatible endpoint (OpenRouter, a direct provider, or a
self-hosted server) with an API key stored via the existing plugin secret
vault (`sdk.secrets`, RFC 0043). If `apps/harness` — the dedicated
first-party service from the first rewrite, structurally the same as
`apps/auth`/`apps/relay`, wrapping a local llama.cpp engine (the choice was
benchmark-gated, see [Research 0015](../research/0015-harness-engine-benchmark.md))
— is reachable and has a model ready, it's folded into the same model list
automatically, with no special status beyond "free, no key needed." Neither
`apps/harness` nor `packages/sdk` needs any code change for this; see RFC
0063 §Current state.

**This epic is phase 1 only: the foundation.** No tool execution, no task
handoff, no floating quick-access button, no voice, no multi-threaded
conversation UI — all of those are real future phases, listed in RFC 0063's
Adoption path but deliberately not scheduled as epic tasks here. The
instruction behind this scope was explicit both times: ship a working chat
surface first, extend capability later.

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

#### ✅ 22.1 — Resolve the harness engine benchmark (Research 0015)

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

**Result:** llama.cpp server selected. Measured on the actual production
self-hosting box (2 vCPU / 3.7GB RAM, no GPU) — raw token throughput was
nearly identical between engines, but Ollama's OpenAI-compatible endpoint
(v0.32.9) does not honor `think: false` (only its native `/api/chat` does),
so every request through it pays Qwen3's full default "thinking" tax —
9–21s of silence before any visible answer, vs. llama.cpp's sub-second TTFT
with `chat_template_kwargs.enable_thinking: false`. Full data and reasoning
in [Research 0015](../research/0015-harness-engine-benchmark.md)'s Decision
section; raw reports in `scripts/harness-benchmark/results/`. Also found:
the official `Qwen/Qwen3-*-GGUF` repos only publish `Q8_0`, not `Q4_K_M` —
task 22.2's model download layer needs the `unsloth/Qwen3-*-GGUF` repos
instead.

---

#### ✅ 22.2 — `apps/harness` engine service scaffold

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

**Result:** `apps/harness` scaffolded as two Compose services under an
optional `harness` profile — `harness` (this repo's own Next.js wrapper:
enrollment trust boundary reusing `apps/relay/src/enrollment.ts` exactly,
lazy non-blocking model download/verification with atomic-rename-on-success,
server-enforced request limits, the narrow internal `/api/chat` completion
API) and `harness-engine` (`ghcr.io/ggml-org/llama.cpp:server` itself,
verified working during leg 1's benchmark). Neither is ever port-mapped to
the host. `SOVEREIGN_HARNESS_ENGINE=fake` gives CI/tests a deterministic
canned-response engine with no model file or network I/O. Baseline stack
confirmed unaffected via `docker compose config` (harness services excluded
without the profile flag) and a successful `docker compose build`; a literal
`docker compose up` hit an unrelated pre-existing container-name collision
with another checkout on the verification machine, not this change — see the
PR description for full detail. `docs/self-hosting.md` and
`docs/architecture-rules.md` updated in the same PR, including two new
architecture rules (the enrollment-pattern reuse, and the wait-loop
Compose-entrypoint technique for a sidecar that needs a file to exist before
its own process can start).

---

#### ✅ 22.3 — Warden platform plugin: basic chat

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

**Result:** `plugins/warden` shipped as a first-party platform plugin
(`fs.sovereign.warden`, `shell: default`, `permissions: ["auth:session"]`
only), composing automatically alongside `console`/`launcher`/`account`.
`app/api/chat/route.ts` is a plugin-owned Route Handler (a first precedent
in this repo — every other plugin uses server actions only) proxying
`apps/harness`'s SSE stream straight through in the success case;
`app/_lib/harness-client.ts` handles enrollment-token caching (stateless,
process-lifetime cache, re-enrolls once on a 401) and maps every
`apps/harness` failure mode to a small state set the UI branches on.
`ChatView.tsx` reuses `packages/ui`'s already-built, previously-unconsumed
`Message`/`MessageScroller` components. Verified against a **real**
`apps/harness` instance, not just the fake-engine test path: built and ran
the actual `harness`/`harness-engine` containers, confirmed
`GET /api/health` → `modelStatus: ready`, then drove the real
`/api/enroll` → `/api/chat` flow directly (curl) with `qwen3:0.6b` and
confirmed the streamed SSE frames (`token`/`done`, no reasoning
bleed-through) match `harness-client.ts`'s parsing exactly. A full
browser-level login-and-chat pass was not possible on the verification
machine at the time — the baseline stack (`auth`/`sqld`/`runtime`) collides
on fixed container names with an already-running sibling checkout, the same
constraint noted in leg 2's PR; the service-contract-level check above was
the mitigation. Scope-creep audit: grepped the whole `plugins/warden` tree
for tool/handoff/voice/floating-button reachability and for any SDK import
beyond `sdk.auth` — none found.

**Follow-up verification (2026-08-14):** the container-name collision was
worked around with a local, uncommitted Compose override
(`container_name: !reset null` on every service, letting Compose fall back
to project-prefixed naming), unblocking the full browser-level pass this
task's own review checklist calls for: register → login → Console → activate
Warden → set access to Everyone → open `/warden` → send a real message →
confirm a real streamed response from `qwen3:0.6b`. That pass surfaced a
real gap in this leg's own delivery: `.dockerignore`'s `plugins/*/`
blanket-ignore was never updated to whitelist `plugins/warden/` (unlike
`account`/`console`/`launcher`), so every Docker build — dev and prod alike
— silently dropped the plugin from its build context; Warden worked under
`pnpm dev` and passed CI but never appeared in a Docker-built instance.
Fixed in [PR #457](https://github.com/sovereignfs/sovereign/pull/457). A
second, unrelated pre-existing bug was also found and fixed along the way:
`apps/auth`'s Docker image crashed on boot on Apple Silicon/musl hosts with
a missing `@libsql/linux-arm64-musl` native binding (three-layer root
cause: `pnpm-workspace.yaml` lacked `supportedArchitectures`, Next's file
tracer couldn't see `@neon-rs/load`'s dynamic `require()`, and pnpm's
isolated `node_modules` layout was missing a symlink even after the raw
package files landed) — fixed in
[PR #456](https://github.com/sovereignfs/sovereign/pull/456).

---

#### 📋 22.4 — Warden model provider registry and discovery

**Goal:** Let a user configure their own OpenAI-API-compatible model
provider(s) and see a merged, live model list — their providers plus
`apps/harness`'s local model when it's reachable — with nothing beyond
`sdk.secrets` as the storage mechanism for keys.

**Deliverables:**

- `warden_providers` table (`sdk.db`, tenant + user scoped): label, base
  URL, and an `sdk.secrets` ref id. The raw API key is never a column in
  this table — only the ref.
- Provider CRUD using `sdk.secrets.create({ scope: 'user', ... })` /
  `.get()` / `.update()` / `.delete()` (RFC 0043) — no manifest permission
  needed for `user`-scoped secrets, no new secret-storage mechanism.
- Model discovery: `GET {baseUrl}/models` per configured provider
  (OpenAI-compatible shape), with a per-provider unreachable/auth-failure
  state that doesn't fail the whole list.
- Fold in `apps/harness`'s existing health/model-ready check as a
  distinct, clearly-labeled "local" entry when available — reuse the
  existing enrollment-token client (`harness-client.ts`); no changes to
  `apps/harness` itself.
- First-run setup UI: an empty state when no provider is configured and no
  local model is available, distinct from an ordinary chat view.
- Explicit model selection (a default, changeable) — no automatic/silent
  fallback between providers or models.

**Dependencies:** None new — `sdk.secrets` (RFC 0043) and `apps/harness`
(task 22.2) already exist.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- A provider's API key is never present in a client-visible payload, prop,
  or log line — verified by checking, not assumed from the code path.
- Deleting a provider also deletes its `sdk.secrets` row in the same
  action; nothing outlives its owning row.
- A single unreachable/misconfigured provider degrades only that
  provider's entry — it does not break the rest of the model list or the
  local-engine entry.
- `apps/harness` being unreachable results in "local option not offered,"
  not an error state.

---

#### 📋 22.5 — Warden persisted chat, incognito mode, and re-enable

**Goal:** Move Warden from ephemeral-only to a single persisted
conversation per user by default, add an incognito toggle that preserves
the original ephemeral behavior as an opt-in, and re-enable the plugin.

**Deliverables:**

- `warden_conversation`/`warden_messages` tables (RFC 0063 §3) — one
  conversation row per user in this phase, modeled as a real entity so a
  future multi-thread UI doesn't require a migration.
- Chat persists by default: both sides of each exchange are written to
  `warden_messages`, tagged with the provider/model used.
- Incognito toggle: a fresh, separate, never-persisted scratch context —
  not a pause of the persisted thread — reusing the existing ephemeral
  request/response shape (`harness-client.ts`'s current behavior)
  unchanged.
- Request limits carried forward from the first rewrite (max input
  characters, max output tokens, concurrency cap), plus a new max-recent-
  turns context guard so a persisted thread with no length cap doesn't
  exceed a model's context window.
- `warden_providers`/`warden_conversation`/`warden_messages` wired into the
  existing plugin portability hooks
  (`sdk.portability.provideExport`/`provideDelete`) so account export/
  deletion covers chat history like any other plugin's data.
- Remove `plugins/warden/manifest.json`'s `disabled: true` once the above
  is verified end to end against a real configured provider — not just
  the fake-engine/mock test path.

**Dependencies:** Task 22.4 (a provider/model must be selectable before a
conversation about it can persist).

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- A user can close the browser, come back, and see their prior
  conversation — against a real provider, not just a mock.
- Toggling incognito on, chatting, and toggling it off (or reloading)
  leaves zero trace in `warden_messages`.
- No tool call, task handoff, or cross-plugin action is reachable from
  Warden after re-enabling — same scope-creep check task 22.3 already
  established; verify by trying to find one, not just by reading the diff.
- Account data export/deletion covers Warden's conversation data, or
  deliberately and visibly excludes it — not silently missing it.
- `disabled: true` is removed only after a real end-to-end pass, not
  merely a green CI run.

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
- **Multi-threaded conversations** (a thread list/switcher) — task 22.5
  ships one persisted thread per user; the data model doesn't block adding
  more, but the UI to manage them is undesigned.
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
- Provider credentials always route through `sdk.secrets` — never a
  plugin-local secret column, never `sdk.crypto` field encryption (RFC
  0063's Alternatives already settled why).

## Related RFCs

- [RFC 0063 — Warden: core assistant platform plugin and harness engine](../rfcs/0063-core-assistant-jarvis.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md) — the storage mechanism for provider API keys (task 22.4)
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
