/**
 * Request limits (RFC 0063 §6/§7, epic task 22.5) — carried forward from
 * the first rewrite's posture: enforced server-side, not left to the
 * client. Hardcoded rather than new plugin-scoped env vars — conservative,
 * sane phase-1 defaults; not worth a new operator-facing config surface
 * (and the self-hosting.md doc-parity update that would require) until a
 * real need for tuning them shows up.
 *
 * Deliberately no concurrency cap for external-provider requests here,
 * unlike the original local-only design. The local path still has its own
 * cap, unchanged, inside `apps/harness` itself — that matters because
 * excess concurrent *local* requests compete for this server's own
 * CPU/GPU, affecting every user. An external provider request's blast
 * radius if a user fires off many at once is the user's own account/rate
 * limit with a service they configured themselves, not shared instance
 * infrastructure — a meaningfully lower-severity case that isn't worth the
 * added complexity of a per-user semaphore in this phase.
 */
export const MAX_INPUT_CHARS = 4000;
export const MAX_OUTPUT_TOKENS = 1024;
export const MAX_RECENT_TURNS = 20;
export const REQUEST_TIMEOUT_MS = 120_000;
