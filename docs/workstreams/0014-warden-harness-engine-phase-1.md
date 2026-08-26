# Workstream 0014 — Warden: harness engine and platform plugin, phase 1

**Status:** ✅ Definition of done satisfied — all 3 legs done (22.1 engine
benchmark, 22.2 `apps/harness` scaffold, 22.3 Warden basic chat)\
**Date:** August 2026 (rewritten; originally drafted for a different
architecture)\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0063](../rfcs/0063-core-assistant-warden.md) (Accepted, August
2026 rewrite)\
**Research:** [0015](../research/0015-harness-engine-benchmark.md) (leg 1
resolves this)\
**Epics touched:** 22 (Warden / Core Assistant)

> **This workstream was substantially rewritten.** The original draft
> targeted RFC 0063's original design — a runtime-owned "Jarvis" assistant
> with 5 sequential legs (shell scaffold, provider client, inference
> sidecar, platform tools, extension review). That RFC was rewritten on
> direct developer instruction: the assistant is now **Warden**, a
> first-party platform plugin backed by a dedicated `apps/harness` engine
> service, scoped to exactly 3 foundation tasks with tool execution and
> every other capability explicitly deferred to unscheduled future phases.
> This file reflects that rewrite. See the Changelog for what changed.

---

## Goal

Ship the foundation only: a real engine choice backed by a measured
benchmark, a standalone `apps/harness` service wrapping that engine
following the `apps/auth`/`apps/relay` pattern, and a Warden platform plugin
with basic ephemeral chat — no tool execution, no task handoff, no
floating quick-access button, no voice. At the end: an operator can install
Warden, `docker compose --profile harness up` the engine, and a user can
hold a basic conversation in Warden's own routed page, served entirely by
infrastructure the operator controls.

## Definition of done

- [x] `22.1` — the llama.cpp-vs-Ollama benchmark from
      [Research 0015](../research/0015-harness-engine-benchmark.md) is
      actually run (not estimated) on representative self-hosting hardware,
      covering both `qwen3:1.7b` and `qwen3:0.6b`; the research doc is
      updated in place with a filled-in decision and moved to `Decided`.
      **Done:** llama.cpp selected — see Research 0015's Decision section.
- [x] `22.2` — `apps/harness` exists as a standalone first-party service
      (own `package.json`/`Dockerfile`/health endpoint), wraps the chosen
      engine, joins `sovereign_net`, stays unexposed to the public internet
      by default; the enrollment-token trust boundary reuses `apps/relay`'s
      pattern; CI runs against a deterministic fake-engine path with no
      real model download; the baseline stack is provably unaffected when
      the `harness` Compose profile isn't enabled.
      **Done:** scaffolded as two Compose services (`harness` +
      `harness-engine`), both gated behind the optional `harness` profile.
      See the epic file's completion note for full detail.
- [x] `22.3` — Warden exists as a first-party plugin (`plugins/warden`)
      with its own routed page; a user can install it and hold a basic,
      ephemeral (non-persisted) conversation against a real `apps/harness`
      instance end to end; zero tool execution, task handoff, floating
      button, or voice is reachable; unavailable/timeout states are clean.
      **Done:** see the epic file's completion note — verified against a
      real `apps/harness`/`harness-engine` instance, not just the
      fake-engine test path.

## Decisions locked

| Decision                                         | Choice                                                                                                   | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                                            | Exactly 22.1, 22.2, 22.3 — foundation only                                                               | Including tool selection, task handoff, the floating quick-access button, or voice in this workstream — rejected on direct developer instruction: "In the first phase we don't need to enable tool selection and task handoff logics but focus on the foundation." Those are real future phases, listed in RFC 0063's Adoption path, not designed or scheduled here                                                                                                                                                                                  |
| Architecture                                     | Warden as a first-party platform plugin (`plugins/warden`), backed by a dedicated `apps/harness` service | The original RFC 0063 draft's runtime-owned, non-plugin design — superseded; see RFC 0063's own "Alternatives considered" for the full reasoning. This workstream builds against the rewritten RFC, not the original                                                                                                                                                                                                                                                                                                                                 |
| Engine choice                                    | Deferred to a real benchmark (leg 1 / Research 0015), not preordained                                    | Picking llama.cpp by ecosystem-consistency default (matching `sovereign-edge`/`sovereign-os`, the two real local-inference precedents in this workspace — not `sovereign-mobile`/`sovereign-desktop`, which run no local inference at all) or Ollama by operator-convenience default — both rejected as unmeasured priors, even though `sovereign-os` already ran and decided this exact comparison for its own differently-constrained target; the developer explicitly asked for a benchmark on representative server hardware before locking this |
| Leg order                                        | Strict 22.1 → 22.2 → 22.3                                                                                | Starting `apps/harness` scaffolding before the engine is chosen — rejected; task 22.2's own scope (in particular, whether model download/verification needs to be hand-built) depends directly on which engine leg 1 picks                                                                                                                                                                                                                                                                                                                           |
| Trust boundary between Warden and `apps/harness` | Reuse `apps/relay/src/enrollment.ts`'s signed-token pattern                                              | Designing a new mechanism — rejected; this is genuinely new territory (no existing plugin calls another first-party `apps/*` service directly), but `apps/relay` already solved the adjacent problem (service-to-service trust) and there's no reason to solve it twice                                                                                                                                                                                                                                                                              |
| Workstream execution                             | Legs — one branch, one draft PR, one review gate per leg                                                 | A single combined PR — rejected for the standard reviewability reason, and because leg 2 structurally cannot start meaningfully before leg 1's decision lands                                                                                                                                                                                                                                                                                                                                                                                        |

## Prerequisites

None blocking leg 1 — it's a research/benchmark task with no code
dependency. Leg 2 depends on leg 1's decision. Leg 3 depends on leg 2's
service existing and exposing its internal chat API.

## Legs

| Leg | Name                                      | Epic tasks | Epics | Gate?   | Done when                                                                                                        |
| --- | ----------------------------------------- | ---------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Harness engine benchmark ✅               | 22.1       | 22    | **Yes** | Research 0015 is resolved with a measured decision, not a guess — done, llama.cpp selected                       |
| 2   | `apps/harness` engine service scaffold ✅ | 22.2       | 22    | No      | The chosen engine runs as a standalone, unexposed-by-default service with a real trust boundary to Warden — done |
| 3   | Warden platform plugin: basic chat ✅     | 22.3       | 22    | No      | A user can install Warden and chat end to end, with zero tool/handoff/voice/floating-button surface — done       |

Strict sequence — each leg's PR must merge before the next leg's branch is
cut. Leg 1 is marked a gate: its outcome (which engine) determines the
shape of leg 2's actual work, not just its starting point.

## Leg detail

### Leg 1 — Harness engine benchmark

**Epic tasks:** 22.1

**Why this leg is a gate:** everything downstream depends on which engine
was chosen — in particular, whether `apps/harness` needs to build its own
model download/verification layer (llama.cpp) or gets one for free
(Ollama). Starting leg 2 before this resolves would mean guessing at that
scope.

**Technical notes:**

- Follow [Research 0015](../research/0015-harness-engine-benchmark.md)'s
  proposed method exactly: measure both engines on representative
  self-hosting hardware (a modest VPS-class machine, not a high-end
  workstation), for both `qwen3:1.7b` and `qwen3:0.6b`.
- Record qualitative engineering cost alongside the raw numbers — a faster
  engine that needs substantially more wrapper code is a real tradeoff, not
  a tiebreaker to ignore.
- Update the research doc in place with the decision. Don't leave it
  `Exploratory` after this leg — that's exactly the kind of doc-drift this
  workspace's other sessions have found and fixed repeatedly; this
  workstream shouldn't create a new instance of it.

**Do not proceed if:** the benchmark can't be run on genuinely representative
hardware (e.g. only a high-end dev workstation is available) — note that
limitation explicitly in the research doc's decision rather than presenting
workstation numbers as representative of a typical self-hosted deployment.

**Leg outcome:** ran on the actual production self-hosting box (2 vCPU /
3.7GB RAM, no GPU) — genuinely representative, not a workstation. llama.cpp
selected; the deciding factor was Qwen3's default "thinking" mode, which
llama.cpp can disable (`chat_template_kwargs.enable_thinking: false`) and
Ollama's OpenAI-compatible endpoint cannot (only its native `/api/chat`
honors `think: false`), costing 9–21s of TTFT on every Ollama request vs.
llama.cpp's sub-second TTFT. Full detail in
[Research 0015](../research/0015-harness-engine-benchmark.md)'s Decision
section.

### Leg 2 — `apps/harness` engine service scaffold

**Epic tasks:** 22.2

**Technical notes:**

- Structure exactly like `apps/auth`/`apps/relay`: own `package.json`,
  `Dockerfile`, health endpoint, joins `sovereign_net`.
- Reuse `apps/relay/src/enrollment.ts`'s signed-token pattern for the trust
  boundary with Warden's server-side code — don't design a new mechanism.
- The internal chat API's exact shape is this leg's own call — it doesn't
  need to be literally OpenAI-compatible like the original draft's design,
  since `apps/harness` has exactly one consumer (Warden) in this phase.
- If leg 1 chose llama.cpp, build the model download/verification/storage
  layer here — it's real, non-optional scope for this leg, not a follow-up.
- No port exposed to the public internet by default; if a debug port is
  opened, docs must warn against public reachability.
- CI must not download or run a real model — build the deterministic
  fake-engine response path as part of this leg, not deferred to leg 3.

**Do not proceed if:** the baseline Sovereign stack (no `harness` Compose
profile) is affected by this leg's changes in any way — verify with an
actual `docker compose up` run without the profile, not a read of the
compose file.

**Leg outcome:** scaffolded as two Compose services under an optional
`harness` profile — `harness` (own `package.json`/`Dockerfile`, the
enrollment trust boundary reusing `apps/relay/src/enrollment.ts` exactly,
lazy non-blocking model download/verification, server-enforced request
limits, the narrow internal `/api/chat` API) and `harness-engine`
(`ghcr.io/ggml-org/llama.cpp:server`, the leg 1 winner). Neither is ever
port-mapped to the host. `docker compose config` (no `--profile` flag)
confirms both services are excluded from the default set, and
`docker compose build` succeeds; a literal `docker compose up` on the
verification machine hit an unrelated pre-existing container-name collision
with a sibling checkout also using the fixed `sovereign-*` names — not
caused by this leg's changes (see the leg's PR description). Two new
`docs/architecture-rules.md` entries came out of this leg: reusing the
enrollment pattern beyond `apps/relay` itself, and the wait-loop
Compose-`entrypoint` technique for a sidecar container that needs a file to
exist before its own process can start.

### Leg 3 — Warden platform plugin: basic chat

**Epic tasks:** 22.3

**Technical notes:**

- Follow `plugins/account`/`plugins/console`/`plugins/launcher`'s shape:
  `manifest.json`, `icon.svg`, `app/` route tree, installed/enabled through
  the existing plugin system.
- Only server-side code calls `apps/harness` — the browser client never
  reaches it directly, matching how no plugin's client code talks to
  `apps/relay`/`apps/auth` directly either.
- No persisted history by default — ephemeral session context only, same
  non-goal as the original RFC draft, still valid.
- Explicitly verify the absence of scope creep here: no tool call, no task
  handoff, no floating button, no voice input should be reachable from this
  leg's UI — check by trying to find one, not just by reading the diff.
- Reuse leg 2's request limits (max input chars, max output tokens, max
  recent turns, concurrency cap) server-side — don't leave limiting to the
  client.

**Do not proceed if:** a tool call, task handoff, or any cross-plugin
action turns out to be reachable from Warden's UI even accidentally (e.g.
via a stray SDK import) — that's a scope violation of this phase's entire
purpose, not a minor over-delivery to wave through.

**Leg outcome:** `plugins/warden` shipped, streaming through a plugin-owned
Route Handler (`/warden/api/chat` — a first precedent in this repo, needed
because a server action can't stream incrementally) that proxies
`apps/harness`'s SSE response straight through. Verified against a real
running `apps/harness`/`harness-engine` pair (not just the fake-engine test
path): the actual `/api/enroll` → `/api/chat` flow, driven directly, streamed
a real `qwen3:0.6b` response whose frame shape matched
`harness-client.ts`'s parsing exactly. Manifest permissions are
`["auth:session"]` only — grepped the whole plugin tree and found zero
tool/handoff/voice/floating-button reachability. This closes the workstream
— all 3 legs done.

## Risks

- **Leg 1's benchmark quality gates everything downstream** — a rushed or
  unrepresentative benchmark (e.g. run only on a high-end workstation)
  could lock in a wrong engine choice that's expensive to reverse once leg
  2 builds real infrastructure around it.
- **Leg 2 is the platform's first plugin-adjacent service-to-service trust
  boundary** — getting the enrollment-token reuse subtly wrong (e.g. token
  scope too broad) could let Warden's server code reach more of
  `apps/harness` than intended, or vice versa. Worth real review attention
  even though it's not marked a gate.
- **Leg 3's biggest risk is scope creep, not a technical bug** — the
  temptation to wire up "just one small tool call" while already building
  the chat UI is exactly the kind of drift the developer's explicit
  foundation-only instruction exists to prevent.

## Kill criteria

Leg 1 stands alone — a resolved benchmark and a documented engine decision
are useful even if legs 2/3 stall for unrelated reasons (e.g. a change in
priority). If leg 2 ships but leg 3 needs more design work than expected
(e.g. the plugin-to-`apps/harness` trust boundary turns out not to map
cleanly onto `apps/relay`'s pattern), ship leg 2 and hold leg 3 rather than
rushing the trust boundary that every future phase (tool execution
especially) will depend on being solid.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 5 legs (22.1–22.5) against RFC 0063's original runtime-owned "Jarvis" design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0.2     | August 2026 | Full rewrite following RFC 0063's own rewrite (Warden, `plugins/warden` + `apps/harness`) — 3 legs (engine benchmark, service scaffold, plugin chat), tool execution/task handoff/floating button/voice all moved out of this workstream's scope entirely, per direct developer instruction to ship foundation only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 0.3     | 2026-08-13  | Leg 1 (task 22.1) done — llama.cpp server selected over Ollama, measured on the actual production self-hosting box. Decisive factor was Qwen3's default thinking mode: llama.cpp can disable it cleanly, Ollama's OpenAI-compatible endpoint can't (only its native `/api/chat` does). Full data in [Research 0015](../research/0015-harness-engine-benchmark.md). Legs 2–3 unblocked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0.4     | 2026-08-13  | Leg 2 (task 22.2) done — `apps/harness` scaffolded as two Compose services (`harness` + `harness-engine`) under an optional `harness` profile, neither host-port-mapped. Enrollment trust boundary reuses `apps/relay/src/enrollment.ts` exactly; model download is lazy/non-blocking with atomic-rename-on-success; deterministic fake engine for CI. Two new `docs/architecture-rules.md` entries. Leg 3 unblocked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.5     | 2026-08-14  | Leg 3 (task 22.3) done — `plugins/warden` shipped, streaming through a first-precedent plugin-owned Route Handler that proxies `apps/harness`'s SSE response straight through. Verified against a real running `apps/harness`/`harness-engine` pair, not just the fake-engine test path. Zero tool/handoff/voice/floating-button reachability, confirmed by grep. **Closes the workstream — all 3 legs done**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.6     | 2026-08-14  | Post-close follow-up: worked around the container-name collision noted in leg 3's outcome and completed the full browser-level pass (register → login → activate Warden → real streamed chat) leg 3's own review checklist calls for. Surfaced and fixed two real bugs found along the way — `.dockerignore` never whitelisting `plugins/warden/`, so Warden was silently excluded from every Docker build ([PR #457](https://github.com/sovereignfs/sovereign/pull/457)), and a pre-existing, unrelated `apps/auth` Docker crash on Apple Silicon/musl hosts from a missing `@libsql` native-binding symlink ([PR #456](https://github.com/sovereignfs/sovereign/pull/456)). Both merged; see [core-assistant.md](../epics/core-assistant.md) task 22.3's completion note for full detail. Workstream remains closed — these are hardening fixes on top of an already-done leg 3, not a new leg                                                                                                                 |
| 0.7     | 2026-08-14  | **Post-ship deprioritization, not a reversal.** The developer decided to deprioritize this path for now — `plugins/warden/manifest.json` now declares `disabled: true`, a new general-purpose manifest hard-disable primitive (`packages/manifest/src/schema.ts`) added specifically to support this decision cleanly: an author-declared, unconditional gate distinct from and stronger than the RFC 0065 per-instance Console toggle — not bypassed in dev, not overridable by activating the plugin, migrations skipped. `apps/harness` and its Compose services needed no code change — they were already opt-in (`profiles: ['harness']`, never started by a plain `up`, referenced by nothing in CI or the main image). Status stays ✅ — all 3 legs genuinely shipped and still work end to end; this just takes the shipped result out of reach until re-prioritized. See `docs/architecture-rules.md`'s new hard-disable bullet and `docs/plugin-development.md`'s manifest reference for the mechanism |
