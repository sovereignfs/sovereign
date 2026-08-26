import { checkHarnessHealth } from './harness-client';
import {
  getProviderApiKey,
  listProviders,
  markProviderError,
  markProviderHealthy,
} from './providers';
import { assertSafeProviderBaseUrl, UnsafeProviderUrlError } from './url-safety';

const MODEL_FETCH_TIMEOUT_MS = 8000;

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
  let safeUrl: URL;
  try {
    // Re-validated here, not just at save time — defense in depth against a
    // TTL-based DNS rebind between when the provider was configured and now.
    safeUrl = await assertSafeProviderBaseUrl(baseUrl);
  } catch (error) {
    return {
      ok: false,
      authFailed: false,
      message:
        error instanceof UnsafeProviderUrlError ? error.message : 'This provider is unreachable.',
    };
  }

  const endpoint = `${safeUrl.toString().replace(/\/$/, '')}/models`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
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
 * real attempt, not a stale save-time assumption.
 */
export async function discoverModels(): Promise<ModelDiscoveryResult> {
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
