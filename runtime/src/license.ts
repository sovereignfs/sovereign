/**
 * Ed25519 license token verification for plugin monetization (RFC 0003).
 *
 * Token format: `<base64url(JSON payload)>.<base64url(Ed25519 signature)>`
 *
 * The signature covers the UTF-8 bytes of the payload portion (before the dot).
 * The plugin author holds the private key; the public key is published in
 * `manifest.monetization.license.publicKey` (raw 32-byte Ed25519, base64url).
 *
 * Authors generate a keypair with:
 *   node -e "const c=require('crypto'); const {publicKey:pub,privateKey:priv}=
 *     c.generateKeyPairSync('ed25519');
 *     console.log('pub',pub.export({format:'jwk'}).x);
 *     console.log('priv',priv.export({format:'jwk'}).d);"
 *
 * Authors sign a token with:
 *   node -e "const c=require('crypto');
 *     const priv=c.createPrivateKey({key:{kty:'OKP',crv:'Ed25519',
 *       x:'<public>',d:'<private>'},format:'jwk'});
 *     const payload=Buffer.from(JSON.stringify({pluginId,sub,issuedAt,expiresAt,tier}))
 *       .toString('base64url');
 *     const sig=c.sign(null,Buffer.from(payload),priv).toString('base64url');
 *     console.log(payload+'.'+sig);"
 */

import { type JsonWebKey, createPublicKey, verify as cryptoVerify } from 'node:crypto';

export interface LicensePayload {
  /** Plugin ID this license is issued for (e.g. `com.acme.myplugin`). */
  pluginId: string;
  /** Subscriber identity — typically the user's email or instance domain. */
  sub: string;
  /** Unix epoch seconds when the license was issued. */
  issuedAt: number;
  /** Unix epoch seconds when the license expires. Omit for perpetual licenses. */
  expiresAt?: number;
  /** Tier ID (e.g. `"pro"`). Omit for single-tier plugins. */
  tier?: string;
}

export interface VerifyResult {
  valid: boolean;
  payload: LicensePayload | null;
  error?: string;
}

/**
 * Verify a signed license token against the author's Ed25519 public key.
 *
 * @param token       Raw token string (`<base64url payload>.<base64url signature>`).
 * @param publicKeyB64 Base64url-encoded raw Ed25519 public key (32 bytes).
 * @param pluginId    Expected plugin ID — verification fails if the payload
 *                    carries a different ID (prevents cross-plugin license reuse).
 */
export function verifyLicenseToken(
  token: string,
  publicKeyB64: string,
  pluginId: string,
): VerifyResult {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1)
      return { valid: false, payload: null, error: 'Malformed token — missing dot separator.' };

    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);

    // The signature covers the UTF-8 bytes of the base64url payload string
    // (i.e. the ASCII characters 'e','y','J',... before the dot), matching
    // what the signing script produces with Buffer.from(payload) [no encoding].
    const payloadBytes = Buffer.from(payloadB64); // utf-8 / ascii of the b64url string
    const sigBytes = Buffer.from(sigB64, 'base64url');

    // Reconstruct the Ed25519 public key from the raw 32-byte JWK `x` value.
    const rawPub = Buffer.from(publicKeyB64, 'base64url');
    if (rawPub.length !== 32) {
      return {
        valid: false,
        payload: null,
        error: 'Public key must be a 32-byte Ed25519 key (base64url).',
      };
    }
    const jwk: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: rawPub.toString('base64url') };
    const pubKey = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });

    const ok = cryptoVerify(null, payloadBytes, pubKey, sigBytes);
    if (!ok) return { valid: false, payload: null, error: 'Signature verification failed.' };

    // Decode and validate the payload fields.
    let payload: LicensePayload;
    try {
      payload = JSON.parse(payloadBytes.toString('utf-8')) as LicensePayload;
    } catch {
      return { valid: false, payload: null, error: 'Payload is not valid JSON.' };
    }

    if (!payload.pluginId || !payload.sub || typeof payload.issuedAt !== 'number') {
      return {
        valid: false,
        payload: null,
        error: 'Payload missing required fields (pluginId, sub, issuedAt).',
      };
    }

    if (payload.pluginId !== pluginId) {
      return {
        valid: false,
        payload: null,
        error: `License is for plugin "${payload.pluginId}", not "${pluginId}".`,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt !== undefined && payload.expiresAt <= now) {
      return { valid: false, payload, error: 'License has expired.' };
    }

    return { valid: true, payload };
  } catch (err: unknown) {
    return {
      valid: false,
      payload: null,
      error: err instanceof Error ? err.message : 'Unknown verification error.',
    };
  }
}
