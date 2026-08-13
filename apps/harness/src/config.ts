/**
 * Environment-gated configuration (RFC 0063, workstream 0014 leg 2). Same
 * "degrade to a clear not-configured response, never throw or pretend to
 * succeed" discipline as apps/relay/src/config.ts.
 */

export type EngineKind = 'llamacpp' | 'fake';

/** True when the enrollment trust boundary can issue/verify tokens at all. */
export function enrollmentConfigured(): boolean {
  return Boolean(process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET);
}

export function enrollmentSecret(): string {
  const secret = process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET;
  if (!secret) throw new Error('SOVEREIGN_HARNESS_ENROLLMENT_SECRET is not configured');
  return secret;
}

/** `fake` is only meant for CI/tests — never set in a real deployment's env. */
export function engineKind(): EngineKind {
  return process.env.SOVEREIGN_HARNESS_ENGINE === 'fake' ? 'fake' : 'llamacpp';
}

/** Internal-network address of the `harness-engine` (llama.cpp server)
 *  Compose service — never the public internet. */
export function llamacppBaseUrl(): string {
  return process.env.SOVEREIGN_HARNESS_LLAMACPP_URL ?? 'http://harness-engine:8080';
}

export type ModelProfile = 'qwen3-1.7b' | 'qwen3-0.6b';

interface ModelSource {
  /** Unsloth's GGUF repo, not the official Qwen one — Research 0015 found
   *  the official Qwen/Qwen3-*-GGUF repos only publish Q8_0, not Q4_K_M. */
  url: string;
  /** Approximate expected size in bytes, used as a coarse download-sanity
   *  check (not a full checksum) before the atomic rename to `model.gguf`. */
  approxBytes: number;
}

const MODEL_SOURCES: Record<ModelProfile, ModelSource> = {
  'qwen3-1.7b': {
    url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    approxBytes: 1_107_000_000,
  },
  'qwen3-0.6b': {
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
    approxBytes: 396_000_000,
  },
};

/** Defaults to the RFC 0063 §4 recommended profile (`qwen3:1.7b`, with
 *  `qwen3:0.6b` as the documented low-resource fallback an operator opts
 *  into via env). Falls back to the 1.7b profile on an unrecognized value
 *  rather than throwing — an operator typo should degrade gracefully, not
 *  crash the service. */
export function modelProfile(): ModelProfile {
  const raw = process.env.SOVEREIGN_HARNESS_MODEL;
  return raw === 'qwen3-0.6b' ? 'qwen3-0.6b' : 'qwen3-1.7b';
}

export function modelSource(profile: ModelProfile = modelProfile()): ModelSource {
  return testModelSourceOverride ?? MODEL_SOURCES[profile];
}

let testModelSourceOverride: ModelSource | null = null;

/** @internal test-only — avoids model.test.ts needing to allocate/stream a
 *  real few-hundred-MB buffer just to exercise the sanity-check threshold. */
export function setModelSourceOverrideForTests(source: ModelSource | null): void {
  testModelSourceOverride = source;
}

/** Where the verified model file lives once ready — same path convention
 *  (fixed filename, decoupled from which profile/quant produced it) both
 *  `harness` and the `harness-engine` sidecar read from the shared
 *  `sovereign_harness_models` volume, just mounted at different paths in
 *  each container. */
export function modelFilePath(): string {
  return process.env.SOVEREIGN_HARNESS_MODEL_DIR
    ? `${process.env.SOVEREIGN_HARNESS_MODEL_DIR}/model.gguf`
    : '/app/models/model.gguf';
}

/** Request limits (RFC 0063 §6) — enforced server-side per leg 3's own
 *  instruction not to leave limiting to the client. Conservative defaults
 *  suitable for a small local chat model on modest self-hosting hardware. */
export function requestLimits() {
  return {
    maxInputChars: Number(process.env.SOVEREIGN_HARNESS_MAX_INPUT_CHARS ?? 4000),
    maxOutputTokens: Number(process.env.SOVEREIGN_HARNESS_MAX_OUTPUT_TOKENS ?? 512),
    maxRecentTurns: Number(process.env.SOVEREIGN_HARNESS_MAX_RECENT_TURNS ?? 10),
    maxConcurrency: Number(process.env.SOVEREIGN_HARNESS_MAX_CONCURRENCY ?? 2),
    timeoutSeconds: Number(process.env.SOVEREIGN_HARNESS_TIMEOUT_SECONDS ?? 120),
  };
}
