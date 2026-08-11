import { headers } from 'next/headers';
import { requireHost } from './host';
import type { CryptoContext, EncryptFieldOptions, DecryptFieldOptions } from './types';

/**
 * Server-side field encryption (RFC 0092, epic task 8.32) — the imperative
 * half of app-level field encryption. Values are encrypted in the runtime
 * under a per-(sensitivity class × plugin) Data Encryption Key before they
 * reach the database, so the database only ever stores ciphertext.
 *
 * Distinct from `sdk.e2ee` (RFC 0060, client-side): the runtime CAN decrypt
 * a field encrypted here — the protection is against the database and its
 * operator, not against the app server.
 *
 * Requires the `crypto:use` manifest permission.
 *
 * Policy semantics (deliberate, documented): whether a value is actually
 * encrypted is the operator's decision via `SOVEREIGN_ENCRYPT_CLASSES` —
 * plugin code stays policy-agnostic. When a sensitivity class is not enabled,
 * `encryptField` returns a passthrough envelope (`svf0:`) rather than
 * ciphertext (`svf1:`); `decryptField` handles both transparently.
 * Decryption never consults the policy — ciphertext written while a class
 * was enabled stays readable after the class is disabled.
 */

const DEFAULT_TENANT_ID = 'default';

async function cryptoContext(): Promise<CryptoContext> {
  const h = await headers();
  const pluginId = h.get('x-sovereign-plugin-id');
  if (!pluginId) {
    throw new Error(
      'sdk.crypto requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  return { tenantId: DEFAULT_TENANT_ID, pluginId };
}

/** Server-side field encryption (RFC 0092). Requires the `crypto:use` permission. */
export const crypto = {
  /**
   * Encrypt a field value under the calling plugin's key for the given
   * sensitivity class. Returns an opaque envelope string to store in an
   * ordinary text column — `svf1:` (ciphertext) when the operator's policy
   * enables the class, `svf0:` (encoded passthrough) when it doesn't.
   *
   * `context` binds the ciphertext to a caller-chosen scope (e.g. a column
   * name): decryption must present the same value or fail. Defaults to `''`.
   */
  async encryptField(value: string, options: EncryptFieldOptions): Promise<string> {
    const context = await cryptoContext();
    return requireHost().crypto.encryptField(value, options, context);
  },

  /**
   * Decrypt an envelope produced by `encryptField` (either `svf1:` or
   * `svf0:`). Fails if the envelope belongs to a different plugin, the
   * `context` doesn't match the one used at encryption time, or the
   * ciphertext was tampered with.
   */
  async decryptField(envelope: string, options: DecryptFieldOptions = {}): Promise<string> {
    const context = await cryptoContext();
    return requireHost().crypto.decryptField(envelope, options, context);
  },
};
