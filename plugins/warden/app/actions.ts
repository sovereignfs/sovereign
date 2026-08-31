'use server';

import { NotAuthenticatedError, sdk } from '@sovereignfs/sdk';
import { invalidateDiscoveryCacheForUser } from './_lib/model-discovery';
import { createProvider, deleteProvider, updateProvider } from './_lib/providers';
import { setModelVisibility } from './_lib/model-visibility';
import { deleteInactiveSessions } from './_lib/sessions';
import { setDefaultModelKey } from './_lib/user-settings';
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
 * would be unused surface, not a convenience. The one exception is
 * `refreshModelDiscoveryAction` below: `discoverModels()` now caches its
 * result for a short TTL (`model-discovery.ts`), so a plain
 * `router.refresh()` from a "Recheck" button would just replay the cached
 * result instead of actually re-checking — that action's only job is
 * dropping the cache first so the refresh that follows runs live.
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
  return sdk.auth.requireSession();
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
    const session = await requireSession();
    const label = stringField(formData, 'label');
    const baseUrl = stringField(formData, 'baseUrl');
    const apiKey = stringField(formData, 'apiKey');
    if (!label) return { ok: false, error: 'Give this provider a name.' };
    if (!baseUrl) return { ok: false, error: 'A base URL is required.' };
    if (!apiKey) return { ok: false, error: 'An API key is required.' };
    await createProvider({ label, baseUrl, apiKey });
    invalidateDiscoveryCacheForUser(session.user.id);
    return { ok: true, message: `${label} was added.` };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not add this provider.', 'createProviderAction'),
    };
  }
}

/**
 * Bind `id` first (`updateProviderAction.bind(null, provider.id)`) so the
 * remaining `(prevState, formData)` shape still fits `useActionState`.
 *
 * `label`/`baseUrl` are required on every call, unlike `apiKey` — the one
 * caller (`ProviderRow`'s edit form) always submits all three fields
 * pre-filled with the current values, so an empty one only ever means the
 * user deliberately cleared it, not "field omitted, leave unchanged". Only
 * `apiKey` has real partial-update semantics, matching its own UI hint
 * ("Leave blank to keep the current key"). Silently keeping the old
 * label/baseUrl on blank — the previous behavior — reported a misleading
 * "was updated" success while discarding what the user visibly cleared.
 */
export async function updateProviderAction(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const label = stringField(formData, 'label');
    const baseUrl = stringField(formData, 'baseUrl');
    const apiKey = stringField(formData, 'apiKey');
    if (!label) return { ok: false, error: 'Give this provider a name.' };
    if (!baseUrl) return { ok: false, error: 'A base URL is required.' };
    const provider = await updateProvider(id, { label, baseUrl, apiKey: apiKey || undefined });
    invalidateDiscoveryCacheForUser(session.user.id);
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
    const session = await requireSession();
    await deleteProvider(id);
    invalidateDiscoveryCacheForUser(session.user.id);
    return { ok: true, message: 'The provider was removed.' };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not remove this provider.', 'deleteProviderAction'),
    };
  }
}

/**
 * Called directly (not via `useActionState`) from a `Toggle`'s `onChange` —
 * there's no form input to preserve on failure here, just a boolean to flip
 * back if the write fails. Needs the session itself (not just proof one
 * exists) to scope the visibility row to this user.
 */
export async function setModelVisibilityAction(
  modelKey: string,
  visible: boolean,
): Promise<ActionResult> {
  try {
    const session = await sdk.auth.requireSession();
    await setModelVisibility(session.user.id, session.user.tenantId, modelKey, visible);
    return { ok: true, message: visible ? 'Model shown in chat.' : 'Model hidden from chat.' };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not update this model.', 'setModelVisibilityAction'),
    };
  }
}

/**
 * Drops this user's cached `discoverModels()` result so the "Recheck
 * providers"/"Recheck models" buttons (`ProvidersView`/`ModelsView`) actually
 * re-verify every provider live instead of replaying the short-lived cache.
 * Called immediately before those buttons' own `router.refresh()`.
 */
export async function refreshModelDiscoveryAction(): Promise<ActionResult> {
  try {
    const session = await requireSession();
    invalidateDiscoveryCacheForUser(session.user.id);
    return { ok: true, message: 'Rechecking…' };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not recheck providers.', 'refreshModelDiscoveryAction'),
    };
  }
}

/**
 * Sets (or clears, via `modelKey: null`) the default model for a brand-new
 * session (Settings → General, RFC 0063 §11). Called directly from a
 * `<Select>`'s `onChange` — no form input to preserve on failure.
 */
export async function setDefaultModelAction(modelKey: string | null): Promise<ActionResult> {
  try {
    const session = await sdk.auth.requireSession();
    await setDefaultModelKey(session.user.id, session.user.tenantId, modelKey);
    return { ok: true, message: 'Default model updated.' };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error, 'Could not update the default model.', 'setDefaultModelAction'),
    };
  }
}

/**
 * Manual retention (Settings → General, RFC 0063 §11) — deletes every
 * unpinned session inactive for more than `olderThanDays`. Not a scheduled
 * job; see `sessions.ts`'s `deleteInactiveSessions` for why.
 */
export async function deleteInactiveSessionsAction(olderThanDays: number): Promise<ActionResult> {
  try {
    const session = await sdk.auth.requireSession();
    const deleted = await deleteInactiveSessions(
      session.user.id,
      session.user.tenantId,
      olderThanDays,
    );
    return {
      ok: true,
      message:
        deleted === 0
          ? 'No inactive sessions to delete.'
          : `Deleted ${deleted} inactive session${deleted === 1 ? '' : 's'}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(
        error,
        'Could not delete inactive sessions.',
        'deleteInactiveSessionsAction',
      ),
    };
  }
}
