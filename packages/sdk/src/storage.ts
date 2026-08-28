import { headers } from 'next/headers';
import { requireHost } from './host';
import type { StorageContext, StorageObject, StoragePutInput } from './types';

const DEFAULT_TENANT_ID = 'default';

async function storageContext(): Promise<StorageContext> {
  let pluginId: string | null = null;
  let userId: string | null = null;
  try {
    const h = await headers();
    pluginId = h.get('x-sovereign-plugin-id');
    userId = h.get('x-sovereign-user-id');
  } catch {
    // Outside a Next.js request context (e.g. a background job handler) —
    // no header-derived plugin id available. The host falls back to the
    // background-invocation context (same pattern as sdk.db.getClient());
    // it throws if that fallback also comes up empty, matching db.ts's
    // "outside a plugin route context" behavior.
  }
  return { tenantId: DEFAULT_TENANT_ID, pluginId, userId };
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
