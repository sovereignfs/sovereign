/**
 * Benchmark runner for Research 0015 / epic task 22.1 (workstream 0014 leg
 * 1). Reuses sovereign-os's benchmark method (docs/research/0015-...md's
 * "Proposed benchmark method") rather than inventing a new one, simplified
 * for this phase's chat-only scope: no tool-call corpus, no DNS/thermal
 * sampling (those were Raspberry-Pi/Pi-hole specific, not relevant to a
 * VPS).
 *
 * Both llama.cpp server and Ollama expose an OpenAI-compatible
 * /v1/chat/completions endpoint with streaming, so one script drives both --
 * only --provider/--base-url/--model differ.
 *
 * Must run ON the VPS being benchmarked (SSH in), against the real engine
 * container's loopback port -- these numbers are only meaningful against
 * the actual target hardware, not a developer's own machine.
 *
 * Usage:
 *   tsx run-benchmark.ts --provider llama-cpp --model qwen3-1.7b \
 *     --container harness-bench-llamacpp --cold --output results/llamacpp-1.7b.json
 *   tsx run-benchmark.ts --provider ollama --model qwen3:1.7b \
 *     --container harness-bench-ollama --cold --output results/ollama-1.7b.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface PromptItem {
  id: string;
  messages: { role: string; content: string }[];
}

interface ChatCompletionResult {
  timeToFirstTokenSeconds: number | null;
  totalDurationSeconds: number;
  completionTokens: number | null;
  tokensReported: boolean;
  tokensPerSecond: number | null;
  completionText: string;
  reasoningText: string;
  error: string | null;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function runChatCompletion(
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[],
  timeoutSeconds: number,
  maxTokens: number,
  enableThinking: boolean,
): Promise<ChatCompletionResult> {
  const start = performance.now();
  let firstTokenAt: number | null = null;
  let text = '';
  let reasoningText = '';
  let reportedTokens: number | null = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
        // Qwen3 defaults to "thinking" mode -- reasoning tokens stream
        // under delta.reasoning_content, not delta.content, and can burn
        // the whole max_tokens budget before any visible answer starts
        // (confirmed on this rig: a 200-token budget produced zero
        // content, TTFT-to-content of 20+s on the ones that did). Warden
        // phase 1 is basic chat, not reasoning, so thinking is disabled
        // by default here to measure the latency that actually matters
        // for that product surface. `think` is Ollama's native flag,
        // `chat_template_kwargs.enable_thinking` is llama.cpp's -- both
        // sent unconditionally since each engine ignores the field it
        // doesn't recognize.
        think: enableThinking,
        chat_template_kwargs: { enable_thinking: enableThinking },
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
          choices?: {
            delta?: { content?: string; reasoning_content?: string; reasoning?: string };
          }[];
          usage?: { completion_tokens?: number };
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        // llama.cpp uses reasoning_content; Ollama's OpenAI-compat layer
        // uses reasoning -- and as of Ollama v0.32.9, that layer doesn't
        // honor `think: false` at all (only its native /api/chat does),
        // so Ollama-via-this-endpoint always streams reasoning regardless
        // of the enableThinking flag. Real engineering-cost finding for
        // Research 0015, not a bug to paper over.
        const reasoningDelta =
          parsed.choices?.[0]?.delta?.reasoning_content ?? parsed.choices?.[0]?.delta?.reasoning;
        if (delta) {
          if (firstTokenAt === null) firstTokenAt = performance.now();
          text += delta;
        }
        if (reasoningDelta) {
          reasoningText += reasoningDelta;
        }
        if (parsed.usage?.completion_tokens) {
          reportedTokens = parsed.usage.completion_tokens;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const end = performance.now();
  const durationSeconds = (end - start) / 1000;
  const approxTokens = reportedTokens ?? (text.split(/\s+/).filter(Boolean).length || null);

  return {
    timeToFirstTokenSeconds: firstTokenAt !== null ? (firstTokenAt - start) / 1000 : null,
    totalDurationSeconds: Math.round(durationSeconds * 10000) / 10000,
    completionTokens: approxTokens,
    tokensReported: reportedTokens !== null,
    tokensPerSecond:
      approxTokens && durationSeconds > 0
        ? Math.round((approxTokens / durationSeconds) * 100) / 100
        : null,
    completionText: text,
    reasoningText,
    error: null,
  };
}

function readContainerMemory(container: string): string | null {
  try {
    const output = execFileSync(
      'docker',
      ['stats', '--no-stream', '--format', '{{.MemUsage}}', container],
      { encoding: 'utf-8', timeout: 10_000 },
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider as string;
  const model = args.model as string;
  const corpusPath =
    (args.corpus as string) ?? `${dirname(new URL(import.meta.url).pathname)}/prompts.json`;
  const outputPath = args.output as string;
  const container = args.container as string | undefined;
  const cold = Boolean(args.cold);
  const timeoutSeconds = args.timeout ? Number(args.timeout) : 120;
  // Capped so a rambling completion on slow CPU-only hardware can't blow
  // past --timeout -- an uncapped generation is exactly what crashed the
  // first llama.cpp run on the 2 vCPU benchmark box (task ran past 60s,
  // AbortController fired mid-stream, unhandled rejection killed the
  // whole corpus instead of just that item).
  const maxTokens = args['max-tokens'] ? Number(args['max-tokens']) : 200;
  // Off by default -- see runChatCompletion's comment. Pass --think to
  // measure the reasoning-enabled path instead.
  const enableThinking = Boolean(args.think);

  if (!provider || !model || !outputPath) {
    console.error(
      'Usage: tsx run-benchmark.ts --provider <llama-cpp|ollama> --model <name> --output <path> ' +
        '[--base-url <url>] [--container <name>] [--cold] [--corpus <path>] [--timeout <seconds>] ' +
        '[--max-tokens <n>] [--think]',
    );
    process.exit(1);
  }

  const baseUrl =
    (args['base-url'] as string) ??
    (provider === 'llama-cpp' ? 'http://127.0.0.1:8081' : 'http://127.0.0.1:11434');

  const corpus: { id: string; items: PromptItem[] } = JSON.parse(readFileSync(corpusPath, 'utf-8'));

  const report: Record<string, unknown> = {
    schemaVersion: 1,
    startedAt: timestamp(),
    provider,
    model,
    baseUrl,
    corpusId: corpus.id,
    cold,
  };

  const items: (ChatCompletionResult & { id: string })[] = [];

  // First item is measured separately when --cold is set: on a
  // just-started container this captures model-load time folded into
  // TTFT (the same lazy-load cold-start penalty sovereign-os found for
  // Ollama, 6.96s -- check whether it reproduces here or whether a kept-
  // warm Compose service avoids it).
  for (const item of corpus.items) {
    try {
      const result = await runChatCompletion(
        baseUrl,
        model,
        item.messages,
        timeoutSeconds,
        maxTokens,
        enableThinking,
      );
      items.push({ id: item.id, ...result });
    } catch (error) {
      // One slow/failed item (e.g. an abort on a memory- and CPU-
      // constrained box) must not discard every other item's data --
      // Research 0015 explicitly wants both engines' numbers kept, not
      // silently lost to a single bad prompt.
      items.push({
        id: item.id,
        timeToFirstTokenSeconds: null,
        totalDurationSeconds: timeoutSeconds,
        completionTokens: null,
        tokensReported: false,
        tokensPerSecond: null,
        completionText: '',
        reasoningText: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.items = items;
  report.coldStartTimeToFirstTokenSeconds = cold
    ? (items[0]?.timeToFirstTokenSeconds ?? null)
    : null;
  report.warmItems = cold ? items.slice(1) : items;

  const warmTtft = (report.warmItems as typeof items)
    .map((i) => i.timeToFirstTokenSeconds)
    .filter((v): v is number => v !== null);
  const warmTps = (report.warmItems as typeof items)
    .map((i) => i.tokensPerSecond)
    .filter((v): v is number => v !== null);

  report.averageWarmTimeToFirstTokenSeconds = warmTtft.length
    ? Math.round((warmTtft.reduce((a, b) => a + b, 0) / warmTtft.length) * 10000) / 10000
    : null;
  report.averageWarmTokensPerSecond = warmTps.length
    ? Math.round((warmTps.reduce((a, b) => a + b, 0) / warmTps.length) * 100) / 100
    : null;

  if (container) {
    report.idleMemoryUsage = readContainerMemory(container);
  }

  report.finishedAt = timestamp();

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
