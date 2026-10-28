import { can, type Capability } from '../roles/capabilities';
import { getCapabilityMatrix } from '../roles/matrix';
import { getSession } from './session';
import { getAuthSettings } from './settings';

export type AuthorizationErrorCode = 'unauthenticated' | 'forbidden';

/** Thrown by the checks below; `authorizationResponse` turns it into a 401 or 403 for a route. */
export class AuthorizationError extends Error {
  override name = 'AuthorizationError';

  constructor(
    readonly code: AuthorizationErrorCode,
    readonly capability?: Capability,
  ) {
    super(code === 'unauthenticated' ? 'Sign in first.' : 'You are not allowed to do that.');
  }
}

export type AuthorizedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * The signed-in person, or `AuthorizationError('unauthenticated')`. For a server action or a route
 * handler, which are public endpoints whatever the page around them checks: it is called inside
 * every one of them, first (docs/architecture-rules.md).
 */
export async function requireSession(): Promise<AuthorizedSession> {
  const session = await getSession();
  if (!session) throw new AuthorizationError('unauthenticated');
  return session;
}

/**
 * The signed-in person, provided their role holds `capability` in the matrix in force. Called inside
 * every server action and route that changes or reveals something, before it does anything. A role it
 * does not know, an account that was deactivated and a session that has ended all fail the same way.
 */
export async function requireCapability(capability: Capability): Promise<AuthorizedSession> {
  const session = await requireSession();
  if (!can(session.user.role, capability, await getCapabilityMatrix())) {
    throw new AuthorizationError('forbidden', capability);
  }
  return session;
}

/**
 * The response for an `AuthorizationError` from a route handler: 401 when nobody is signed in, 403
 * when someone is but may not. `undefined` for any other error, which the route should rethrow. It
 * names no capability: what a person lacks is not for them to map.
 */
export function authorizationResponse(error: unknown): Response | undefined {
  if (!(error instanceof AuthorizationError)) return undefined;
  return Response.json(
    { error: error.code },
    {
      status: error.code === 'unauthenticated' ? 401 : 403,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

/**
 * Refuses a request that did not come from core's own pages (or an origin the operator trusted),
 * for a route handler that changes something. better-auth checks this for its own routes; a route
 * written here has to do it itself, or another site could send the person's cookies with a request
 * of its own. The browser says where a request came from in `Origin`, on every request that changes
 * something, and a request without it is refused.
 */
export function requireSameOrigin(request: Request): void {
  const { baseUrl, trustedOrigins } = getAuthSettings();
  const allowed = new Set([new URL(baseUrl).origin, ...trustedOrigins]);
  const origin = request.headers.get('origin');
  if (origin === null || !allowed.has(origin)) throw new AuthorizationError('forbidden');
}
