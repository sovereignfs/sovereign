# Epic: Core Assistant

> First runtime phase of the Sovereign Harness roadmap: Jarvis and local inference.

## Status

📋 Planned

## Overview

The Core Assistant is the first runtime phase of the broader Sovereign Harness
roadmap. It gives users a lightweight, local-first workspace assistant before
the full Harness plugin exists. It is implemented as `assistant` in architecture
and code, presented as Jarvis by default in the UI, and powered initially by an
optional `apps/inference` sidecar.

Jarvis is not an installable plugin and not an autonomous agent framework. It is
user-initiated, short-context, platform-owned, and bounded by deterministic
tool validation, current-user authorization, confirmation gates, and audit
events. The future Harness plugin remains the advanced orchestration product for
durable conversations, memory, run traces, richer provider routing, and
consent-gated plugin context. Council remains adjacent as the multi-model
deliberation workspace.

## Tasks

#### 📋 22.1 — Core Assistant shell and disabled state (RFC 0063)

**Goal:** Add the core assistant feature boundary to the runtime with Jarvis
hidden or disabled by default.

**Deliverables:**

- Add `runtime/src/assistant/config.ts` with disabled-by-default assistant
  configuration.
- Use `assistant` for code/API/env naming and Jarvis only as the default
  user-facing display name.
- Add shell UI entry-point scaffolding that stays hidden or disabled unless
  `ASSISTANT_ENABLED` is true.
- Add admin-visible settings copy for enablement, display name, provider URL,
  model name, and health state.
- If `runtime/app/api/assistant` is introduced, add `assistant` to
  `RESERVED_API_SEGMENTS` and update the namespace parity test.
- Keep the implementation runtime-owned, not a plugin.

**Dependencies:** RFC 0063.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- Jarvis is disabled by default.
- Runtime code uses `assistant`, not `jarvis`, for stable architecture naming.
- The UI display name can be changed without changing API routes, storage keys,
  env vars, or tests.
- No plugin imports runtime assistant internals.
- Adding assistant API routes does not break the public provider API namespace.

#### 📋 22.2 — Assistant provider client and fake-provider tests (RFC 0063)

**Goal:** Implement the runtime's model-agnostic provider interface and a
deterministic fake provider for tests.

**Deliverables:**

- Add the internal `AssistantModelProvider` interface.
- Implement an OpenAI-compatible provider client using
  `ASSISTANT_MODEL_BASE_URL` and `ASSISTANT_MODEL_NAME`.
- Add request limits for input length, output tokens, timeout, recent turns, and
  concurrency.
- Add provider health checks and user/admin-facing error states for disabled,
  unavailable, timeout, and model-missing cases.
- Add a deterministic fake provider so CI does not download or run real models.
- Add unit tests for provider success, timeout, malformed responses, and
  disabled-state behavior.

**Dependencies:** Task 22.1.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- CI does not require Ollama, llama.cpp, GPU access, or model downloads.
- Runtime depends only on an OpenAI-compatible HTTP contract.
- Provider failures return controlled assistant errors, not uncaught exceptions.
- Assistant request limits are enforced before provider calls.

#### 📋 22.3 — Optional local inference sidecar (RFC 0063)

**Goal:** Add the optional `apps/inference` sidecar path for local model
serving without changing the baseline Sovereign stack.

**Deliverables:**

- Add `apps/inference` with Ollama-first wrapper docs and model profiles.
- Recommend `qwen3:1.7b` as the default local profile and document
  `qwen3:0.6b` as the ultra-low-resource fallback.
- Add optional Docker Compose profile `assistant` with an `inference` service
  and persistent model volume.
- Keep inference ports unexposed by default in production.
- Document non-Docker setup with Ollama, llama.cpp server, or any local
  OpenAI-compatible endpoint.
- Update self-hosting, upgrade, and troubleshooting docs for model cache,
  health checks, and public-exposure warnings.

**Dependencies:** Task 22.2.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- `docker compose up` without the assistant profile still runs the same baseline
  services.
- No model weights are committed or bundled into the runtime image.
- The inference service is on the internal Compose network and not public by
  default.
- Operators can replace Ollama with another OpenAI-compatible endpoint.
- Docker/config impact is documented in the same PR.

#### 📋 22.4 — Platform-owned assistant tools and confirmation flow (RFC 0063)

**Goal:** Add the first platform-owned assistant tools with schema validation,
permission checks, previews, confirmations, and audit events.

**Deliverables:**

- Add the assistant tool registry for runtime-owned tools only.
- Implement read-only tools first, such as installed-app listing, navigation
  search, instance summary, and explicit current-page summarization.
- Add tool-call parsing and schema validation before any tool runs.
- Add preview and confirmation flow for every write, send, delete, admin change,
  external call, or durable side effect.
- Execute tools as the current user and tenant through existing runtime/API
  authorization paths.
- Add high-level audit events for request start/completion/failure, tool
  preview, confirmation, execution, denial, and provider failure.
- Avoid storing raw prompts or model outputs in normal activity logs.

**Dependencies:** Task 22.2, Task 5.1 activity logging. RFC 0047 remains a
future dependency for plugin-authored tools.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- Plugin-authored tools are not available in this task.
- Model output is never executed directly.
- All mutating tools require confirmation.
- Read-only tools respect the current user's visibility and role.
- Audit events do not leak raw prompt/output content by default.

#### 📋 22.5 — Assistant history, preferences, and extension review (RFC 0063)

**Goal:** Review the first Jarvis implementation and decide which optional
extensions are ready for design.

**Deliverables:**

- Evaluate real Jarvis prompt behavior against `qwen3:1.7b`, `qwen3:0.6b`,
  `qwen3:4b`, and `gemma3:1b`.
- Decide whether persisted chat history should remain deferred or become an
  opt-in feature with export/deletion semantics.
- Decide whether per-user visibility/preferences are needed beyond global admin
  enablement.
- Decide whether assistant audit events should remain summarized activity events
  or move to a dedicated runtime-local audit table.
- Revisit whether any provider/client code is stable enough to move into
  `packages/*`.
- Revisit plugin-authored assistant tools only after RFC 0047 has shipped.

**Dependencies:** Task 22.4, RFC 0047 for plugin-authored tools.

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)

**Review checklist:**

- No persisted chat history is added without explicit opt-in design.
- Model recommendations are based on Jarvis-specific prompt tests, not generic
  benchmarks alone.
- Any package extraction has at least two real consumers or a public contract.
- Jarvis remains the first runtime phase of the Harness roadmap without
  introducing runtime-internal coupling to the future Harness plugin or Council.

## Related RFCs

- [RFC 0063 — Core Assistant, Jarvis UI, and Local Inference Sidecar](../rfcs/0063-core-assistant-jarvis.md)
- [RFC 0040 — Sovereign Harness](../rfcs/0040-sovereign-harness.md)
- [RFC 0055 — Sovereign Council](../rfcs/0055-sovereign-council.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)
- [RFC 0005 — Activity log](../rfcs/0005-activity-log.md)

## Related Docs

- [architecture-rules.md](../architecture-rules.md)
- [self-hosting.md](../self-hosting.md)
- [plugin-development.md](../plugin-development.md)
