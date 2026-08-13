import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function readSseFrames(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice('data:'.length).trim()));
}

async function enrollToken(): Promise<string> {
  const { issueEnrollmentToken } = await import('../../../../src/enrollment');
  return issueEnrollmentToken().token;
}

function chatRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET = 'test-secret';
  process.env.SOVEREIGN_HARNESS_ENGINE = 'fake';
});

afterEach(async () => {
  delete process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET;
  delete process.env.SOVEREIGN_HARNESS_ENGINE;
  const { resetRateLimitsForTests, resetConcurrencyForTests } =
    await import('../../../../src/rate-limit');
  resetRateLimitsForTests();
  resetConcurrencyForTests();
});

describe('POST /api/chat', () => {
  it('returns 503 not_configured when enrollment is unset', async () => {
    delete process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET;
    const { POST } = await import('../route');
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  it('returns 401 with no token', async () => {
    const { POST } = await import('../route');
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const { POST } = await import('../route');
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }, 'garbage'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty/malformed messages array', async () => {
    const { POST } = await import('../route');
    const token = await enrollToken();
    const res = await POST(chatRequest({ messages: [] }, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_request');
  });

  it('returns 400 when combined input exceeds the char limit', async () => {
    process.env.SOVEREIGN_HARNESS_MAX_INPUT_CHARS = '10';
    const { POST } = await import('../route');
    const token = await enrollToken();
    const res = await POST(
      chatRequest(
        { messages: [{ role: 'user', content: 'this is way more than ten chars' }] },
        token,
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('input_too_long');
    delete process.env.SOVEREIGN_HARNESS_MAX_INPUT_CHARS;
  });

  it('streams token/done frames for a valid request against the fake engine', async () => {
    const { POST } = await import('../route');
    const token = await enrollToken();
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hello' }] }, token));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const frames = await readSseFrames(res);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.at(-1)).toEqual({ type: 'done', completionTokens: expect.any(Number) });
    expect(frames.slice(0, -1).every((f) => (f as { type: string }).type === 'token')).toBe(true);
  });

  it('rate-limits repeated chat calls from the same instance', async () => {
    const { POST } = await import('../route');
    const token = await enrollToken();
    for (let i = 0; i < 60; i++) {
      const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }, token));
      expect(res.status).toBe(200);
      // Consume the body, same as a real caller (Warden) always would —
      // otherwise the concurrency slot never releases (see route.ts's
      // cancel()/finally comment) and later iterations 503 instead of the
      // 429 this test is actually checking for.
      await res.text();
    }
    const blocked = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }, token));
    expect(blocked.status).toBe(429);
  });

  it('rejects with model_not_ready when the llamacpp engine has no model yet', async () => {
    process.env.SOVEREIGN_HARNESS_ENGINE = 'llamacpp';
    const { POST } = await import('../route');
    const token = await enrollToken();
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'hi' }] }, token));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('model_not_ready');
  });
});
