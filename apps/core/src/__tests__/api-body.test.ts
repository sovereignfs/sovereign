/**
 * The body of a Core API call (core-app §3.9): a JSON object of the fields a call allows, at most 16 KB. A request that does not say
 * its length used to be read whole before it was measured, so a caller could make core hold whatever it sent; it is now refused as
 * soon as it passes the limit, and the rest is not read.
 */
import { describe, expect, it } from 'vitest';
import { bodyOf } from '../api/body';
import { ApiError } from '../api/errors';

const chunked = (pull: (controller: ReadableStreamDefaultController<Uint8Array>) => void) =>
  new Request('https://sovereign.local/api/v1/activity', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({ pull }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

describe('a Core API body', () => {
  it('is the object, with only the fields allowed', async () => {
    const request = new Request('https://sovereign.local/x', {
      method: 'POST',
      body: JSON.stringify({ to: 'a', summary: 'b' }),
    });
    expect(await bodyOf(request, ['to', 'summary'])).toEqual({ to: 'a', summary: 'b' });
    await expect(
      bodyOf(new Request('https://sovereign.local/x', { method: 'POST', body: '{"x":1}' }), ['to']),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('is refused when it says it is too large, before anything is read', async () => {
    const request = new Request('https://sovereign.local/x', {
      method: 'POST',
      headers: { 'content-length': String(64 * 1024) },
      body: '{}',
    });
    await expect(bodyOf(request, [])).rejects.toMatchObject({ status: 400 });
  });

  it('is refused as soon as a body with no length passes the limit, and the rest is never read', async () => {
    let sent = 0;
    const request = chunked((controller) => {
      sent += 4096;
      controller.enqueue(new Uint8Array(4096).fill(32));
    });
    await expect(bodyOf(request, [])).rejects.toMatchObject({ status: 400 });
    // An endless stream: reading stopped just past 16 KB, rather than running until memory ran out.
    expect(sent).toBeLessThanOrEqual(16 * 1024 + 2 * 4096);
  });

  it('counts bytes, not characters, toward the limit', async () => {
    const text = JSON.stringify({ summary: 'é'.repeat(9000) });
    expect(text.length).toBeLessThan(16 * 1024);
    let done = false;
    const request = chunked((controller) => {
      if (done) return controller.close();
      done = true;
      controller.enqueue(new TextEncoder().encode(text));
    });
    await expect(bodyOf(request, ['summary'])).rejects.toMatchObject({ status: 400 });
  });
});
