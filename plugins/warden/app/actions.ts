'use server';

import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { createProvider, deleteProvider, updateProvider } from './_lib/providers';
import { UnsafeProviderUrlError } from './_lib/url-safety';

/**
 * Platform server-action result convention (Console's `settings/actions.ts`,
 * the sv-ui-design error-handling rules): expected failures never throw —
 * they return a discriminated result the caller renders inline via
 * `useActionState`, keeping the user's input intact.
 *
 * Reads (`listProviders`/`discoverModels`) have no action wrapper here on
 * purpose — the providers page is a Server Component that calls `_lib`
 * directly, and every mutation below triggers a `router.refresh()` from the
 * client to get fresh server-rendered data, so a client-callable read action
 * would be unused surface, not a convenience.
 */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Every action in this file manages the *current user's own* providers only
 * — `sdk.connections`/`sdk.secrets` are already scoped to the calling
 * user+plugin by request context, so `requireSession()` (proving *some*
 * authenticated user is calling) is sufficient. No capability check is
 * needed on top of it, unlike an admin-only action — see
 * `docs/architecture-rules.md` on why `requireSession()` alone is not always
 * enough for actions that act on data beyond the caller's own.
 */
async function requireSession() {
  await sdk.auth.requireSession();
}

/**
 * Maps a caught error to what the user sees. Anything not on this
 * recognized list is a genuinely unexpected failure (e.g. a
 * misconfigured `SOVEREIGN_VAULT_KEY` on this instance) — the user can't
 * act on it, but an operator needs to be able to find it, so it's logged
 * server-side before falling back to the generic message.
 */
function messageFor(error: unknown, fallback: string, context: string): string {
  if (error instanceof NotAuthenticatedError) {
    return 'You must be signed in to manage Warden providers.';
  }
  if (error instanceof UnsafeProviderUrlError) return error.message;
  if (error instanceof Error && error.message === 'Provider not found.') return error.message;
  console.error(`[warden] ${context} failed unexpectedly:`, error);
  return fallback;
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** `(prevState, formData)` — plugs directly into `useActionState`. */
export async function createProviderAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSession();
    const label = stringField(formData, 'label');
    const baseUrl = stringField(formData, 'baseUrl');
    const apiKey = stringField(formData, 'apiKey');
    if (!label) return { ok: false, error: 'Give this provider a name.' };
    if (!baseUrl) return { ok: false, error: 'A base URL is required.' };
    if (!apiKey) return { ok: false, error: 'An API key is required.' };
    await createProvider({ label, baseUrl, apiKey });
    return { ok: true, message: `${label} was added.` };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not add this provider.', 'createProviderAction'),
    };
  }
}

/** Bind `id` first (`updateProviderAction.bind(null, provider.id)`) so the
 *  remaining `(prevState, formData)` shape still fits `useActionState`. */
export async function updateProviderAction(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSession();
    const label = stringField(formData, 'label');
    const baseUrl = stringField(formData, 'baseUrl');
    const apiKey = stringField(formData, 'apiKey');
    const provider = await updateProvider(id, {
      label: label || undefined,
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
    });
    return { ok: true, message: `${provider.label} was updated.` };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not update this provider.', 'updateProviderAction'),
    };
  }
}

/** Bind `id` first, same as `updateProviderAction`. */
export async function deleteProviderAction(
  id: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteProvider(id);
    return { ok: true, message: 'The provider was removed.' };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not remove this provider.', 'deleteProviderAction'),
    };
  }
}
