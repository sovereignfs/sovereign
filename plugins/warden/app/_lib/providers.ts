import { sdk } from '@sovereignfs/sdk';
import type { ConnectionRef, ConnectionStatus } from '@sovereignfs/sdk';
import { assertSafeProviderBaseUrl } from './url-safety';

/**
 * Warden's user-configured OpenAI-API-compatible model providers (RFC 0063
 * §3/§4, epic task 22.4). Deliberately reuses existing platform mechanisms
 * rather than a new plugin-owned table:
 *
 * - `sdk.connections` (RFC 0049) already stores exactly this shape — a
 *   per-user, labeled, secret-referencing external connection with health
 *   tracking (`status`/`lastError`/`lastCheckedAt`). It was designed with
 *   this exact case in mind ("connecting model providers or self-hosted AI
 *   endpoints" is one of its own worked motivations).
 * - `sdk.secrets` (RFC 0043) holds the API key. `providers.ts` never stores
 *   the key itself — only the `secretRef` id `sdk.connections` already
 *   carries.
 *
 * All of Warden's connections use one constant `provider` classifier since
 * they're all the same kind of thing to this plugin (an OpenAI-compatible
 * endpoint) — there is no OAuth flow, no per-vendor adapter, and therefore
 * no reason to distinguish "openrouter" from "custom" the way the SDK's own
 * examples do for services that need vendor-specific handling.
 */
const PROVIDER_KIND = 'openai-compatible';

export interface ProviderView {
  id: string;
  label: string;
  baseUrl: string;
  status: ConnectionStatus;
  lastError: string | null;
  lastCheckedAt: number | null;
}

function baseUrlFromMetadata(metadata: Record<string, unknown> | null): string {
  const value = metadata?.baseUrl;
  return typeof value === 'string' ? value : '';
}

function toView(ref: ConnectionRef): ProviderView {
  return {
    id: ref.id,
    label: ref.label,
    baseUrl: baseUrlFromMetadata(ref.metadata),
    status: ref.status,
    lastError: ref.lastError?.message ?? null,
    lastCheckedAt: ref.lastCheckedAt,
  };
}

/** Fetches one of *this user's* providers, or null — never another plugin's
 *  or another user's connection (`sdk.connections` is already scoped to the
 *  calling plugin+user by request context; the `provider` check additionally
 *  guards against ever touching a non-provider connection Warden might add
 *  for something else in the future). */
async function getOwnProvider(id: string): Promise<ConnectionRef | null> {
  const existing = await sdk.connections.get(id);
  if (!existing || existing.provider !== PROVIDER_KIND) return null;
  return existing;
}

export async function listProviders(): Promise<ProviderView[]> {
  const refs = await sdk.connections.list({ provider: PROVIDER_KIND, scope: 'user' });
  return refs.map(toView);
}

export async function createProvider(input: {
  label: string;
  baseUrl: string;
  apiKey: string;
}): Promise<ProviderView> {
  const { url } = await assertSafeProviderBaseUrl(input.baseUrl);
  const secret = await sdk.secrets.create({
    scope: 'user',
    label: `Warden provider: ${input.label}`,
    value: input.apiKey,
  });
  const ref = await sdk.connections.create({
    scope: 'user',
    provider: PROVIDER_KIND,
    label: input.label,
    secretRef: secret.id,
    metadata: { baseUrl: url.toString() },
  });
  return toView(ref);
}

/**
 * Edits label/base URL/key. Omitting `apiKey` keeps the existing secret —
 * same "blank means unchanged, a new value rotates it" convention
 * `docs/plugin-development.md`'s connections section already documents for
 * other plugins' provider config forms.
 */
export async function updateProvider(
  id: string,
  input: { label?: string; baseUrl?: string; apiKey?: string },
): Promise<ProviderView> {
  const existing = await getOwnProvider(id);
  if (!existing) throw new Error('Provider not found.');

  let secretRef = existing.secretRef;
  if (input.apiKey) {
    if (secretRef) {
      await sdk.secrets.update(secretRef, input.apiKey);
    } else {
      const secret = await sdk.secrets.create({
        scope: 'user',
        label: `Warden provider: ${input.label ?? existing.label}`,
        value: input.apiKey,
      });
      secretRef = secret.id;
    }
  }

  let baseUrl = baseUrlFromMetadata(existing.metadata);
  if (input.baseUrl) {
    const { url } = await assertSafeProviderBaseUrl(input.baseUrl);
    baseUrl = url.toString();
  }

  const updated = await sdk.connections.update(id, {
    label: input.label ?? existing.label,
    secretRef,
    metadata: { baseUrl },
    // An explicit edit is a fresh start for health tracking — the next
    // model-discovery pass re-establishes whether it's actually reachable.
    status: 'connected',
  });
  return toView(updated);
}

/** Removes a provider. `disconnect()` atomically deletes the linked
 *  `sdk.secrets` row too (verified in `runtime/src/platform-db.ts`'s
 *  `disconnectPluginConnection`) — nothing to do here beyond that call.
 *  Idempotent: deleting an already-gone or not-ours id is a silent no-op,
 *  matching `sdk.connections.disconnect()`'s own behavior. */
export async function deleteProvider(id: string): Promise<void> {
  const existing = await getOwnProvider(id);
  if (!existing) return;
  await sdk.connections.disconnect(id);
}

/** Server-side only — the API key itself, for making the actual outbound
 *  request. Never return this from a server action to the client. */
export async function getProviderApiKey(id: string): Promise<string | null> {
  const existing = await getOwnProvider(id);
  if (!existing?.secretRef) return null;
  return sdk.secrets.get(existing.secretRef);
}

export async function markProviderHealthy(id: string): Promise<void> {
  await sdk.connections.update(id, {
    status: 'connected',
    lastCheckedAt: Math.floor(Date.now() / 1000),
  });
}

export async function markProviderError(
  id: string,
  message: string,
  status?: number,
): Promise<void> {
  await sdk.connections.markError(id, { error: { message, status }, status: 'error' });
}
