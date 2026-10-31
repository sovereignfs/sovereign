/**
 * Packs every package that is published to npm (the libraries under packages/, and the operator's toolkit and `create` under apps/) and checks the tarball (scripts/lib/package-check.ts),
 * then runs the real `pnpm publish --dry-run` on it. Nothing is published. Needs the packages built:
 * `pnpm build` first.
 *
 * Run: `pnpm packages:check`. It also runs in CI, after the build.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tarballProblems, type PackedManifest } from './lib/package-check';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = path.join(root, 'packages');

const manifestOf = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackedManifest;

type Candidate = { dir: string; kind: 'library' | 'tool' };

// The libraries under packages/, and the operator's tools under apps/: a tool is published when it is not private, and is run and not
// imported (AGPL-3.0-or-later, a `bin`).
const published: Candidate[] = [
  ...readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: path.join(packagesDir, entry.name), kind: 'library' as const })),
  ...['cli', 'create'].map((name) => ({
    dir: path.join(root, 'tools', name),
    kind: 'tool' as const,
  })),
].filter(({ dir }) => manifestOf(dir).private !== true);

const publishedNames = new Set(published.map(({ dir }) => manifestOf(dir).name ?? ''));

const out = mkdtempSync(path.join(tmpdir(), 'sv-pack-'));
let failed = false;

try {
  for (const { dir, kind } of published) {
    const name = path.basename(dir);
    const packed = execFileSync('pnpm', ['pack', '--pack-destination', out], {
      cwd: dir,
      encoding: 'utf8',
    });
    const tarball = packed
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith('.tgz'));
    if (!tarball) throw new Error(`pnpm pack printed no tarball for ${name}`);

    const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const manifest = JSON.parse(
      execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
    ) as PackedManifest;

    const licenseText = execFileSync('tar', ['-xzOf', tarball, 'package/LICENSE'], {
      encoding: 'utf8',
    });
    const binHeads: Record<string, string> = {};
    for (const bin of Object.values(
      typeof manifest.bin === 'string' ? { bin: manifest.bin } : (manifest.bin ?? {}),
    )) {
      const file = bin.replace(/^\.\//, '');
      if (files.includes(`package/${file}`)) {
        const text = execFileSync('tar', ['-xzOf', tarball, `package/${file}`], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        });
        binHeads[file] = text.slice(0, 64);
      }
    }
    const problems = tarballProblems(manifest, files, {
      licenseText,
      publishedNames,
      kind,
      binHeads,
    });
    execFileSync('pnpm', ['publish', '--dry-run', '--no-git-checks'], { cwd: dir, stdio: 'pipe' });

    if (problems.length > 0) {
      failed = true;
      console.error(`\n${manifest.name ?? name}: ${problems.length} problem(s)`);
      for (const problem of problems) console.error(`  - ${problem}`);
    } else {
      console.log(
        `${manifest.name}@${manifest.version}: ${files.length} files, publishes (dry run)`,
      );
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (published.length === 0) {
  console.error('No published package found: nothing was checked.');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
