---
rfc: 0040
title: Sovereign Harness — AI assistant and orchestration layer
status: Draft
date: June 2026
author: kasunben
scope: >
  plugins/harness (new), packages/db, packages/sdk, packages/manifest, runtime,
  plugins/account, plugins/console, docs; builds on RFC 0002, RFC 0005, RFC 0015,
  RFC 0018, RFC 0021, RFC 0022, RFC 0035
incorporated_into_plan: 'No — documentation-first. This RFC specifies the product and architecture direction for an in-tree platform AI harness plugin; scheduling, package versions, and task IDs are deferred.'
---

# RFC 0040 — Sovereign Harness

## Summary

Add **Sovereign Harness**, a first-party AI assistant and orchestration plugin
that lives inside Sovereign and acts on behalf of the current user. It provides
chat, memory, model routing, tool execution, and consent-gated interaction with
other plugins. The goal is not to bolt a generic chatbot onto the platform; the
goal is to make Sovereign's plugin graph usable through an AI layer while keeping
the user's data, consent grants, audit trail, and model-provider choices under
the instance owner's control.

Harness is inspired by the local-first AI harness pattern: a personal AI
workspace with long-lived memory, model flexibility, and optional tool use. In
Sovereign, those ideas become a plugin that reuses the platform's existing
boundaries: SDK-only access, cross-plugin data sharing, notification delivery,
activity logging, plugin-scoped env vars, and role/capability enforcement.

Model access is configurable. Operators may route through OpenRouter, configure
direct provider API keys, or point Harness at self-hosted OpenAI-compatible
model servers such as Ollama, vLLM, llama.cpp server, or LM Studio. No model
provider is enabled by default.

## Motivation

Sovereign is already structured as a self-hosted workspace where plugins own
the user's data and expose capabilities through a common shell. The missing
layer is an assistant that can help the user operate that workspace: ask
questions across their data, summarize recent activity, draft records, prepare
messages, coordinate tasks, and eventually call approved plugin actions.

Today each plugin must build its own AI features if it wants them. That creates
duplicate provider configuration, duplicate memory stores, inconsistent
permission checks, and unclear data-sharing behavior. It also makes it too easy
for a plugin to send sensitive user data to a model provider without a clear
platform-level consent and audit story.

Harness gives Sovereign one shared AI layer with explicit boundaries:

- The user chooses when Harness can read another plugin's data.
- The operator chooses which model providers are available.
- The platform records what Harness read, which model endpoint it used, and
  which user initiated the request.
- Plugins expose data and tools through normal Sovereign mechanisms rather than
  bespoke AI integrations.

This fits Sovereign's positioning: embrace AI, but keep ownership, deployment,
and data flow under the instance's control.

## Current state

- **Plugins are composed into the runtime** from `plugins/<id>/app/` via the
  generate step. The manifest `routePrefix` is the source of truth for URL
  placement.
- **Plugins use the SDK boundary**. Importing platform internals from plugin
  code is forbidden by ESLint. Harness must not be special-cased around this
  boundary.
- **Cross-plugin data sharing exists** through `sdk.data` and consent grants
  (RFC 0002). It is read-only and user-mediated.
- **Activity logging exists** through `sdk.activity.log()` (RFC 0005). Harness
  can use this to record assistant actions and tool runs.
- **Notifications exist** through `sdk.notifications.send()` (RFC 0015).
  Harness can notify a user when a long-running task completes.
- **Plugin-scoped env vars exist** (RFC 0018). They are the right initial path
  for provider API keys and self-hosted model endpoints because they avoid
  storing secrets in the platform DB.
- **Platform roles and capabilities exist** (RFC 0021), and plugin-declared
  capabilities exist (RFC 0022). Harness should expose its own capabilities for
  sensitive actions such as using external models, executing tools, or managing
  shared prompts.
- **Progressive user verification is specified** (RFC 0035). Harness can later
  require stronger verification levels for high-risk actions.
- **Reserved SDK surfaces exist** for `events`, `storage`, and `billing`, but
  they are not required for the first Harness version.

## Proposed design

### 1. Product shape

Harness ships as an in-tree platform plugin with the Sovereign platform code:

```text
plugins/harness/
├── manifest.json
├── icon.svg
├── package.json
├── app/
│   ├── page.tsx                 # conversation workspace
│   ├── settings/page.tsx        # personal Harness preferences
│   ├── memory/page.tsx          # user-visible memory controls
│   ├── runs/[id]/page.tsx       # tool/model run trace
│   └── _components/
└── db/
    └── schema.ts                # optional plugin table declarations
```

Suggested manifest shape:

```jsonc
{
  "schemaVersion": 1,
  "id": "fs.sovereign.harness",
  "name": "Harness",
  "version": "0.1.0",
  "description": "AI assistant and orchestration layer for Sovereign.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/harness",
  "shell": "default",
  "database": "isolated",
  "permissions": [
    "auth:session",
    "db:readWrite",
    "data:consume",
    "activity:write",
    "notifications:send",
  ],
  "capabilities": {
    "chat": {
      "description": "Use Harness chat and local memory.",
      "defaultGrant": "all",
    },
    "use-external-models": {
      "description": "Send prompts to configured external model providers.",
      "defaultGrant": "none",
    },
    "run-tools": {
      "description": "Allow Harness to execute approved tools on the user's behalf.",
      "defaultGrant": "none",
    },
    "manage-providers": {
      "description": "Configure instance-level model providers.",
      "defaultGrant": "none",
    },
  },
  "env": {
    "OPENROUTER_API_KEY": {
      "description": "Optional OpenRouter API key used by Harness model routing.",
      "required": false,
      "secret": true,
      "scope": "runtime",
    },
    "OPENAI_API_KEY": {
      "description": "Optional direct OpenAI-compatible provider API key.",
      "required": false,
      "secret": true,
      "scope": "runtime",
    },
    "LOCAL_MODEL_BASE_URL": {
      "description": "Optional OpenAI-compatible local model server base URL.",
      "required": false,
      "secret": false,
      "scope": "runtime",
      "default": "http://localhost:11434/v1",
    },
  },
  "compatibility": {
    "minPlatformVersion": "0.10.0",
  },
}
```

`database: "isolated"` is recommended. Harness will accumulate conversations,
messages, run traces, model metadata, embeddings, and memory summaries. Keeping
that store separate makes backup, removal, and future encryption work cleaner.

`type: "platform"` is required because Harness is part of the platform
distribution. It should be committed and versioned with the platform monorepo,
composed through the normal plugin generation path, and enabled as a platform
plugin rather than installed from an external plugin registry. The architectural
rule still matters: Harness is a platform plugin, not runtime core.

### 2. Core features

Phase 1 should be intentionally narrow:

- Chat conversations scoped to the current user.
- Configurable model providers.
- Explicit provider selection per conversation or per message.
- Local conversation history.
- User-visible memory extraction and deletion.
- Consent-gated reads from other plugins through `sdk.data.query()`.
- Activity logging for assistant actions and cross-plugin reads.
- Run traces showing prompts, provider, model, token counts when available,
  tool calls, errors, and consent decisions.

Phase 2 can add:

- Multi-agent conversations.
- Scheduled or long-running tasks.
- Web search.
- Document and file ingestion.
- Plugin-authored tools with approval gates.
- Public sharing of selected conversations or generated documents.
- Voice input/output.
- Local embedding indexes and semantic search.

Computer use, browser automation, coding agents, and arbitrary shell execution
are explicitly out of scope until a separate security RFC defines the sandbox,
approval model, and audit requirements.

### 3. Model provider abstraction

Harness owns a provider adapter layer with a narrow internal interface:

```ts
interface HarnessModelProvider {
  id: string;
  label: string;
  kind: 'openrouter' | 'openai-compatible' | 'local';
  listModels(): Promise<HarnessModel[]>;
  complete(input: HarnessCompletionInput): Promise<HarnessCompletionResult>;
  stream?(input: HarnessCompletionInput): AsyncIterable<HarnessStreamEvent>;
}
```

Initial adapters:

| Adapter            | Configuration                                | Notes                                                   |
| ------------------ | -------------------------------------------- | ------------------------------------------------------- |
| OpenRouter         | `OPENROUTER_API_KEY`                         | Broad model selection through one external provider.    |
| OpenAI-compatible  | `OPENAI_API_KEY`, optional base URL          | Covers OpenAI and compatible hosted providers.          |
| Local model server | `LOCAL_MODEL_BASE_URL`, optional model allow | Covers Ollama/vLLM/llama.cpp/LM Studio style endpoints. |

The provider abstraction is internal to Harness at first. It should not become
a platform SDK surface until at least one non-Harness plugin needs to invoke
models through the same broker.

### 4. Provider configuration and secrets

Provider secrets must not be stored casually in the platform DB. The first
version should use plugin-scoped runtime env vars for instance-level provider
configuration:

- `SV_PLUGIN_FS_SOVEREIGN_HARNESS_OPENROUTER_API_KEY`
- `SV_PLUGIN_FS_SOVEREIGN_HARNESS_OPENAI_API_KEY`
- `SV_PLUGIN_FS_SOVEREIGN_HARNESS_LOCAL_MODEL_BASE_URL`

Harness Settings shows which providers are available but never displays secret
values.

User-supplied API keys are deferred. Supporting bring-your-own-key per user
requires a secure secret store, clear export/deletion semantics, and likely
field-level encryption. Until that exists, operators can configure instance
providers and use capabilities to control who may send data to external models.

### 5. External model disclosure and consent

Sending data to an external model provider is materially different from using a
local model. Harness must make that visible:

- Conversations display the active provider and whether it is local or external.
- The first use of an external provider by a user requires explicit
  acknowledgement.
- The `use-external-models` capability gates external provider use.
- If no external capability is present, Harness may still allow local model use
  when a local provider is configured.
- Run traces record provider ID, model ID, endpoint kind, and timestamp.

Harness must never silently fall back from a local provider to an external
provider. If the selected local model is unavailable, the request fails with a
clear error and lets the user choose another provider.

### 6. Cross-plugin context

Harness reads other plugins through RFC 0002 data contracts only:

```ts
const rows = await sdk.data.query(
  { providerId: 'example.plugin', contract: 'records', version: 1 },
  { query: userQuestion },
);
```

The user grants consent per consumer/provider/contract. Harness should present
these grants in plain language:

```text
Harness wants to read "Recent notes" from Notes for this conversation.
```

Harness stores the grant reference and retrieval result metadata in the run
trace, but the source plugin remains the owner of its data. Revoking the grant
in Account blocks future reads immediately.

Harness should support two context modes:

| Mode          | Behavior                                                                |
| ------------- | ----------------------------------------------------------------------- |
| Manual attach | User picks a plugin/data source for a conversation or message.          |
| Suggested     | Harness suggests a source, then asks for consent before the first read. |

Automatic background reads across plugins are out of scope for Phase 1.

### 7. Tool execution model

Reading data is not the same as taking action. Phase 1 supports read-only data
queries and local Harness-only writes such as saving a memory or creating a
conversation.

Mutating actions in other plugins require a later **plugin tool contract**. The
shape should be similar to data contracts but with stricter approval:

```ts
interface PluginToolDeclaration {
  id: string;
  title: string;
  description: string;
  inputSchema: unknown;
  effect: 'read' | 'write' | 'external';
  requiresConfirmation: boolean;
}
```

Before any write tool runs, Harness must show:

- the plugin that will act;
- the exact action;
- the structured input;
- the expected effect;
- whether external network access is involved.

The first Harness RFC does not add this manifest or SDK surface. It records the
direction so Phase 1 data access does not accidentally become a general-purpose
agent execution system.

### 8. Memory

Harness memory is user-scoped and inspectable. The assistant may suggest memory
items, but the user controls whether they are retained.

Suggested tables in the isolated Harness DB:

| Table                   | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `harness_conversations` | Conversation metadata, owner user ID, title, timestamps.   |
| `harness_messages`      | User, assistant, and tool messages.                        |
| `harness_runs`          | One model/tool run per assistant turn.                     |
| `harness_run_events`    | Streaming chunks, tool calls, errors, consent checkpoints. |
| `harness_memory_items`  | User-approved long-lived memory facts or preferences.      |
| `harness_sources`       | Data-source references used by a run or conversation.      |
| `harness_provider_logs` | Provider/model metadata without raw secret values.         |

Memory item fields:

| Column       | Notes                                                         |
| ------------ | ------------------------------------------------------------- |
| `id`         | Stable ID.                                                    |
| `user_id`    | Owner.                                                        |
| `kind`       | `preference`, `fact`, `project`, `instruction`, or `summary`. |
| `content`    | The memory text.                                              |
| `source`     | `user`, `assistant_suggested`, `conversation`, or `plugin`.   |
| `source_ref` | Optional conversation/message/plugin reference.               |
| `pinned`     | User-pinned memories are never auto-pruned.                   |
| `created_at` | Unix seconds.                                                 |
| `updated_at` | Unix seconds.                                                 |
| `deleted_at` | Soft delete for audit and undo; hard delete on data deletion. |

The user can view, edit, pin, and delete memory items. Harness must provide a
"forget this" action on assistant messages that generated or used memory.

### 9. Data deletion and portability

Harness must participate in user data deletion (RFC 0033) and portability
(RFC 0007).

On export:

- conversations;
- messages;
- memory items;
- run traces;
- source references;
- provider metadata;
- user settings.

On import:

- conversations and messages are restored additively;
- memory IDs are remapped;
- source references to unavailable plugins are preserved as inert metadata;
- provider secrets are not exported or imported.

On deletion:

- hard-delete the user's conversations, messages, memories, run traces, and
  provider logs;
- do not delete instance-level provider configuration;
- log a deletion summary in the platform activity log.

### 10. UI flows

#### First run

```text
User opens /harness
  └─ Harness checks available providers
       ├─ No provider configured
       │    └─ Show empty state:
       │         "No model provider is configured."
       │         Admin link to Console/Harness provider setup when allowed.
       └─ Provider available
            └─ Start conversation screen
```

#### Asking with plugin context

```text
User asks a question
  └─ Harness suggests a plugin source
       └─ User approves source
            └─ RFC 0002 consent prompt if grant missing
                 ├─ Grant denied → answer without that source
                 └─ Grant accepted → query provider plugin
                      └─ Send selected context to chosen model
                           └─ Show answer + source trace
```

#### External provider acknowledgement

```text
User selects OpenRouter or hosted provider
  └─ Harness detects external provider
       └─ User has not acknowledged external processing
            └─ Show disclosure
                 ├─ Cancel → stay on local/no-provider path
                 └─ Continue → record acknowledgement and run request
```

#### Memory review

```text
Assistant suggests a memory
  └─ User chooses:
       ├─ Save
       ├─ Edit then save
       └─ Dismiss
```

### 11. Admin and user settings

Harness has two settings layers:

| Layer    | Owner                      | Examples                                                          |
| -------- | -------------------------- | ----------------------------------------------------------------- |
| Instance | Admin/operator             | enabled providers, default provider, model allowlist, limits.     |
| User     | Current authenticated user | default conversation model, memory preferences, acknowledgements. |

Instance settings should live in Harness's isolated DB unless they need to be
visible to runtime health checks. Secrets stay in env vars for Phase 1.

Suggested instance settings:

- default provider;
- allowed provider IDs;
- allowed model IDs;
- maximum input tokens;
- maximum output tokens;
- monthly request budget per user;
- whether external providers are available at all;
- whether plugin context suggestions are enabled.

Suggested user settings:

- default provider/model from the allowed set;
- external provider acknowledgement timestamp;
- memory enabled/disabled;
- whether assistant may suggest plugin sources;
- whether assistant may suggest memory saves.

### 12. Auditing and observability

Harness writes activity events for meaningful actions:

- `harness.conversation_created`
- `harness.model_run_started`
- `harness.model_run_completed`
- `harness.model_run_failed`
- `harness.plugin_context_requested`
- `harness.plugin_context_read`
- `harness.memory_saved`
- `harness.memory_deleted`

Raw prompts and model responses should not be written to the platform-wide
activity log. They remain in Harness's own DB where user deletion and export
rules are clearer. Activity log metadata should include IDs and counts, not full
content.

Run traces inside Harness should be visible to the user and to admins only when
an explicit support/debug policy allows it. By default, admins see aggregate
provider health and usage, not private conversation content.

### 13. Security and privacy requirements

1. **No default external egress.** With no provider env configured, Harness
   cannot call external models.
2. **No silent provider fallback.** Local-to-external fallback is forbidden.
3. **Secrets do not enter generated artifacts.** Provider API keys use
   plugin-scoped secret env vars.
4. **Cross-plugin data is consent-gated.** Harness uses RFC 0002; no direct
   plugin DB reads.
5. **User memory is inspectable and erasable.** Hidden memory is not allowed.
6. **Raw conversation content stays in Harness.** Platform activity logs store
   metadata only.
7. **External model use is capability-gated.** Operators can allow local AI
   without allowing hosted providers.
8. **Prompt injection is treated as an application risk.** Context retrieved
   from plugins is untrusted model input, not instructions. Harness must
   separate system/developer instructions from retrieved user data.
9. **High-risk tools require confirmation.** Future mutating tools cannot run
   silently.
10. **Network tools are out of scope until sandboxed.** Web browsing, computer
    use, and coding-agent execution require separate RFCs.

## Alternatives considered

### Build AI features separately in each plugin

Rejected. It duplicates model configuration, memory, and audit behavior. It also
makes it harder for users to understand which plugin sent which data to which
model provider.

### Make model access a core runtime service immediately

Rejected for Phase 1. Harness can prove the product and safety model as a
plugin. A platform-level `sdk.ai` broker can be introduced later if multiple
plugins need direct model access.

### Depend on a single hosted model provider

Rejected. It conflicts with Sovereign's self-hosted and privacy-first
positioning. Hosted providers are useful, but they must be optional and visible.

### Local models only

Rejected as the only mode. Local models are important, but many operators will
prefer hosted models for quality, speed, or hardware reasons. The architecture
should support both without hiding the privacy tradeoff.

### Store user API keys in the database in Phase 1

Rejected for now. Bring-your-own-key is useful, but storing user secrets needs a
stronger secret-management story than plain platform tables. Instance-level env
configuration is less flexible but safer for the first version.

### Give Harness direct read access to every plugin table

Rejected. That would violate the plugin boundary and bypass user consent.
Harness should be a first-class consumer of cross-plugin data contracts, not a
privileged database crawler.

## Open questions

1. **Provider settings UI.** Should provider availability be configured in
   Harness Settings, Console, or both?
2. **User BYOK.** What secret store is required before per-user API keys are
   acceptable?
3. **Embedding storage.** Should Phase 1 include embeddings at all, and if so,
   should embeddings live in SQLite/Postgres tables or a local vector index?
4. **Admin visibility.** What is the right support model for admins debugging
   failed user conversations without reading private content?
5. **Plugin tool contract.** Should mutating tools extend RFC 0002 or become a
   new manifest/SDK surface?
6. **Web search.** Should web search be a Harness feature, a separate plugin, or
   a tool provider contract?
7. **Verification gates.** Which Harness capabilities should require stronger
   user verification once RFC 0035 is implemented?

## Adoption path

1. **RFC draft:** agree on scope, safety boundaries, and provider model for a
   platform-shipped Harness plugin.
2. **Phase 1 — Assistant core:** plugin scaffold, isolated DB, conversation UI,
   model provider abstraction, env-based provider config, local memory, run
   traces, external-provider disclosure.
3. **Phase 2 — Sovereign context:** integrate `sdk.data.query()` source
   attachment, consent prompts, source traces, activity logging, user-visible
   memory review.
4. **Phase 3 — Operations:** admin usage dashboard, provider health, budgets,
   export/import/delete participation, notification on long-running tasks.
5. **Phase 4 — Tools:** separate RFC for plugin-authored tools, mutating
   actions, web search, computer use, coding agents, and sandboxing.
6. **Possible later SDK extraction:** if other plugins need model access,
   extract a stable `sdk.ai` or model-broker package from Harness after the
   internal provider abstraction has proven itself.

## Semver and package impact

Phase 1 can avoid changes to published packages if Harness only uses existing
SDK surfaces: `auth`, `db`, `data`, `activity`, `notifications`, `platform`, and
`env`.

Possible later package changes:

| Package                 | Change                                                     | Semver |
| ----------------------- | ---------------------------------------------------------- | ------ |
| `@sovereignfs/sdk`      | Add `sdk.ai` or plugin tool contracts if generalized.      | minor  |
| `@sovereignfs/manifest` | Add tool declarations or AI provider metadata if needed.   | minor  |
| `@sovereignfs/db`       | Add platform tables only if model broker moves to runtime. | minor  |
| `@sovereignfs/ui`       | Add chat/run-trace/memory review primitives if reusable.   | minor  |

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
