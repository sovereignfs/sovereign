/** The scopes core knows (core-app §3.6.2). A client is allowed some of them; it can never ask for another. */
export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'roles',
  'directory',
  'offline_access',
] as const;

/** Whether core offers a scope. One it does not is ignored when it is asked for (core-app §3.6.2). */
export function isOfferedScope(name: string): boolean {
  return (OAUTH_SCOPES as readonly string[]).includes(name);
}
