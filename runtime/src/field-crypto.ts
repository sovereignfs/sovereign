import { FieldEncryptionConfigError, getFieldKeyRowById, getPlatformDb } from '@sovereignfs/db';
import type { CryptoContext, DecryptFieldOptions, EncryptFieldOptions } from '@sovereignfs/sdk';
import { SENSITIVITY_CLASSES } from '@sovereignfs/sdk';
import { getFieldCipher, isClassEnabled } from './field-encryption-keys';

/**
 * `sdk.crypto` host implementation (RFC 0092, epic task 8.32 — workstream
 * 0011 leg 2): the `svf1` data envelope over leg 1's key service, plus the
 * `svf0` passthrough for classes the operator's policy doesn't enable.
 *
 * Envelope formats (both opaque strings safe for an ordinary text column):
 *
 *   svf1:<dekId>:<iv>:<tag>:<ciphertext>   AES-256-GCM under the
 *     (class × plugin) DEK; AAD binds {tenantId, pluginId, class, context}.
 *     `dekId` names the `field_encryption_keys` row, so decryption resolves
 *     the class — and verifies the owning plugin — from the envelope itself.
 *
 *   svf0:<base64url(plaintext)>            policy-off passthrough. Encoded
 *     (not raw) so the two cases are impossible to confuse and a plugin
 *     never branches on "is this encrypted?" — decryptField handles both.
 *
 * Policy is consulted at *encrypt* time only. Decryption of `svf1` never
 * checks `SOVEREIGN_ENCRYPT_CLASSES`: data written while a class was enabled
 * stays readable after an operator disables the class.
 *
 * Permission: `crypto:use`, enforced here against the calling plugin's
 * manifest (same shape as `requireMailerPluginContext`).
 */

const DATA_ENVELOPE = 'svf1';
const PASSTHROUGH_ENVELOPE = 'svf0';

/** The minimal manifest slice this module needs — keeps tests independent of the full schema. */
export interface CryptoPermissionManifest {
  id: string;
  permissions: readonly string[];
}

export function requireCryptoPluginContext(
  pluginId: string,
  manifest: CryptoPermissionManifest | undefined,
): void {
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes('crypto:use')) {
    throw new Error(`Plugin "${pluginId}" does not have the "crypto:use" permission.`);
  }
}

function fieldAad(input: {
  tenantId: string;
  pluginId: string;
  class: string;
  context: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      tenantId: input.tenantId,
      pluginId: input.pluginId,
      class: input.class,
      context: input.context,
    }),
    'utf8',
  );
}

export async function encryptFieldValue(
  value: string,
  options: EncryptFieldOptions,
  ctx: CryptoContext,
): Promise<string> {
  const cls: string = options.sensitivity;
  if (!(SENSITIVITY_CLASSES as readonly string[]).includes(cls)) {
    throw new FieldEncryptionConfigError(
      `Unknown sensitivity class "${cls}" — expected one of: ${SENSITIVITY_CLASSES.join(', ')}.`,
    );
  }
  if (!isClassEnabled(cls)) {
    return `${PASSTHROUGH_ENVELOPE}:${Buffer.from(value, 'utf8').toString('base64url')}`;
  }
  const cipher = await getFieldCipher(ctx.pluginId, cls);
  const aad = fieldAad({
    tenantId: ctx.tenantId,
    pluginId: ctx.pluginId,
    class: cls,
    context: options.context ?? '',
  });
  return `${DATA_ENVELOPE}:${cipher.dekId}:${cipher.encrypt(value, aad)}`;
}

export async function decryptFieldValue(
  envelope: string,
  options: DecryptFieldOptions,
  ctx: CryptoContext,
): Promise<string> {
  const sep = envelope.indexOf(':');
  const prefix = sep === -1 ? envelope : envelope.slice(0, sep);

  if (prefix === PASSTHROUGH_ENVELOPE) {
    return Buffer.from(envelope.slice(sep + 1), 'base64url').toString('utf8');
  }
  if (prefix !== DATA_ENVELOPE) {
    throw new FieldEncryptionConfigError(
      `Unsupported field envelope (expected ${DATA_ENVELOPE} or ${PASSTHROUGH_ENVELOPE}).`,
    );
  }

  const [, dekId, iv, tag, ciphertext] = envelope.split(':');
  if (!dekId || !iv || !tag || !ciphertext) {
    throw new FieldEncryptionConfigError('Malformed svf1 field envelope.');
  }

  const pdb = await getPlatformDb();
  const row = await getFieldKeyRowById(pdb, dekId);
  if (!row) {
    throw new FieldEncryptionConfigError(
      `Unknown DEK id in field envelope — the key row no longer exists.`,
    );
  }
  // Cross-plugin guard: fail identically to a missing row *before* any
  // crypto, so plugin A can neither decrypt nor probe plugin B's envelopes.
  if (row.pluginId !== ctx.pluginId) {
    throw new FieldEncryptionConfigError(
      `Unknown DEK id in field envelope — the key row no longer exists.`,
    );
  }

  const cipher = await getFieldCipher(ctx.pluginId, row.class);
  const aad = fieldAad({
    tenantId: ctx.tenantId,
    pluginId: ctx.pluginId,
    class: row.class,
    context: options.context ?? '',
  });
  return cipher.decrypt([iv, tag, ciphertext].join(':'), aad);
}
