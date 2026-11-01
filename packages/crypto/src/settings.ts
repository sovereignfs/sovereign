import { ConfigError, secret } from '@sovereignfs/config';
import type { ConfigValues, Problem } from '@sovereignfs/config';
import { KeyRingError } from './errors.js';
import { FieldCipher } from './field-cipher.js';

/**
 * The field-encryption variable of contracts/env.md, to spread into an app's `defineConfig`.
 * Optional here, because whether an app needs it depends on whether it stores secrets;
 * `resolveFieldEncryption` says which, and reports a problem naming the variable.
 */
export const fieldEncryptionVariables = {
  fieldEncryptionKeys: secret({
    name: 'FIELD_ENCRYPTION_KEYS',
    description:
      'The keys that encrypt stored secrets, newest first: id:key entries, comma-separated',
  }),
};

export type FieldEncryptionSettings = ConfigValues<typeof fieldEncryptionVariables>;

export type ResolveOptions = {
  /** The app's prefix, so a problem names the real variable (`SV_FIELD_ENCRYPTION_KEYS`). */
  prefix: string;
  /** The app stores secrets, so it cannot run without keys. */
  required?: boolean;
};

/**
 * The cipher for the app's key ring, `undefined` when none is set and none is required. A
 * ring that is set but wrong is an error either way, so a typo never turns encryption off.
 */
export function resolveFieldEncryption(
  settings: FieldEncryptionSettings,
  options: ResolveOptions & { required: true },
): FieldCipher;
export function resolveFieldEncryption(
  settings: FieldEncryptionSettings,
  options: ResolveOptions,
): FieldCipher | undefined;
export function resolveFieldEncryption(
  settings: FieldEncryptionSettings,
  { prefix, required = false }: ResolveOptions,
): FieldCipher | undefined {
  const variable = `${prefix}_FIELD_ENCRYPTION_KEYS`;
  const keys = settings.fieldEncryptionKeys;
  if (keys === undefined) {
    if (!required) return undefined;
    throw new ConfigError([
      { variable, message: `is required but not set (or set ${variable}_FILE)` },
    ]);
  }
  try {
    return FieldCipher.fromKeyRing(keys.reveal());
  } catch (error) {
    if (error instanceof KeyRingError) {
      const problems: Problem[] = error.problems.map((message) => ({ variable, message }));
      throw new ConfigError(problems);
    }
    throw error;
  }
}
