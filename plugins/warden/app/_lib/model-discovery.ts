import { sdk } from '@sovereignfs/sdk';
import { checkHarnessHealth } from './harness-client';
import { pinnedFetch } from './pinned-fetch';
import {
  getProviderApiKey,
  listProviders,
  markProviderError,
  markProviderHealthy,
} from './providers';
import {
  assertSafeProviderBaseUrl,
  UnsafeProviderUrlError,
  type SafeProviderUrl,
} from './url-safety';

const MODEL_FETCH_TIMEOUT_MS = 8000;

const UNDECRYPTABLE_KEY_MESSAGE =
  'Stored API key cannot be decrypted (SOVEREIGN_VAULT_KEY changed?). Re-enter it.';

/**
 * `runtime/src/secrets.ts` throws `SecretUndecryptableError` when a stored
 * secret's AES-GCM auth tag fails to verify — the row was encrypted under a
 * different `SOVEREIGN_VAULT_KEY` (rotated, lost, or two checkouts sharing
 * one dev database with different `.env` files). Matched by `name` because
 * a plugin may not import `runtime/src`; anything else (a DB fault, a
 * missing vault key) is a genuine error and keeps propagating.
 */
function isUndecryptableSecretError(error: unknown): boolean {
  return error instanceof Error && error.name === 'SecretUndecryptableError';
}

/**
 * `discoverModels()` used to run a live health/auth check against every
 * configured provider (a real network round trip, potentially downloading
 * and parsing a several-hundred-model catalog) on *every* render of the
 * chat, models, and providers pages — including plain navigation between
 * them, with no caching at all. A provider that's slow or unreachable added
 * up to `MODEL_FETCH_TIMEOUT_MS` to every single page load. This per-process,
 * per-user cache bounds that to one live pass per `DISCOVERY_CACHE_TTL_MS`;
 * `invalidateDiscoveryCacheForUser` gives mutation sites and the explicit
 * "Recheck" actions (`actions.ts`) a way to force a fresh pass sooner.
 *
 * Two refinements on top of the plain TTL, both found investigating slow
 * Warden launches:
 *
 * - **In-flight dedup.** The chat page, the Settings dialog and the
 *   Providers/Models pages can all call this within the same request (or
 *   within milliseconds of each other). With only a TTL cache, every caller
 *   that arrived before the first live pass *finished* started its own —
 *   two full passes against every provider, and two rounds of status
 *   writes, for a single navigation. Concurrent callers now share one
 *   promise per user.
 * - **Stale-while-revalidate.** Once the TTL lapses, the next caller used to
 *   block on a full live pass (up to 8s per unreachable provider) even
 *   though a perfectly usable result from 31 seconds ago was sitting right
 *   there. An expired entry is now served immediately while a refresh runs
 *   in the background, up to `DISCOVERY_STALE_MAX_MS` — beyond that the
 *   result is old enough that a provider added or removed on another device
 *   could plausibly be missing, so the caller waits for a fresh pass.
 *   `invalidateDiscoveryCacheForUser` still forces the next call to block
 *   on a live pass: an explicit "Recheck" must never answer from cache.
 */
const DISCOVERY_CACHE_TTL_MS = 30_000;
const DISCOVERY_STALE_MAX_MS = 5 * 60_000;
const discoveryCache = new Map<string, { result: ModelDiscoveryResult; freshUntil: number }>();
const inFlight = new Map<string, Promise<ModelDiscoveryResult>>();

/** Drops this user's cached discovery result, if any — the next
 *  `discoverModels()` call for them runs a live pass instead of serving a
 *  cached one. Safe to call even if nothing is cached. */
export function invalidateDiscoveryCacheForUser(userId: string): void {
  discoveryCache.delete(userId);
}

/** @internal test-only reset — clears every cached user's entry so test
 *  cases don't leak results into one another via the shared module cache. */
export function resetDiscoveryCacheForTests(): void {
  discoveryCache.clear();
  inFlight.clear();
}

export interface DiscoveredModel {
  /** Stable selection key: `'local'`, or `${providerId}:${modelId}`. */
  key: string;
  label: string;
}

export interface ProviderDiscoveryStatus {
  id: string;
  label: string;
  baseUrl: string;
  ok: boolean;
  message: string | null;
  modelCount: number;
}

export interface ModelDiscoveryResult {
  local: { available: boolean; message: string | null };
  providers: ProviderDiscoveryStatus[];
  /** Flattened, ready-to-select list across every reachable source. */
  models: DiscoveredModel[];
}

interface OpenAiModelListResponse {
  data?: Array<{ id?: unknown }>;
}

type ProviderFetchResult =
  { ok: true; modelIds: string[] } | { ok: false; authFailed: boolean; message: string };

async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<ProviderFetchResult> {
  let safe: SafeProviderUrl;
  try {
    // Re-validated here, not just at save time. The actual request below
    // connects to `safe.pinnedAddress` directly (pinnedFetch), not a fresh
    // fetch(url) that would let a second, independent DNS lookup answer
    // differently from this one — see url-safety.ts's own doc comment for
    // why "validate immediately before" alone isn't enough.
    safe = await assertSafeProviderBaseUrl(baseUrl);
  } catch (error) {
    return {
      ok: false,
      authFailed: false,
      message:
        error instanceof UnsafeProviderUrlError ? error.message : 'This provider is unreachable.',
    };
  }

  const endpoint = new URL(`${safe.url.toString().replace(/\/$/, '')}/models`);
  let response: Response;
  try {
    response = await pinnedFetch(endpoint, safe.pinnedAddress, safe.pinnedFamily, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODEL_FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, authFailed: false, message: 'This provider is unreachable.' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, authFailed: true, message: 'This provider rejected the API key.' };
  }
  if (!response.ok) {
    return {
      ok: false,
      authFailed: false,
      message: `This provider returned an error (${response.status}).`,
    };
  }

  const body: OpenAiModelListResponse = await response.json().catch(() => ({}));
  const modelIds = Array.isArray(body.data)
    ? body.data.map((entry) => entry?.id).filter((id): id is string => typeof id === 'string')
    : [];
  return { ok: true, modelIds };
}

/**
 * Builds Warden's merged model list (RFC 0063 §4, epic task 22.4): every
 * configured provider's own `/models`, plus `apps/harness`'s local model
 * folded in as one zero-config entry when it's reachable and ready. A single
 * failing provider degrades only its own entry — it never fails the whole
 * list (review checklist), and a locally-unreachable `apps/harness` is
 * silently absent rather than an error.
 *
 * Runs a live health/auth check on every call and records the result back
 * onto the connection (`markProviderHealthy`/`markProviderError`), so the
 * provider management UI's per-provider status reflects the most recent
 * real attempt, not a stale save-time assumption. Callers should go through
 * `discoverModels()` below, which fronts this with a short-lived cache —
 * calling this directly re-runs the full live pass unconditionally.
 */
async function runDiscovery(): Promise<ModelDiscoveryResult> {
  const [localHealth, providers] = await Promise.all([checkHarnessHealth(), listProviders()]);

  const models: DiscoveredModel[] = [];
  if (localHealth.kind === 'ready') {
    models.push({ key: 'local', label: 'Local model (this server)' });
  }

  const providerStatuses = await Promise.all(
    providers.map(async (provider): Promise<ProviderDiscoveryStatus> => {
      let apiKey: string | null;
      try {
        apiKey = await getProviderApiKey(provider.id);
      } catch (error) {
        // One undecryptable key must degrade only its own provider. Before
        // this guard the rejection escaped the `Promise.all`, so a single
        // stale row took down the whole Warden UI (chat, local model, and
        // every healthy provider) via the plugin error boundary.
        if (!isUndecryptableSecretError(error)) throw error;
        await markProviderError(provider.id, UNDECRYPTABLE_KEY_MESSAGE);
        return {
          id: provider.id,
          label: provider.label,
          baseUrl: provider.baseUrl,
          ok: false,
          message: UNDECRYPTABLE_KEY_MESSAGE,
          modelCount: 0,
        };
      }
      if (!apiKey) {
        await markProviderError(provider.id, 'This provider has no stored API key.');
        return {
          id: provider.id,
          label: provider.label,
          baseUrl: provider.baseUrl,
          ok: false,
          message: 'Missing API key.',
          modelCount: 0,
        };
      }

      const result = await fetchProviderModels(provider.baseUrl, apiKey);
      if (!result.ok) {
        await markProviderError(provider.id, result.message, result.authFailed ? 401 : undefined);
        return {
          id: provider.id,
          label: provider.label,
          baseUrl: provider.baseUrl,
          ok: false,
          message: result.message,
          modelCount: 0,
        };
      }

      await markProviderHealthy(provider.id);
      for (const modelId of result.modelIds) {
        models.push({ key: `${provider.id}:${modelId}`, label: `${provider.label} — ${modelId}` });
      }
      return {
        id: provider.id,
        label: provider.label,
        baseUrl: provider.baseUrl,
        ok: true,
        message: null,
        modelCount: result.modelIds.length,
      };
    }),
  );

  return {
    local: {
      available: localHealth.kind === 'ready',
      message:
        localHealth.kind === 'not_ready'
          ? `The local model is still ${localHealth.modelStatus === 'downloading' ? 'downloading' : 'unavailable'}.`
          : null,
    },
    providers: providerStatuses,
    models,
  };
}

/**
 * Cached entry point every page/action should call instead of
 * `runDiscovery()` directly. Serves a per-user result up to
 * `DISCOVERY_CACHE_TTL_MS` old rather than re-running a live pass against
 * every provider on every page render — see this file's top-of-file comment
 * for why that matters. `invalidateDiscoveryCacheForUser` (called from
 * `actions.ts` on provider mutations and the explicit "Recheck" actions)
 * forces the next call here to run live again.
 */
export async function discoverModels(): Promise<ModelDiscoveryResult> {
  const session = await sdk.auth.requireSession();
  const userId = session.user.id;
  const now = Date.now();
  const cached = discoveryCache.get(userId);

  if (cached && cached.freshUntil > now) return cached.result;

  if (cached && cached.freshUntil + DISCOVERY_STALE_MAX_MS > now) {
    // Stale but recent: answer now, refresh behind the caller's back. The
    // refresh is deduped through `inFlight` like any other pass, and its
    // failure is logged rather than surfaced — the caller already has a
    // result, and the next call will try again.
    void refreshDiscovery(userId).catch((error) => {
      console.error('[warden] background model discovery failed:', error);
    });
    return cached.result;
  }

  return refreshDiscovery(userId);
}

/** One live pass per user at a time — every caller that arrives while a
 *  pass is running awaits that same promise instead of starting another. */
function refreshDiscovery(userId: string): Promise<ModelDiscoveryResult> {
  const running = inFlight.get(userId);
  if (running) return running;

  const pass = runDiscovery()
    .then((result) => {
      discoveryCache.set(userId, { result, freshUntil: Date.now() + DISCOVERY_CACHE_TTL_MS });
      return result;
    })
    .finally(() => {
      // Only clear our own entry — a `resetDiscoveryCacheForTests()` or a
      // later pass may already have replaced it.
      if (inFlight.get(userId) === pass) inFlight.delete(userId);
    });
  inFlight.set(userId, pass);
  return pass;
}
