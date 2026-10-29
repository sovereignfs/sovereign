/** The one body every Core API failure has, and what each kind means (`ErrorResponse` in the contract). */
export type ApiErrorCode =
  'invalid_request' | 'invalid_token' | 'insufficient_scope' | 'not_found' | 'rate_limited';

/** A failure the Core API answers with, with the status and headers it should carry. */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** The answer a failure becomes: the contract's error body, never cached, never sniffed. */
export function errorResponse(error: ApiError): Response {
  return new Response(JSON.stringify({ error: error.code, message: error.message }), {
    status: error.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...error.headers,
    },
  });
}

/** A successful answer: JSON, never cached (it is about particular people, for a particular app). */
export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const invalidRequest = (message: string): ApiError =>
  new ApiError(400, 'invalid_request', message);
