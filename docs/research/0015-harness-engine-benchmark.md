# Research 0015 — `apps/harness` engine: llama.cpp vs. Ollama

**Status:** Decided\
**Date:** August 2026\
**Author:** kasunben\
**Scope:** `apps/harness` (new)\
**Related:** [RFC 0063](../rfcs/0063-core-assistant-jarvis.md) (Warden, the
consumer of this decision), epic task 22.1; `sovereign-os`'s
`docs/research/local-ai-options.md` and
`docs/adrs/0013-initial-inference-runner-and-model-selection.md` (separate
repo in this workspace) — real prior art on the same engine choice for a
different target (Raspberry Pi appliance vs. general self-hosted server);
see Findings for why the result doesn't transfer automatically

---

## Question

`apps/harness`, the new dedicated engine service backing the Warden platform
plugin (RFC 0063), needs to wrap exactly one local inference engine. The two
real candidates are **llama.cpp server** and **Ollama**. Which one, and why —
decided by a real, measured comparison rather than by reputation or
convenience.

This doc frames the question and the evaluation method. See "Decision" below
for the measured result — epic task 22.1's benchmark has now run.

## Findings

Current-state facts the comparison should be measured against, not assumed:

- **Correction to this doc's first draft:** it previously claimed
  `sovereign-mobile` and `sovereign-desktop` standardize on `llama.cpp` for
  on-device inference. That's wrong — both are thin Capacitor/Tauri shells
  that load a self-hosted Sovereign instance's web UI in a WebView; neither
  bundles or runs any local model at all (confirmed: no `llama`/`ollama`/
  `inference` reference in either repo beyond a one-line "distinct from
  sovereign-edge" disclaimer in `sovereign-mobile/CONCEPT.md:129`). The two
  repos that actually run local inference are **`sovereign-edge`** (a fully
  offline mobile AI app, `llama.rn`/GGUF) and **`sovereign-os`** (a
  Raspberry Pi appliance OS with its own Conversation Service) — both
  separate repos in this workspace.
- **`sovereign-os` already ran this exact comparison and decided**, for its
  own target hardware — this is real, directly relevant prior art, not a
  cold start. Per `sovereign-os/docs/research/local-ai-options.md` and
  `sovereign-os/docs/adrs/0013-initial-inference-runner-and-model-selection.md`
  (Accepted, 2026-08-09): **llama.cpp beat Ollama**, decided on two
  concrete, measured findings — (1) llama.cpp scored 85% vs. Ollama's 75%
  on an identical 28-item tool-call corpus, and (2) Ollama's lazy model
  loading cost a confirmed, reproducible **6.96s time-to-first-token** on a
  question llama.cpp answered in **0.18s** (a cold-start penalty, not a
  steady-state difference). Six real hardware passes across two corpora
  backed this decision, not a single quick run.
- **That result doesn't automatically transfer here, and shouldn't be
  treated as this decision pre-made.** `sovereign-os`'s target is a
  resource-constrained ARM64 Raspberry Pi 5 appliance running one
  co-located service (Pi-hole) alongside inference; `apps/harness` targets
  general self-hosted deployments — likely x86_64 VPS-class or bare-metal
  hardware, running alongside the full Sovereign platform stack (runtime,
  `apps/auth`, Postgres/SQLite, optionally Redis), a different resource
  ceiling and a different "what else is competing for RAM/CPU" picture.
  Ollama's cold-start penalty in particular may matter less on a
  Docker Compose service kept warm than on an appliance optimizing for idle
  power. Treat `sovereign-os`'s numbers as a strong prior and a benchmark
  method to reuse, not as license to skip task 22.1's own measurement on
  representative server hardware.
- Ollama exposes OpenAI-compatible `/v1/chat/completions` with streaming,
  JSON mode, and tool support out of the box
  ([docs](https://docs.ollama.com/api/openai-compatibility)), plus its own
  model pull/management UX (`ollama pull qwen3:1.7b`) — meaningfully less
  engineering effort to wrap than rolling model download/verification by
  hand.
- llama.cpp server also exposes an OpenAI-compatible chat endpoint with
  JSON/schema-constrained output and tool support
  ([docs](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)),
  but has no built-in model registry/pull mechanism — `apps/harness` would
  need to own model download, verification, and storage itself if this
  engine is chosen (a real, non-trivial addition to task 22.2's scope).
- The recommended default model, `qwen3:1.7b` (1.4GB, 40K context) with
  `qwen3:0.6b` (523MB, 40K context) as a low-resource fallback, is available
  in GGUF form for llama.cpp and in Ollama's own model library for Ollama —
  the model choice doesn't constrain the engine choice either way.
- Neither engine's actual runtime resource footprint (idle memory, cold-load
  time, tokens/sec on realistic hardware) has been measured for this
  specific workload as of this doc's writing — every claim above is about
  API shape and ecosystem fit, not performance.

## Options considered

### Ollama

- **For:** built-in model management (pull/list/remove), official Docker
  image, broad model library, OpenAI-compatible API with minimal wrapper
  code needed in `apps/harness`.
- **Against:** heavier daemon (a full server process, not just an inference
  library), less direct control over quantization/context parameters, a
  second update/security surface to track (Ollama's own release cadence, on
  top of the underlying llama.cpp it's built on).

### llama.cpp server

- **For:** lighter footprint, direct GGUF/quantization control, matches the
  engine already operationally proven in `sovereign-edge` (mobile, on-device)
  and — more directly relevant here — already benchmarked and selected over
  Ollama in `sovereign-os`'s own self-hosted-appliance context, on real
  measured data (85% vs. 75% corpus accuracy; no cold-start penalty vs.
  Ollama's confirmed 6.96s TTFT). Real shared team knowledge and a reusable
  benchmark method, not just a vague ecosystem-consistency argument.
- **Against:** `apps/harness` would need to build its own model
  download/verification/storage layer — llama.cpp server itself doesn't
  provide one. Real added scope to task 22.2 if chosen, not free.
  `sovereign-os`'s own Follow-up Decisions log this as a still-open piece of
  its equivalent RFC-0002, for reference — this repo would face the same
  open question, not a solved one.

## Decision

**llama.cpp server.** Measured 2026-08-13 on the actual production
self-hosting box (`openfs`, 2 vCPU / 3.7GB RAM, no GPU) — genuinely
representative hardware, not a dev workstation. Tooling and raw reports live
in `scripts/harness-benchmark/` (not shipped product code; throwaway rig for
this task) with results in `scripts/harness-benchmark/results/*.json`.

### Results

|                     | llama.cpp `1.7b` | llama.cpp `0.6b` | Ollama `1.7b`           | Ollama `0.6b` |
| ------------------- | ---------------- | ---------------- | ----------------------- | ------------- |
| Cold-start TTFT     | 1.32s            | 0.46s            | not captured (see note) | 11.71s        |
| Warm avg TTFT       | 0.86s            | 0.41s            | 20.83s                  | 9.12s         |
| Warm avg tokens/sec | 7.15             | 16.61            | 7.37                    | 16.45         |

(Ollama `1.7b`'s cold pass is not directly comparable — see the thinking-mode
finding below; a clean re-run landed as a warm-cache pass instead of
recapturing cold-start specifically, since by that point the cold-start
question had already been answered by the `0.6b` pass and the llama.cpp
passes.)

### Why llama.cpp won: it isn't close, and it isn't really about raw speed

Raw token-generation throughput is nearly identical between the two engines
— expected, since both run the same underlying compute on the same
quantized weights. The decisive gap is almost entirely about **Qwen3's
default "thinking" mode**, which turned out to be the real story of this
benchmark, not a footnote:

- Qwen3 models think by default — reasoning tokens stream separately from
  the actual answer (a distinct API field) and can consume an entire
  response's token budget before any visible answer text appears.
- **llama.cpp server** exposes `chat_template_kwargs.enable_thinking: false`
  and it works correctly — disabling it drops TTFT to sub-second across
  both model sizes.
- **Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`, v0.32.9)
  does not honor `think: false` at all.** Only Ollama's own native
  `/api/chat` endpoint respects that flag (confirmed directly: identical
  request against `/api/chat` disables thinking correctly). Every request
  through Ollama's OpenAI-compatible surface pays the full reasoning tax —
  9–21 seconds of silence before any answer, far outside acceptable chat
  latency for Warden.
- The two engines also disagree on the streaming field name for reasoning
  tokens: `reasoning_content` (llama.cpp, OpenAI's own convention) vs.
  `reasoning` (Ollama). A client written against one silently drops the
  other's reasoning stream unless it checks both — confirmed the hard way
  when the first benchmark pass showed several prompts returning empty
  completions with a full token count consumed.

This directly echoes `sovereign-os`'s own finding that Ollama carries a real
latency cost llama.cpp doesn't — but the mechanism here is different from
`sovereign-os`'s cold-load-time story. There, it was lazy model loading. Here
(on a kept-warm Compose service, as anticipated), model loading isn't the
issue at all — it's that Ollama's more convenient API surface (its
OpenAI-compatible endpoint, the one every wrapper would default to using)
simply doesn't support turning off a behavior that's disqualifying for a
basic-chat product surface.

### Engineering cost

- **Model download/verification**: real added scope for llama.cpp as
  expected — `apps/harness` (leg 2) must build this itself. Confirmed
  workable in practice: `curl` against the correct GGUF repo is enough (see
  note below on repo drift), no auth/EULA gate hit.
- **One correction to this doc's assumption**: the _official_
  `Qwen/Qwen3-{0.6B,1.7B}-GGUF` repos on Hugging Face only publish `Q8_0`
  quantization, not `Q4_K_M`. The `Q4_K_M` files used for this benchmark
  came from the community `unsloth/Qwen3-{0.6B,1.7B}-GGUF` repos instead.
  `apps/harness`'s model download/verification layer (leg 2) needs to know
  this — hardcoding the official Qwen repo path and assuming `Q4_K_M`
  exists there will 404.
- **Chat API shape**: both engines expose OpenAI-compatible streaming
  endpoints, confirming this doc's earlier finding — but Ollama's version of
  that compatibility is incomplete (the thinking-mode gap above). To get
  Ollama to genuinely equivalent no-think chat behavior, `apps/harness`
  would have to abandon the OpenAI-compatible surface for Ollama
  specifically and integrate its native `/api/chat` instead — a real,
  asymmetric engineering cost llama.cpp doesn't impose. Since task 22.2's
  own scope already says the internal chat API doesn't need to be literally
  OpenAI-compatible, this cost is avoidable by choosing llama.cpp, not by
  designing around it.
- **Licensing**: no concern for either path. llama.cpp (MIT), Ollama (MIT),
  and the Qwen3 model weights themselves (Apache 2.0) all impose no
  self-hosting/redistribution restriction and require no EULA acceptance —
  resolves this doc's open question below.

### Resource footprint on representative hardware

Both engines used comparable memory in practice — around 2GB resident for
the `1.7b` model, out of 3.7GB total on the benchmark box, alongside the
platform's own live `sovereign-runtime`/`sovereign-auth`/`sovereign-sqld`/
`sovereign-postgres`/`caddy` stack (already consuming ~1GB). Available memory
never dropped below ~800MB during any single pass; no OOM, no measurable
production-service degradation. This is genuinely tight on a 4GB-class VPS,
though — a production `apps/harness` deployment should budget for it
explicitly (Warden's leg 3 request-limit work, and this data point, should
inform that), and it's a real argument for `0.6b` as more than just a
"fallback" on the smallest self-hosting tiers.

## Recommendation

**llama.cpp server**, per the Decision above. Locked in for epic task 22.2
(`apps/harness` scaffold, workstream 0014 leg 2), which now needs to build
its own model download/verification/storage layer against the `unsloth`
GGUF repos (not the official `Qwen` ones) and should default
`chat_template_kwargs.enable_thinking: false` for phase 1's chat-only scope.

**Proposed benchmark method** (as executed by task 22.1) — reused
`sovereign-os`'s method rather than designing one from scratch, since it was
already proven useful there:

1. Run both engines with `qwen3:1.7b` on representative self-hosting
   hardware (a modest VPS-class machine, not a high-end workstation — match
   the resource ceiling a real operator is likely to run Sovereign on, the
   server equivalent of `sovereign-os`'s own "target the real device, not a
   dev workstation" discipline).
2. Measure: cold-start/model-load time, idle memory footprint, tokens/sec
   for a short chat-shaped completion, and time-to-first-token —
   specifically check for the same Ollama lazy-load cold-start penalty
   `sovereign-os` found (6.96s TTFT), since a Compose service that's kept
   warm may or may not reproduce it. (It didn't reproduce in that form here
   — the dominant cost turned out to be thinking-mode handling instead, see
   Decision above.)
3. If tool-call accuracy ever becomes relevant to this decision (it isn't
   for phase 1's chat-only scope, but the comparison method transfers), a
   small versioned prompt corpus like `sovereign-os`'s 28-item set is a
   reusable pattern worth borrowing rather than reinventing.
4. Measure engineering cost qualitatively: lines of wrapper code needed for
   each to expose the internal chat API `apps/harness` needs, and whether
   model download/verification needs to be hand-built (llama.cpp) or comes
   free (Ollama) — `sovereign-os` left this exact question open for its own
   RFC-0002 equivalent; this doc's own answer is recorded above.
5. Record both engines' numbers and qualitative cost side by side — don't
   discard the losing engine's data, future re-evaluation may need it. (Kept
   in full in `scripts/harness-benchmark/results/*.json`.)

## Open questions

- ~~Should the benchmark also cover `qwen3:0.6b`...~~ Resolved: yes, and it
  mattered — `0.6b` roughly doubles throughput over `1.7b` on this hardware
  (see Decision above), a meaningful data point for the smallest
  self-hosting tiers.
- ~~Does either engine's licensing or distribution model create a
  self-hosting concern...~~ Resolved: no concern for either engine or the
  model weights — see Decision above.

## Next steps

**Graduates directly into epic task 22.1's own output** — no separate RFC
needed for this decision. Per RFC 0063's adoption path, task 22.1 is
"resolve this research doc": run the benchmark described above, fill in a
"Decision" section in this file with the result and the reasoning, and only
then does task 22.2 (`apps/harness` scaffold) start. This doc should be
updated in place when that happens, not left stale — its own Status line
should move from `Exploratory` to `Decided` at that point.
