/**
 * sv keys rotate-field-kek — re-wrap every stored field-encryption DEK and
 * blind-index HMAC key under a new KEK (RFC 0092, epic task 8.31).
 *
 * Rotation never touches data rows: only the wrapped key material in
 * `field_encryption_keys` is rewritten, so it completes in seconds regardless
 * of how much encrypted data exists. Flow:
 *
 *   1. Old KEK comes from `SOVEREIGN_FIELD_KEK` (the currently active key).
 *   2. New KEK comes from `--new-key`, or is generated (and printed) if omitted.
 *   3. Every row is unwrapped with the old KEK *first* — any failure aborts
 *      before a single write happens (fail-fast, no partial state on a wrong
 *      old key).
 *   4. Rows are rewritten one by one. Each row's `kek_fingerprint` records
 *      which KEK wraps it, so an interrupted run is cleanly resumable: re-run
 *      with the same `--new-key` and already-rotated rows are skipped.
 *   5. The operator updates `SOVEREIGN_FIELD_KEK` to the new key and restarts.
 *
 * Run while the platform is stopped (the runtime caches unwrapped keys and
 * knows nothing about the new KEK until restarted with it).
 */
import { randomBytes } from 'node:crypto';
import {
  FieldEncryptionConfigError,
  fieldKekFromEnv,
  findWorkspaceRoot,
  getPlatformDb,
  kekFingerprint,
  listFieldKeyRows,
  unwrapKeyMaterial,
  updateFieldKeyRowWrapped,
  wrapKeyMaterial,
} from '@sovereignfs/db';
import { consola } from 'consola';
import { loadRootEnv } from './load-root-env';

// Normally invoked via `sv keys rotate-field-kek`, which already loads .env
// before spawning this — but load here too (idempotent, never overrides an
// already-set var) so a direct `pnpm tsx scripts/rotate-field-kek.ts` doesn't
// silently miss SOVEREIGN_FIELD_KEK/DB_DIALECT.
loadRootEnv(findWorkspaceRoot());

function decodeNewKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  for (const normalized of [trimmed, trimmed.replace(/-/g, '+').replace(/_/g, '/')]) {
    const key = Buffer.from(normalized, 'base64');
    if (key.length === 32) return key;
  }
  throw new FieldEncryptionConfigError(
    '--new-key must be a 32-byte key encoded as base64, base64url, or 64-character hex.',
  );
}

async function main(): Promise<void> {
  const oldKek = fieldKekFromEnv();
  if (!oldKek) {
    consola.error(
      'SOVEREIGN_FIELD_KEK is not set — there is no current KEK to rotate away from. ' +
        '(On a fresh instance, just set the key; rotation is only for replacing an existing one.)',
    );
    process.exit(1);
  }

  const newKeyFlagIdx = process.argv.indexOf('--new-key');
  const newKekRaw = newKeyFlagIdx !== -1 ? process.argv[newKeyFlagIdx + 1] : undefined;
  if (newKeyFlagIdx !== -1 && !newKekRaw) {
    consola.error('--new-key requires a value.');
    process.exit(1);
  }
  const generated = !newKekRaw;
  const newKek = newKekRaw ? decodeNewKey(newKekRaw) : randomBytes(32);
  const newKekEncoded = newKek.toString('base64');

  if (kekFingerprint(newKek) === kekFingerprint(oldKek)) {
    consola.error('The new KEK is identical to the current one — nothing to rotate.');
    process.exit(1);
  }

  // getPlatformDb (not bare createClient) so platform migrations have run —
  // rotating on an instance that never booted this version still finds the
  // field_encryption_keys table in place.
  const pdb = await getPlatformDb();
  const rows = await listFieldKeyRows(pdb);
  if (rows.length === 0) {
    consola.info('No field-encryption keys stored yet — nothing to rotate.');
    consola.info(`To adopt a new KEK, simply set SOVEREIGN_FIELD_KEK to it.`);
    return;
  }

  const oldFp = kekFingerprint(oldKek);
  const newFp = kekFingerprint(newKek);
  const pending = rows.filter((r) => r.kekFingerprint !== newFp);
  const alreadyRotated = rows.length - pending.length;
  if (alreadyRotated > 0) {
    consola.info(`${alreadyRotated} row(s) already wrapped under the new KEK — resuming.`);
  }

  // Phase 1 — unwrap everything first. A wrong old KEK (or a row wrapped
  // under some third key) fails here, before any write.
  const unwrapped = pending.map((row) => {
    if (row.kekFingerprint !== oldFp) {
      throw new FieldEncryptionConfigError(
        `Row for plugin "${row.pluginId}" class "${row.class}" is wrapped under KEK ` +
          `${row.kekFingerprint}, but the current SOVEREIGN_FIELD_KEK is ${oldFp}. ` +
          'Set SOVEREIGN_FIELD_KEK to the KEK that wraps this row, then re-run.',
      );
    }
    const ctx = { pluginId: row.pluginId, class: row.class } as const;
    return {
      row,
      dek: unwrapKeyMaterial(oldKek, row.wrappedDek, { ...ctx, purpose: 'dek' }),
      hmacKey: unwrapKeyMaterial(oldKek, row.wrappedHmacKey, { ...ctx, purpose: 'hmac' }),
      // A KEK rotation during an open blind-index rotation window must carry
      // the previous HMAC key across, or the dual-read window dies silently.
      hmacKeyPrevious: row.wrappedHmacKeyPrevious
        ? unwrapKeyMaterial(oldKek, row.wrappedHmacKeyPrevious, { ...ctx, purpose: 'hmac' })
        : null,
    };
  });

  // Phase 2 — rewrap and persist. Interruption mid-loop is safe: each row is
  // atomically either old-wrapped or new-wrapped, and a re-run resumes.
  for (const { row, dek, hmacKey, hmacKeyPrevious } of unwrapped) {
    const ctx = { pluginId: row.pluginId, class: row.class } as const;
    await updateFieldKeyRowWrapped(
      pdb,
      row.id,
      wrapKeyMaterial(newKek, dek, { ...ctx, purpose: 'dek' }),
      wrapKeyMaterial(newKek, hmacKey, { ...ctx, purpose: 'hmac' }),
      hmacKeyPrevious
        ? wrapKeyMaterial(newKek, hmacKeyPrevious, { ...ctx, purpose: 'hmac' })
        : null,
      newFp,
    );
    consola.success(`Rotated ${row.pluginId} / ${row.class}`);
  }

  consola.box(
    [
      `Rotation complete — ${pending.length} row(s) re-wrapped.`,
      '',
      generated
        ? `Generated new KEK (base64):\n  ${newKekEncoded}`
        : 'New KEK: the value you passed via --new-key.',
      '',
      'Now update SOVEREIGN_FIELD_KEK to the new key everywhere it is set',
      '(.env, compose files, secret manager) and restart the platform.',
      'The old KEK no longer decrypts anything once this is done.',
    ].join('\n'),
  );
}

main()
  .then(() => {
    // Explicit exit: on Postgres the connection pool would otherwise keep the
    // process alive after the work is done.
    process.exit(0);
  })
  .catch((err: unknown) => {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
