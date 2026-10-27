# @sovereignfs/crypto

Field encryption for Sovereign core and the apps beside it: the secrets an app stores in its
database (an SMTP password, a TOTP secret) are encrypted with a key from the environment, with
**AES-256-GCM** and a **key ring** that makes rotation a routine change. Later releases add
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
