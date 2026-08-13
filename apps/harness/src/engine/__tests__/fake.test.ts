import { describe, expect, it } from 'vitest';
import { FakeEngine } from '../fake';

async function collect(gen: AsyncGenerator<{ type: string; text?: string }>) {
  const chunks = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

describe('FakeEngine', () => {
  it('yields token chunks then a done chunk, no network I/O', async () => {
    const engine = new FakeEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'hello' }], 50));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.at(-1)?.type).toBe('done');
    expect(chunks.slice(0, -1).every((c) => c.type === 'token')).toBe(true);
  });

  it('echoes the last user message deterministically', async () => {
    const engine = new FakeEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'ping' }], 50));
    const text = chunks
      .filter((c) => c.type === 'token')
      .map((c) => c.text)
      .join('');
    expect(text).toContain('ping');
  });

  it('respects maxTokens as a rough output cap', async () => {
    const engine = new FakeEngine();
    const chunks = await collect(engine.chat([{ role: 'user', content: 'x' }], 3));
    const tokenChunks = chunks.filter((c) => c.type === 'token');
    expect(tokenChunks.length).toBeLessThanOrEqual(3);
  });
});
