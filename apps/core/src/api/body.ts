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
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw invalidRequest('That body is too large.');
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
