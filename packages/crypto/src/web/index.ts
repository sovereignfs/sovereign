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
export { encodeFields, LABEL } from './fields.js';
export type { Field } from './fields.js';
export { generateReceivingKey, open, publicKeyBytes, seal } from './hpke.js';
export type { KeyPair, SealContext, Sealed } from './hpke.js';
export {
  accountWrapData,
  appKeyData,
  importWrappingKey,
  KEY_BYTES,
  newKey,
  parseWrapRecord,
  RecordError,
  rewrapKey,
  SUITE,
  unwrapKey,
  unwrapSecret,
  wrapSecret,
} from './records.js';
export type { WayIn, WrapRecord } from './records.js';
export {
  createAccountSigningKey,
  createAppIdentity,
  openAccountSigningKey,
  openAppIdentity,
  publicKeyFrom,
  signAppKeys,
  verifyAppKeys,
} from './identity.js';
export type { AppIdentity, OpenedIdentity, WrappedPair } from './identity.js';
export { openDocumentKey, openEscrowWrap, sealEscrowWrap, shareDocumentKey } from './sharing.js';
export { formatKit, kitKey, readKit } from './kit.js';
export { PASSKEY_BYTES, passkeyKey, passkeyPrfInput } from './passkey.js';
export {
  CHUNK_BYTES,
  decryptBytes,
  decryptContent,
  encryptBytes,
  encryptContent,
  importDocumentKey,
} from './content.js';
export type { ContentTarget } from './content.js';
export { acceptChangedKey, memoryRememberedKeys, rememberKey } from './vault.js';
export type {
  AccountKeys,
  AppKeys,
  Remembered,
  RememberedKeys,
  Vault,
  WayInRecord,
} from './vault.js';
export type { ReadKit } from './kit.js';
export type { DocumentKeyTarget, SealedRecord, SharedKeyRecord } from './sharing.js';
export { isSignInValue, signInValueVersion } from '../sign-in-value.js';
export { indexedDbBackend, KeyStore, memoryBackend } from './keystore.js';
export type { KeyStoreBackend } from './keystore.js';
export {
  isReleaseState,
  newReleaseState,
  openRelease,
  RELEASE_MAX_AGE_MS,
  ReleaseError,
  sealRelease,
  STATE_BYTES,
} from './release.js';
export type { ReleaseAnswer, ReleaseRefusal, ReleaseTarget } from './release.js';
export { escrowKeyId, formatEscrowKey, looksLikeEscrowKey, parseEscrowKey } from './escrow.js';
export type { EscrowKey } from './escrow.js';
export {
  addPasskeyWayIn,
  coverEscrowNow,
  derivePassphrase,
  escrowPending,
  finishNewPassword,
  keepKit,
  keptAccountKey,
  kitPending,
  openAppKey,
  prepareNewPassword,
  unlockWithKit,
  unlockWithPasskey,
  unlockWithPassword,
} from './unlock.js';
export type {
  AppKeyActions,
  DerivePassphraseInput,
  KitActions,
  PreparedChange,
  Unlocked,
  VaultActions,
} from './unlock.js';
