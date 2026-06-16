/**
 * validate-registry — verify and pin every entry in `registry/plugins.json`.
 *
 * For each entry it:
 *   1. validates the entry shape against the registry-entry schema;
 *   2. fetches the plugin source (shallow git clone at the pinned ref, or a
 *      local path) — proving the source exists;
 *   3. validates the source `manifest.json` against the manifest schema, and
 *      checks the manifest `id` matches the entry and a `LICENSE` file exists;
 *   4. computes a content hash (sha256 over the source tree) and records it
 *      with the resolved commit as `provenance` on the entry.
 *
 * Two modes:
 *   - default (write): writes the resolved `provenance` back into plugins.json.
 *     Plugin authors run `pnpm registry:validate` before opening a PR.
 *   - `--check`: does not write; verifies the committed `provenance` matches a
 *     fresh validation, exiting non-zero on any drift. CI runs this.
 *
 * Path sources can only be validated where the path exists (local dev); in
 * `--check` with a missing path the entry is reported as unverifiable.
 *
 * See: docs/roadmap.md — Task 0.5.18; registry/CONTRIBUTING.md.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCompatibility, validateManifest, validateRegistryEntry } from '@sovereignfs/manifest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'plugins.json');

function readPlatformVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface CliArgs {
  check: boolean;
}

/** Parse CLI flags. `--check` = verify-only (no write); default = write provenance. */
export function parseArgs(argv: string[]): CliArgs {
  return { check: argv.includes('--check') };
}

export interface Provenance {
  commit: string;
  contentHash: string;
  validatedAt: string;
}

/** True when committed provenance matches a freshly computed one (commit + hash). */
export function provenanceMatches(
  committed: Provenance | undefined,
  computed: Provenance,
): boolean {
  return (
    committed !== undefined &&
    committed.commit === computed.commit &&
    committed.contentHash === computed.contentHash
  );
}

/** Recursively collect file paths under `dir`, excluding the `.git` directory. */
function collectFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full));
    }
  }
  return out;
}

/**
 * Deterministic sha256 over a source tree: every file's POSIX-normalised
 * relative path and raw bytes, length-delimited, in sorted path order. Stable
 * across machines (sorted paths, content-only — permissions/symlinks ignored).
 */
export function hashTree(dir: string): string {
  const files = collectFiles(dir)
    .map((p) => p.split(sep).join('/'))
    .sort();
  const hash = createHash('sha256');
  for (const rel of files) {
    const bytes = readFileSync(join(dir, ...rel.split('/')));
    hash.update(`${rel}\0${String(bytes.length)}\0`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Shallow-clone a git source at an optional ref into a temp dir; resolve the commit. */
function fetchGitSource(url: string, ref: string | undefined): { dir: string; commit: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sv-registry-'));
  const args = ['clone', '--depth', '1', '--quiet'];
  if (ref) args.push('--branch', ref);
  args.push(url, dir);
  try {
    execFileSync('git', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch {
    // A raw commit SHA can't be used with --branch; fall back to a full clone + checkout.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['clone', '--quiet', url, dir], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (ref) {
      execFileSync('git', ['-C', dir, 'checkout', '--quiet', ref], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    }
  }
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { dir, commit };
}

export interface EntryResult {
  id: string;
  errors: string[];
  provenance?: Provenance;
}

/**
 * Validate a single entry end to end and compute fresh provenance. Returns the
 * computed provenance (write mode stores it; check mode compares it). Network +
 * filesystem side effects live here; pure logic above is unit-tested.
 */
export function validateEntry(entry: unknown): EntryResult {
  const shape = validateRegistryEntry(entry);
  if (!shape.valid) {
    const id = (entry as { id?: string }).id ?? '<unknown>';
    return { id, errors: shape.errors.map((e) => `entry: ${e}`) };
  }
  const e = shape.entry;
  const errors: string[] = [];

  let dir: string | undefined;
  let commit = '';
  let cleanup: (() => void) | undefined;
  try {
    if (e.repository.type === 'git') {
      const fetched = fetchGitSource(e.repository.url, e.repository.ref);
      dir = fetched.dir;
      commit = fetched.commit;
      cleanup = () => rmSync(fetched.dir, { recursive: true, force: true });
    } else {
      const abs = resolve(ROOT, e.repository.url);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        return { id: e.id, errors: [`source path not found: ${e.repository.url}`] };
      }
      dir = abs;
      commit = 'path';
    }

    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      errors.push('source has no manifest.json');
      return { id: e.id, errors };
    }
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    if (!manifest.valid) {
      errors.push(...manifest.errors.map((m) => `manifest: ${m}`));
    } else {
      if (manifest.manifest.id !== e.id) {
        errors.push(`manifest id "${manifest.manifest.id}" does not match entry id "${e.id}"`);
      }
      if (manifest.manifest.type === 'platform') {
        errors.push('platform plugins are not listed in the registry');
      }
      // Advisory compat check against the running platform version (RFC 0024).
      const compat = checkCompatibility(manifest.manifest, readPlatformVersion());
      for (const w of compat.warnings) {
        console.warn(`[validate-registry] advisory ${e.id}: ${w}`);
      }
    }
    if (!existsSync(join(dir, 'LICENSE')) && !existsSync(join(dir, 'LICENSE.md'))) {
      errors.push('source is missing a LICENSE file');
    }

    const provenance: Provenance = {
      commit,
      contentHash: hashTree(dir),
      validatedAt: new Date().toISOString(),
    };
    return { id: e.id, errors, provenance };
  } catch (err) {
    return { id: e.id, errors: [`could not fetch source: ${(err as Error).message}`] };
  } finally {
    cleanup?.();
  }
}

interface RegistryFile {
  registryVersion: number;
  plugins: Record<string, unknown>[];
}

function main(): void {
  const { check } = parseArgs(process.argv.slice(2));
  const registry: RegistryFile = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const entries = registry.plugins;

  if (entries.length === 0) {
    console.log('[validate-registry] No entries to validate.');
    return;
  }

  let failed = false;
  for (const entry of entries) {
    const result = validateEntry(entry);
    if (result.errors.length > 0 || !result.provenance) {
      failed = true;
      console.error(`[validate-registry] ✗ ${result.id}`);
      for (const e of result.errors) console.error(`    - ${e}`);
      continue;
    }
    const committed = entry.provenance as Provenance | undefined;
    if (check) {
      if (!provenanceMatches(committed, result.provenance)) {
        failed = true;
        console.error(
          `[validate-registry] ✗ ${result.id}: provenance is missing or stale — ` +
            'run `pnpm registry:validate` and commit the result.',
        );
        continue;
      }
      console.log(`[validate-registry] ✓ ${result.id}`);
    } else {
      entry.provenance = { ...result.provenance };
      console.log(`[validate-registry] ✓ ${result.id} (${result.provenance.contentHash})`);
    }
  }

  if (!check) {
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
    console.log('[validate-registry] wrote provenance to registry/plugins.json');
  }

  if (failed) {
    console.error('[validate-registry] validation failed.');
    process.exit(1);
  }
  console.log('[validate-registry] all entries valid.');
}

// Only run when invoked directly, not when the pure helpers are imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
