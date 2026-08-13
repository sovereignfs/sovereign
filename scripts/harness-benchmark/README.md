# Harness engine benchmark rig

Throwaway tooling for [Research 0015](../../docs/research/0015-harness-engine-benchmark.md)
/ epic task 22.1 (workstream 0014 leg 1). Not part of the shipped stack —
`apps/harness` doesn't exist yet; that's leg 2, gated on this benchmark's
result. Nothing here is wired into the root `docker-compose.yml`.

Run this **on the target VPS** (2 vCPU / 4GB RAM or whatever representative
box you provisioned), not on a dev workstation — the whole point is
measuring real self-hosting hardware, not a laptop.

## 1. Get the repo + models onto the VPS

```bash
git clone <repo-url> && cd sovereignfs/pods/p5
git switch chore/harness-engine-benchmark
pnpm install --frozen-lockfile
```

Download the GGUF weights for llama.cpp (Ollama pulls its own copy, no
manual step needed):

```bash
mkdir -p scripts/harness-benchmark/models
# Q4_K_M is llama.cpp's common self-hosting quantization default; adjust if
# you want to compare quant levels too.
curl -L -o scripts/harness-benchmark/models/qwen3-1.7b-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf
curl -L -o scripts/harness-benchmark/models/qwen3-0.6b-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf
```

Verify the exact filenames/quant tags on Hugging Face before running this —
repo layouts change. Check licensing while you're there (Research 0015's
open question on EULA/distribution concerns).

## 2. Run one engine at a time

Never start both profiles together — 4GB RAM doesn't have headroom for two
model processes plus the OS, and results would reflect memory pressure, not
the engine.

### llama.cpp, qwen3:1.7b

```bash
cd scripts/harness-benchmark
LLAMACPP_MODEL_FILE=qwen3-1.7b-q4_k_m.gguf docker compose --profile llamacpp up -d
# wait for the server to report ready — GET /health returns 200 once the
# model is loaded; poll it, don't guess a sleep duration
until curl -sf http://127.0.0.1:8081/health > /dev/null; do sleep 1; done

mkdir -p results
tsx run-benchmark.ts --provider llama-cpp --model qwen3-1.7b \
  --container harness-bench-llamacpp --cold \
  --output results/llamacpp-1.7b.json

docker compose --profile llamacpp down
```

Repeat with `LLAMACPP_MODEL_FILE=qwen3-0.6b-q4_k_m.gguf` and
`--model qwen3-0.6b --output results/llamacpp-0.6b.json`.

### Ollama, qwen3:1.7b

```bash
docker compose --profile ollama up -d
docker exec harness-bench-ollama ollama pull qwen3:1.7b

# Deliberately do NOT pre-warm with a throwaway request — the first real
# request in run-benchmark.ts (--cold) needs to hit a genuinely
# lazy-loaded model to measure sovereign-os's reported 6.96s TTFT
# cold-start penalty and check whether it reproduces here.
tsx run-benchmark.ts --provider ollama --model qwen3:1.7b \
  --container harness-bench-ollama --cold \
  --output results/ollama-1.7b.json

docker compose --profile ollama down
```

Repeat with `qwen3:0.6b` / `results/ollama-0.6b.json`. Pull the model fresh
before each cold run (`docker exec ... ollama pull` again after `down`/`up`
if you want a truly cold container, since Ollama caches into the named
volume across restarts — delete the volume between cold-start passes if you
need the on-disk cache excluded too:
`docker compose --profile ollama down -v`).

## 3. What each report contains

- `coldStartTimeToFirstTokenSeconds` — TTFT of the very first request
  against a freshly started container. This is where Ollama's lazy-load
  penalty would show up.
- `averageWarmTimeToFirstTokenSeconds` / `averageWarmTokensPerSecond` —
  steady-state numbers across the rest of the prompt corpus.
- `idleMemoryUsage` — `docker stats` snapshot taken right after the run
  (rough idle footprint, not a peak/steady-state distinction — for a more
  careful reading, run `docker stats` yourself in a second terminal while
  idle for 30s post-run).
- Full per-prompt results are kept in `items`, per Research 0015's
  instruction not to discard the losing engine's data.

## 4. After all 4 runs

Fold the 4 JSON reports (`results/{llamacpp,ollama}-{1.7b,0.6b}.json`) plus
the qualitative wrapper-code/model-management notes into a new "Decision"
section in `docs/research/0015-harness-engine-benchmark.md`, and flip that
doc's `Status:` line from `Exploratory` to `Decided`. That closes epic task
22.1 and unblocks leg 2.
