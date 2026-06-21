/**
 * Structured request logger (RFC 0020). Emits newline-delimited JSON to
 * stdout/stderr; nothing is sent off-box, preserving the no-telemetry
 * guarantee (docs/security.md). Set LOG_LEVEL=debug for verbose output.
 *
 * Edge runtime note: this module uses process.stdout/stderr and is therefore
 * Node.js-only. Do not import it from middleware.ts (Edge runtime).
 */

type Level = 'error' | 'warn' | 'info' | 'debug';
const RANK: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeRank(): number {
  const raw = (process.env.LOG_LEVEL ?? 'warn').toLowerCase();
  return RANK[raw as Level] ?? RANK.warn;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (RANK[level] > activeRank()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
};
