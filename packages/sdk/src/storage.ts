import { headers } from 'next/headers';
import { requireHost } from './host';
import type { StorageContext, StorageObject, StoragePutInput } from './types';

const DEFAULT_TENANT_ID = 'default';

async function storageContext(): Promise<StorageContext> {
  const h = await headers();
  const pluginId = h.get('x-sovereign-plugin-id');
  if (!pluginId) {
    throw new Error(
      'sdk.storage requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  return {
    tenantId: DEFAULT_TENANT_ID,
    pluginId,
    userId: h.get('x-sovereign-user-id'),
  };
}

/** Plugin-scoped file storage (RFC 0044). Requires the `storage:readWrite` manifest permission. */
export const storage = {
  async put(input: StoragePutInput): Promise<StorageObject> {
    const context = await storageContext();
    return requireHost().storage.put(input, context);
  },

  async get(key: string): Promise<(StorageObject & { body: ReadableStream }) | null> {
    const context = await storageContext();
    return requireHost().storage.get(key, context);
  },

  async delete(key: string): Promise<void> {
    const context = await storageContext();
    return requireHost().storage.delete(key, context);
  },

  async list(prefix?: string): Promise<StorageObject[]> {
    const context = await storageContext();
    return requireHost().storage.list(prefix, context);
  },

  /** Create a short-lived, read-only download URL for an object (default 5 minutes, max 1 hour). */
  async getSignedUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string> {
    const context = await storageContext();
    return requireHost().storage.getSignedUrl(key, options, context);
  },
};
