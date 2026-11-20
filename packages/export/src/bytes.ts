import type { ByteSource } from './types.js';

/** Any byte source as an async iterable of chunks. */
export async function* chunksOf(source: ByteSource): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    if (source.byteLength > 0) yield source;
    return;
  }
  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value.byteLength > 0) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  for await (const chunk of source as AsyncIterable<Uint8Array>) {
    if (chunk.byteLength > 0) yield chunk;
  }
}

/** Reads exact numbers of bytes from a stream of chunks of any size. */
export class ByteReader {
  readonly #iterator: AsyncIterator<Uint8Array>;
  #pending: Uint8Array = new Uint8Array(0);
  #done = false;

  constructor(source: ByteSource) {
    this.#iterator = chunksOf(source)[Symbol.asyncIterator]();
  }

  async #fill(): Promise<boolean> {
    if (this.#done) return false;
    const next = await this.#iterator.next();
    if (next.done) {
      this.#done = true;
      return false;
    }
    this.#pending =
      this.#pending.byteLength === 0 ? next.value : concat([this.#pending, next.value]);
    return true;
  }

  /** Exactly `n` bytes, or `null` when the stream ends first (having read what there was). */
  async exactly(n: number): Promise<Uint8Array | null> {
    while (this.#pending.byteLength < n) {
      if (!(await this.#fill())) return null;
    }
    const out = this.#pending.subarray(0, n);
    this.#pending = this.#pending.subarray(n);
    return out;
  }

  /** Up to `n` bytes as they come, ending early only when the stream does. */
  async *upTo(n: number): AsyncGenerator<Uint8Array> {
    let left = n;
    while (left > 0) {
      if (this.#pending.byteLength === 0 && !(await this.#fill())) return;
      const take = Math.min(left, this.#pending.byteLength);
      const out = this.#pending.subarray(0, take);
      this.#pending = this.#pending.subarray(take);
      left -= take;
      yield out;
    }
  }

  /** Whether anything at all is left. */
  async atEnd(): Promise<boolean> {
    if (this.#pending.byteLength > 0) return false;
    return !(await this.#fill());
  }

  async close(): Promise<void> {
    await this.#iterator.return?.();
  }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const encoder = new TextEncoder();
export const utf8 = (text: string): Uint8Array => encoder.encode(text);
