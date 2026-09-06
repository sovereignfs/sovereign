/**
 * The one result shape every Console server action returns.
 *
 * A `'use server'` function that *throws* reaches the client as Next's
 * opaque error digest in production and, when consumed by a bare
 * `<form action>`, replaces the whole Console main column with `error.tsx`
 * ("Something went wrong") — the actual reason ("Insufficient privileges",
 * "auth server returned 503") is lost. Returning a value keeps the message
 * and lets the caller decide between an inline error and a toast.
 *
 * `blocked` marks a refusal the caller may retry with a stronger option
 * (e.g. deleting a group that an app access policy still references).
 */
export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string; blocked?: boolean };

export const ACTION_OK: ActionResult = { ok: true };

export function actionError(error: unknown, fallback = 'Something went wrong.'): ActionResult {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return { ok: false, error: message || fallback };
}

/**
 * Run `fn`, converting any throw into `{ ok: false }`. Wrap the *body* of an
 * action with it so an unexpected failure (network, a guard that throws)
 * still comes back as a result instead of an error digest.
 */
export async function guarded(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (error) {
    return actionError(error);
  }
}

/** Pull the API's `{ error }` body out of a non-OK response, with a status fallback. */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${fallback}: ${res.status}`;
}
