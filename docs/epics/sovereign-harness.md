# Epic: Sovereign Harness

> Platform-shipped AI assistant and orchestration layer for Sovereign.

## Status

📋 Planned

## Overview

Sovereign Harness is an in-tree `platform` plugin that gives users an AI assistant
inside Sovereign. It owns conversation UI, memory, model-provider routing, run
traces, consent-gated cross-plugin context, and eventually confirmed tool
execution through plugin tool contracts.

Harness is deliberately implemented as a platform plugin, not as runtime core.
It uses the same SDK boundaries as other plugins and depends on platform
surfaces for data sharing, notifications, activity logging, jobs, secrets, and
tool execution.

## Tasks

#### 📋 18.1 — Sovereign Harness platform plugin (RFC 0040)

**Goal:** Ship Sovereign Harness as an in-tree platform plugin that provides chat, memory, model routing, run traces, and consent-gated plugin context.

**Deliverables:**

- Add `plugins/harness` as a `type: "platform"` plugin shipped with the platform code.
- Add conversation workspace, settings, memory review, and run-trace views.
- Add model provider abstraction for OpenRouter, OpenAI-compatible providers, and local OpenAI-compatible model servers.
- Use deployment-level provider configuration first; defer per-user BYOK until a secret-vault-backed design is available.
- Use RFC 0002 data contracts for consent-gated read-only plugin context.
- Log assistant actions and cross-plugin context reads through activity logging.
- Notify users when long-running assistant work completes.
- Keep model/tool/provider abstractions internal until another plugin needs them as stable SDK surfaces.

**Dependencies:** RFC 0002 cross-plugin data sharing, Task 4.1 notifications, Task 5.1 activity logging, Task 1.8/1.9 progressive verification, Task 8.6 plugin secret vault, Task 3.16 plugin jobs, Task 3.18 plugin tool contracts.

**SRS reference:** [RFC 0040](../rfcs/0040-sovereign-harness.md)

**Review checklist:**

- Harness appears as a platform-shipped plugin with `type: "platform"`.
- No model provider is enabled by default.
- Provider choice and external-provider disclosure are visible to the user/operator.
- Cross-plugin context reads require explicit consent grants and never read plugin tables directly.
- Mutating tool execution is unavailable until plugin tool contracts and confirmation gates are implemented.

## Related RFCs

- [RFC 0040 — Sovereign Harness](../rfcs/0040-sovereign-harness.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md)
- [RFC 0046 — Plugin background jobs and schedules](../rfcs/0046-plugin-jobs.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [sdk-stability.md](../sdk-stability.md)
