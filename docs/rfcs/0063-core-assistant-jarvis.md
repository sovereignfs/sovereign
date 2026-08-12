---
rfc: 0063
title: Warden — core assistant platform plugin and harness engine (formerly "Jarvis")
status: Accepted
date: August 2026 (rewritten; originally drafted July 2026)
author: kasunben
scope: >
  apps/harness (new), plugins/warden (new), docker-compose.yml,
  docker-compose.prod.yml, docs/self-hosting.md, docs/architecture-rules.md;
  builds on RFC 0005, RFC 0021, RFC 0034, RFC 0047, RFC 0055; RFC 0040
  (Sovereign Harness) is flagged pending revisit — see "Relationship to the
  Harness roadmap" below
incorporated_into_plan: 'Yes - epic tasks 22.1-22.3'
---

# RFC 0063 - Warden: core assistant platform plugin and harness engine

> **This RFC was substantially rewritten in August 2026.** The original
> version (July 2026, "Jarvis") proposed a runtime-owned, non-plugin
> implementation with an optional `apps/inference` sidecar. That design is
> superseded — see "Alternatives considered" for what changed and why. This
> revision reflects a direct architectural decision from the developer
> (kasunben), accepted in the same change that produced this rewrite.

## Summary

Add **Warden**, a first-party platform plugin providing Sovereign's built-in
workspace assistant — its own routed space, basic conversational chat, no
persisted history by default. Warden is backed by a new dedicated service,
**`apps/harness`**, built on the same architectural pattern as `apps/auth`
and `apps/relay`: a standalone first-party app with its own Dockerfile,
health checks, and a signed trust boundary to the rest of the platform —
wrapping a local inference engine (llama.cpp or Ollama; the choice is
gated on a real benchmark, see [Research 0015](../research/0015-harness-engine-benchmark.md)).

**This RFC's scope is phase 1 only: the foundation.** No tool execution, no
task handoff, no floating quick-access button, no voice — those are explicit
future phases, listed but not designed in detail here. Phase 1 ships a
working chat surface and nothing more, on the developer's own instruction to
"focus on the foundation" before extending capability.

No model weights are bundled into any image. The engine is unexposed to the
public internet by default.

## Motivation

Sovereign is a self-hostable workspace runtime. Even before any tool
execution or orchestration exists, users benefit from a small always-available
assistant that can hold a basic conversation inside their own instance,
served entirely by infrastructure the operator controls.

Warden is deliberately named to claim the direction Sovereign's assistant
roadmap is heading: `apps/harness` is meant to become the technical
foundation the **Sovereign Harness** product direction (RFC 0040) eventually
runs on, not a differently-named thing that happens to sit next to it. RFC
0040 itself needs a revisit in light of this RFC's architecture — see
"Relationship to the Harness roadmap" below. This RFC does not attempt that
revisit; it only flags it.

This design keeps Sovereign's privacy-first posture. The engine runs on the
operator's own server. No external provider is enabled by default, and no
model weights are bundled into any image.

## Current state

- `apps/auth` and `apps/relay` are the existing precedent for a standalone,
  first-party Next.js service with its own `Dockerfile`, health checks, and
  a signed trust boundary to the rest of the platform
  (`apps/relay/src/enrollment.ts` implements an HMAC-signed enrollment-token
  pattern for exactly this kind of internal service-to-service trust — the
  template to reuse for `apps/harness` rather than inventing a new
  mechanism).
- `plugins/account`, `plugins/console`, and `plugins/launcher` are the
  existing precedent for a first-party platform plugin: a `manifest.json`,
  an `app/` routed page tree, install/enable through the existing plugin
  system, no bespoke runtime-owned config or settings UI needed. Warden
  follows this pattern rather than the original draft's runtime-owned
  `runtime/src/assistant/` design.
- Plugins must not import runtime internals; the SDK is the only
  plugin-to-platform contract (`docs/architecture-rules.md:7`). Warden's
  server-side code reaches `apps/harness` over the internal Docker network
  the same way any first-party app reaches another — not through the SDK,
  and not by importing runtime internals. The exact sanctioned mechanism for
  a plugin calling another first-party `apps/*` service directly is new
  territory (existing plugins only ever call through the SDK) — see "Open
  questions."
- Docker development currently runs `mailpit`, `auth`, and `runtime` on the
  shared `sovereign_net` network (`docker-compose.yml:12`). `apps/harness`
  joins the same network and stays unexposed to browsers by default, same
  posture as the original draft's `apps/inference` sidecar.
- `sovereign-edge` (fully offline mobile AI app) and `sovereign-os`
  (Raspberry Pi appliance OS) — both separate repos in this workspace — are
  the two that actually run local inference, both on `llama.cpp`.
  `sovereign-mobile` and `sovereign-desktop` are unrelated thin
  Capacitor/Tauri shells around a self-hosted instance's web UI; neither
  runs any local model. `sovereign-os` in particular already ran a real,
  decided llama.cpp-vs-Ollama benchmark for its own (differently
  constrained) target — see
  [Research 0015](../research/0015-harness-engine-benchmark.md) for the
  specifics and why that result doesn't transfer automatically to a
  general self-hosted server deployment.
- Ollama exposes OpenAI-compatible `/v1/chat/completions` endpoints with
  streaming, JSON mode, and tool support
  ([OpenAI compatibility docs](https://docs.ollama.com/api/openai-compatibility)),
  and the `qwen3:1.7b`/`qwen3:0.6b` model pair remains a reasonable small
  default profile regardless of which engine wraps them
  ([qwen3 library](https://ollama.com/library/qwen3)).
- llama.cpp server provides a lightweight, OpenAI-compatible chat server
  with JSON/schema-constrained output and function/tool support
  ([llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)),
  making either engine viable as `apps/harness`'s wrapped implementation.

## Proposed design

### 1. Naming and boundaries

| Layer            | Name                         | Meaning                                                                                                                                           |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin / product | **Warden**                   | User-facing platform plugin: chat UI, its own routed space. Formerly "Jarvis."                                                                    |
| Engine service   | **`apps/harness`**           | Dedicated backend service wrapping the local inference engine. Deliberately named after the Sovereign Harness product direction — see Motivation. |
| Broader roadmap  | Sovereign Harness (RFC 0040) | The future advanced orchestration product `apps/harness` is meant to grow into. Pending revisit.                                                  |

Code paths:

```text
apps/harness/
  package.json
  Dockerfile
  src/
    engine/           # llama.cpp or Ollama wrapper — see Research 0015
    enrollment.ts      # trust boundary with plugins/warden, relay-pattern HMAC
    api/               # internal-only chat completion endpoint
plugins/warden/
  manifest.json
  icon.svg
  app/
    page.tsx           # Warden's own routed space
    _components/
```

Do not reuse `assistant`/`Jarvis` naming anywhere in new code — this
revision replaces both. `agent` remains reserved for advanced AI systems
(the eventual Harness/Council direction), matching the original draft's
reasoning on that point, which still holds.

### 2. Product scope — phase 1 (this RFC)

Warden v1 (phase 1) supports:

- basic conversational chat with short, ephemeral context;
- Warden's own routed plugin page (not a shell-chrome drawer or overlay —
  that's a future-phase decision, see Open questions);
- install/enable through the existing plugin system — no bespoke
  `ASSISTANT_ENABLED`-style env gate; ordinary plugin install/entitlement
  mechanics apply;
- health/unavailable states when `apps/harness` is unreachable or
  misconfigured.

Warden v1 explicitly does **not** support, on the developer's direct
instruction to keep this phase foundation-only:

- tool selection or tool execution of any kind;
- task handoff to other plugins;
- a floating quick-access action button reachable from any screen;
- voice input or output;
- durable chat history by default (same non-goal as the original draft —
  ephemeral context only, no persistence without a later opt-in design);
- per-user preferences beyond ordinary plugin visibility rules;
- external model providers by default.

All of the above are real, intended future phases — listed under "Adoption
path" below — not rejected ideas. They are out of scope for what this RFC
commits to building now.

### 3. Warden platform plugin

Warden is a first-party plugin, not runtime-owned code — a direct reversal
of the original draft's design (see "Alternatives considered"). It follows
the `plugins/account`/`plugins/console`/`plugins/launcher` shape: a
manifest, an `app/` route tree, and installation/enablement through the
existing plugin system rather than a parallel runtime-owned settings
surface.

Warden's server-side route/action code calls `apps/harness` directly over
the internal network — it does not go through the SDK for this, since the
SDK is the plugin-to-_platform_ contract and `apps/harness` is a sibling
first-party service, not a platform capability. The client (browser) side
of Warden never talks to `apps/harness` directly; every request is proxied
through Warden's own server-side code, matching how no plugin's client code
talks to `apps/relay` or `apps/auth` directly either.

Warden gets **no privileged runtime access beyond an ordinary plugin** in
this phase — it has no tools to call, so there is nothing to be privileged
about yet. When phase 2 (tool selection) is designed, the intended answer is
that Warden becomes the first, flagship consumer of RFC 0047's plugin tool
contracts like any other plugin would — not a runtime-level bypass. This is
a locked decision for this RFC even though the tool-selection design itself
is out of scope; it exists to keep phase 2 from quietly reopening a
privilege-escalation question phase 1 already answered.

### 4. `apps/harness` engine service

A standalone first-party Next.js service, structurally identical to
`apps/auth`/`apps/relay`: own `package.json`, own `Dockerfile`, own health
endpoint, joins `sovereign_net`, never exposed to the public internet by
default.

It wraps exactly one local inference engine — **llama.cpp or Ollama, decided
by [Research 0015](../research/0015-harness-engine-benchmark.md)'s
benchmark**, not preordained by this RFC. Whichever engine wins, `apps/harness`
exposes an internal-only chat completion API to Warden's server-side code.
Whether that internal API is literally OpenAI-compatible (as the original
draft specified) or a narrower purpose-built contract is left to the
implementation task, since `apps/harness` has exactly one consumer (Warden)
in this phase, unlike the original design's "any OpenAI-compatible endpoint,
any consumer" framing.

Trust boundary: `apps/harness` and Warden's server-side code authenticate
each other using the same signed-enrollment-token pattern `apps/relay`
already implements (`apps/relay/src/enrollment.ts`) — reused, not
reinvented.

Default model profile follows the original draft's recommendation
regardless of engine choice:

```jsonc
{
  "model": "qwen3:1.7b",
  "fallbackModel": "qwen3:0.6b",
  "purpose": "Warden default local chat profile",
  "notes": [
    "Small enough for low-resource self-hosting.",
    "Model weights are pulled by the operator or the harness engine at boot — see Open questions.",
  ],
}
```

### 5. Docker and deployment

The baseline Sovereign stack must remain unchanged when Warden/`apps/harness`
isn't in use. Development Compose adds an optional profile:

```yaml
services:
  harness:
    profiles: ['harness']
    build:
      context: .
      dockerfile: apps/harness/Dockerfile
    container_name: sovereign-harness
    volumes:
      - sovereign_harness_models:/models
    networks:
      - sovereign_net
```

Production Compose offers the same optional profile, with no port exposed
to the public internet by default — if an operator exposes one for
debugging, docs must warn against public reachability, matching the
original draft's stance.

Non-Docker deployments should be able to run `apps/harness` as its own
process, same as `apps/auth` already supports today.

### 6. Failure modes and limits

| State                                        | Expected behavior                                             |
| -------------------------------------------- | ------------------------------------------------------------- |
| Warden not installed                         | No entry point exists — ordinary plugin-uninstalled behavior. |
| Warden installed, `apps/harness` unreachable | Chat page shows an unavailable state; no infinite retry loop. |
| Model missing on the engine                  | Health state surfaces a clear "model not pulled" message.     |
| Engine timeout                               | Request fails with a retry affordance.                        |

Runtime limits carried forward unchanged from the original draft's
reasoning: request timeout, max input characters, max output tokens, max
recent turns, a concurrency cap. CI must not download or run a real model —
a deterministic fake engine response is required for tests, same principle
as the original draft's fake-provider requirement.

### 7. Relationship to the Harness roadmap

This is the one section where this RFC deliberately does **not** resolve
everything, and says so:

- RFC 0040 (Sovereign Harness) currently describes Harness as a plugin
  living in "a separate first-party repository" and names RFC 0063's
  original runtime-owned design as its prerequisite "first runtime phase."
  Both of those statements are now stale: this RFC's Warden is a plugin
  living **in this monorepo** (`plugins/warden`), not runtime-owned code,
  and not a separate repo.
- Whether Sovereign Harness (RFC 0040) ends up **being** `apps/harness` +
  Warden extended with memory/orchestration/tool-routing, or whether it
  remains a genuinely separate, later product built on top of this
  foundation, is an open design question RFC 0040 needs to answer on its
  own revisit — not decided here.
- A short pending-revisit note has been added to RFC 0040 itself pointing
  back here. The actual revisit is future work, out of this RFC's scope.

### 8. Packages and shared code

Same conservative stance as the original draft: keep everything inside
`apps/harness` and `plugins/warden` for phase 1. Don't extract a
`packages/*` shared contract until at least a second consumer needs the same
abstraction — premature extraction was already a rejected pattern in the
original draft and remains one here.

## UI flows

### Basic user chat

1. User navigates to Warden's own routed page (installed plugin, ordinary
   plugin visibility rules apply).
2. Warden starts with no durable history.
3. User asks a question.
4. Warden's server-side code calls `apps/harness` over the internal
   network, authenticated via the enrollment-token pattern.
5. Warden displays the response, or an unavailable/timeout state if
   `apps/harness` can't be reached.

## Alternatives considered

### Keep the assistant runtime-owned, not a plugin (the original v1 design)

**Superseded, August 2026.** The original draft kept the assistant inside
`runtime/src/assistant/` specifically because it worried a plugin
implementation would either weaken the SDK boundary or require special
runtime privileges no other plugin has. Revisited on explicit developer
direction: Sovereign already has a working precedent for privileged
first-party plugins (Console, Account, Launcher) that get their own routed
space without runtime-embedded code, and building Warden as a plugin lets
it reuse the existing manifest/install/entitlement machinery instead of
inventing parallel runtime-owned config and settings UI. The specific
concern that motivated the original decision — privileged access ordinary
plugins don't have — is addressed differently now: phase 1 ships with zero
tool/cross-plugin access, and phase 2's eventual tool access is designed
(if not yet built) to go through RFC 0047's tool-contract model like any
other plugin, not a runtime bypass.

### Optional `apps/inference` sidecar, any OpenAI-compatible endpoint

**Superseded, August 2026.** The original draft made the engine a
loosely-coupled, swappable sidecar any operator could point the runtime at.
This revision makes `apps/harness` a dedicated, purpose-built service with
exactly one consumer (Warden), following the `apps/auth`/`apps/relay`
pattern instead — trading the original's "any compatible endpoint" openness
for the tighter operational and trust-boundary story a dedicated first-party
service gives. Operators who want a different engine/endpoint entirely are
no longer a phase-1 consideration; that flexibility could return in a later
phase if real demand appears.

### Use `Jarvis` / `assistant` naming

**Superseded, August 2026.** Renamed to Warden per direct developer
instruction. The original draft's reasoning for keeping a stable
architecture name separate from a configurable display name doesn't need to
carry forward as strongly now, since Warden is a plugin name, not a
runtime-internal architecture label — but the practice of not reusing
"agent" for this feature still holds, unchanged.

### Use llama.cpp server as the first official engine

Deferred to [Research 0015](../research/0015-harness-engine-benchmark.md).
The original draft deferred in Ollama's favor based on operator-experience
reasoning alone, without a real benchmark. This revision explicitly does
not preordain an answer — the developer asked for a measured comparison
before locking the engine choice.

### Persist chat history by default

Not revisited — still rejected for phase 1, same reasoning as the original
draft: durable history introduces storage, deletion, export, encryption,
and moderation questions phase 1 doesn't need to answer yet.

### Allow tool execution or task handoff in phase 1

Not revisited — still rejected, and more firmly so than the original draft
(which still wanted one low-risk write tool in its own phase 4). The
developer's explicit instruction for this rewrite was to ship foundation
only: chat, nothing else, in phase 1.

## Open questions

Carried forward from the original draft, resolved where this rewrite's
architecture already answers them, left open where it doesn't:

- ~~Should the assistant be visible to all users once enabled, or gated by
  a new capability?~~ **Resolved by the plugin model** — ordinary plugin
  install/visibility rules apply; no new capability needed for phase 1.
- ~~Should the first UI be a sidebar drawer, command palette, or overlay
  route?~~ **Resolved** — phase 1 is Warden's own routed plugin page, per
  the developer's explicit "own space" instruction. A shell-chrome
  quick-access surface (drawer/floating button) is a real future-phase
  question, not resolved here.
- Should `apps/harness` auto-pull the configured model on first boot, or
  should operators run an explicit pull/setup command? **Still open** —
  should be answered during the `apps/harness` scaffold task or folded into
  Research 0015.
- **New:** what is the exact sanctioned mechanism for `plugins/warden`'s
  server-side code to call `apps/harness` directly? No existing plugin
  calls another first-party `apps/*` service today — every existing
  cross-service call goes through the SDK or is between two `apps/*`
  services with no plugin involved (e.g. runtime→relay). This is genuinely
  new territory and should be nailed down concretely during the
  `apps/harness` scaffold task, reusing `apps/relay`'s enrollment pattern
  as the starting point rather than designing from scratch.
- **New:** is `apps/harness` required infrastructure the moment Warden is
  installed, or must Warden degrade gracefully to "installed but
  unreachable"? This RFC assumes graceful degradation (see Failure modes)
  but the operational default (does installing Warden imply
  `docker compose --profile harness up`, or is that a separate operator
  step?) isn't fully specified.
- **New:** is GPU passthrough in scope for any planned phase? Not phase 1;
  explicitly deferred, but worth a placeholder note since it materially
  changes `apps/harness`'s container topology if it's ever needed.

Dropped from the original draft as no longer applicable to phase 1's scope
(they were tool-execution and audit questions; phase 1 has no tools to
execute or audit):

- What is the first useful platform-owned write tool?
- Should audit events reuse the activity log or a dedicated table?
- Where does the health endpoint live?

## Adoption path

Phase 0 — RFC and docs (this rewrite):

- Accept this RFC (done, in the same change as this rewrite).
- Flag RFC 0040 (Sovereign Harness) as pending revisit.
- Add Research 0015 (engine benchmark) as an open research doc, to be
  resolved by an epic task, not by this RFC.

**Phase 1 — Foundation (epic 22, this RFC's actual scope):**

- Task 22.1 — Resolve [Research 0015](../research/0015-harness-engine-benchmark.md):
  benchmark llama.cpp vs. Ollama, lock the engine decision.
- Task 22.2 — `apps/harness` scaffold: the chosen engine wrapped in a
  standalone first-party service, Dockerfile, Compose profile,
  enrollment-token trust boundary reused from `apps/relay`.
- Task 22.3 — Warden plugin: manifest, routed page, basic ephemeral chat
  wired to `apps/harness` through Warden's own server-side code only. No
  tool execution, no persisted history.

Phase 2+ — Future, not yet scheduled as epic tasks:

- Tool selection and execution, via RFC 0047's plugin tool contracts —
  Warden as the first flagship consumer, not a privileged bypass.
- A floating quick-access action button reachable from any screen — needs
  a new shell-chrome extension point that doesn't exist today; a small
  design question of its own, not solved by this RFC.
- Voice input/output.
- Opt-in persisted chat history, with export/deletion semantics.
- Per-user preferences beyond plugin-level visibility.
- The RFC 0040 (Sovereign Harness) revisit: whether Harness becomes this
  foundation extended with memory/orchestration, or a separate later
  product built on top of it.

Semver impact:

- `apps/harness` and `plugins/warden` are new, additive workspace members —
  no breaking change to existing `@sovereignfs/sdk`/`@sovereignfs/ui`
  surfaces for phase 1.
- Docker and operator docs must be updated in the same implementation PR
  that adds the `harness` Compose profile.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft — "Jarvis," runtime-owned, optional `apps/inference` sidecar, any OpenAI-compatible endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.2     | August 2026 | Rewritten and accepted — renamed to Warden; architecture reversed from runtime-owned to a first-party platform plugin (`plugins/warden`) backed by a dedicated `apps/harness` engine service (auth/relay pattern, not a loosely-coupled sidecar); engine choice (llama.cpp vs. Ollama) deferred to a real benchmark (Research 0015) instead of preordained; tool execution, task handoff, floating quick-access button, and voice moved to explicit, undesigned future phases; phase 1 scoped to exactly 3 tasks (engine benchmark, `apps/harness` scaffold, Warden plugin with basic chat) per direct developer instruction to ship foundation only; RFC 0040 (Sovereign Harness) flagged pending revisit, not resolved here |
| 0.3     | August 2026 | Corrected "Current state": `sovereign-mobile`/`sovereign-desktop` do not run local inference (they're thin Capacitor/Tauri shells around a self-hosted instance's web UI) — the real local-inference precedents are `sovereign-edge` and `sovereign-os`, the latter having already run and decided a real llama.cpp-vs-Ollama benchmark for its own (differently constrained) target. Developer-caught error in this doc's own first draft                                                                                                                                                                                                                                                                                    |
