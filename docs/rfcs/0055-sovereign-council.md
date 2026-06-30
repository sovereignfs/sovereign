---
rfc: 0055
title: Sovereign Council — multi-model deliberation workspace
status: Draft
date: June 2026
author: kasunben
scope: >
  sovereign-council plugin (separate first-party repository), plugin registry,
  packages/sdk, packages/manifest, runtime, docs; builds on RFC 0018, RFC 0021,
  RFC 0022, RFC 0040, RFC 0043, RFC 0047
incorporated_into_plan: 'Yes — epic task 19.1'
---

# RFC 0055 — Sovereign Council

## Summary

Add **Sovereign Council**, a first-party platform plugin for structured
multi-model deliberation. A user starts a council session with a topic, goal, and
participant lineup. Multiple LLMs then join the discussion as distinct
participants, optionally alongside humans. A smaller or cheaper model can act as
secretary, maintaining minutes and producing a final report.

The idea came from a hands-on multi-agent planning exercise where Claude and
Codex collaborated through human-mediated message passing. The interaction
worked well enough to suggest a reusable workspace pattern: let multiple AI
participants deliberate with a human in the loop, then preserve the discussion
as an inspectable artifact. [karpathy/llm-council](https://github.com/karpathy/llm-council)
is related prior art for one useful protocol: several LLMs answer independently,
review/rank one another's answers anonymously, and a chairman model compiles a
final response. Sovereign Council broadens that pattern into a configurable
workspace primitive: operators can configure OpenRouter or multiple
OpenAI-compatible endpoints, users can choose deliberation formats, and every
round remains inspectable.

Council is related to Harness (RFC 0040) but should be a separate plugin.
Harness is the personal assistant and orchestration layer. Council is a
deliberation room: many model participants, explicit rounds, note taking,
human steering, and report generation.

## Motivation

The multi-agent planning exercise for this project showed that two different AI
systems can collaborate productively when the human mediates context and asks
each model to critique or extend the other's work. That interaction pattern is
valuable beyond coding: product planning, architecture review, writing, decision
making, incident review, research synthesis, and strategy work all benefit from
multiple perspectives.

Asking one model for an answer is often useful, but it collapses disagreement
too early. A council-style workflow preserves the intermediate disagreement:
one model proposes, another critiques, a third reframes, and a secretary
distills the useful parts into a durable artifact.

Sovereign is a good home for this because it can add:

- self-hosted control over provider configuration;
- auditable session traces and reports;
- reusable council templates;
- human participants alongside model participants;
- clear disclosure when external providers are used;
- future integration with Sovereign data and tools through existing plugin
  boundaries.

## Current State

- Harness RFC 0040 already defines a provider-adapter direction, external model
  disclosure, memory, run traces, and consent-gated plugin context.
- Plugin-scoped env vars (RFC 0018) provide a safe initial path for provider
  keys and local endpoint URLs.
- Platform roles/capabilities (RFC 0021) and plugin-declared capabilities (RFC 0022) can gate session creation, external-provider use, template management,
  and report sharing.
- Plugin secret vault (RFC 0043) is the likely prerequisite for per-user BYOK.
- Plugin tool contracts (RFC 0047) are the likely future mechanism for Council
  sessions that can act, not only deliberate.

## Product Shape

Council is a first-party platform plugin maintained in a separate repository:

```text
sovereign-council/
├── manifest.json
├── icon.svg
├── package.json
├── app/
│   ├── page.tsx                    # session list / start session
│   ├── sessions/[id]/page.tsx      # live deliberation room
│   ├── reports/[id]/page.tsx       # generated report artifact
│   ├── settings/page.tsx           # user preferences
│   └── _components/
└── db/
    └── schema.ts
```

It is a platform plugin by trust/distribution class, not by physical repo
location. Sovereign may pin and ship it through first-party registry metadata,
but the source should live outside the core monorepo so it can evolve at the
pace of AI product work without coupling every iteration to the runtime.

Suggested manifest identity:

```jsonc
{
  "schemaVersion": 1,
  "id": "fs.sovereign.council",
  "name": "Council",
  "version": "0.1.0",
  "description": "Multi-model deliberation and report-generation workspace.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/council",
  "shell": "default",
  "database": "isolated",
  "permissions": ["auth:session", "db:readWrite", "activity:write", "notifications:send"],
  "capabilities": {
    "create-sessions": {
      "description": "Create and participate in council sessions.",
      "defaultGrant": "all",
    },
    "use-external-models": {
      "description": "Send council prompts to configured external model providers.",
      "defaultGrant": "none",
    },
    "manage-templates": {
      "description": "Create shared council templates and participant presets.",
      "defaultGrant": "none",
    },
    "manage-providers": {
      "description": "Configure instance-level model providers for Council.",
      "defaultGrant": "none",
    },
  },
  "env": {
    "OPENROUTER_API_KEY": {
      "description": "Optional OpenRouter API key used by Council.",
      "required": false,
      "secret": true,
      "scope": "runtime",
    },
    "OPENAI_COMPATIBLE_BASE_URLS": {
      "description": "Optional comma-separated OpenAI-compatible endpoint allowlist.",
      "required": false,
      "secret": false,
      "scope": "runtime",
    },
  },
}
```

## Phase 1 — Proof of Concept

The POC should prove the deliberation loop before adding deep platform
integration.

### POC Features

- Configure at least two model participants through OpenRouter or
  OpenAI-compatible endpoints.
- Start a session with topic, objective, optional background, and selected
  participants.
- Run a fixed deliberation protocol:
  1. **Opening positions:** each model answers independently.
  2. **Review:** each model reviews the other outputs, preferably anonymized.
  3. **Synthesis:** a chair or secretary model creates a final report.
- Show all participant outputs in an inspectable interface.
- Store session transcript, model metadata, review notes, and final report in
  Council's isolated DB.
- Let the user manually add steering messages between rounds.
- Provide a secretary role that captures minutes, decisions, risks, open
  questions, and next actions.
- Log high-level activity events without writing raw prompt/output content to
  the platform-wide activity log.

### POC Non-Goals

- No plugin data access.
- No tool execution.
- No autonomous background sessions.
- No per-user API keys.
- No shared provider broker in `@sovereignfs/sdk`.
- No claims that the final answer is more correct merely because multiple
  models agreed.

### POC Success Criteria

- A user can run a council session with two or more model participants.
- The user can inspect every intermediate model response and review.
- The secretary report is saved as a durable artifact.
- Provider/model choice and external-provider status are visible.
- A failed participant does not fail the whole session unless the user chooses
  to stop.

## Phase 2 — Full Product

Phase 2 turns the POC into a repeatable deliberation workspace.

### Session Modes

| Mode               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| Brainstorming      | Generate divergent ideas, cluster them, and produce a proposal.  |
| Decision review    | Compare options, risks, tradeoffs, and recommendation strength.  |
| Adversarial review | Assign advocate, skeptic, security, operator, or user roles.     |
| Planning           | Produce milestones, dependencies, open questions, and owners.    |
| Retrospective      | Analyze what happened, lessons learned, and follow-up actions.   |
| Research synthesis | Compare claims, source notes, uncertainties, and report outputs. |

### Full Features

- Reusable templates for protocols, roles, chair instructions, and report
  formats.
- Human participants in a live session alongside LLM participants.
- Manual and automatic round advancement.
- Voting/ranking modes, including anonymous model review to reduce brand/model
  favoritism.
- Configurable chair/secretary selection.
- Cost and token budget controls per session.
- Exportable reports in Markdown and later PDF/Docx.
- Notifications when long-running sessions complete.
- Public or team sharing of selected reports when sharing infrastructure exists.
- Optional plugin context through RFC 0002 data contracts after Harness proves
  the consent UX.
- Optional tool execution only after RFC 0047 and confirmation gates exist.

## Provider Model

Council can share design language with Harness but should not force a shared
runtime package too early. Phase 1 should keep provider adapters local to the
plugin or use a small duplicated internal pattern.

Initial provider options:

| Provider path      | Notes                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| OpenRouter         | Best POC path for quickly selecting multiple hosted models.           |
| OpenAI-compatible  | Covers OpenAI, compatible hosted providers, Ollama, vLLM, LM Studio.  |
| Local-only profile | Allows self-hosted operators to disable hosted model egress entirely. |

A later `sdk.ai` or first-party model-broker package should wait until both
Harness and Council have independently proven the same abstraction.

## Data Model

Suggested isolated tables:

| Table                     | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `council_sessions`        | Topic, objective, owner, status, template, timestamps.    |
| `council_participants`    | Model/human participants, role, provider, model metadata. |
| `council_rounds`          | Ordered deliberation phases and state.                    |
| `council_messages`        | User, human, model, chair, and secretary messages.        |
| `council_reviews`         | Cross-model reviews, rankings, and rationale.             |
| `council_reports`         | Final report artifacts and generated summaries.           |
| `council_templates`       | Reusable protocols, roles, and report formats.            |
| `council_provider_events` | Provider/model calls, token counts, latency, failures.    |

Raw prompts and responses remain in Council's DB, not the platform-wide
activity log. User data export/deletion support should include sessions,
participants created by the user, messages, reviews, reports, and templates.

## Security and Privacy Requirements

1. **No model provider by default.** Council cannot send prompts anywhere until
   an operator configures at least one provider.
2. **External provider use is visible.** Each participant shows provider/model
   and whether the endpoint is local or external.
3. **No silent fallback.** If a selected model fails, Council may skip, retry, or
   ask the user; it must not silently substitute another provider.
4. **Capability-gated hosted models.** External model use is controlled by a
   capability separate from local model use.
5. **No hidden council members.** Every model/human participant and secretary is
   visible in the session trace.
6. **Intermediate reasoning is an artifact, not authority.** Agreement among
   models is recorded as signal, not treated as proof.
7. **Prompt injection remains in scope.** Any future plugin-context input must
   be separated from participant instructions and treated as untrusted data.
8. **Tools are out of scope for POC.** Mutating actions require a later tool
   contract and explicit confirmation.

## Relationship to Harness

Harness and Council should remain separate:

| Area             | Harness                                          | Council                                     |
| ---------------- | ------------------------------------------------ | ------------------------------------------- |
| Primary user job | Ask an assistant to help operate Sovereign.      | Convene multiple perspectives on a topic.   |
| Conversation     | User + assistant, with memory and context.       | User/humans + many model participants.      |
| Output           | Assistant answer, action, memory, trace.         | Transcript, reviews, minutes, final report. |
| Future tools     | Executes approved plugin actions.                | Debates/approves plans before tools run.    |
| Best first repo  | Separate first-party platform plugin repository. | Separate first-party platform plugin repo.  |

They may later share:

- provider adapter code;
- provider health checks;
- model allowlists and budgets;
- UI primitives for chat, traces, and reports;
- external-provider acknowledgement UX.

Those shared pieces should be extracted only after both products have real
implementation pressure.

## Alternatives Considered

### Put Council inside Harness

Rejected for now. Harness already has a broad assistant/orchestration scope.
Council has a different mental model and UI: sessions, rounds, participants,
reviews, minutes, and reports. Combining them too early would make Harness less
coherent and make Council harder to evolve.

### Clone karpathy/llm-council directly

Rejected. The reference project is a useful proof of interaction design, but
Sovereign needs provider controls, capability gates, user/session storage,
auditability, export/deletion behavior, and first-party plugin packaging.

### Build a platform-wide model broker first

Rejected for POC. It would front-load abstraction work. Council can prove the
session model with local provider adapters, then share infrastructure with
Harness later.

## Adoption Path

1. **RFC draft:** agree on the Council product boundary and POC scope.
2. **POC:** separate repo, plugin manifest, provider config, fixed three-stage
   protocol, transcript UI, secretary report, isolated DB.
3. **Templates:** configurable modes, roles, ranking, chair/secretary prompts,
   report formats.
4. **Collaboration:** human participants, comments, report sharing, completion
   notifications.
5. **Sovereign context:** optional RFC 0002 data-source attachment once consent
   UX is proven.
6. **Shared AI infrastructure:** extract provider/budget/UI pieces only if
   Harness and Council converge.

## Semver and Package Impact

The POC should avoid published package changes if it uses existing SDK surfaces:
`auth`, `db`, `activity`, `notifications`, `platform`, and `env`.

Possible later package changes:

| Package                 | Change                                                   | Semver |
| ----------------------- | -------------------------------------------------------- | ------ |
| `@sovereignfs/sdk`      | Add shared `sdk.ai`, tools, or report-sharing surfaces.  | minor  |
| `@sovereignfs/manifest` | Add provider metadata, tool declarations, or repo trust. | minor  |
| `@sovereignfs/ui`       | Add reusable participant, transcript, and report views.  | minor  |

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
