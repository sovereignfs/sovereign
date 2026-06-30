# Epic: Sovereign Council

> First-party platform plugin for multi-model deliberation, brainstorming, and report generation.

## Status

📋 Planned

## Overview

Sovereign Council is a separately maintained first-party platform plugin that lets users convene a group of LLM participants around a topic. Sessions can include multiple models, human steering, a chair model, and a secretary model that produces notes and a final report.

Council is separate from Sovereign Harness. Harness is the personal assistant and orchestration layer; Council is a deliberation workspace for brainstorming, review, planning, and synthesis.

## Tasks

#### 📋 19.1 — Sovereign Council POC (RFC 0055)

**Goal:** Build the first proof of concept for Council as a separately maintained platform plugin with configurable model participants, structured rounds, and secretary-generated reports.

**Deliverables:**

- Create the separate first-party Council plugin repository with `type: "platform"` manifest identity.
- Support at least two model participants through OpenRouter or OpenAI-compatible endpoints.
- Implement the fixed POC protocol: opening positions, review/ranking, and final synthesis.
- Add a secretary role that records minutes, decisions, risks, unresolved questions, and next actions.
- Persist sessions, participants, rounds, messages, reviews, provider metadata, and final reports in an isolated plugin DB.
- Make provider/model identity and local/external endpoint status visible in the session UI.
- Keep plugin data access, tool execution, per-user API keys, and shared `sdk.ai` out of the POC.

**Dependencies:** RFC 0018 plugin-scoped env vars, RFC 0021 platform roles and capabilities, RFC 0022 plugin-declared capabilities, RFC 0040 Harness for shared AI product direction.

**SRS reference:** [RFC 0055](../rfcs/0055-sovereign-council.md)

**Review checklist:**

- A user can run a council session with two or more model participants.
- The user can inspect each participant's intermediate output and review.
- The secretary report is saved as a durable artifact.
- A failed participant does not silently swap to another provider.
- The plugin does not require platform package changes for the POC.

#### 📋 19.2 — Sovereign Council full deliberation workspace

**Goal:** Expand Council from POC into a reusable deliberation product with templates, richer session modes, human collaboration, reports, and optional Sovereign context.

**Deliverables:**

- Add reusable templates for session modes, roles, round structure, chair behavior, and report format.
- Support brainstorming, decision review, adversarial review, planning, retrospective, and research synthesis modes.
- Add human participants and manual or automatic round advancement.
- Add ranking/voting modes, including anonymous model review where useful.
- Add token/cost budgets and provider health visibility.
- Add report export and completion notifications.
- Explore optional RFC 0002 plugin context attachment after the consent UX is proven.
- Defer mutating tool execution until RFC 0047 confirmation gates are implemented.

**Dependencies:** Task 19.1, RFC 0043 plugin secret vault for BYOK, RFC 0047 plugin tool contracts for future actions.

**SRS reference:** [RFC 0055](../rfcs/0055-sovereign-council.md)

**Review checklist:**

- Council sessions can be created from templates.
- Human and model participants are visible in the same session trace.
- Reports can be exported or shared according to available platform capabilities.
- External provider use remains capability-gated and visible.
- Tool execution remains disabled unless a separate approved tool contract is available.

## Related RFCs

- [RFC 0055 — Sovereign Council](../rfcs/0055-sovereign-council.md)
- [RFC 0040 — Sovereign Harness](../rfcs/0040-sovereign-harness.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md)
- [RFC 0047 — Plugin tool contracts](../rfcs/0047-plugin-tools.md)

## Related Docs

- [plugin-development.md](../plugin-development.md)
- [sdk-stability.md](../sdk-stability.md)
