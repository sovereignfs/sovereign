import { headers } from 'next/headers';

/**
 * Server-to-server call to one of the two admin APIs Console drives:
 * the runtime's own `/api/admin/*` (default) or the auth server's. A fresh
 * outbound request, not a passthrough of the browser's — the proxy never
 * sees it, so the acting admin's id is forwarded explicitly when the target
 * route attributes the action to a user (`actor: true`); without it the
 * route's actor check 401s even though the caller is a fully authenticated
 * admin.
 *
 * Replaces five near-identical local copies (users, groups, plugins,
 * remove-actions, email-templates) that had drifted in header handling.
 */
export type AdminApi = 'runtime' | 'auth';

export interface AdminFetchOptions extends RequestInit {
  api?: AdminApi;
  /** Forward `x-sovereign-user-id` from the current request. */
  actor?: boolean;
}

export function adminApiBase(api: AdminApi = 'runtime'): string {
  if (api === 'auth') {
    return process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
  }
  return `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
}

export async function adminFetch(
  path: string,
  { api = 'runtime', actor = false, ...init }: AdminFetchOptions = {},
): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const actorHeaders: Record<string, string> = {};
  if (actor) {
    actorHeaders['x-sovereign-user-id'] = (await headers()).get('x-sovereign-user-id') ?? '';
  }
  return fetch(`${adminApiBase(api)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...actorHeaders,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
