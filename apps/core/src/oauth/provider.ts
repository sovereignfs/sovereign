import { oauthProvider } from '@better-auth/oauth-provider';
import type { Database } from '@sovereignfs/database';
import { jwt } from 'better-auth/plugins/jwt';
import type { AuthSettings } from '../auth/settings';
import { can } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { claimsFor, rolesClaim } from './claims';
import { oauthGuards } from './guards';
import { isTrusted } from './trust';

/** The scopes core knows (core-app §3.6.2). A client is allowed some of them; it can never ask for another. */
export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'roles',
  'directory',
  'offline_access',
] as const;

/** The claims discovery advertises (core-app §3.6.2). */
const SUPPORTED_CLAIMS = [
  'sub',
  'iss',
  'aud',
  'exp',
  'iat',
  'sid',
  'scope',
  'azp',
  'name',
  'picture',
  'given_name',
  'family_name',
  'email',
  'email_verified',
  'locale',
  'zoneinfo',
  'roles',
] as const;

/** Token lifetimes in seconds (core-app §3.6.1): access 15 minutes, ID 1 hour, refresh 30 days from last use. */
export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const ID_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

/** Signing keys rotate every 90 days, and the old one stays published for 30 more (core-app §3.6.1). */
export const KEY_ROTATION_SECONDS = 90 * 24 * 60 * 60;
export const KEY_GRACE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Core's OpenID Connect provider (core-app §3.6) as better-auth plugins: the JWT plugin, which holds the
 * signing keys and sets the issuer, and the OAuth provider on top of it, configured as research 0001
 * decided.
 *
 * - **The issuer is the instance URL with no path.** Discovery is served at the root by core's own route
 *   handlers; the endpoints stay under `/api/auth`.
 * - **Authorization code flow with refresh tokens, and nothing else**: no implicit, password or
 *   client-credentials grant. PKCE `S256` is required of every client (the plugin's own rule), and no
 *   client can register itself: operators do (`clientPrivileges`).
 * - **Redirect URIs match exactly.** The plugin would also let a registered loopback address change its
 *   port; the spec does not, so only a URI that is registered, character for character, is accepted.
 * - Client secrets are stored hashed, and so are the tokens.
 * - Every client is owned by the instance (`clientReference`), so any operator can manage it, and only an
 *   account whose role holds `client:manage` in the matrix in force may create, change or list one.
 */
export function oidcPlugins(database: Database, settings: AuthSettings) {
  const issuer = new URL(settings.baseUrl).origin;
  return [
    oauthGuards(),
    jwt({
      jwks: {
        keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
        rotationInterval: KEY_ROTATION_SECONDS,
        gracePeriod: KEY_GRACE_SECONDS,
      },
      jwt: { issuer },
    }),
    oauthProvider({
      loginPage: '/sign-in',
      consentPage: '/consent',
      scopes: [...OAUTH_SCOPES],
      grantTypes: ['authorization_code', 'refresh_token'],
      storeClientSecret: 'hashed',
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
      idTokenExpiresIn: ID_TOKEN_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_SECONDS,
      validateRedirectUri: (uri, registered) => registered.includes(uri),
      clientReference: () => 'instance',
      clientPrivileges: async ({ user }) =>
        can(user?.role, 'client:manage', await loadMatrix(database)),
      // Discovery lists the claims core can give. The plugin adds the ones it knows itself.
      advertisedMetadata: { claims_supported: [...SUPPORTED_CLAIMS] },
      customIdTokenClaims: ({ user, scopes }) => claimsFor(user, scopes, issuer),
      customUserInfoClaims: ({ user, scopes }) => claimsFor(user, scopes, issuer),
      // `roles` is for a trusted client that was granted the scope, and no other (core-app §3.6.4). Only
      // an extension sees the client, so it is added here, in both places a claim can be read.
      extensions: [
        {
          claims: {
            idToken: ({ user, scopes, client }) =>
              user && scopes.includes('roles') && isTrusted(client) ? rolesClaim(user) : {},
            userInfo: ({ user, scopes, client }) =>
              scopes.includes('roles') && isTrusted(client) ? rolesClaim(user) : {},
          },
        },
      ],
    }),
  ];
}
