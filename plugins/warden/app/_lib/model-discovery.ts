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
 */
const DISCOVERY_CACHE_TTL_MS = 30_000;
const discoveryCache = new Map<string, { result: ModelDiscoveryResult; expiresAt: number }>();

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
      const apiKey = await getProviderApiKey(provider.id);
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
  const cached = discoveryCache.get(session.user.id);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await runDiscovery();
  discoveryCache.set(session.user.id, { result, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
  return result;
}
