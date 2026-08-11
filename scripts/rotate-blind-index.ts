/**
 * sv keys rotate-blind-index — rotate a plugin's blind-index HMAC key(s)
 * with a dual-read window (RFC 0092 gate B, epic task 8.34).
 *
 * Flow per (plugin × class) key row:
 *   1. Swap: generate + wrap a new HMAC key; the old key moves to
 *      `wrapped_hmac_key_previous` and the window opens (one transactional
 *      row update; refuses to stack on an unfinished window — resume it).
 *   2. Re-seal: the generic walker recomputes every registered blind index
 *      from its decrypted source under the new key. Checkpointed and
 *      resumable; queries keep working throughout via dual-read
 *      (`hashFieldCandidates` returns both keys' hashes while the window is
 *      open).
 *   3. Complete: after a clean full pass, the previous key is deleted and
 *      the window closes. Never an indefinite both-keys mode — boot warns
 *      when a window is older than 7 days.
 *
 * Usage:
 *   pnpm sv keys rotate-blind-index --plugin <id> [--class <cls>]
 *   pnpm sv keys rotate-blind-index --status
 */
import { randomBytes } from 'node:crypto';
import {
  completeHmacRotation,
  fieldKekFromEnv,
  findWorkspaceRoot,
  getPlatformDb,
  listFieldKeyRows,
  listOpenHmacRotations,
  startHmacRotation,
  wrapKeyMaterial,
} from '@sovereignfs/db';
import { consola } from 'consola';
import { loadRootEnv } from './load-root-env';
import { runReseal } from '../runtime/src/field-reseal';

loadRootEnv(findWorkspaceRoot());

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) {
    consola.error(`${name} requires a value.`);
    process.exit(1);
  }
  return value;
}

async function showStatus(): Promise<void> {
  const pdb = await getPlatformDb();
  const open = await listOpenHmacRotations(pdb);
  if (open.length === 0) {
    consola.success('No blind-index rotation windows are open.');
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  for (const row of open) {
    const ageDays = ((now - (row.hmacRotationStartedAt ?? now)) / 86400).toFixed(1);
    consola.info(
      `${row.pluginId} / ${row.class}: window open for ${ageDays} day(s) — ` +
        `finish with \`sv keys rotate-blind-index --plugin ${row.pluginId} --class ${row.class}\``,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--status')) {
    await showStatus();
    return;
  }

  const kek = fieldKekFromEnv();
  if (!kek) {
    consola.error('SOVEREIGN_FIELD_KEK is not set — there are no keyed blind indexes to rotate.');
    process.exit(1);
  }
  const pluginId = flagValue('--plugin');
  if (!pluginId) {
    consola.error('Usage: sv keys rotate-blind-index --plugin <id> [--class <cls>] | --status');
    process.exit(1);
  }
  const cls = flagValue('--class');

  const pdb = await getPlatformDb();
  const rows = (await listFieldKeyRows(pdb)).filter(
    (r) => r.pluginId === pluginId && (!cls || r.class === cls),
  );
  if (rows.length === 0) {
    consola.warn(
      `No field-encryption key rows for plugin "${pluginId}"` +
        (cls ? ` class "${cls}"` : '') +
        ' — nothing to rotate (keys are created on first classified write).',
    );
    return;
  }

  // Phase 1 — open (or resume) the rotation window per key row.
  for (const row of rows) {
    if (row.wrappedHmacKeyPrevious) {
      consola.info(`${row.pluginId} / ${row.class}: rotation window already open — resuming.`);
      continue;
    }
    const wrapped = wrapKeyMaterial(kek, randomBytes(32), {
      pluginId: row.pluginId,
      class: row.class,
      purpose: 'hmac',
    });
    const started = await startHmacRotation(pdb, row.id, wrapped);
    if (!started) {
      consola.warn(`${row.pluginId} / ${row.class}: could not open a window — re-run to resume.`);
      continue;
    }
    consola.success(
      `${row.pluginId} / ${row.class}: rotation window opened (new HMAC key active).`,
    );
  }

  // Phase 2 — re-seal every registered blind index for this plugin under the
  // new key. Recomputation is per-source-class, so an unrotated class's
  // indexes compare equal and are skipped — running per-plugin is safe.
  consola.info('Re-sealing blind indexes (resumable — safe to interrupt and re-run)…');
  const summary = await runReseal(pdb, 'rotate-index', {
    pluginId,
    onProgress: (message) => consola.info(message),
  });
  for (const t of summary.tables) {
    consola.success(
      `${t.pluginId} / ${t.tableName}: ${String(t.scanned)} rows scanned, ${String(t.updated)} re-indexed`,
    );
  }
  for (const t of summary.skipped) {
    consola.warn(`${t.pluginId} / ${t.tableName}: SKIPPED — ${t.skippedReason ?? 'unknown'}`);
  }
  if (summary.skipped.length > 0) {
    consola.error(
      'Rotation NOT completed: skipped tables above may still hold old-key indexes. ' +
        'Resolve the skips and re-run; the dual-read window stays open until then.',
    );
    process.exit(1);
  }
  if (summary.tables.length === 0 && !process.argv.includes('--force')) {
    consola.error(
      `No classified-table registrations for plugin "${pluginId}". Completing now would ` +
        'delete the old key while unregistered tables may still hold old-key indexes. ' +
        'If this plugin genuinely has no registered classified tables, re-run with --force ' +
        'to close the window; otherwise have the plugin register via ' +
        'sdk.crypto.registerTables() first. The dual-read window stays open meanwhile.',
    );
    process.exit(1);
  }

  // Phase 3 — clean pass: close the window, delete the old key.
  for (const row of rows) {
    await completeHmacRotation(pdb, row.id);
    consola.success(`${row.pluginId} / ${row.class}: rotation complete — old key deleted.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
