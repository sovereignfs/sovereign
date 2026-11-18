import { requireSignedIn } from '../auth/require-signed-in';
import { can } from '../roles/capabilities';
import { getCapabilityMatrix } from '../roles/matrix';
import type { Capability } from '../roles/capabilities';

/**
 * The signed-in session, and whether its role holds `capability` in the matrix in force, for a page that sends someone who is not signed
 * in to sign in (`requireSignedIn`, back to `returnTo`) and tells someone who is, and may not, so. Server actions and routes use
 * `requireCapability`, which throws.
 */
export async function sessionFor(capability: Capability, returnTo: string) {
  const session = await requireSignedIn(returnTo);
  const allowed = can(session.user.role, capability, await getCapabilityMatrix());
  return { session, allowed } as const;
}
