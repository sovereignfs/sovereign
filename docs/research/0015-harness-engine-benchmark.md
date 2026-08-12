# Research 0015 — `apps/harness` engine: llama.cpp vs. Ollama

**Status:** Exploratory\
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

This doc frames the question and the evaluation method. **It does not yet
contain the benchmark results or a decision** — that's epic task 22.1's job,
to be filled in when that task runs. See "Next steps."

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

## Recommendation

**Not yet made.** This doc intentionally stops short of a recommendation —
per [RFC 0063](../rfcs/0063-core-assistant-jarvis.md)'s explicit instruction,
the choice is gated on epic task 22.1 actually running the benchmark, not on
this doc's authors' priors.

**Proposed benchmark method**, to be executed by task 22.1 — reusing
`sovereign-os`'s method rather than designing one from scratch, since it's
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
   warm may or may not reproduce it.
3. If tool-call accuracy ever becomes relevant to this decision (it isn't
   for phase 1's chat-only scope, but the comparison method transfers), a
   small versioned prompt corpus like `sovereign-os`'s 28-item set is a
   reusable pattern worth borrowing rather than reinventing.
4. Measure engineering cost qualitatively: lines of wrapper code needed for
   each to expose the internal chat API `apps/harness` needs, and whether
   model download/verification needs to be hand-built (llama.cpp) or comes
   free (Ollama) — `sovereign-os` left this exact question open for its own
   RFC-0002 equivalent, so don't expect an existing answer to crib from.
5. Record both engines' numbers and qualitative cost side by side — don't
   discard the losing engine's data, future re-evaluation may need it.

## Open questions

- Should the benchmark also cover `qwen3:0.6b` (the low-resource fallback),
  or is `qwen3:1.7b` alone sufficient signal for this decision? Leaning
  toward covering both, since the fallback model is exactly the case where
  engine overhead (Ollama's daemon weight, in particular) matters most.
- Does either engine's licensing or distribution model create a self-hosting
  concern (e.g. a EULA a self-hosted operator would need to accept)? Not
  yet checked — should be part of task 22.1's writeup even though it's not
  a performance question.

## Next steps

**Graduates directly into epic task 22.1's own output** — no separate RFC
needed for this decision. Per RFC 0063's adoption path, task 22.1 is
"resolve this research doc": run the benchmark described above, fill in a
"Decision" section in this file with the result and the reasoning, and only
then does task 22.2 (`apps/harness` scaffold) start. This doc should be
updated in place when that happens, not left stale — its own Status line
should move from `Exploratory` to `Decided` at that point.
