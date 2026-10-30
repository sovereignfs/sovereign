/** The scopes core knows (core-app §3.6.2). A client is allowed some of them; it can never ask for another. */
export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'roles',
  'directory',
  'notifications',
  'offline_access',
] as const;

/** Whether core offers a scope. One it does not is ignored when it is asked for (core-app §3.6.2). */
export function isOfferedScope(name: string): boolean {
  return (OAUTH_SCOPES as readonly string[]).includes(name);
}

/**
 * What an app may do for itself, with no person present (core-app §3.6.6). Separate from the scopes above, which a person
 * grants: an operator gives an app these (§3.7.1), and a person is never asked about one. Never `directory`, which needs a person,
 * and none of `openid`, `profile`, `email`, `roles` or `offline_access`, which are about one. `notifications:send` is the first
 * (core-app §4.1).
 */
export const APP_SCOPES = ['notifications:send'] as const;

/** Whether a scope is one an app holds for itself. */
export function isAppScope(name: string): boolean {
  return (APP_SCOPES as readonly string[]).includes(name);
}

/** Everything the provider has to know to validate a request: the scopes of people, and those of apps. */
export const PROVIDER_SCOPES = [...OAUTH_SCOPES, ...APP_SCOPES] as const;
