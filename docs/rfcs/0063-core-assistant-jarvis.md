---
rfc: 0063
title: Core Assistant, Jarvis UI, and Local Inference Sidecar
status: Draft
date: July 2026
author: kasunben
scope: >
  runtime, apps/inference, docker-compose.yml, docker-compose.prod.yml,
  docs/self-hosting.md, docs/architecture-rules.md; builds on RFC 0005,
  RFC 0021, RFC 0034, RFC 0040, RFC 0047, RFC 0055
incorporated_into_plan: 'Yes - epic tasks 22.1-22.5'
---

# RFC 0063 - Core Assistant, Jarvis UI, and Local Inference Sidecar

## Summary

Add a built-in, lightweight workspace assistant to Sovereign. The feature is
implemented as the **core assistant** in architecture and code, presented to
users as **Jarvis** by default, and powered initially by an optional local
**inference** sidecar. Jarvis is not an installable plugin and not an advanced
agent framework. It is the first runtime phase of the broader Sovereign Harness
roadmap: a platform-owned assistant layer for user-initiated workspace help,
simple conversational interactions, navigation, read-only summaries, and narrow
tool execution with deterministic validation and confirmation gates.

The default shipping model is disabled by default. Operators can enable Jarvis
globally, configure the display name, and point the runtime at an
OpenAI-compatible model endpoint. Sovereign provides an official optional
`apps/inference` sidecar path using Ollama first, with `qwen3:1.7b` as the
recommended tiny default model profile and `qwen3:0.6b` as an ultra-low-resource
fallback. No model weights are bundled into the runtime image.

## Motivation

Sovereign is a self-hostable workspace runtime. Even before full AI
orchestration exists, users benefit from a small always-available helper that
can answer basic questions, help navigate installed apps, summarize visible
workspace state, and prepare or execute simple tasks.

Jarvis is the first phase of Sovereign's Harness direction, but not the full
Harness plugin described in RFC 0040. It establishes the local-first runtime
assistant surface, model-provider boundary, and basic tool-safety pattern that
the later Harness plugin can learn from or build around. Harness remains the
advanced orchestration product: durable conversations, memory, richer provider
routing, run traces, consent-gated plugin context, and long-running workflows.
Council (RFC 0055) remains adjacent: a multi-model deliberation workspace, not
the personal assistant path.

This design keeps Sovereign's privacy-first posture. The first official
provider path is local inference on the same server. Operators may replace the
default sidecar with any compatible local endpoint, but no external provider is
enabled by default.

## Current state

- The monorepo already has a single main host package named
  `@sovereignfs/runtime`; adding another app named `platform` or `runtime` would
  conflict with existing terminology (`runtime/package.json:1`).
- The workspace already includes `apps/*`, `packages/*`, `plugins/*`, and
  `runtime` as first-class package roots (`pnpm-workspace.yaml:1`). An
  `apps/inference` package fits the current workspace shape when the sidecar
  needs scripts, model profiles, or a custom image wrapper.
- Docker development currently runs `mailpit`, `auth`, and `runtime` on the
  shared `sovereign_net` network (`docker-compose.yml:12`). A local inference
  service can join the same network and remain unexposed to browsers by
  default.
- Plugins must not import runtime internals; the SDK is the only
  plugin-to-platform contract (`docs/architecture-rules.md:7`). Jarvis lives in
  runtime core specifically because it needs shell context, authenticated user
  state, platform settings, and runtime-owned enforcement.
- New runtime API segments under `runtime/app/api/*` must be added to
  `RESERVED_API_SEGMENTS` (`docs/architecture-rules.md:134`). A future
  `runtime/app/api/assistant` implementation must update that guard.
- Runtime Docker behavior is load-bearing: standalone output, healthcheck
  conventions, named production volume, and `pnpm-workspace.yaml` copying must
  remain intact (`docs/architecture-rules.md:235`). The inference sidecar must
  be optional and must not change baseline runtime image requirements.
- Ollama exposes OpenAI-compatible `/v1/chat/completions` endpoints and supports
  streaming, JSON mode, and tools according to its
  [OpenAI compatibility docs](https://docs.ollama.com/api/openai-compatibility).
- The Ollama model library lists `qwen3:1.7b` as a 1.4GB model with a 40K
  context window and `qwen3:0.6b` as a 523MB model with a 40K context window
  ([qwen3 library](https://ollama.com/library/qwen3)). Those sizes fit the
  feature's lightweight default better than larger local models.
- llama.cpp server is a viable alternative because it provides a lightweight
  server with OpenAI-compatible chat, embeddings, JSON/schema-constrained
  output, monitoring endpoints, and function/tool use support
  ([llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)).

## Proposed design

### 1. Naming and boundaries

Use three names deliberately:

| Layer             | Name        | Meaning                                                              |
| ----------------- | ----------- | -------------------------------------------------------------------- |
| Architecture/code | `assistant` | Runtime-owned orchestration, policy, tools, context, and API routes. |
| UI/product        | Jarvis      | Default user-facing assistant label, configurable by operators.      |
| Model sidecar     | `inference` | Optional local model-serving component.                              |

The code should use boring, stable names:

```text
runtime/src/assistant/
runtime/app/api/assistant/
runtime/app/(platform)/_components/AssistantButton.tsx
runtime/app/(platform)/_components/AssistantPanel.tsx
apps/inference/
ASSISTANT_ENABLED
ASSISTANT_DISPLAY_NAME
ASSISTANT_MODEL_BASE_URL
ASSISTANT_MODEL_NAME
```

The UI should default to Jarvis:

```text
Jarvis
Ask Jarvis
Enable Jarvis
Jarvis needs confirmation
Jarvis is unavailable
```

Operators may rename Jarvis at the instance level. The display name is
presentation-only. API routes, env vars, storage keys, tests, and extension
contracts remain `assistant`.

Do not use `agent` for this core feature. In Sovereign, "agent" remains reserved
for advanced AI systems such as Harness, Council, and future long-running or
multi-step automation surfaces. Jarvis may become more capable over time, but it
is still user-initiated and policy-bound in core runtime.

### 2. Product scope

Jarvis v1 should support:

- basic conversation with short context;
- app and workspace help;
- installed-app discovery and navigation suggestions;
- current-page or current-app summaries where context is explicitly provided;
- a small runtime-owned tool set;
- tool previews;
- confirmation before mutation;
- health/status display when inference is disabled or unavailable;
- operator-level enablement and naming controls.

Jarvis v1 should not support:

- durable chat history by default;
- autonomous background work;
- arbitrary shell execution;
- browser/computer control;
- direct database writes from model output;
- plugin-authored tools;
- long-context document analysis;
- external model providers by default;
- multi-agent deliberation;
- persistent memory.

The first implementation should keep conversation context short and ephemeral.
No durable chat history is stored by default. The client may send recent turns
back to the runtime for continuity, and the runtime may keep short-lived session
state when useful, but raw chat transcripts are not persisted unless a later
opt-in history feature is designed.

### 3. Runtime assistant service

Runtime owns the assistant control plane:

```text
runtime/src/assistant/
  config.ts
  provider.ts
  openai-compatible-provider.ts
  context.ts
  tools.ts
  policy.ts
  confirmations.ts
  audit.ts
  errors.ts
```

The internal provider interface should be narrow:

```ts
interface AssistantModelProvider {
  complete(request: AssistantCompletionRequest): Promise<AssistantCompletionResult>;
  stream?(request: AssistantCompletionRequest): AsyncIterable<AssistantStreamEvent>;
  health(): Promise<AssistantProviderHealth>;
}
```

The runtime should initially implement an OpenAI-compatible provider client
against `ASSISTANT_MODEL_BASE_URL`. That keeps the assistant model-agnostic and
lets operators use Ollama, llama.cpp server, LocalAI, vLLM, LM Studio, or a
future compatible local endpoint without changing runtime code.

The model output must never be trusted directly. The deterministic flow is:

```text
user request
  -> context builder
  -> model provider
  -> parse candidate response/tool call
  -> schema validation
  -> permission check
  -> preview
  -> confirmation when required
  -> host-executed tool
  -> audit event
  -> user-visible result
```

### 4. Tool model

Jarvis tools are always platform-owned in v1. Plugins do not register tools
with Jarvis yet, and Jarvis does not become a shortcut around the SDK boundary.

Good v1 platform tools:

| Tool                     | Mode       | Notes                                                |
| ------------------------ | ---------- | ---------------------------------------------------- |
| `list_installed_apps`    | read       | Uses the same visibility rules as the launcher.      |
| `open_app`               | navigation | Returns a route/action for the shell to apply.       |
| `get_instance_summary`   | read       | Uses platform settings visible to the current user.  |
| `search_navigation`      | read       | Searches app names, settings names, and help labels. |
| `summarize_current_page` | read       | Requires explicit page context from the client.      |
| `draft_text`             | local      | No mutation; produces text for the user to apply.    |
| `prepare_notification`   | preview    | Creates a preview only; sending requires confirm.    |
| `update_user_preference` | write      | Requires confirmation and existing auth checks.      |

All writes, deletes, sends, admin changes, external calls, cross-app mutations,
and any action with durable side effects require confirmation. Read-only tools
may execute without confirmation, subject to the current user's permissions.

Tool implementations execute as the current user and tenant. They must reuse
existing runtime/API authorization paths wherever possible. Jarvis must not have
privileged runtime access that the user does not have.

Plugin-authored tools are deferred until RFC 0047 is implemented and proven.
Future plugin tool integration may allow Harness, Council, and Jarvis to share
some tool contracts, but Jarvis remains platform-owned.

### 5. Enablement and operator controls

Jarvis is disabled by default.

Initial controls should be instance-level and admin-only:

| Setting                     | Default        | Notes                                                    |
| --------------------------- | -------------- | -------------------------------------------------------- |
| `ASSISTANT_ENABLED`         | `false`        | Hard runtime gate.                                       |
| `ASSISTANT_DISPLAY_NAME`    | `Jarvis`       | Operator-facing name override.                           |
| `ASSISTANT_MODEL_BASE_URL`  | unset          | Required when enabled unless a local default is derived. |
| `ASSISTANT_MODEL_NAME`      | `qwen3:1.7b`   | Recommended Ollama model profile.                        |
| `ASSISTANT_MAX_INPUT_CHARS` | implementation | Prevents accidental large prompt submission.             |
| `ASSISTANT_MAX_TOKENS`      | implementation | Caps output size.                                        |
| `ASSISTANT_TIMEOUT_MS`      | implementation | Caps provider latency.                                   |

Console should eventually expose:

- enable/disable Jarvis;
- display name;
- provider URL;
- model name;
- provider health;
- last health error;
- max input/output settings;
- tool execution enabled/disabled.

Per-user visibility and per-user preferences are useful later, but v1 should
start with global admin enablement. If the operator disables Jarvis, runtime UI
entry points should disappear or render a disabled state without calling the
provider.

### 6. Inference sidecar

Add `apps/inference` as the optional model-serving component. It is not a
workspace app, not a plugin, and not the assistant. It is the local model data
plane.

Recommended initial shape:

```text
apps/inference/
  package.json
  README.md
  model-profiles/
    qwen3-1.7b.json
    qwen3-0.6b.json
  ollama/
    Dockerfile
    entrypoint.sh
```

The first official implementation should wrap Ollama because it has a simple
operator experience, an official Docker image, model management, and
OpenAI-compatible endpoints. The wrapper may preconfigure the default model
profile, health check, and volume paths, but it must not vendor model weights.

Default profile:

```jsonc
{
  "id": "qwen3-1.7b",
  "provider": "ollama",
  "model": "qwen3:1.7b",
  "fallbackModel": "qwen3:0.6b",
  "baseUrl": "http://inference:11434/v1",
  "purpose": "Jarvis default local workspace assistant profile",
  "notes": [
    "Small enough for low-resource self-hosting.",
    "Supports the Qwen3 family used for chat and tool-oriented workflows.",
    "Model weights are pulled by the operator or sidecar, not bundled.",
  ],
}
```

The runtime must only depend on an OpenAI-compatible HTTP contract. Operators
can replace `apps/inference` with:

- llama.cpp server for lower-level GGUF control;
- LocalAI for broader backend compatibility;
- vLLM or SGLang for larger installations;
- any local OpenAI-compatible endpoint.

### 7. Docker and deployment

Docker impact is explicit. The baseline Sovereign stack must remain unchanged
when Jarvis is disabled.

Development Compose should add an optional profile:

```yaml
services:
  inference:
    profiles: ['assistant']
    build:
      context: .
      dockerfile: apps/inference/ollama/Dockerfile
    container_name: sovereign-inference
    volumes:
      - sovereign_inference:/root/.ollama
    networks:
      - sovereign_net
```

The runtime service should receive assistant env vars only when the profile is
enabled or when the operator sets them explicitly:

```text
ASSISTANT_ENABLED=true
ASSISTANT_DISPLAY_NAME=Jarvis
ASSISTANT_MODEL_BASE_URL=http://inference:11434/v1
ASSISTANT_MODEL_NAME=qwen3:1.7b
```

Production Compose should offer the same optional profile but avoid exposing the
inference port publicly. If a port is exposed for operator debugging, the docs
must warn that inference endpoints should not be reachable from the public
internet.

Non-Docker deployments should be able to run Ollama, llama.cpp server, or
another compatible service separately and point `ASSISTANT_MODEL_BASE_URL` at
it.

### 8. Context, retention, and audit

Jarvis v1 does not persist chat history by default. The context builder may use:

- the current user identity and role;
- the current app/page label and route;
- explicitly provided page text or selected text;
- recent client-provided chat turns;
- results from read-only platform tools.

Do not silently scrape all plugin data or page DOM. Page and app context should
be explicit, narrow, and inspectable.

Audit is separate from chat history. Runtime should record high-level events for
security-relevant actions:

- assistant request started/completed/failed;
- provider used;
- tool preview generated;
- tool confirmed;
- tool executed;
- permission denied;
- timeout or provider unavailable.

Audit events should avoid raw prompt/output content by default. If a future
debug mode captures prompts, it must be operator-controlled, clearly disclosed,
and excluded from normal activity logs.

### 9. Failure modes and limits

Jarvis must handle these states cleanly:

| State                         | Expected behavior                                       |
| ----------------------------- | ------------------------------------------------------- |
| disabled globally             | Hide entry point or show admin-disabled message.        |
| provider URL missing          | Admin health shows configuration error.                 |
| inference sidecar unavailable | User sees unavailable state; no retries loop forever.   |
| model missing                 | Admin health suggests pulling configured model.         |
| provider timeout              | Request fails with retry option.                        |
| invalid tool call             | Tool is rejected and model may be asked to repair once. |
| permission denied             | User sees permission denial without leaking data.       |
| confirmation expired          | User must rerun or regenerate the preview.              |

Runtime limits should include:

- request timeout;
- max input characters;
- max output tokens;
- max recent turns;
- concurrency cap per user or instance;
- optional circuit breaker after repeated provider failures.

CI must not download or run real models. Tests should use a deterministic fake
provider.

### 10. Relationship to the Harness roadmap

Jarvis is the first runtime phase of the broader Sovereign Harness roadmap. It
is intentionally smaller than the Harness plugin and implemented in runtime
core because it needs shell context, platform-owned settings, current-user
authorization, confirmation gates, and audit behavior.

| Component      | Role                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Jarvis         | First Harness runtime phase; lightweight, local-first, user-initiated. |
| Inference      | Local model-serving sidecar used by Jarvis and possibly others.        |
| Harness plugin | Later advanced assistant/orchestration product with memory and tools.  |
| Council        | Adjacent multi-model deliberation workspace with sessions/reports.     |

This is a roadmap relationship, not a code dependency. Jarvis should not import
Harness or Council code. Harness and Council should not rely on Jarvis
internals. Future communication or shared data must use explicit contracts.
Shared AI provider packages should wait until at least two components have
proven the same abstraction.

### 11. Packages and shared code

Keep v1 inside runtime unless a stable public/shared boundary appears.

Acceptable v1 locations:

```text
runtime/src/assistant/
runtime/app/api/assistant/
apps/inference/
```

Potential later packages:

```text
packages/assistant-contracts/
packages/inference-profiles/
packages/ai-provider-client/
```

Do not create these packages prematurely. Move code to `packages/*` only when
the same contract is needed by runtime and another package/app, or when a
public SDK contract is intentionally introduced.

## UI flows

### Admin enablement

1. Admin opens Console assistant settings.
2. Console shows Jarvis disabled by default.
3. Admin enables Jarvis, keeps or changes the display name, and configures the
   provider URL/model.
4. Runtime checks provider health.
5. If healthy, Jarvis appears in the shell for eligible users.

### Basic user chat

1. User opens Jarvis from the shell.
2. Jarvis starts with no durable history.
3. User asks a workspace question.
4. Runtime builds short context and calls the configured provider.
5. Jarvis responds or shows an unavailable/timeout state.

### Tool confirmation

1. User asks Jarvis to perform a task with side effects.
2. Model proposes a tool call.
3. Runtime validates the tool input and current-user permission.
4. Jarvis shows a preview.
5. User confirms.
6. Runtime executes deterministic host code and records an audit event.
7. Jarvis shows the result.

## Alternatives considered

### Use `Jarvis` in code and API routes

Rejected. `Jarvis` is a product/persona label. Architecture, env vars, route
names, tests, and storage should use `assistant` so the UI label can change
without migrations or breaking contracts.

### Use `agent` as the core name

Rejected. "Agent" implies autonomy, background execution, planning, and
multi-step workflows. Those belong to Harness, Council, or future advanced AI
surfaces. The core runtime feature is an assistant.

### Implement Jarvis as a plugin

Rejected for v1. Jarvis needs shell context, runtime settings, route-level
guards, confirmation enforcement, and platform-owned audit. Making it a plugin
would either weaken the SDK boundary or force special privileges into the
plugin system.

### Bundle model weights in the runtime image

Rejected. Bundled weights increase image size, complicate licensing and
upgrades, and make baseline Sovereign heavier for operators who do not want AI.
The runtime stays lightweight; the local model is optional.

### Use llama.cpp server as the first official sidecar

Deferred. llama.cpp server is lighter and gives direct GGUF control, but Ollama
has a better initial operator experience for pulling, running, and swapping
models. The runtime provider contract remains compatible with llama.cpp server.

### Persist chat history by default

Rejected for v1. Durable history introduces storage, deletion, export,
encryption, moderation/debugging, and user expectations that are not needed for
the first useful version. Persisted history can be added later as an opt-in
feature.

### Allow plugin-authored tools immediately

Rejected for v1. Plugin tools require a stable SDK contract, consent model,
schema validation, and security review. Jarvis starts with platform-owned tools
only.

## Open questions

- Should Jarvis be visible to all users once globally enabled, or should v1 add
  a platform capability such as `assistant:use`?
- Should the first UI be a sidebar drawer, a command palette-style panel, or an
  overlay route?
- Should the inference sidecar auto-pull the configured model on first boot, or
  should operators run an explicit pull/setup command?
- What is the first useful platform-owned write tool?
- Should assistant audit events reuse the activity log directly, or use a
  runtime-local audit table with summarized activity events?
- Should the assistant health endpoint be under `/api/assistant/health` or
  included in the existing admin health report?

## Adoption path

Phase 0 - RFC and docs:

- Accept this RFC.
- Add roadmap/epic tasks when scheduling is ready.
- Document Jarvis as the first runtime phase of the Harness roadmap while
  keeping `apps/inference` as the reusable model-serving sidecar.

Phase 1 - Runtime shell and disabled state:

- Add `runtime/src/assistant/config.ts`.
- Add shell UI entry point hidden/disabled by default.
- Add admin-visible settings shape and health copy.
- Add reserved API namespace entry if `runtime/app/api/assistant` is created.

Phase 2 - Provider client and fake-provider tests:

- Add OpenAI-compatible provider client.
- Add deterministic fake provider for tests.
- Add request limits and failure handling.
- Keep CI independent of real model downloads.

Phase 3 - Optional inference sidecar:

- Add `apps/inference` with Ollama wrapper/profile docs.
- Add optional Compose profile and model volume.
- Recommend `qwen3:1.7b`; document `qwen3:0.6b` fallback.
- Update self-hosting and troubleshooting docs.

Phase 4 - Platform-owned tools:

- Add read-only tools first.
- Add preview/confirmation pipeline.
- Add one low-risk write tool only after confirmation and audit are in place.

Phase 5 - Future extensions:

- Optional persisted history.
- Per-user assistant preferences.
- Plugin-authored tools after RFC 0047 lands.
- Shared provider package only after Jarvis, Harness, or Council prove a common
  contract.

Semver impact:

- Runtime-only changes follow the root platform version.
- No `@sovereignfs/sdk` or `@sovereignfs/ui` public API change is required for
  v1 unless a shared assistant component or plugin tool contract is introduced.
- Docker and operator docs must be updated in the same implementation PR that
  adds the inference profile.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
