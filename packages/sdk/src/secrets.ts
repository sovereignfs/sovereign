import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type { CreateSecretInput, SecretContext, SecretRef, SecretScope } from './types';

const DEFAULT_TENANT_ID = 'default';

function parseCapabilities(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((cap): cap is string => typeof cap === 'string')
      : [];
  } catch {
    return [];
  }
}

async function secretContext(): Promise<SecretContext> {
  let pluginId: string | null = null;
  let userId: string | null = null;
  let capabilities: readonly string[] = [];
  try {
    const h = await headers();
    pluginId = h.get('x-sovereign-plugin-id');
    userId = h.get('x-sovereign-user-id');
    capabilities = parseCapabilities(h.get('x-sovereign-user-capabilities'));
  } catch {
    // Outside a Next.js request context (e.g. a background job/schedule
    // handler) — no header-derived plugin id available. The host falls back
    // to the background-invocation context (same pattern as
    // sdk.storage/sdk.db.getClient()); it throws if that fallback also
    // comes up empty.
  }
  return { tenantId: DEFAULT_TENANT_ID, pluginId, userId, capabilities };
}

function requireUserForUserScope(scope: SecretScope, userId: string | null): void {
  if (scope === 'user' && !userId) throw new NotAuthenticatedError();
}

/** Experimental platform-managed plugin secret vault (RFC 0043). */
export const secrets = {
  async create(input: CreateSecretInput): Promise<SecretRef> {
    const context = await secretContext();
    requireUserForUserScope(input.scope, context.userId);
    return requireHost().secrets.create(input, context);
  },

  async get(id: string): Promise<string | null> {
    const context = await secretContext();
    return requireHost().secrets.get(id, context);
  },

  async list(scope?: SecretScope): Promise<SecretRef[]> {
    const context = await secretContext();
    if (scope) requireUserForUserScope(scope, context.userId);
    return requireHost().secrets.list(scope, context);
  },

  async update(id: string, value: string): Promise<SecretRef> {
    const context = await secretContext();
    return requireHost().secrets.update(id, value, context);
  },

  async delete(id: string): Promise<void> {
    const context = await secretContext();
    return requireHost().secrets.delete(id, context);
  },
};
