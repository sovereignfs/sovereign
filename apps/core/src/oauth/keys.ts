import type { JwtOptions } from 'better-auth/plugins/jwt';

/** Signing keys rotate every 90 days, and the old one stays published for 30 more (core-app §3.6.1). */
export const KEY_ROTATION_SECONDS = 90 * 24 * 60 * 60;
export const KEY_GRACE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The signing keys core holds (core-app §3.6.1). EdDSA is the primary key and signs everything unless an app is set
 * otherwise. RS256 is a second kind, declared here so it can be made on demand: no ID token is signed with it unless
 * an operator set an app to RS256, and it is published (see `id-token-alg.ts`) only while one has.
 */
export const jwksOptions = {
  keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
  keyPairConfigs: [{ alg: 'RS256', modulusLength: 2048 }],
  rotationInterval: KEY_ROTATION_SECONDS,
  gracePeriod: KEY_GRACE_SECONDS,
} satisfies NonNullable<JwtOptions['jwks']>;

/** The JWT plugin's options for an instance: its keys and its issuer. */
export const jwtOptionsFor = (issuer: string) =>
  ({ jwks: jwksOptions, jwt: { issuer } }) satisfies JwtOptions;
