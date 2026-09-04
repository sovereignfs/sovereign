/**
 * Minimal `sv backup`/`sv restore`-only entrypoint (epic task 8.16) —
 * `tsup`-bundled (see `bin/tsup.config.ts`) into `runtime/dist-cli/`, and
 * shipped inside the production `runner` Docker image, which has no
 * `pnpm`/`tsx`/full `node_modules` to run the rest of `bin/sv.ts`'s ~30
 * subcommands (plugin management, seed, migrate-to-postgres, …), and no
 * reason to — `runtime/src/backup-run.ts`'s `runInstanceBackup` is the only
 * caller in that image. Deliberately not `bin/sv.ts` itself: bundling that
 * whole multi-command CLI would pull `@sovereignfs/manifest`,
 * `bin/plugin-deps.ts`, and `scripts/install-plugins.ts`'s git-credential
 * machinery into a production image that never needs any of it.
 *
 * `backup`/`restore` themselves live in `./backup-restore.ts`, shared
 * unchanged with `bin/sv.ts` — this file only adds a tiny `citty` dispatcher
 * around them, so `pnpm sv backup` and `node dist-cli/sv-backup-cli.js
 * backup` run the exact same command logic.
 */
import { defineCommand, runMain } from 'citty';
import { backup, restore } from './backup-restore';
import { loadRootEnv } from '../scripts/load-root-env';

// Mirrors bin/sv.ts's own `loadRootEnv(ROOT)` call — but keyed off
// `process.cwd()`, not this file's own location: unlike `bin/sv.ts` (always
// at `<repo>/bin/sv.ts`), this entrypoint is `tsup`-bundled to a different
// path (`runtime/dist-cli/sv-backup-cli.js`) for its real (production)
// invocation, so a location-relative root would resolve one level too
// shallow post-bundling. `runInstanceBackup()` (`runtime/src/backup-run.ts`)
// already spawns this with `cwd` set to the real workspace root, matching
// `backup-restore.ts`'s own `findWorkspaceRoot()`, so `process.cwd()` is
// already correct here. In production this is a no-op regardless — no
// `.env` file is ever copied into the `runner` image (env vars arrive via
// Docker Compose instead) — kept for parity with a manual/local invocation
// of this bundle.
loadRootEnv(process.cwd());

const main = defineCommand({
  meta: { name: 'sv-backup-cli', description: 'Sovereign backup/restore CLI (minimal, bundled)' },
  subCommands: { backup, restore },
});

void runMain(main);
