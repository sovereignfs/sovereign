import { engineKind } from '../config';
import { FakeEngine } from './fake';
import { LlamaCppEngine } from './llamacpp';
import type { Engine } from './types';

export type { ChatChunk, ChatMessage, Engine } from './types';

let cached: Engine | null = null;

/** Selects the active engine once per process and caches it — matches
 *  engineKind()'s own env-gated selection (SOVEREIGN_HARNESS_ENGINE), not
 *  something that changes mid-run. */
export function getEngine(): Engine {
  if (cached) return cached;
  cached = engineKind() === 'fake' ? new FakeEngine() : new LlamaCppEngine();
  return cached;
}

/** @internal test-only reset — lets tests switch SOVEREIGN_HARNESS_ENGINE
 *  between cases without process restart. */
export function resetEngineForTests(): void {
  cached = null;
}
