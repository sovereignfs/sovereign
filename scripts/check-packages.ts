/**
 * Packs every package that is published to npm and checks the tarball (scripts/lib/package-check.ts),
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

const published = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .filter((dir) => {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, 'package.json'), 'utf8'),
    ) as PackedManifest;
    return manifest.private !== true;
  });

const publishedNames = new Set(
  published.map(
    (dir) =>
      (JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackedManifest).name ??
      '',
  ),
);

const out = mkdtempSync(path.join(tmpdir(), 'sv-pack-'));
let failed = false;

try {
  for (const dir of published) {
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
    const problems = tarballProblems(manifest, files, { licenseText, publishedNames });
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
