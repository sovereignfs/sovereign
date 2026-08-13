import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type {
  ConsumeHandoffOptions,
  CreateHandoffInput,
  HandoffContext,
  HandoffRequestContext,
  HandoffToken,
} from './types';

const DEFAULT_TENANT_ID = 'default';

async function handoffContext(): Promise<HandoffRequestContext> {
  const h = await headers();
  const pluginId = h.get('x-sovereign-plugin-id');
  if (!pluginId) {
    throw new Error(
      'sdk.handoffs requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  return {
    tenantId: DEFAULT_TENANT_ID,
    pluginId,
    actorUserId: h.get('x-sovereign-user-id'),
  };
}

/**
 * Platform-mediated flow handoffs (RFC 0053) — a signed, short-lived payload
 * that lets one plugin start or continue a user-facing flow in another,
 * for an authenticated user or an anonymous public visitor.
 *
 * **Source (caller):**
 *
 * ```ts
 * const handoff = await sdk.handoffs.create({
 *   providerId: 'io.openfs.sovereign.checkout',
 *   name: 'checkout-session',
 *   payload: { items },
 *   returnUrl: '/source/thank-you',
 *   mode: 'public',
 * });
 * // Redirect the visitor's browser to the provider's declared receiver path,
 * // e.g. `/checkout/cart?ho=${handoff.token}`.
 * ```
 *
 * **Provider (receiver):**
 *
 * ```ts
 * const context = await sdk.handoffs.consume(token, { name: 'checkout-session' });
 * // context.payload, context.returnUrl, context.actorUserId (null if public)
 * ```
 *
 * `mode: 'authenticated'` handoffs can only be created by an authenticated
 * caller and can only be consumed by that exact same user — a stolen or
 * forwarded handoff URL cannot be redeemed by a different logged-in visitor.
 * `mode: 'public'` handoffs may be consumed anonymously, but only at a
 * receiver the provider's manifest explicitly marks `public: true`.
 */
export const handoffs = {
  /** Source: create a signed handoff token for a provider-declared receiver. */
  async create<TPayload = unknown>(input: CreateHandoffInput<TPayload>): Promise<HandoffToken> {
    const context = await handoffContext();
    if (input.mode === 'authenticated' && !context.actorUserId) {
      throw new NotAuthenticatedError();
    }
    return requireHost().handoffs.create(input, context);
  },

  /** Provider: consume a handoff token, returning its stored payload and context. */
  async consume<TPayload = unknown>(
    token: string,
    options: ConsumeHandoffOptions,
  ): Promise<HandoffContext<TPayload>> {
    const context = await handoffContext();
    const result = await requireHost().handoffs.consume(token, options, context);
    return result as HandoffContext<TPayload>;
  },
};
