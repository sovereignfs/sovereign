/**
 * `@sovereignfs/crypto/web`: what runs in a browser (and unchanged in Node): the keys of RFC 0005, starting with the password
 * derivation. Nothing here imports from Node; the package's main entry point is the server's.
 */
export { argon2id, MINIMUM_COST, ARGON2_SALT_BYTES } from './argon2.js';
export type { Argon2Cost } from './argon2.js';
export { concat, fromBase64Url, toBase64Url, utf8 } from './bytes.js';
export {
  derivePassword,
  deriveUnlockKey,
  INSTANCE_ID_BYTES,
  normaliseAddress,
  PASSWORD_DERIVATION,
  passwordSalt,
} from './password.js';
export type {
  DerivedPassword,
  DerivePasswordInput,
  PasswordDerivation,
  WebKey,
} from './password.js';
export { generateReceivingKey, open, publicKeyBytes, seal } from './hpke.js';
export type { KeyPair, SealContext, Sealed } from './hpke.js';
export { isSignInValue, signInValueVersion } from '../sign-in-value.js';
