import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findUnpublished, type Resolve } from './lib/template-published';

const run = promisify(execFile);

/** Asks npm for the newest published version in the range; no shell, so nothing from the ranges is interpreted. */
const resolve: Resolve = async (name, range) => {
  try {
    const { stdout } = await run('npm', ['view', `${name}@${range}`, 'version', '--json'], {
      timeout: 30_000,
    });
    const text = stdout.trim();
    if (text === '') return undefined;
    const parsed = JSON.parse(text) as string | string[];
    const versions = Array.isArray(parsed) ? parsed : [parsed];
    return versions.at(-1);
  } catch {
    return undefined;
  }
};

const missing = await findUnpublished(resolve);

if (missing.length === 0) {
  console.log(
    'template:check-published - every Sovereign package the app template needs is on npm.',
  );
} else {
  console.error(
    `template:check-published - ${missing.length} package(s) the app template needs are not on npm in range:\n`,
  );
  for (const { name, range } of missing) console.error(`  ${name}@${range}`);
  console.error(
    '\nRelease them (docs/releasing.md) before releasing a toolkit that makes new apps.',
  );
  process.exitCode = 1;
}
