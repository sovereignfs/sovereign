/**
 * `sv backup`/`sv restore` — extracted from `bin/sv.ts` (epic task 8.16) so
 * they can be registered from two entrypoints: the full `sv` CLI (unchanged
 * behavior, `pnpm sv backup`/`./bin/sv backup`) and `bin/sv-backup-cli.ts`, a
 * minimal entrypoint `tsup`-bundled into `runtime/dist-cli/` and shipped
 * inside the production `runner` Docker image — which has no `pnpm`/`tsx`/
 * full `node_modules` to run the rest of `sv`'s ~30 subcommands, and no
 * reason to (`runtime/src/backup-run.ts`'s `runInstanceBackup` is the only
 * caller in that image).
 *
 * Every helper below is a small, deliberate duplicate of an equivalent in
 * `packages/db/src/{dialect,client}.ts` or `bin/helpers.ts`, rather than an
 * import — importing `@sovereignfs/db` would pull its whole barrel
 * (`drizzle-orm`, `cron-parser`, `@libsql/client`, the native
 * `better-sqlite3-multiple-ciphers` addon) into the bundle; importing
 * `bin/helpers.ts` would pull in `@sovereignfs/manifest` (zod, semver) the
 * same way. `citty`, `consola`, and `age-encryption` (added for `restore`'s
 * `--age-identity` flag, epic task 8.42, workstream 0023 leg 6) are the
 * bundle's only real dependencies — all three genuinely zero-dependency,
 * pure-JS packages (see `bin/tsup.config.ts`'s own comment), so none of them
 * threaten this file's bundle-ability into the dependency-free
 * `sv-backup-cli.js` artifact the way `@sovereignfs/db`/`bin/helpers.ts`
 * would.
 */
import { mkdirSync, mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { Decrypter } from 'age-encryption';

/** Mirrors packages/db/src/client.ts's findWorkspaceRoot — see this file's own doc comment for why duplicated. */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Mirrors packages/db/src/dialect.ts's resolveDialect — see this file's own doc comment for why duplicated. */
function resolveDialect(env: NodeJS.ProcessEnv = process.env): { dialect: 'sqlite' | 'postgres' } {
  const explicit = env.DB_DIALECT?.toLowerCase();
  if (explicit !== 'sqlite' && explicit !== 'postgres') {
    throw new Error(
      `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
        explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
      }).`,
    );
  }
  return { dialect: explicit };
}

/** Mirrors bin/helpers.ts's defaultArchivePath — see this file's own doc comment for why duplicated. */
function defaultArchivePath(workspaceRoot: string, version: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(workspaceRoot, 'backups', `sovereign-backup-${ts}-v${version}.tar.gz`);
}

/** Mirrors bin/helpers.ts's readPlatformVersion — see this file's own doc comment for why duplicated. */
function readPlatformVersion(workspaceRoot: string): string {
  try {
    const raw = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Mirrors packages/db/src/plugin-client.ts's pluginSchemaName — see this file's own doc comment for why duplicated. */
function pluginSchemaName(pluginId: string): string {
  return `plugin_${pluginId.replace(/[.-]/g, '_')}`;
}

/**
 * citty's `defineCommand` args have no "repeatable" arg type — it parses via
 * Node's own `util.parseArgs()` with `multiple` never set for any option, so
 * a flag passed more than once just silently keeps the last occurrence
 * (confirmed by reading node_modules/citty's own parser). Reading `rawArgs`
 * directly instead gives `--exclude-plugin a --exclude-plugin b` its
 * expected meaning — both values, in order — matching the equally-repeatable
 * `pg_dump --exclude-schema` flag this maps onto below. Handles both
 * `--flag value` and `--flag=value` forms.
 */
function parseRepeatedStringFlag(rawArgs: string[] | undefined, flag: string): string[] {
  const values: string[] = [];
  const eqPrefix = `${flag}=`;
  const args = rawArgs ?? [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) values.push(next);
    } else if (arg?.startsWith(eqPrefix)) {
      values.push(arg.slice(eqPrefix.length));
    }
  }
  return values;
}

/**
 * Parse an age identity file's raw content into the bare secret-key
 * line(s) `age-encryption`'s own `Decrypter.addIdentity()` expects (it
 * accepts only a string starting with `AGE-SECRET-KEY-1`/`-PQ-1` — unlike
 * the real `age` CLI's `-i` flag, this library throws on anything else, so
 * a raw `age-keygen -o <file>` output can't be handed to it unparsed).
 * Mirrors the real `age` CLI's own documented identity-file convention:
 * blank lines and lines starting with `#` are comments, everything else is
 * a candidate key — `age-keygen`'s default output is exactly this shape
 * (`# created: ...` / `# public key: ...` comment lines above the real
 * `AGE-SECRET-KEY-1...` line).
 */
function parseIdentityFile(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Decrypt a recipient-mode-encrypted archive with an operator-supplied
 * identity file (epic task 8.42, workstream 0023 leg 6) — the one place
 * this CLI ever holds a private key. This doesn't violate workstream 0023's
 * "Sovereign never holds a private key" invariant: that invariant is about
 * the *running instance process* never possessing one, and this is the
 * operator's own offline CLI invocation, using a key file they supply from
 * their own storage — structurally identical to how they already have to
 * supply a passphrase for the passphrase-mode case (this function has no
 * passphrase-mode equivalent; a passphrase-encrypted archive is decrypted
 * with the standalone `age` CLI before being handed to `sv restore`, same
 * as before this leg).
 */
async function decryptWithIdentity(ciphertext: Buffer, identities: string[]): Promise<Buffer> {
  const decrypter = new Decrypter();
  for (const identity of identities) {
    decrypter.addIdentity(identity);
  }
  try {
    const plaintext = await decrypter.decrypt(ciphertext);
    return Buffer.from(plaintext);
  } catch {
    throw new Error(
      'Decryption failed: the identity does not match this archive, or it is tampered/corrupted.',
    );
  }
}

const ROOT = findWorkspaceRoot();

export const backup = defineCommand({
  meta: {
    name: 'backup',
    description: 'Snapshot the platform data (databases + avatars) to a timestamped archive',
  },
  args: {
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    out: {
      type: 'string',
      description: 'Output archive path (default: ./backups/sovereign-backup-<ts>-v<ver>.tar.gz)',
    },
    excludePlugin: {
      type: 'string',
      description:
        "Exclude a schema-isolated plugin's data from the backup, by plugin id (repeatable). " +
        'No effect on a shared-schema (platform-type) plugin id.',
    },
  },
  async run({ args, rawArgs }) {
    const dataDir = resolve(args.dataDir);
    const version = readPlatformVersion(ROOT);
    const archivePath = resolve(args.out ?? defaultArchivePath(ROOT, version));
    const archiveDir = dirname(archivePath);
    const excludePlugins = parseRepeatedStringFlag(rawArgs, '--exclude-plugin');

    if (!existsSync(dataDir)) {
      consola.error(`Data directory not found: ${dataDir}`);
      process.exit(1);
    }

    mkdirSync(archiveDir, { recursive: true });

    const { dialect } = resolveDialect(process.env);

    if (dialect === 'postgres') {
      // One pg_dump of the whole database — the platform's own tables
      // (public schema), the auth schema (sovereign_auth), and every
      // isolated plugin's schema (plugin_<slug>) all live in this same
      // database now, so a single dump already captures everything unless
      // explicitly excluded.
      consola.start(`Creating Postgres backup → ${archivePath}`);
      const tmp = mkdtempSync(join(archiveDir, '.sv-backup-'));
      const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });
      try {
        const pgUrl = process.env.POSTGRES_DB_URL;
        if (!pgUrl) {
          cleanup();
          consola.error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
          process.exit(1);
        }
        const dumpArgs = ['--format=custom', `--file=${join(tmp, 'sovereign.pgdump')}`];
        for (const pluginId of excludePlugins) {
          dumpArgs.push(`--exclude-schema=${pluginSchemaName(pluginId)}`);
        }
        dumpArgs.push(pgUrl);
        const dumpResult = spawnSync('pg_dump', dumpArgs, { stdio: 'inherit' });
        if (dumpResult.status !== 0) {
          cleanup();
          consola.error('pg_dump failed.');
          process.exit(1);
        }
        // Non-secret metadata for a later restore's compatibility check
        // (epic task 8.17's follow-on) — plain JSON, not encrypted; the
        // archive as a whole may be encrypted by whoever calls this CLI
        // (runtime/src/backup-run.ts does, for job-driven backups).
        writeFileSync(
          join(tmp, 'sovereign-backup-manifest.json'),
          JSON.stringify({
            schemaVersion: 1,
            platformVersion: version,
            dialect,
            createdAt: Math.floor(Date.now() / 1000),
            excludedPlugins: excludePlugins,
          }),
        );
        // Include avatars if they exist.
        const avatarsDir = join(dataDir, 'avatars');
        const tarArgs = ['-czf', archivePath, '-C', tmp, '.'];
        if (existsSync(avatarsDir)) {
          tarArgs.push('-C', dataDir, 'avatars');
        }
        const tarResult = spawnSync('tar', tarArgs, { stdio: 'inherit' });
        cleanup();
        if (tarResult.status !== 0) {
          consola.error('tar failed creating archive.');
          process.exit(1);
        }
      } catch (err) {
        cleanup();
        throw err;
      }
    } else {
      // SQLite is sqld-backed only — its data lives in the sovereign_sqld_data
      // Docker volume, not a local directory this CLI can tar. There is no
      // automated sqld backup here yet (mirrors task 8.16's equivalent
      // Postgres gap) — point the operator at a volume-level backup instead
      // of silently producing an incomplete or empty archive.
      consola.error(
        'Automated backup for the SQLite (sqld) dialect is not implemented yet. Back up the ' +
          '`sovereign_sqld_data` Docker volume directly, e.g.:\n' +
          '  docker run --rm -v sovereign_sqld_data:/data -v "$PWD":/backup alpine ' +
          'tar -czf /backup/sqld-backup.tar.gz -C /data .',
      );
      process.exit(1);
    }

    consola.success(`Backup saved → ${archivePath}`);
  },
});

export const restore = defineCommand({
  meta: {
    name: 'restore',
    description: 'Restore a backup archive created by `sv backup`',
  },
  args: {
    archive: {
      type: 'positional',
      required: true,
      description:
        'Path to the .tar.gz backup archive (or a recipient-mode-encrypted ' +
        '.tar.gz.age archive, with --age-identity)',
    },
    dataDir: {
      type: 'string',
      description: 'Restore destination (default: ./data)',
      default: join(ROOT, 'data'),
    },
    ageIdentity: {
      type: 'string',
      description:
        'Path to an age identity file (e.g. produced by `age-keygen`) to decrypt a ' +
        'recipient-mode-encrypted archive before restoring it (epic task 8.42). Omit for ' +
        'an already-decrypted archive, or a passphrase-mode one — decrypt those with the ' +
        'standalone `age` CLI first; this flag only handles recipient mode.',
    },
  },
  async run({ args }) {
    let archivePath = resolve(args.archive);
    const dataDir = resolve(args.dataDir);

    if (!existsSync(archivePath)) {
      consola.error(`Archive not found: ${archivePath}`);
      process.exit(1);
    }

    mkdirSync(dataDir, { recursive: true });

    const { dialect } = resolveDialect(process.env);

    consola.warn(
      `This will overwrite data in ${dataDir}. ` +
        'Stop the server before restoring to avoid data corruption.',
    );

    let decryptedTempPath: string | null = null;
    if (args.ageIdentity) {
      const identityPath = resolve(args.ageIdentity);
      if (!existsSync(identityPath)) {
        consola.error(`Age identity file not found: ${identityPath}`);
        process.exit(1);
      }
      const identities = parseIdentityFile(readFileSync(identityPath, 'utf8'));
      if (identities.length === 0) {
        consola.error(`No age identity found in ${identityPath}.`);
        process.exit(1);
      }

      consola.start('Decrypting archive with the supplied age identity...');
      let plaintext: Buffer;
      try {
        plaintext = await decryptWithIdentity(readFileSync(archivePath), identities);
      } catch (err) {
        consola.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const decryptDir = mkdtempSync(join(dataDir, '.sv-restore-decrypt-'));
      decryptedTempPath = join(decryptDir, 'sovereign-backup.tar.gz');
      writeFileSync(decryptedTempPath, plaintext);
      archivePath = decryptedTempPath;
      consola.success('Archive decrypted.');
    }

    try {
      if (dialect === 'postgres') {
        const pgUrl = process.env.POSTGRES_DB_URL;
        if (!pgUrl) {
          consola.error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
          process.exit(1);
        }
        // Extract the dump file then pg_restore it — one database now covers
        // the platform's own tables, the auth schema, and every plugin schema
        // (see `backup`'s identical comment).
        const tmp = mkdtempSync(join(dataDir, '.sv-restore-'));
        const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });
        try {
          const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', tmp], {
            stdio: 'inherit',
          });
          if (extractResult.status !== 0) {
            cleanup();
            consola.error('tar extraction failed.');
            process.exit(1);
          }

          const dumpPath = join(tmp, 'sovereign.pgdump');
          if (existsSync(dumpPath)) {
            const result = spawnSync(
              'pg_restore',
              ['--clean', '--if-exists', `--dbname=${pgUrl}`, dumpPath],
              { stdio: 'inherit' },
            );
            if (result.status !== 0) {
              cleanup();
              consola.error('pg_restore failed.');
              process.exit(1);
            }
          }

          // Restore avatars if present in the archive.
          const avatarsSrc = join(tmp, 'avatars');
          if (existsSync(avatarsSrc)) {
            rmSync(join(dataDir, 'avatars'), { recursive: true, force: true });
            const mvResult = spawnSync('mv', [avatarsSrc, join(dataDir, 'avatars')], {
              stdio: 'inherit',
            });
            if (mvResult.status !== 0) {
              cleanup();
              consola.error('Failed to restore avatars.');
              process.exit(1);
            }
          }
          cleanup();
        } catch (err) {
          cleanup();
          throw err;
        }
      } else {
        // See `backup`'s identical branch — sqld's data isn't reachable as a
        // local directory this CLI can tar/restore.
        consola.error(
          'Automated restore for the SQLite (sqld) dialect is not implemented yet. Restore the ' +
            '`sovereign_sqld_data` Docker volume directly from your own volume-level backup.',
        );
        process.exit(1);
      }
    } finally {
      // Clean up the decrypted plaintext temp copy (epic task 8.42) — never
      // leave it behind, success or failure, so an --age-identity restore
      // doesn't quietly accumulate unencrypted archive copies in dataDir.
      if (decryptedTempPath) {
        rmSync(dirname(decryptedTempPath), { recursive: true, force: true });
      }
    }

    consola.success('Restore complete. Restart the server to apply.');
  },
});
