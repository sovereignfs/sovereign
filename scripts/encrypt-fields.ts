/**
 * sv db encrypt-fields — the explicit operator backfill for app-level field
 * encryption (RFC 0092, epic task 8.34).
 *
 * Enabling a sensitivity class in `SOVEREIGN_ENCRYPT_CLASSES` affects new
 * writes only; this tool converts what already exists: plaintext or `svf0`
 * passthrough values in classified columns whose class the policy now
 * enables become `svf1` ciphertext, and blind indexes are (re)computed from
 * the plaintext. Idempotent, resumable (checkpoint per table — kill it and
 * re-run), and scoped: `--plugin <id>` bounds a run to one plugin.
 *
 * Works over the classified-table registrations plugins persist via
 * `sdk.crypto.registerTables()` — a classified table that was never
 * registered is invisible to this tool and is called out in the output,
 * never silently skipped. Run `pnpm sv db encrypt-fields` after enabling a
 * class; take a backup first (`sv backup`) as with any bulk migration.
 */
import {
  assertFieldEncryptionConfig,
  encryptClassesFromEnv,
  fieldKekFromEnv,
  findWorkspaceRoot,
  getPlatformDb,
} from '@sovereignfs/db';
import { consola } from 'consola';
import { loadRootEnv } from './load-root-env';
import { runReseal } from '../runtime/src/field-reseal';

loadRootEnv(findWorkspaceRoot());

async function main(): Promise<void> {
  assertFieldEncryptionConfig();
  if (!fieldKekFromEnv()) {
    consola.error(
      'SOVEREIGN_FIELD_KEK is not set — there is nothing to encrypt with. Set the key ' +
        '(and SOVEREIGN_ENCRYPT_CLASSES) first.',
    );
    process.exit(1);
  }
  const classes = encryptClassesFromEnv();
  if (classes.length === 0) {
    consola.error(
      'SOVEREIGN_ENCRYPT_CLASSES is empty — no class is enabled, so a backfill would be a ' +
        'no-op. Enable the classes to encrypt first.',
    );
    process.exit(1);
  }

  const pluginFlagIdx = process.argv.indexOf('--plugin');
  const pluginId = pluginFlagIdx !== -1 ? process.argv[pluginFlagIdx + 1] : undefined;
  if (pluginFlagIdx !== -1 && !pluginId) {
    consola.error('--plugin requires a plugin id.');
    process.exit(1);
  }

  consola.info(
    `Backfilling field encryption for enabled classes [${classes.join(', ')}]` +
      (pluginId ? ` — plugin ${pluginId}` : ' — all registered plugins'),
  );

  const pdb = await getPlatformDb();
  const summary = await runReseal(pdb, 'backfill', {
    pluginId,
    onProgress: (message) => consola.info(message),
  });

  if (summary.tables.length === 0 && summary.skipped.length === 0) {
    consola.warn(
      'No classified-table registrations found' +
        (pluginId ? ` for plugin ${pluginId}` : '') +
        '. Plugins register their tables via sdk.crypto.registerTables() at server-entry ' +
        'scope — a plugin that has not registered cannot be backfilled by this tool.',
    );
    return;
  }
  for (const t of summary.tables) {
    consola.success(
      `${t.pluginId} / ${t.tableName}: ${String(t.scanned)} rows scanned, ${String(t.updated)} sealed`,
    );
  }
  for (const t of summary.skipped) {
    consola.warn(`${t.pluginId} / ${t.tableName}: SKIPPED — ${t.skippedReason ?? 'unknown'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
