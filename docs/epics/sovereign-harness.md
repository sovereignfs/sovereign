# Epic: Sovereign Harness

> Platform-shipped AI assistant and orchestration layer for Sovereign.

## Status

📋 Planned

## Overview

Sovereign Harness is the advanced product phase of Sovereign's assistant
roadmap. The first runtime phase is Jarvis / Core Assistant (RFC 0063), which
establishes the lightweight built-in assistant, local inference sidecar, and
basic tool-safety pattern. The Harness plugin builds on that direction as a
first-party `platform` plugin with durable conversation UI, memory,
model-provider routing, run traces, consent-gated cross-plugin context, and
eventually confirmed tool execution through plugin tool contracts.

Harness is deliberately implemented as a platform plugin, not as runtime core.
It uses the same SDK boundaries as other plugins and depends on platform
surfaces for data sharing, notifications, activity logging, jobs, secrets, and
tool execution.

## Tasks

#### 📋 18.1 — Sovereign Harness platform plugin (RFC 0040)

**Goal:** Ship Sovereign Harness as a first-party platform plugin that provides chat, memory, model routing, run traces, and consent-gated plugin context.

**Deliverables:**

- Create or pin the separate first-party Harness plugin repository with `type: "platform"` manifest identity.
- Add conversation workspace, settings, memory review, and run-trace views.
- Add model provider abstraction for OpenRouter, OpenAI-compatible providers, and local OpenAI-compatible model servers.
- Use deployment-level provider configuration first; defer per-user BYOK until a secret-vault-backed design is available.
- Use RFC 0002 data contracts for consent-gated read-only plugin context.
- Log assistant actions and cross-plugin context reads through activity logging.
- Notify users when long-running assistant work completes.
- Keep model/tool/provider abstractions internal until another plugin needs them as stable SDK surfaces.

**Dependencies:** RFC 0063 Core Assistant / Jarvis, RFC 0002 cross-plugin data sharing, Task 4.1 notifications, Task 5.1 activity logging, Task 1.8/1.9 progressive verification, Task 8.6 plugin secret vault, Task 3.16 plugin jobs, Task 3.18 plugin tool contracts.

**SRS reference:** [RFC 0040](../rfcs/0040-sovereign-harness.md)

**Review checklist:**

- Harness appears as a platform-shipped plugin with `type: "platform"`.
- No model provider is enabled by default.
- Provider choice and external-provider disclosure are visible to the user/operator.
- Cross-plugin context reads require explicit consent grants and never read plugin tables directly.
- Mutating tool execution is unavailable until plugin tool contracts and confirmation gates are implemented.

## Related RFCs

- [RFC 0040 — Sovereign Harness](../rfcs/0040-sovereign-harness.md)
- [RFC 0063 — Core Assistant, Jarvis UI, and Local Inference Sidecar](../rfcs/0063-core-assistant-jarvis.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md)
- [RFC 0046 — Plugin background jobs and schedules](../rfcs/0046-plugin-jobs.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [sdk-stability.md](../sdk-stability.md)
