import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type {
  ConnectionContext,
  ConnectionListFilter,
  ConnectionOAuthState,
  ConnectionRef,
  ConnectionScope,
  CreateConnectionInput,
  MarkConnectionErrorInput,
  OAuthStateInput,
  ProviderConfig,
  UpdateConnectionInput,
} from './types';

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

async function connectionContext(): Promise<ConnectionContext> {
  const h = await headers();
  const pluginId = h.get('x-sovereign-plugin-id');
  if (!pluginId) {
    throw new Error(
      'sdk.connections requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  return {
    tenantId: DEFAULT_TENANT_ID,
    pluginId,
    userId: h.get('x-sovereign-user-id'),
    capabilities: parseCapabilities(h.get('x-sovereign-user-capabilities')),
  };
}

function requireUserForUserScope(scope: ConnectionScope | undefined, userId: string | null): void {
  if ((scope === undefined || scope === 'user') && !userId) throw new NotAuthenticatedError();
}

/** Experimental platform-managed external connection metadata API (RFC 0049). */
export const connections = {
  async create(input: CreateConnectionInput): Promise<ConnectionRef> {
    const context = await connectionContext();
    requireUserForUserScope(input.scope, context.userId);
    return requireHost().connections.create(input, context);
  },

  async list(filter?: ConnectionListFilter): Promise<ConnectionRef[]> {
    const context = await connectionContext();
    requireUserForUserScope(filter?.scope, context.userId);
    return requireHost().connections.list(filter, context);
  },

  async get(id: string): Promise<ConnectionRef | null> {
    const context = await connectionContext();
    return requireHost().connections.get(id, context);
  },

  async update(id: string, input: UpdateConnectionInput): Promise<ConnectionRef> {
    const context = await connectionContext();
    return requireHost().connections.update(id, input, context);
  },

  async disconnect(id: string): Promise<void> {
    const context = await connectionContext();
    return requireHost().connections.disconnect(id, context);
  },

  async markUsed(id: string): Promise<void> {
    const context = await connectionContext();
    return requireHost().connections.markUsed(id, context);
  },

  async markError(id: string, input: MarkConnectionErrorInput): Promise<ConnectionRef> {
    const context = await connectionContext();
    return requireHost().connections.markError(id, input, context);
  },

  async createOAuthState(input: OAuthStateInput): Promise<string> {
    const context = await connectionContext();
    requireUserForUserScope('user', context.userId);
    return requireHost().connections.createOAuthState(input, context);
  },

  async verifyOAuthState(state: string): Promise<ConnectionOAuthState> {
    const context = await connectionContext();
    requireUserForUserScope('user', context.userId);
    return requireHost().connections.verifyOAuthState(state, context);
  },

  async getProviderConfig(provider: string): Promise<ProviderConfig> {
    const context = await connectionContext();
    return requireHost().connections.getProviderConfig(provider, context);
  },
};
