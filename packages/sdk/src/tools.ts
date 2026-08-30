import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type {
  ToolContext,
  ToolExecuteOptions,
  ToolPreviewResponse,
  ToolProviderHandlers,
  ToolRef,
} from './types';

const DEFAULT_TENANT_ID = 'default';

function normalizeVerificationLevel(raw: string | null): 0 | 1 | 2 | 3 {
  const n = Number(raw ?? 0);
  if (n >= 3) return 3;
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
}

async function toolContext(): Promise<ToolContext> {
  let callerPluginId: string | null = null;
  let userId: string | null = null;
  let verificationLevel: 0 | 1 | 2 | 3 = 0;
  try {
    const h = await headers();
    callerPluginId = h.get('x-sovereign-plugin-id');
    userId = h.get('x-sovereign-user-id');
    verificationLevel = normalizeVerificationLevel(h.get('x-sovereign-verification-level'));
  } catch {
    // Outside a Next.js request context (e.g. a scheduled automation calling
    // another plugin's tool) — no header-derived plugin id available. The
    // host falls back to the background-invocation context (same pattern as
    // sdk.storage/sdk.db.getClient()); it throws if that fallback also comes
    // up empty. userId/verificationLevel stay at their safe defaults (no
    // live user in a background invocation).
  }
  return {
    tenantId: DEFAULT_TENANT_ID,
    callerPluginId,
    userId,
    verificationLevel,
  };
}

/**
 * Platform-mediated tool contracts (RFC 0047) — the write/action counterpart
 * to `sdk.data`. A provider plugin declares tools in its manifest (`tools[]`,
 * requires the `tools:provide` permission) and registers the actual
 * `preview`/`execute` handlers here; a caller plugin (requires `tools:call`)
 * asks for a preview, then executes with the confirmation token `preview()`
 * returned when the tool requires one.
 *
 * **Provider:**
 *
 * ```ts
 * await sdk.tools.provide('create-record', {
 *   preview: async (input) => ({ summary: `Create "${input.title}"`, details: input }),
 *   execute: async (input) => createRecord(input),
 * });
 * ```
 *
 * **Caller:**
 *
 * ```ts
 * const ref = { providerId: 'com.example.finance', tool: 'create-record' };
 * const preview = await sdk.tools.preview(ref, { title: 'Example' });
 * // ...render preview.summary/details, get user confirmation...
 * const result = await sdk.tools.execute(ref, { title: 'Example' }, {
 *   confirmationToken: preview.confirmationToken,
 * });
 * ```
 *
 * Confirmation UI is caller-owned (RFC 0047 open question #3) — this surface
 * only issues and verifies the token; rendering the "are you sure?" prompt
 * from `preview()`'s `summary`/`details` is the calling plugin's own
 * responsibility.
 */
export const tools = {
  /**
   * Provider: register this plugin's handlers for one of its declared tools.
   * Registrations are in-process and reset on server restart — call this on
   * every request that might be the first to need it (idempotent).
   */
  async provide<TInput = unknown, TResult = unknown, TDetails = unknown>(
    name: string,
    handlers: ToolProviderHandlers<TInput, TResult, TDetails>,
  ): Promise<void> {
    const h = await headers();
    const providerId = h.get('x-sovereign-plugin-id');
    if (!providerId) {
      throw new Error(
        'sdk.tools.provide() requires a plugin route context (x-sovereign-plugin-id header missing).',
      );
    }
    requireHost().tools.provide(providerId, name, handlers as unknown as ToolProviderHandlers);
  },

  /** Caller: request a non-mutating preview of a tool call, for the current user. */
  async preview<TInput = unknown, TDetails = unknown>(
    ref: ToolRef,
    input: TInput,
  ): Promise<ToolPreviewResponse<TDetails>> {
    const context = await toolContext();
    if (!context.userId) throw new NotAuthenticatedError();
    const result = await requireHost().tools.preview(ref, input, context);
    return result as ToolPreviewResponse<TDetails>;
  },

  /**
   * Caller: execute a tool call for the current user. `confirmationToken` is
   * required when the tool's effective `requiresConfirmation` is `true`
   * (RFC 0047's effect-class default, or an explicit manifest override) and
   * must be the exact token `preview()` returned for this same input.
   */
  async execute<TInput = unknown, TResult = unknown>(
    ref: ToolRef,
    input: TInput,
    options?: ToolExecuteOptions,
  ): Promise<TResult> {
    const context = await toolContext();
    if (!context.userId) throw new NotAuthenticatedError();
    const result = await requireHost().tools.execute(ref, input, {
      ...context,
      confirmationToken: options?.confirmationToken,
    });
    return result as TResult;
  },
};
