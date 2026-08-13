export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatChunk {
  type: 'token' | 'done' | 'error';
  /** Present on `token` chunks. */
  text?: string;
  /** Present on `done` chunks. */
  completionTokens?: number;
  /** Present on `error` chunks — a message safe to surface to the caller,
   *  never a raw internal error/stack trace. */
  message?: string;
}

/**
 * The narrow contract `apps/harness`'s engine wrapper exposes internally —
 * not literally OpenAI-compatible (see CURRENT_TASK.md's design decisions
 * / RFC 0063 §4: this task's own call, since there's exactly one consumer).
 * Both the real llama.cpp wrapper and the deterministic CI fake implement
 * this same shape so `/api/chat` never needs to know which one is active.
 */
export interface Engine {
  /** Async generator of chunks; the caller (the `/api/chat` route) is
   *  responsible for turning this into an SSE response and for enforcing
   *  the overall request timeout. */
  chat(messages: ChatMessage[], maxTokens: number): AsyncGenerator<ChatChunk>;
}
