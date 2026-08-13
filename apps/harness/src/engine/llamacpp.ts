import { llamacppBaseUrl } from '../config';
import type { ChatChunk, ChatMessage, Engine } from './types';

/**
 * Wraps the `harness-engine` Compose service (llama.cpp server, Research
 * 0015 / epic task 22.1's decision) via its OpenAI-compatible streaming
 * endpoint. `chat_template_kwargs.enable_thinking: false` is set
 * unconditionally — Research 0015 found Qwen3's default "thinking" mode
 * costs 9-21s of silence before any visible answer, disqualifying for
 * Warden's basic-chat scope; llama.cpp is the engine that can actually turn
 * it off (confirmed during that benchmark — Ollama's OpenAI-compatible
 * endpoint cannot).
 */
export class LlamaCppEngine implements Engine {
  async *chat(messages: ChatMessage[], maxTokens: number): AsyncGenerator<ChatChunk> {
    let response: Response;
    try {
      response = await fetch(`${llamacppBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'harness',
          messages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: maxTokens,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
    } catch {
      yield { type: 'error', message: 'engine_unreachable' };
      return;
    }

    if (!response.ok || !response.body) {
      yield { type: 'error', message: 'engine_unreachable' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completionTokens = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice('data:'.length).trim();
          if (payload === '[DONE]') continue;
          let parsed: {
            choices?: { delta?: { content?: string } }[];
            usage?: { completion_tokens?: number };
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          // Only `content` is surfaced — with thinking disabled above,
          // reasoning_content shouldn't appear, but if it ever does
          // (engine-side change, template quirk), it's silently dropped
          // rather than shown as chat output. Phase 1 has no "thinking"
          // UI concept at all.
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { type: 'token', text: delta };
          if (parsed.usage?.completion_tokens) {
            completionTokens = parsed.usage.completion_tokens;
          }
        }
      }
    } catch {
      yield { type: 'error', message: 'engine_stream_interrupted' };
      return;
    }

    yield { type: 'done', completionTokens };
  }
}
