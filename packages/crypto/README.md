# @sovereignfs/crypto

Field encryption for Sovereign core and the apps beside it: the secrets an app stores in its
database (an SMTP password, a TOTP secret) are encrypted with a key from the environment, with
**AES-256-GCM** and a **key ring** that makes rotation a routine change. A second entry point,
`@sovereignfs/crypto/web`, holds the keys of [RFC 0005](../../docs/rfcs/0005-end-to-end-encryption.md)
for a browser (below, "In a browser"). Later releases add
end-to-end encryption and the recovery kit to this package.

> Not yet published to npm. It is `private` until the first app outside this repository needs it.

```ts
import { defineConfig } from '@sovereignfs/config';
import {
  fieldEncryptionVariables,
  isDecryptionError,
  resolveFieldEncryption,
} from '@sovereignfs/crypto';

const config = defineConfig({ prefix: 'SV', variables: { ...fieldEncryptionVariables } });
const cipher = resolveFieldEncryption(config.load(), { prefix: 'SV', required: true });

const stored = cipher.encrypt(smtpPassword, 'settings.smtp_password');
// sv1:k2:<iv>:<ciphertext>:<tag>

try {
  const { value, upgraded } = cipher.open(stored, 'settings.smtp_password');
  if (upgraded) await save(upgraded); // written under an older key: rewrite it under the current one
} catch (error) {
  if (!isDecryptionError(error)) throw error;
  // this value is unreadable (error.reason says why); degrade this value, not the whole page
}
```

## The key ring

`SV_FIELD_ENCRYPTION_KEYS` (or `SV_FIELD_ENCRYPTION_KEYS_FILE`) is comma-separated `id:key`
entries, **newest first**. A key is 32 random bytes, base64 or base64url:

```bash
echo "k1:$(openssl rand -base64 32)"
```

New values are encrypted with the first entry; any entry decrypts. To **rotate**, put a new entry
in front and keep the old ones for as long as stored values still name them:

```
SV_FIELD_ENCRYPTION_KEYS=k2:<new key>,k1:<old key>
```

Values written under `k1` still decrypt, and `open` returns an `upgraded` envelope for each, so
the rotation finishes itself as values are read. `isCurrent(envelope)` tells which values are
still under an old key, for a sweep that does not wait for reads. Drop `k1` from the ring only
when none remain; a value that still names it then fails with `unknown-key`.

Problems with the ring are reported at start-up, each by entry position, none showing a key.
A ring that is set but wrong is an error even where none is required, so a typo never turns
encryption off.

## What it guarantees

- **Authenticated.** An altered value, or one opened with the wrong key or context, does not
  decrypt. `DecryptionError.reason` is `malformed`, `unknown-key` or `authentication-failed`;
  nothing in it shows a value or a key.
- **Bound to its context.** `context` (`settings.smtp_password`, or table, column and row id) is
  authenticated with the value, so a ciphertext copied into another field or row does not open
  there. A bad context (empty, over 256 characters) throws a `TypeError`: a mistake in the
  caller, not a value that failed.
- **A fresh random 96-bit IV for every value.** One key stays safe for about 2^32 values with
  random IVs, far beyond a settings table. This is for secrets, not bulk data.
- **No plaintext fallback.** Nothing here ever returns, logs or stores a value it could not
  encrypt.

## Envelope

`sv1:<key id>:<iv>:<ciphertext>:<tag>`, base64url fields, so a later format can be told apart
and read beside this one. The key id and the context are both part of the authenticated data.

## In a browser: `@sovereignfs/crypto/web`

What runs in a browser, and unchanged in Node, for encryption the server cannot read
([core-app §5](../../docs/specs/core-app.md)). It imports nothing of Node, and a test holds it to
that. So far it has the password derivation of RFC 0005 §1.1:

```ts
import { derivePassword, deriveUnlockKey } from '@sovereignfs/crypto/web';

const { signIn, secret } = await derivePassword({ password, address, instanceId });
// send `signIn` where the password used to go; after signing in, with the vault's salt:
const unlock = await deriveUnlockKey(secret, vaultSalt);
```

- One Argon2id run gives a secret, held only as a WebCrypto key that cannot be exported. From it
  HKDF makes the **sign-in value** (`svp1.` and 43 base64url characters) and, later, the
  **unlock key** (AES-256-GCM, also not exportable).
- `isSignInValue` is the shape check the server makes, exported from both entry points.
- WebCrypto needs a secure context: https, or `localhost`.

### Argon2id: libsodium

WebCrypto has no Argon2id. No implementation for a browser was found to be fully audited, so the
choice was made with the goal owner (2026-11-16) on what each audit actually covered:

| Implementation                                    | Audit                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **libsodium** (`libsodium-wrappers-sumo`), chosen | The C library, v1.0.12, by Cryptography Engineering in 2017, with password hashing in scope; Argon2id arrived in 1.0.13 and was reviewed as a diff, with no new findings. The WebAssembly build that runs here was not in scope ([report](https://www.privateinternetaccess.com/blog/2017/08/libsodium-v1-0-12-and-v1-0-13-security-assessment/)) |
| noble-hashes                                      | Cure53, v1.0.0, 2022, which excluded `argon2` ([README](https://jsr.io/@noble/hashes)). Pure JavaScript, so no WebAssembly, but about five times slower than native, which helps someone guessing                                                                                                                                                 |
| hash-wasm                                         | None found                                                                                                                                                                                                                                                                                                                                        |

- Only the **sumo** build has `crypto_pwhash`; the standard one does not.
- libsodium fixes **one lane** (RFC 0005 asks for one) and a **16-byte salt**, so the salt is the
  first 16 bytes of the RFC's SHA-256.
- It is **WebAssembly**, compiled from bytes inside the package and never fetched, so a page that
  derives needs `'wasm-unsafe-eval'` in `script-src` (core-app §5.2). It is loaded only when a
  derivation is first asked for.
- libsodium copies the password into its own memory and frees it without overwriting it. This code
  overwrites the copies it holds; libsodium's own heap is outside its reach.

### Checking it

- **RFC 9106's own Argon2id vector** (§5.3) uses four lanes, a secret and associated data, which
  libsodium does not take, so it is checked against noble-hashes instead, in the tests.
- **Vectors** in `src/web/__tests__/password-vectors.json` are made by noble-hashes (SHA-256,
  Argon2id, HKDF) and none of this package's code: `pnpm --filter @sovereignfs/crypto vectors`. The
  tests compare this package against them, and run both Argon2ids on random inputs.
- **In a browser**, the timing page checks libsodium against the same vectors before it times
  anything. The Node tests run in CI; the browser check is run by opening the page.

### HPKE: written here, over WebCrypto

Sealing a key to a person is HPKE (RFC 9180), base mode, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
AES-256-GCM. No audited HPKE for a browser was found: `@hpke/core` (hpke-js) has no published audit
and had a critical nonce-reuse flaw before 1.7.5 (CVE-2025-64767), and noble has no HPKE. So it is
written here over WebCrypto, from RFC 9180 §4 and §5, in about a hundred lines:

- Only single-shot `seal` and `open`: a fresh ephemeral key and sequence number 0 each time, so
  there is no context to keep and no counter to get wrong.
- It meets RFC 9180's printed vector (A.1.1, which uses AES-128-GCM; the AEAD is a parameter
  inside, for that vector only), and agrees both ways with `@hpke/core` on AES-256-GCM, for which
  RFC 9180 prints no X25519 vector. `@hpke/core` is a test dependency only.
- The recipient's private key stays a WebCrypto key that cannot be exported. The X25519 output and
  the secrets made from it are bytes in this code while it runs, and are overwritten before it
  returns.

### Records

Every key RFC 0005 stores is a small JSON record that names its suite (`{ "suite": 1, … }`), and
every encryption is bound to whose it is and what it is for: an account key's ways in, an app key,
an app's two key pairs, the account's signing key, a document key sealed to a reader and signed by
who shared it, and an escrow wrap. What binds them (associated data, HPKE `info`, signed messages)
is `encodeFields`: a label first, then each field's length and bytes, so a byte cannot move from a
person's `sub` into an app's client id and read the same.

### What "cannot be exported" means

Keys are held as WebCrypto keys that cannot be exported, and a key's bytes exist only inside the
call that needs them, overwritten before it returns. That stops a key object being copied out of the
page. It does **not** stop a script running on the page: whatever can use a key can decrypt what it
wraps, and so recover the bytes, and `unwrapKey` lets its caller choose `extractable`. A test holds
this property, so that no document claims more: cross-site scripting in an app gets that app's keys
while the page is open, and not another app's.

### The cost

The derivation starts at RFC 0005 §1.4's **64 MiB and 3 passes** (`PASSWORD_DERIVATION`). It is
fixed by timing it on real phones: about one second on an ordinary phone, two at most on a slow
one; if slower, memory comes down before passes, never below 19 MiB and 2 passes.

```bash
pnpm --filter @sovereignfs/crypto timing
```

prints an address to open on a phone on the same network. The page times Argon2id alone, which
works over plain http; the rest of a derivation costs well under a millisecond.

| Device                                   | Browser          | 64 MiB · 3 | 48 MiB · 3 | 32 MiB · 3 | 19 MiB · 3 | 19 MiB · 2 |
| ---------------------------------------- | ---------------- | ---------- | ---------- | ---------- | ---------- | ---------- |
| The development Mac (8 cores), for scale | Chromium 156     | 120 ms     | 90 ms      | 60 ms      | 37 ms      | 26 ms      |
| An ordinary phone                        | not yet measured |            |            |            |            |            |
| A slow phone                             | not yet measured |            |            |            |            |            |
