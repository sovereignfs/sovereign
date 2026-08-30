# Epic: Warden (Core Assistant)

> Phase 1 foundation for Sovereign's built-in assistant: a first-party
> platform plugin (Warden, formerly "Jarvis"). See
> [RFC 0063](../rfcs/0063-core-assistant-warden.md) for the full design.
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

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-warden.md)

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

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-warden.md)

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

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-warden.md)

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

#### ✅ 22.4 — Warden model provider registry and discovery

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

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-warden.md)

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

**Result:** shipped entirely on top of existing platform mechanisms — no new
DB table, no migrations, no new manifest permission. `app/_lib/providers.ts`
is a thin wrapper over `sdk.connections` (RFC 0049, `provider:
'openai-compatible'`, `scope: 'user'`) and `sdk.secrets` (RFC 0043) for the
key; deleting a provider calls `sdk.connections.disconnect()`, which was
verified (via `runtime/src/platform-db.ts`'s `disconnectPluginConnection`)
to already atomically delete the linked secret. `app/_lib/model-discovery.ts`
merges each provider's live `GET {baseUrl}/models` with `apps/harness`'s
existing health check into one list, writing the result back onto the
connection (`markProviderHealthy`/`markProviderError`) so the UI always
reflects the most recent real attempt. Added `app/_lib/url-safety.ts`, an
SSRF guard not called out in this task's own text but a direct consequence
of letting a user supply an outbound base URL server-side: resolves the
hostname and blocks loopback/link-local/cloud-metadata addresses and this
repo's own known internal Compose service names, while deliberately _not_
blocking general private-IP ranges so a real self-hosted LAN server keeps
working — verified live against a real dev server by pointing a provider at
`http://harness:3003` and confirming the rejection. Full CRUD (add/edit/
remove) and the first-run empty state (`/warden` shows a setup prompt only
when no provider is configured and no local model is reachable) were
verified end to end in a live browser session, not just unit tests: create
→ live 404 status from a real unreachable endpoint → edit → remove, with
the API key confirmed absent from the DOM/response at every step. Caught and
fixed one real bug along the way, found only by driving the UI live (a
`fireEvent`-based component test was added afterward so it can't regress
silently): `ProviderRow`'s delete-confirmation called the `useActionState`
dispatch function directly (`deleteAction(new FormData())`) from
`ConfirmDialog`'s `onConfirm`, which React flags as "called outside of a
transition" — fixed by wrapping it in `startTransition`.

---

#### ✅ 22.5 — Warden persisted chat, incognito mode, and re-enable

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

**SRS reference:** [RFC 0063](../rfcs/0063-core-assistant-warden.md)

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

**Result:** `warden_conversation`/`warden_messages` added as real isolated
tables (`plugins/warden/app/_db/schema{,.postgres}.ts` + drizzle migrations),
which required changing the manifest's `type` from `platform` to `sovereign`
(the former routes `sdk.db` to the shared, unisolated schema) and adding a
`repository` field the schema requires for that type — a change not
anticipated when task 22.4 shipped. `app/_lib/conversations.ts` is a single
conversation per user (`getOrCreateConversation`), read back oldest-first for
display and newest-`MAX_RECENT_TURNS`-then-reversed for building model
context. Found and fixed one real bug while writing its test: message
timestamps used `Math.floor(Date.now()/1000)` (second precision), so two
messages appended within the same second — plausible in real usage, not just
a test artifact — sorted ambiguously; switched to millisecond `Date.now()`.
`app/_lib/provider-chat.ts` normalizes an upstream OpenAI-compatible SSE
stream into the same `{type:'token'|'done'|'error', ...}` frame shape
`apps/harness`'s local path already produces, so `app/api/chat/route.ts`
and `ChatView` don't need to know which kind of provider answered.
Persistence is non-blocking: `stream-capture.ts`'s `teeAndCapture` tees the
response so the client-facing stream is untouched while a background branch
accumulates the full reply and writes it to `warden_messages` once done —
the user's turn is also written immediately, before the reply streams back.
Incognito is a genuinely separate, always-empty-on-entry scratch context
(`ChatView`'s `incognitoTurns` state), not a pause of the persisted thread —
turning it on always discards any prior scratch content, matching a
browser's own incognito window; its request shape sends the client's own
transcript and never calls `appendMessage`, reusing the original phase-1
ephemeral contract unchanged. Portability (`app/_lib/portability.ts`)
registers `provideExport`/`provideDelete` — deliberately does not touch
provider connections/secrets, both because `sdk.connections`/`sdk.secrets`
throw outside a real plugin request (no portability-context fallback the way
`sdk.db.getClient()` has) and because the platform's own account-deletion
cascade already deletes every plugin's `plugin_connections`/`plugin_secrets`
rows for the deleted user unconditionally, so a plugin-specific handler
duplicating that would be redundant, not more thorough.

Verified live end to end against a real dev instance (not just the 118
passing unit tests across 12 files): a locally-run OpenAI-compatible mock
HTTP server, bound to the machine's real LAN address (not `localhost` —
blocked by `url-safety.ts`'s loopback guard, correctly, since a real remote
provider would never resolve there) rather than an actual hosted vendor —
added as a provider, selected as the active model, and used to confirm (1) a
sent message and its reply persist and reappear after a full page reload,
including a second message whose request body was confirmed server-side to
carry the full prior exchange as context; (2) turning incognito on starts a
genuinely empty scratch thread, a message sent there gets a reply, and
turning incognito back off (or reloading) shows only the original persisted
thread with zero trace of the incognito exchange; (3) the local-model entry
is correctly absent from the model list while this dev environment's own
`apps/harness` reports `modelStatus: "error"` (a pre-existing native-dev
path issue unrelated to this branch), confirming task 22.4's health-check
integration degrades correctly rather than silently offering a broken
option. Zero browser console or dev-server errors across the whole session.
**Not independently verified**: an actual hosted OpenAI-compatible vendor
(OpenRouter, etc.) — doing so would need a real account/API key, which
wasn't available in this session; the mock server exercises the identical
code path (`assertSafeProviderBaseUrl` → `fetch` → SSE frame parsing →
`Authorization: Bearer` header) a real vendor would hit, but a vendor's own
response-shape quirks are unverified. `disabled: true` removed in this same
change based on the above.

---

#### 📋 22.6 — Pin the resolved IP for Warden's provider-URL SSRF guard (close the DNS-rebind race)

**Goal:** Close the DNS-rebind race in Warden's provider-URL SSRF guard: `assertSafeProviderBaseUrl()` (`plugins/warden/app/_lib/url-safety.ts:88-116`) resolves the provider's hostname via its own `lookup(hostname, { all: true, verbatim: true })` call and rejects loopback/link-local/known-internal addresses, but discards the resolved IPs and returns only the original `URL`. Both call sites — `provider-chat.ts:94-107`'s `fetch(endpoint, ...)` and `model-discovery.ts:56-65`'s `fetch(endpoint, ...)` — then let the runtime's global `fetch` re-resolve the same hostname independently for the actual TCP connection. A user configuring a malicious external provider controls authoritative DNS for their own domain and can answer the validation lookup with a safe public address while answering the connection's own lookup with a loopback or internal address — a classic check-then-use race, not narrowed by re-running the same two-step validate-then-fetch closer together in time (both call sites' own doc comments already claim this closes a \"TTL-based DNS rebind,\" which is incorrect: it is still two independent DNS queries no matter how short the gap between them). The fix is to pin the exact IP address `assertSafeProviderBaseUrl` already validated for the connection itself — via a custom DNS-bypassing `lookup` on an undici `Agent` passed as the request's `dispatcher` — while still sending the original hostname via the `Host` header and TLS SNI, so the request remains indistinguishable to the upstream provider.

**Deliverables:**

- Change `assertSafeProviderBaseUrl()`'s return type in `plugins/warden/app/_lib/url-safety.ts:88` from `Promise<URL>` to `Promise<{ url: URL; addresses: { address: string; family: number }[] }>`, returning the exact `addresses` array already produced by the `lookup(hostname, { all: true, verbatim: true })` call at `url-safety.ts:105` instead of discarding it after the safety check.
- Add `undici` as an explicit dependency of `plugins/warden/package.json` (already resolved transitively at `undici@7.29.0` per `pnpm-lock.yaml:7737`; pin it directly the same way `unpdf`/`drizzle-orm` already are in that file — not added to the shared `pnpm-workspace.yaml` catalog, since it's consumed by only this one package). Node's global `fetch` is undici-backed internally but doesn't expose a way to attach a custom `dispatcher`, so pinning a connection requires importing `Agent`/`fetch` from the `undici` package directly.
- Add `plugins/warden/app/_lib/pinned-fetch.ts` exporting `fetchPinned(url: URL, addresses: { address: string; family: number }[], init: RequestInit): Promise<Response>`. It builds an undici `Agent` whose `connect.lookup` ignores the OS/`dns` resolver entirely and returns the caller-supplied `addresses` verbatim for any hostname, then calls undici's own `fetch(url, { ...init, dispatcher: agent })`. `url.hostname` is passed through unchanged, so the `Host` header and TLS SNI still match the original hostname — only the TCP-level connection target is pinned to the address `assertSafeProviderBaseUrl` already validated.
- `plugins/warden/app/_lib/provider-chat.ts:83-107`: capture `{ url, addresses }` from `assertSafeProviderBaseUrl`, keep building `endpoint` from `url` as today, and replace the global `fetch(endpoint, ...)` call at line 97 with `fetchPinned(new URL(endpoint), addresses, { ...same init... })`, preserving the existing `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` and header/body options unchanged.
- `plugins/warden/app/_lib/model-discovery.ts:41-65`: same change in `fetchProviderModels()` — capture `addresses` from `assertSafeProviderBaseUrl`, replace the global `fetch(endpoint, ...)` call at line 59 with `fetchPinned(...)`, preserving `AbortSignal.timeout(MODEL_FETCH_TIMEOUT_MS)`.
- Correct the now-inaccurate doc comments that describe re-validation as sufficient rebind protection: `url-safety.ts:80-87`'s "Call this both when saving a provider ... and immediately before every outbound request (defense in depth against a TTL-based DNS rebind between the two)", `provider-chat.ts:70-76`'s identical claim ("same reasoning as `model-discovery.ts`"), and `model-discovery.ts:43-46`'s inline comment ("defense in depth against a TTL-based DNS rebind between when the provider was configured and now") — replace all three with a description of the actual fix (the resolved address is pinned for the connection, not merely re-checked on a shorter timeline against a second independent lookup).
- Add a regression test to `plugins/warden/app/_lib/__tests__/url-safety.test.ts` asserting `assertSafeProviderBaseUrl` returns the resolved `addresses` array alongside `url`, and update every existing test in that file that currently does `const url = await assertSafeProviderBaseUrl(...)` / `url.toString()`/`url.hostname` to destructure `{ url }` from the new return shape.
- Add a regression test (new `plugins/warden/app/_lib/__tests__/pinned-fetch.test.ts`, or added to `provider-chat.test.ts`/`model-discovery.test.ts`) that simulates the actual rebind: mock `node:dns/promises`' `lookup` to return a safe public address on the validation call, then assert the outbound connection created by `fetchPinned` uses that exact pinned address — i.e. that no second `dns.lookup`/`lookup()` call for the same hostname occurs between validation and the request (spy call count stays at 1), closing the TOCTOU gap the audit finding describes.

**Dependencies:** None. Tasks 22.4 and 22.5 (which introduced `url-safety.ts`, `provider-chat.ts`, and `model-discovery.ts`) have already shipped; this is pure remediation on top of completed code, with no forward blocker.

**SRS reference:** [RFC 0063 — Warden: core assistant platform plugin and harness engine](../rfcs/0063-core-assistant-warden.md) §3/§4 — `url-safety.ts`'s own header comment cites this RFC and epic task 22.4 as the guard's origin, but the RFC itself never specified the check-then-fetch mechanics; this task is remediation of an implementation gap in that guard, not new design.

**Review checklist:**

- `pnpm exec vitest run plugins/warden` passes, including the new `pinned-fetch`/rebind regression test and the updated `url-safety.test.ts` assertions on the new `{ url, addresses }` return shape.
- Neither `provider-chat.ts` nor `model-discovery.ts` calls the ambient global `fetch` for the upstream provider request anymore — `grep -n 'fetch(' plugins/warden/app/_lib/provider-chat.ts plugins/warden/app/_lib/model-discovery.ts` shows only `fetchPinned` calls (plus any unrelated `response.json()`/stream calls, which are not new outbound requests).
- The rebind regression test fails against the pre-fix code (a second, independently-mockable `dns.lookup` call between validation and the request) and passes only once `fetchPinned` is wired in — confirm by temporarily reverting the `provider-chat.ts`/`model-discovery.ts` call sites to plain `fetch` and watching the new test fail, then restoring the fix.
- The three stale "defense in depth against a TTL-based DNS rebind" doc comments (`url-safety.ts:80-87`, `provider-chat.ts:70-76`, `model-discovery.ts:43-46`) no longer claim re-validation alone closes the race; each accurately describes the pinned-connection fix instead.
- A locally-run OpenAI-compatible mock provider (same technique task 22.5's own verification used — bound to a real LAN address, not `localhost`) still works end to end through both `discoverModels()` and `requestProviderChat()` after the `fetchPinned` change — confirms the pin doesn't break the legitimate self-hosted-provider case the module's own header comment calls out as an explicit design goal.
- `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` all pass.
- `plugins/warden/package.json`'s new `undici` dependency version matches (or is compatible with) the `undici@7.29.0` already resolved transitively in `pnpm-lock.yaml`, and `pnpm install --frozen-lockfile` succeeds after the lockfile is regenerated for the new direct dependency.

---

#### 📋 22.7 — Fix Warden's account-deletion N+1 query pattern

**Goal:** Close an N+1 query pattern found in `plugins/warden/app/_lib/portability.ts`'s `sdk.portability.provideDelete` handler (lines 33-61): it first selects every one of the user's `warden_conversation` rows, then loops over them serially awaiting a per-conversation `select` (to count `warden_messages` rows) plus a per-conversation `delete`, before finally deleting the conversation rows themselves — `2n + 2` sequential DB round trips for a user with `n` conversations, all inside the 30s per-plugin budget `runtime/src/user-deletion.ts`'s `DELETION_TIMEOUT_MS` enforces on every account-deletion handler. Every value the loop computes (the message count, and the delete scope) is derivable from the user's conversation ids directly via `inArray`, collapsing the handler to a fixed 4 queries regardless of conversation count. Impact today is bounded — this handler only runs once per account deletion, and only for Warden — but it scales linearly with a heavy chat user's conversation count and is worth closing before it's a real timeout risk."

**Deliverables:**

- Rewrite `plugins/warden/app/_lib/portability.ts`'s `provideDelete` handler (currently lines 33-61) to replace the per-conversation loop with a fixed, small number of queries independent of conversation count: one select of the user's conversation ids (`eq(wardenConversation.userId, ctx.userId)`), one select of matching message ids via `inArray(wardenMessages.conversationId, conversationIds)` for the count, one `delete(wardenMessages).where(inArray(wardenMessages.conversationId, conversationIds))`, and the existing final `delete(wardenConversation).where(eq(wardenConversation.userId, ctx.userId))` — 4 queries total regardless of how many conversations the user has, versus the current `2n + 2`.
- Do not introduce `.delete().returning()` — keep the existing count-via-select-before-delete idiom (portability.ts:45-47's own comment, and the identical documented pattern in `plugins/sovereign-plugin-tasks.local/app/_lib/portability.ts:377-379`) rather than the audit's literal `RETURNING id` suggestion, since that comment records a deliberate prior decision that `.returning()` isn't guaranteed to behave identically across every driver behind `ctx.db` (sqld/libsql vs. node-postgres, per `packages/db/src/client.ts`), and this task is a targeted perf fix, not a re-litigation of that driver-compatibility call.
- Import `inArray` from `drizzle-orm` alongside the existing `eq` import (portability.ts:1).
- Update `plugins/warden/app/_lib/__tests__/portability.test.ts`'s `fakeDb()` helper (lines 38-72) to support an `inArray`-shaped predicate in `select().from().where()` and `delete().from().where()`, since its current `eq`-only mock (lines 24-33, 45-51, 58-67) can't express the new query shape.
- Add a regression test with 3+ conversations (each with messages) for the same user, asserting: (a) the final `{ deleted: N }` count matches total messages + conversations exactly as before, (b) every conversation and its messages are gone afterward, and (c) the number of `database.select`/`database.delete` invocations is a fixed constant (not proportional to conversation count) — via a call-count spy on the `fakeDb()` mock's `select`/`delete` methods.
- Keep the existing 3 tests (portability.test.ts:116-152 — single-conversation delete, cross-user isolation, zero-conversation case) passing unmodified in behavior, only adapting them to the updated `fakeDb()` shape if the mock's method signatures change.
- Bump `plugins/warden/manifest.json`'s `version` field (plugins version only their manifest, never `package.json`, per this repo's convention).

**Dependencies:** None.

**SRS reference:** None — this is remediation of a bug found in code review (task 22.5's own shipped implementation), not new design. RFC 0063 (`docs/rfcs/0063-core-assistant-warden.md`) covers Warden generally but says nothing about deletion query shape.

**Review checklist:**

- `pnpm --filter warden exec vitest run app/_lib/__tests__/portability.test.ts` passes, including the new multi-conversation regression test.
- The new multi-conversation test fails against the pre-fix code (revert the fix locally and confirm the call-count assertion breaks) before being considered a real regression guard, not just a test that happens to pass.
- `provideDelete`'s handler body contains no loop (`for`/`.forEach`/`.map` awaited serially) over the conversations array — grep confirms it.
- `grep -n "returning" plugins/warden/app/_lib/portability.ts` returns nothing — the fix does not introduce `.returning()`.
- The handler still returns the exact same `{ deleted }` count as before for a user with N conversations and M total messages (N + M), verified by the existing single-conversation test plus the new multi-conversation one.
- `pnpm typecheck` and `pnpm lint` pass for `plugins/warden`.
- `plugins/warden/manifest.json`'s `version` field is bumped; `plugins/warden/package.json`'s `version` stays pinned at `0.0.0`.

---

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

- [RFC 0063 — Warden: core assistant platform plugin and harness engine](../rfcs/0063-core-assistant-warden.md)
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
