import { sdk } from '@sovereignfs/sdk';
import type { Session } from '@sovereignfs/sdk';

/**
 * Every Console mutation authorizes inside the action — a server action is
 * reachable by its id regardless of the page's `adminOnly` gate, and most of
 * them attach `SOVEREIGN_ADMIN_KEY` on the caller's behalf, so a missing
 * check would let any signed-in user borrow the platform's own credentials
 * (`docs/architecture-rules.md`). This is the single preamble those actions
 * share: session first, then an explicit capability. It throws a
 * `CapabilityError`; actions wrap their body in `guarded()` so the throw
 * becomes an `{ ok: false }` result rather than an error digest.
 */
export class CapabilityError extends Error {
  readonly capability: string;
  constructor(capability: string, message: string) {
    super(message);
    this.name = 'CapabilityError';
    this.capability = capability;
  }
}

const DEFAULT_MESSAGES: Record<string, string> = {
  'user:manage': 'Insufficient privileges to manage users.',
  'role:assign': 'Insufficient privileges to assign roles.',
  'plugin:manage': 'Insufficient privileges to manage apps.',
  'instance:configure': 'Insufficient privileges to change instance settings.',
  'instance:configure-secrets': 'Insufficient privileges to change instance secrets.',
  'instance:backup': 'Insufficient privileges to back up this instance.',
};

export async function requireCapability(capability: string, message?: string): Promise<Session> {
  const session = await sdk.auth.requireSession();
  if (!sdk.auth.hasCapability(session, capability)) {
    throw new CapabilityError(
      capability,
      message ?? DEFAULT_MESSAGES[capability] ?? `Insufficient privileges (${capability}).`,
    );
  }
  return session;
}
