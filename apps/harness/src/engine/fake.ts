import type { ChatChunk, ChatMessage, Engine } from './types';

/**
 * Deterministic engine for CI and tests — no network I/O, no model file,
 * no dependency on a real llama.cpp process (RFC 0063 §6 / epic task
 * 22.2's explicit deliverable: "tests must not download or run a real
 * model"). Selected via SOVEREIGN_HARNESS_ENGINE=fake (src/config.ts).
 *
 * Echoes back a fixed, recognizable response derived from the last user
 * message, split into a few word-sized chunks so callers exercising
 * streaming behavior (partial output, timeout-mid-stream, etc.) have
 * something to observe across multiple `token` chunks, not just one.
 */
export class FakeEngine implements Engine {
  async *chat(messages: ChatMessage[], maxTokens: number): AsyncGenerator<ChatChunk> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const words =
      `This is a fake harness response to: ${lastUserMessage?.content ?? '(no message)'}`
        .split(' ')
        .slice(0, Math.max(1, maxTokens));

    for (const word of words) {
      yield { type: 'token', text: `${word} ` };
    }
    yield { type: 'done', completionTokens: words.length };
  }
}
