import { invalidRequest } from './errors';

const MAX_BODY_BYTES = 16 * 1024;

/** The JSON object a request carries (core-app §3.9), and only the fields allowed. */
export async function bodyOf(
  request: Request,
  allowed: readonly string[],
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw invalidRequest('That body is too large.');
  const text = await limitedText(request, MAX_BODY_BYTES);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw invalidRequest('The body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw invalidRequest('The body must be an object.');
  const extra = Object.keys(body).filter((field) => !allowed.includes(field));
  if (extra.length > 0) throw invalidRequest(`The body has no ${extra.join(', ')}.`);
  return body as Record<string, unknown>;
}

/**
 * The body as text, read no further than `max` bytes. A request that does not say its length (chunked) is otherwise read whole before
 * it can be measured, so a caller could make core hold as much as it cared to send; this stops reading, and refuses, past the limit.
 */
async function limitedText(request: Request, max: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw invalidRequest('That body is too large.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
